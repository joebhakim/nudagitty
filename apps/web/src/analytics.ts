type AnalyticsPrimitive = string | number | boolean;
type AnalyticsProps = Record<string, AnalyticsPrimitive | null | undefined>;
type SanitizedAnalyticsProps = Record<string, AnalyticsPrimitive>;

type UmamiTracker = {
  track: (eventName: string, data?: SanitizedAnalyticsProps) => void;
};

type ViteImportMeta = ImportMeta & {
  env?: Record<string, string | boolean | undefined>;
};

declare global {
  interface Window {
    umami?: UmamiTracker;
  }
}

const SCRIPT_MARKER = "data-nudagitty-analytics";
const EVENT_NAME_PATTERN = /^[a-z][a-z0-9_]{0,49}$/;
const PROP_KEY_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;
const STRING_VALUE_PATTERN = /^[a-zA-Z0-9_.:-]{1,80}$/;
const ENGAGEMENT_MILESTONES_SECONDS = [5, 20, 60, 180, 300, 600] as const;

let queuedEvents: { name: string; props?: SanitizedAnalyticsProps }[] = [];
let engagementStop: (() => void) | null = null;

function analyticsEnv() {
  return (import.meta as ViteImportMeta).env ?? {};
}

function analyticsConfig() {
  const env = analyticsEnv();
  const scriptSrc = stringEnv(env.VITE_UMAMI_SRC);
  const websiteId = stringEnv(env.VITE_UMAMI_WEBSITE_ID);
  return {
    enabled: env.VITE_UMAMI_ENABLED !== "false" && Boolean(scriptSrc && websiteId),
    domains: stringEnv(env.VITE_UMAMI_DOMAINS),
    scriptSrc,
    websiteId
  };
}

export function initAnalytics() {
  if (typeof document === "undefined") return;
  const config = analyticsConfig();
  if (!config.enabled || !config.scriptSrc || !config.websiteId) return;
  if (document.querySelector(`script[${SCRIPT_MARKER}="umami"]`)) {
    flushQueuedEvents();
    return;
  }

  const script = document.createElement("script");
  script.defer = true;
  script.src = config.scriptSrc;
  script.setAttribute(SCRIPT_MARKER, "umami");
  script.setAttribute("data-website-id", config.websiteId);
  script.setAttribute("data-exclude-hash", "true");
  script.setAttribute("data-exclude-search", "true");
  script.setAttribute("data-do-not-track", "true");
  if (config.domains) script.setAttribute("data-domains", config.domains);
  script.addEventListener("load", flushQueuedEvents);
  document.head.appendChild(script);
}

export function trackAnalyticsEvent(name: string, props?: AnalyticsProps) {
  if (!analyticsConfig().enabled || !EVENT_NAME_PATTERN.test(name)) return;
  const sanitized = props ? sanitizeAnalyticsProps(props) : undefined;
  const tracker = typeof window === "undefined" ? undefined : window.umami;
  if (tracker) {
    tracker.track(name, sanitized);
    return;
  }
  queuedEvents = [...queuedEvents, { name, props: sanitized }].slice(-30);
}

export function startEngagementMilestones() {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};
  if (!analyticsConfig().enabled) return () => {};
  if (engagementStop) return engagementStop;

  let visibleSeconds = 0;
  let lastTick = window.performance.now();
  const reached = new Set<number>();

  const tick = () => {
    const now = window.performance.now();
    if (document.visibilityState === "visible") {
      visibleSeconds += (now - lastTick) / 1000;
    }
    lastTick = now;
    for (const seconds of ENGAGEMENT_MILESTONES_SECONDS) {
      if (visibleSeconds >= seconds && !reached.has(seconds)) {
        reached.add(seconds);
        trackAnalyticsEvent("engagement_milestone", { seconds });
      }
    }
  };

  const timer = window.setInterval(tick, 1000);
  const onVisibilityChange = () => {
    tick();
  };
  document.addEventListener("visibilitychange", onVisibilityChange);

  engagementStop = () => {
    tick();
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    engagementStop = null;
  };
  return engagementStop;
}

export function sanitizeAnalyticsProps(props: AnalyticsProps): SanitizedAnalyticsProps {
  const sanitized: SanitizedAnalyticsProps = {};
  for (const [key, value] of Object.entries(props)) {
    if (!PROP_KEY_PATTERN.test(key) || value === null || value === undefined) continue;
    if (typeof value === "boolean") {
      sanitized[key] = value;
      continue;
    }
    if (typeof value === "number") {
      if (Number.isFinite(value)) sanitized[key] = Math.round(value * 1000) / 1000;
      continue;
    }
    if (typeof value === "string" && STRING_VALUE_PATTERN.test(value)) {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

function flushQueuedEvents() {
  const tracker = typeof window === "undefined" ? undefined : window.umami;
  if (!tracker || queuedEvents.length === 0) return;
  const events = queuedEvents;
  queuedEvents = [];
  for (const event of events) tracker.track(event.name, event.props);
}

function stringEnv(value: string | boolean | undefined) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}
