import { describe, expect, it } from "vitest";
import { sanitizeAnalyticsProps } from "./analytics";

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
