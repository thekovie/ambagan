import fs from "node:fs";
import { describe, expect, it } from "vitest";

// A sign-in link must land on "/", which sends admins to /admin/dashboard and members to /dashboard.
// Hard-coding /dashboard dropped admins on the member page with no visible way to the admin area.
describe("sign-in landing page", () => {
  it.each(["src/app/(auth)/login/actions.ts", "src/app/(auth)/invite/[token]/actions.ts"])("%s signs people in to the role-based home", (file) => {
    const source = fs.readFileSync(file, "utf8");
    expect(source).toMatch(/signIn\("nodemailer", \{[^}]*redirectTo: "\/" \}\)/);
    expect(source).not.toContain('redirectTo: "/dashboard"');
  });

  it("the home page routes by role", () => {
    const home = fs.readFileSync("src/app/page.tsx", "utf8");
    expect(home).toContain('user.role === "ADMIN" ? "/admin/dashboard" : "/dashboard"');
  });
});
