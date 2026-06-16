type AnalyticsPrimitive = string | number | boolean;
type AnalyticsProps = Record<string, AnalyticsPrimitive | null | undefined>;
type SanitizedAnalyticsProps = Record<string, AnalyticsPrimitive>;

type UmamiTracker = {
  track: (eventName: string, data?: SanitizedAnalyticsProps) => void;
  identify?: (data: SanitizedAnalyticsProps) => void;
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

// --- Client classification ---------------------------------------------------
//
// Every event carries a `client` dimension so the dashboard can separate human
// usage from automation / bots / our own test drives. All signals are coarse and
// non-identifying (a boolean + a UA word-match + an explicit opt-in flag), so this
// stays cookieless and banner-free. Note: pure scrapers that never run JS never
// fire an event at all — for those, see Cloudflare edge analytics (out of scope here).
export type ClientClass = "human" | "automated" | "bot" | "test";
// Why a client was classified — sent as session data so a session is self-describing
// ("test" alone isn't very informative; "test via override" / "automated via webdriver"
// is). Maps 1:1 to the branches of classifyClient().
export type ClientReason = "human" | "override" | "webdriver" | "bot_ua";
const CLIENT_CLASSES: ClientClass[] = ["human", "automated", "bot", "test"];
const CLIENT_OVERRIDE_KEY = "nudagitty_analytics_client";
const BOT_UA_PATTERN = /bot|crawl|spider|slurp|headless|puppeteer|playwright|selenium|phantom|lighthouse|pingdom|gtmetrix|chrome-lighthouse|google web preview/i;

// Build commit (injected by vite define; "dev" under vitest / local). Lets a session
// be correlated to the deploy it ran on.
declare const __APP_VERSION__: string;
const APP_VERSION = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";

function isClientClass(value: string | null): value is ClientClass {
  return value !== null && (CLIENT_CLASSES as string[]).includes(value);
}

// An explicit, deliberate marker (`?nu_client=test|automated|bot`) for scripted runs
// that aren't otherwise detectable (e.g. a real-browser QA pass against prod). Held
// in sessionStorage so it lasts the tab session only — never a cross-session id.
function readClientOverride(): ClientClass | null {
  try {
    const param = new URL(window.location.href).searchParams.get("nu_client");
    if (isClientClass(param)) {
      window.sessionStorage.setItem(CLIENT_OVERRIDE_KEY, param);
      return param;
    }
    const stored = window.sessionStorage.getItem(CLIENT_OVERRIDE_KEY);
    if (isClientClass(stored)) return stored;
  } catch {
    // sessionStorage / URL unavailable — fall through to detection
  }
  return null;
}

export function classifyClient(): { client: ClientClass; reason: ClientReason } {
  if (typeof window === "undefined" || typeof navigator === "undefined") return { client: "human", reason: "human" };
  const override = readClientOverride();
  if (override) return { client: override, reason: "override" };
  if (navigator.webdriver === true) return { client: "automated", reason: "webdriver" };
  if (BOT_UA_PATTERN.test(navigator.userAgent || "")) return { client: "bot", reason: "bot_ua" };
  return { client: "human", reason: "human" };
}

export function clientClass(): ClientClass {
  return classifyClient().client;
}

// Props attached to EVERY event (merged in trackAnalyticsEvent); allowed on every
// event by the schema guard.
export const GLOBAL_EVENT_PROPS = { client: CLIENT_CLASSES } as const;

function analyticsEnv(): Record<string, string | boolean | undefined> {
  const meta = (import.meta as ViteImportMeta).env ?? {};
  // In the browser build, import.meta.env carries the inlined values and `process`
  // is undefined. Under vitest, import.meta.env is module-local (can't be set from a
  // test), but process.env is a shared global — so merge it as a test/SSR fallback
  // with import.meta.env still taking precedence in production.
  if (typeof process !== "undefined" && process.env) {
    return { ...process.env, ...meta };
  }
  return meta;
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
    identifyClient();
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
  script.addEventListener("load", () => {
    identifyClient();
    flushQueuedEvents();
  });
  document.head.appendChild(script);
}

// Attach the client classification as SESSION data (umami.identify), so pageview/
// visitor metrics — not just custom events — are filterable, and a session is
// self-describing (client + why it was classified + which build). All categorical /
// non-identifying, so this stays cookieless and banner-free.
let sessionIdentified = false;
export function identifyClient() {
  const tracker = typeof window === "undefined" ? undefined : window.umami;
  if (!tracker?.identify) return;
  const { client, reason } = classifyClient();
  tracker.identify(sanitizeAnalyticsProps({ client, client_reason: reason, app_version: APP_VERSION }));
  sessionIdentified = true;
}

export function trackAnalyticsEvent(name: string, props?: AnalyticsProps) {
  if (!analyticsConfig().enabled || !EVENT_NAME_PATTERN.test(name)) return;
  // Tag every event with the client class so human vs automated/bot/test usage is
  // separable in the dashboard. Placed last so an event can't shadow it.
  const sanitized = sanitizeAnalyticsProps({ ...props, client: clientClass() });
  const tracker = typeof window === "undefined" ? undefined : window.umami;
  if (tracker) {
    // Defensive: make sure the session carries the client tag even if the
    // script-load identify was missed (idempotent — fires once per session).
    if (!sessionIdentified) identifyClient();
    tracker.track(name, sanitized);
    return;
  }
  queuedEvents = [...queuedEvents, { name, props: sanitized }].slice(-30);
}

// --- Typed event layer -------------------------------------------------------
//
// Every custom event goes through one of the typed helpers below. Their params
// are LITERAL UNIONS, so passing a node label / free-form string is a *compile*
// error, not a runtime privacy leak. ANALYTICS_SCHEMA is the single source of
// truth (event name -> allowed prop keys + enum values); the guard test asserts
// each helper conforms and that sanitizeAnalyticsProps strips anything off-enum.
// This is what keeps the tracker cookieless-and-PII-free => no consent banner.

export type FunnelRole = "exposure" | "outcome" | "latent" | "mediator" | "collider" | "confounder" | "other";
export type OperationName = "none" | "intervene" | "select" | "condition" | "adjust";
export type OperationClassification = "backdoor" | "collider" | "neutral" | "na";
export type OutputKind = "crude" | "stratified" | "standardized" | "completed" | "diagnosis";
export type EmptyReason = "needs_roles" | "no_exposure_outcome" | "no_data";
export type SimStatus = "ok" | "empty" | "failed";
export type SamplingMethod = "forward" | "rejection" | "importance";
export type ChartKind = "scatter" | "category_binary" | "category_continuous" | "risk_curve";
export type OverlaySource = "explanation" | "pairwise";
export type EditTarget = "node" | "edge";

// Prop value rule per event. "slug" = a fixed app-defined identifier (example id),
// never user content; "int" = a bucketed integer; an array = an exact enum.
export const ANALYTICS_SCHEMA = {
  // pre-existing coarse events (kept for the guard's name allowlist)
  example_loaded: { example: "slug" },
  graph_action: { action: ["add_node", "add_edge", "resample", "set_operation", "new_graph"], operation: ["none", "intervene", "select", "condition", "adjust"] },
  mode_changed: { mode: ["demo", "pro"] },
  share_clicked: { kind: ["compact", "full"] },
  export_clicked: { format: ["svg", "png", "jpeg"] },
  engagement_milestone: { seconds: "int" },
  // new granular, friction-first events
  node_selected: { role: ["exposure", "outcome", "latent", "mediator", "collider", "confounder", "other"] },
  operation_set: { operation: ["none", "intervene", "select", "condition", "adjust"], classification: ["backdoor", "collider", "neutral", "na"] },
  output_viewed: { kind: ["crude", "stratified", "standardized", "completed", "diagnosis"] },
  output_empty: { reason: ["needs_roles", "no_exposure_outcome", "no_data"] },
  bad_control_shown: { classification: ["collider"] },
  sim_state: { status: ["ok", "empty", "failed"] },
  sampling_fallback: { method: ["forward", "rejection", "importance"] },
  analysis_sample_small: { bucket: "int" },
  chart_rendered: { chart_kind: ["scatter", "category_binary", "category_continuous", "risk_curve"] },
  example_dwell: { example: "slug", seconds: "int" },
  info_overlay_opened: { source: ["explanation", "pairwise"] },
  denouement_viewed: { example: "slug" },
  edit_committed: { target: ["node", "edge"] }
} as const;

export type AnalyticsEventName = keyof typeof ANALYTICS_SCHEMA;

export function trackNodeSelected(role: FunnelRole) {
  trackAnalyticsEvent("node_selected", { role });
}
export function trackOperationSet(operation: OperationName, classification: OperationClassification) {
  trackAnalyticsEvent("operation_set", { operation, classification });
}
export function trackOutputViewed(kind: OutputKind) {
  trackAnalyticsEvent("output_viewed", { kind });
}
export function trackOutputEmpty(reason: EmptyReason) {
  trackAnalyticsEvent("output_empty", { reason });
}
export function trackBadControlShown() {
  trackAnalyticsEvent("bad_control_shown", { classification: "collider" });
}
export function trackSimState(status: SimStatus) {
  trackAnalyticsEvent("sim_state", { status });
}
export function trackSamplingFallback(method: SamplingMethod) {
  trackAnalyticsEvent("sampling_fallback", { method });
}
export function trackAnalysisSampleSmall(bucket: number) {
  trackAnalyticsEvent("analysis_sample_small", { bucket });
}
export function trackChartRendered(chartKind: ChartKind) {
  trackAnalyticsEvent("chart_rendered", { chart_kind: chartKind });
}
export function trackExampleDwell(example: string, seconds: number) {
  trackAnalyticsEvent("example_dwell", { example, seconds });
}
export function trackInfoOverlayOpened(source: OverlaySource) {
  trackAnalyticsEvent("info_overlay_opened", { source });
}
export function trackDenouementViewed(example: string) {
  trackAnalyticsEvent("denouement_viewed", { example });
}

// Editing is continuous (slider drags), so throttle commits to one per target per
// window to avoid flooding while still capturing that an edit session happened.
const EDIT_THROTTLE_MS = 4000;
const lastEditAt: Record<EditTarget, number> = { node: -Infinity, edge: -Infinity };
export function trackEditCommitted(target: EditTarget) {
  if (typeof window === "undefined") return;
  const now = window.performance.now();
  if (now - lastEditAt[target] < EDIT_THROTTLE_MS) return;
  lastEditAt[target] = now;
  trackAnalyticsEvent("edit_committed", { target });
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
