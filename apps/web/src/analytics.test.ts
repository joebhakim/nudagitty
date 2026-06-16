import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ANALYTICS_SCHEMA,
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
  const spec = (ANALYTICS_SCHEMA as Record<string, Record<string, unknown>>)[event.name];
  if (!spec) throw new Error(`unknown event "${event.name}"`);
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
