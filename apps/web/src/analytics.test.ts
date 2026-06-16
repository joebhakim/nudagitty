import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ANALYTICS_SCHEMA,
  GLOBAL_EVENT_PROPS,
  clientClass,
  identifyClient,
  sanitizeAnalyticsProps,
  trackAnalysisSampleSmall,
  trackBadControlShown,
  trackChartRendered,
  trackDenouementViewed,
  trackEditCommitted,
  trackExampleDwell,
  trackInfoOverlayOpened,
  trackNodeSelected,
  trackOperationSet,
  trackOutputEmpty,
  trackOutputViewed,
  trackSamplingFallback,
  trackSimState
} from "./analytics";

describe("sanitizeAnalyticsProps", () => {
  it("keeps coarse analytics values and drops free-form values", () => {
    expect(sanitizeAnalyticsProps({
      example_id: "what-if-snaft-survival",
      mode: "pro",
      seconds: 20.1234,
      copied: true,
      label: "90-day outcome at treatment start",
      url: "http://localhost:1337/#c=private"
    })).toEqual({
      example_id: "what-if-snaft-survival",
      mode: "pro",
      seconds: 20.123,
      copied: true
    });
  });
});

// Capture what reaches the umami tracker, with a browser-ish global + enabled config.
type Tracked = { name: string; props?: Record<string, unknown> };
const tracked: Tracked[] = [];
beforeEach(() => {
  tracked.length = 0;
  // process.env is the shared, test-controllable env seam (see analyticsEnv()).
  process.env.VITE_UMAMI_SRC = "https://analytics.example/script.js";
  process.env.VITE_UMAMI_WEBSITE_ID = "test-website-id";
  (globalThis as unknown as { window: unknown }).window = {
    umami: { track: (name: string, props?: Record<string, unknown>) => tracked.push({ name, props }) },
    performance: { now: () => 0 }
  };
});

afterEach(() => {
  delete process.env.VITE_UMAMI_SRC;
  delete process.env.VITE_UMAMI_WEBSITE_ID;
  delete (globalThis as unknown as { window?: unknown }).window;
});

const SLUG = /^[a-zA-Z0-9_.:-]{1,80}$/;

function assertConforms(event: Tracked) {
  const base = (ANALYTICS_SCHEMA as Record<string, Record<string, unknown>>)[event.name];
  if (!base) throw new Error(`unknown event "${event.name}"`);
  // client is attached to every event globally.
  const spec = { ...base, ...GLOBAL_EVENT_PROPS } as Record<string, unknown>;
  expect(event.props, `event "${event.name}" missing client tag`).toHaveProperty("client");
  for (const [key, value] of Object.entries(event.props ?? {})) {
    const rule = spec[key];
    expect(rule, `event "${event.name}" has prop "${key}" not in schema`).toBeTruthy();
    if (Array.isArray(rule)) {
      expect(rule, `"${event.name}.${key}"=${String(value)} not in enum`).toContain(value);
    } else if (rule === "int") {
      expect(typeof value).toBe("number");
      expect(Number.isInteger(value)).toBe(true);
    } else if (rule === "slug") {
      expect(typeof value).toBe("string");
      expect(SLUG.test(String(value))).toBe(true);
    }
  }
}

describe("typed analytics helpers stay within the privacy schema", () => {
  it("every helper emits an event that conforms to ANALYTICS_SCHEMA", () => {
    trackNodeSelected("collider");
    trackOperationSet("adjust", "collider");
    trackOutputViewed("standardized");
    trackOutputEmpty("no_data");
    trackBadControlShown();
    trackSimState("empty");
    trackSamplingFallback("rejection");
    trackAnalysisSampleSmall(50);
    trackChartRendered("risk_curve");
    trackExampleDwell("cats-highrise-syndrome", 90);
    trackInfoOverlayOpened("pairwise");
    trackDenouementViewed("simpson-severity");
    trackEditCommitted("node");

    expect(tracked).toHaveLength(13);
    for (const event of tracked) assertConforms(event);
  });

  it("tags every event with a client class", () => {
    trackNodeSelected("exposure");
    expect(tracked[0]?.props?.client).toBe("human"); // no navigator stub in this scope
  });

  it("never lets free-form text through (the no-banner guarantee)", () => {
    const sanitized = sanitizeAnalyticsProps({
      role: "collider", // enum-safe -> kept
      label: "Brought to vet (recorded only)", // free-form (spaces) -> dropped
      note: "P(Y | X, S=1)" // free-form -> dropped
    });
    expect(sanitized).toEqual({ role: "collider" });
  });

  it("throttles repeated edit commits so sliders don't flood", () => {
    trackEditCommitted("edge");
    trackEditCommitted("edge"); // within throttle window (performance.now() === 0)
    expect(tracked.filter((event) => event.name === "edit_committed")).toHaveLength(1);
  });
});

describe("clientClass separates human / automated / bot / test", () => {
  function setup(opts: { webdriver?: boolean; ua?: string; href?: string; sessionTest?: string }) {
    const store: Record<string, string> = {};
    if (opts.sessionTest) store["nudagitty_analytics_client"] = opts.sessionTest;
    // navigator is a read-only global in Node — stub via vi.stubGlobal.
    vi.stubGlobal("window", {
      location: { href: opts.href ?? "http://localhost/" },
      sessionStorage: {
        getItem: (k: string) => store[k] ?? null,
        setItem: (k: string, v: string) => { store[k] = v; }
      }
    });
    vi.stubGlobal("navigator", { webdriver: opts.webdriver ?? false, userAgent: opts.ua ?? "Mozilla/5.0 (human)" });
  }

  afterEach(() => { vi.unstubAllGlobals(); });

  it("defaults to human", () => { setup({}); expect(clientClass()).toBe("human"); });
  it("flags webdriver automation (Playwright/Selenium)", () => { setup({ webdriver: true }); expect(clientClass()).toBe("automated"); });
  it("flags bot user agents", () => { setup({ ua: "Mozilla/5.0 (compatible; Googlebot/2.1)" }); expect(clientClass()).toBe("bot"); });
  it("honors an explicit ?nu_client=test over detection", () => {
    setup({ webdriver: true, href: "http://nudag.joeha.kim/?nu_client=test" });
    expect(clientClass()).toBe("test");
  });
  it("persists the override for the tab session", () => {
    setup({ sessionTest: "test" });
    expect(clientClass()).toBe("test");
  });

  it("identifyClient sends client + reason + app_version as session data", () => {
    const identified: unknown[] = [];
    vi.stubGlobal("window", { umami: { track: () => {}, identify: (d: unknown) => identified.push(d) } });
    vi.stubGlobal("navigator", { webdriver: true, userAgent: "x" });
    identifyClient();
    expect(identified).toEqual([{ client: "automated", client_reason: "webdriver", app_version: "dev" }]);
  });

  it("explains the reason: override beats webdriver, bot UA is bot_ua", () => {
    const seen: any[] = [];
    vi.stubGlobal("window", {
      location: { href: "http://nudag.joeha.kim/?nu_client=test" },
      sessionStorage: { getItem: () => null, setItem: () => {} },
      umami: { track: () => {}, identify: (d: any) => seen.push(d) }
    });
    vi.stubGlobal("navigator", { webdriver: true, userAgent: "Googlebot" });
    identifyClient();
    expect(seen[0]).toMatchObject({ client: "test", client_reason: "override" });
  });
});
