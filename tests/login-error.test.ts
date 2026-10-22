import { describe, expect, it } from "vitest";
import { loginErrorMessage } from "@/lib/login-error";

describe("loginErrorMessage", () => {
  it("explains the errors we know", () => {
    expect(loginErrorMessage("Verification")).toMatch(/expired or was already used/);
    expect(loginErrorMessage("AccessDenied")).toMatch(/can't sign in/);
  });

  it("falls back for anything else, including names that exist on every object", () => {
    for (const odd of ["Nope", "", "constructor", "__proto__", "toString", "hasOwnProperty", undefined, ["Verification"]]) {
      expect(loginErrorMessage(odd as string | undefined)).toMatch(/Something went wrong/);
    }
  });
});
