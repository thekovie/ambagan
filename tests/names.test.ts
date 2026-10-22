import { describe, expect, it } from "vitest";
import { cleanDisplayName, cleanFreeText } from "@/lib/names";

describe("cleanDisplayName also hides invisible fillers", () => {
  it("removes blank-looking and formatting characters but keeps emoji joiners", () => {
    expect(cleanDisplayName("Ana\u3164 \u2800Reyes\u00AD")).toBe("Ana Reyes");
    expect(cleanDisplayName("Pamilya 👨‍👩‍👧")).toBe("Pamilya 👨‍👩‍👧");
  });
});

describe("cleanDisplayName", () => {
  it("keeps ordinary names, accents, apostrophes and emoji as they are", () => {
    expect(cleanDisplayName("Ana R. Reyes")).toBe("Ana R. Reyes");
    expect(cleanDisplayName("José Peña-O'Brien")).toBe("José Peña-O'Brien");
    expect(cleanDisplayName("Kovie 🎧")).toBe("Kovie 🎧");
  });

  it("trims and collapses runs of whitespace", () => {
    expect(cleanDisplayName("  Ana    Reyes \t ")).toBe("Ana Reyes");
  });

  it("removes line breaks and other control characters (a name is a single line)", () => {
    expect(cleanDisplayName("Ana\nBcc: evil@example.com")).toBe("Ana Bcc: evil@example.com");
    expect(cleanDisplayName("Ana\u0000\u0007Reyes")).toBe("AnaReyes");
  });

  it("removes characters that reorder or hide text (bidirectional controls, zero-width characters)", () => {
    expect(cleanDisplayName("Ana‮ gnirts")).toBe("Ana gnirts");
    expect(cleanDisplayName("A⁦na⁩")).toBe("Ana");
    expect(cleanDisplayName("An​a‎")).toBe("Ana");
    expect(cleanDisplayName("﻿Ana")).toBe("Ana");
  });

  it("returns an empty string for a name made of nothing visible", () => {
    expect(cleanDisplayName(" ​ \n ")).toBe("");
  });
});

describe("cleanFreeText (titles, notes and reasons that end up in emails)", () => {
  it("removes hidden and reordering characters but keeps line breaks and ordinary text", () => {
    expect(cleanFreeText("Dinner\u202Esdrawkcab\u200B")).toBe("Dinnersdrawkcab");
    expect(cleanFreeText("Line one\nLine two\r\nLine three")).toBe("Line one\nLine two\nLine three");
    expect(cleanFreeText("Salamat, Niño! 🎉")).toBe("Salamat, Niño! 🎉");
  });

  it("drops other control characters and trims", () => {
    expect(cleanFreeText("  a\u0000b\u0007c  ")).toBe("abc");
  });

  it("also removes line separators, invisible formatting characters and blank-looking fillers", () => {
    expect(cleanFreeText("a\u2028b\u2029c")).toBe("abc");
    expect(cleanFreeText("a\u00ADb\u3164c\u2800d\u180Ee\u{E0041}")).toBe("abcde");
    // But not the joiner that emoji sequences are built from.
    expect(cleanFreeText("Family 👨‍👩‍👧")).toBe("Family 👨‍👩‍👧");
  });

  it("does not let more than one blank line through", () => {
    expect(cleanFreeText("a\n\n\n\nb")).toBe("a\n\nb");
  });
});

