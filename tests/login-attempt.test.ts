import { describe, expect, it } from "vitest";
import { decideLoginAttempt } from "@/server/auth/login-attempt";
import { createRateLimiter } from "@/server/auth/rate-limit";

function setup() {
  let t = 1_000_000;
  const limiters = {
    email: createRateLimiter({ limit: 1, windowMs: 60_000, now: () => t }),
    ip: createRateLimiter({ limit: 3, windowMs: 15 * 60_000, now: () => t }),
  };
  return { limiters, advance: (ms: number) => (t += ms) };
}

describe("decideLoginAttempt", () => {
  it("sends the first link for an address, and quietly sends nothing on a repeat within the minute (never an error)", () => {
    const { limiters } = setup();
    expect(decideLoginAttempt("ana@example.com", "1.1.1.1", limiters)).toBe("SEND");
    // The first link is already in their inbox and works for a while, so a repeat needs nothing sent and nothing said.
    expect(decideLoginAttempt("ana@example.com", "1.1.1.1", limiters)).toBe("QUIET_SKIP");
    expect(decideLoginAttempt("ana@example.com", "2.2.2.2", limiters)).toBe("QUIET_SKIP");
  });

  it("lets the same address have another link after the cooldown", () => {
    const { limiters, advance } = setup();
    decideLoginAttempt("ana@example.com", "1.1.1.1", limiters);
    advance(61_000);
    expect(decideLoginAttempt("ana@example.com", "1.1.1.1", limiters)).toBe("SEND");
  });

  it("does not let one person's attempts get in the way of someone else's address", () => {
    const { limiters } = setup();
    expect(decideLoginAttempt("ana@example.com", "1.1.1.1", limiters)).toBe("SEND");
    expect(decideLoginAttempt("ben@example.com", "1.1.1.1", limiters)).toBe("SEND");
  });

  it("tells a client that keeps hammering from one address to slow down, without using up anyone's cooldown", () => {
    const { limiters } = setup();
    for (const email of ["a@x.com", "b@x.com", "c@x.com"]) decideLoginAttempt(email, "9.9.9.9", limiters);
    expect(decideLoginAttempt("victim@example.com", "9.9.9.9", limiters)).toBe("TOO_MANY");
    // The victim's own request, from somewhere else, still goes through: the attacker did not burn their cooldown.
    expect(decideLoginAttempt("victim@example.com", "5.5.5.5", limiters)).toBe("SEND");
  });
});
