import { describe, expect, it } from "vitest";
import { avatarClass, initials } from "@/lib/avatar";

describe("initials", () => {
  it("uses the first letter of the email when there is no name", () => {
    expect(initials(null, "ana@example.com")).toBe("A");
    expect(initials("   ", "ben@example.com")).toBe("B");
  });

  it("uses one letter for a single word and first + last for several", () => {
    expect(initials("ana", "x@y.z")).toBe("A");
    expect(initials("Ana R. Reyes", "x@y.z")).toBe("AR");
  });

  it("keeps an emoji whole instead of splitting it", () => {
    expect(initials("🎧 Dina", "x@y.z")).toBe("🎧D");
  });
});

describe("avatarClass", () => {
  it("is stable for the same seed and always a pastel with ink text", () => {
    expect(avatarClass("Ana R. Reyes")).toBe(avatarClass("Ana R. Reyes"));
    expect(avatarClass("anyone")).toMatch(/^bg-st-\w+ text-st-ink$/);
  });
});
