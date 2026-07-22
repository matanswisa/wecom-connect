import { describe, expect, it } from "vitest";
import { getEmployeeColor } from "./employeeColors";

describe("employee colors", () => {
  it("returns a stable color for the same registered user", () => {
    expect(getEmployeeColor("user-123")).toEqual(getEmployeeColor("user-123"));
  });

  it("spreads different users across the palette", () => {
    const colors = new Set(["user-1", "user-2", "user-3", "user-4"].map(
      (identifier) => getEmployeeColor(identifier).solid
    ));

    expect(colors.size).toBeGreaterThan(1);
  });
});
