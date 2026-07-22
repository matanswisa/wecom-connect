import { describe, expect, it } from "vitest";
import { getScheduleDays } from "./dates";

describe("schedule dates", () => {
  it("builds a full Sunday-to-Saturday week with dates", () => {
    const days = getScheduleDays("2026-07-19");

    expect(days).toHaveLength(7);
    expect(days[0]).toMatchObject({ label: "ראשון", date: "2026-07-19" });
    expect(days[6]).toMatchObject({ label: "שבת", date: "2026-07-25" });
  });
});
