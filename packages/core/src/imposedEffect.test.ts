import { describe, it, expect } from "vitest";
import { normalizeGraphDocumentMetadata } from "./index";

// The imposed effect is the AUTHORED ESTIMAND, not the coefficient that encodes it. It must round-trip
// through normalize (it rides the share URL), and it must keep accepting the LEGACY bare number, because
// share links already in the wild carry `"imposedEffect": 1794`.
describe("ImposedEffect normalize round-trip", () => {
  const meta = (imposedEffect: unknown) => normalizeGraphDocumentMetadata({ imposedEffect } as never).imposedEffect;

  it("round-trips the full spec", () => {
    expect(meta({ target: 1794, extensiveShare: 0.62, exposure: "In_program", outcome: "Earnings_78" }))
      .toEqual({ target: 1794, extensiveShare: 0.62, exposure: "In_program", outcome: "Earnings_78" });
  });

  it("accepts a legacy bare number (old share links)", () => {
    expect(meta(1794)).toEqual({ target: 1794 });
  });

  it("clamps extensiveShare to [0,1]", () => {
    expect(meta({ target: 100, extensiveShare: 5 })?.extensiveShare).toBe(1);
    expect(meta({ target: 100, extensiveShare: -2 })?.extensiveShare).toBe(0);
  });

  it("is absent (not null) when unset, so docs without one stay byte-identical", () => {
    expect(normalizeGraphDocumentMetadata({}).imposedEffect).toBeUndefined();
    expect("imposedEffect" in normalizeGraphDocumentMetadata({})).toBe(false);
  });

  it("rejects garbage", () => {
    expect(meta({ extensiveShare: 0.5 })).toBeUndefined();   // no target
    expect(meta("1794")).toBeUndefined();
    expect(meta(Number.NaN)).toBeUndefined();
  });
});
