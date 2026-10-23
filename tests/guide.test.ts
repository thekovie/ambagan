import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ADMIN_GUIDE, MEMBER_GUIDE, guideFor } from "@/app/guide/content";

const links = (sections: typeof ADMIN_GUIDE) => sections.flatMap((s) => s.steps.flatMap((step) => (step.link ? [step.link.href] : [])));

describe("guide content", () => {
  it("shows a member nothing about the admin area", () => {
    const { yours, theirs } = guideFor("MEMBER");
    expect(yours).toBe(MEMBER_GUIDE);
    expect(theirs).toEqual([]);
    expect(links(yours).filter((href) => href.startsWith("/admin"))).toEqual([]);
    expect(JSON.stringify(yours)).not.toMatch(/Settings|Plans|Verify|Members page/);
  });

  it("gives an admin their own sections first, then what their friends see", () => {
    const { yours, theirs } = guideFor("ADMIN");
    expect(yours).toBe(ADMIN_GUIDE);
    expect(theirs).toBe(MEMBER_GUIDE);
    expect(yours[0].id).toBe("set-up");
  });

  it("has unique section ids and no empty sections", () => {
    const all = [...ADMIN_GUIDE, ...MEMBER_GUIDE];
    expect(new Set(all.map((s) => s.id)).size).toBe(all.length);
    for (const section of all) {
      expect(section.steps.length, section.id).toBeGreaterThan(0);
      for (const step of section.steps) expect(step.body.length, step.title).toBeGreaterThan(20);
    }
  });

  it("only links to pages that exist, so the guide cannot point at something that was renamed", () => {
    for (const href of new Set([...links(ADMIN_GUIDE), ...links(MEMBER_GUIDE)])) {
      const route = href.split("#")[0];
      const page = path.join(process.cwd(), "src", "app", route, "page.tsx");
      // Pages inside route groups, e.g. (member), are looked up too.
      const grouped = fs
        .readdirSync(path.join(process.cwd(), "src", "app"), { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && /^\(.+\)$/.test(entry.name))
        .map((entry) => path.join(process.cwd(), "src", "app", entry.name, route, "page.tsx"));
      expect([page, ...grouped].some((candidate) => fs.existsSync(candidate)), `${href} has no page`).toBe(true);
    }
  });
});
