import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LOGO_HEX, LOGO_SLICES } from "@/components/brand/logo-mark";

describe("the logo", () => {
  it("has four slices, one of them lifted out", () => {
    expect(LOGO_SLICES).toHaveLength(4);
    expect(LOGO_SLICES.filter((s) => s.transform)).toHaveLength(1);
    expect(LOGO_SLICES.find((s) => s.transform)?.id).toBe("share");
  });

  it("is drawn the same in the tab icon as in the app (same shapes and colours)", () => {
    const svg = readFileSync("src/app/icon.svg", "utf8");
    for (const slice of LOGO_SLICES) {
      expect(svg).toContain(`d="${slice.d}"`);
      expect(svg).toContain(`fill="${LOGO_HEX[slice.id]}"`);
      if (slice.transform) expect(svg).toContain(`transform="${slice.transform}"`);
    }
    expect(svg).toContain(`stroke="${LOGO_HEX.ink}"`);
  });
});
