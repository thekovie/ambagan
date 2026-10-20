import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every server action is a public HTTP endpoint. Authorization is the first thing each one must do, so this
 * guard reads the source and fails if an exported action in an admin or member area doesn't call the right
 * check. (The e2e journey only proves the happy path; this catches a dropped check.)
 */
const APP = path.join(process.cwd(), "src", "app");

function actionFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return actionFiles(full);
    return entry.name === "actions.ts" ? [full] : [];
  });
}

/** Exported async functions with their bodies, found by brace matching from each declaration. */
function exportedActions(source: string): { name: string; body: string }[] {
  const found: { name: string; body: string }[] = [];
  const declaration = /export async function (\w+)\s*\(/g;
  for (let match = declaration.exec(source); match; match = declaration.exec(source)) {
    const open = source.indexOf("{", source.indexOf(")", match.index) + 1);
    let depth = 0;
    let end = open;
    for (; end < source.length; end++) {
      if (source[end] === "{") depth++;
      else if (source[end] === "}" && --depth === 0) break;
    }
    found.push({ name: match[1], body: source.slice(open, end + 1) });
  }
  return found;
}

const rel = (file: string) => path.relative(process.cwd(), file);

/** The guard must come before any other `await` (so no work is started for an unauthorized caller). */
function guardsFirst(body: string, guard: string): boolean {
  const at = body.indexOf(guard);
  const firstAwait = body.indexOf("await ");
  return at > -1 && (firstAwait === -1 || at <= firstAwait + "await ".length);
}

describe("server actions authorize their caller", () => {
  const adminFiles = actionFiles(path.join(APP, "admin"));
  const memberFiles = actionFiles(path.join(APP, "(member)"));

  it("finds the action files (so this guard can't pass by checking nothing)", () => {
    expect(adminFiles.length).toBeGreaterThanOrEqual(5);
    expect(memberFiles.length).toBeGreaterThanOrEqual(1);
  });

  it.each(adminFiles.map((f) => [rel(f), f]))("%s: every exported action calls requireAdmin() first", (_label, file) => {
    const source = fs.readFileSync(file, "utf8");
    expect(source.startsWith('"use server"')).toBe(true);
    const actions = exportedActions(source);
    expect(actions.length).toBeGreaterThan(0);
    for (const { name, body } of actions) {
      expect(guardsFirst(body, "requireAdmin()"), `${name} must call requireAdmin() before doing anything else`).toBe(true);
    }
  });

  it.each(memberFiles.map((f) => [rel(f), f]))("%s: every exported action calls requireUser() first", (_label, file) => {
    const source = fs.readFileSync(file, "utf8");
    for (const { name, body } of exportedActions(source)) {
      expect(guardsFirst(body, "requireUser()"), `${name} must call requireUser() before doing anything else`).toBe(true);
    }
  });
});
