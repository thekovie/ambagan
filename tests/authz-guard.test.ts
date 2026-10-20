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

describe("private-link endpoints verify the link first", () => {
  // Guests have no session, so the signed link is their credential: it must be checked before anything else happens.
  const linkActionFiles = actionFiles(path.join(APP, "s"));
  const linkRoutes = routeFiles(path.join(APP, "api", "s"));
  const linkPages = filesNamed(path.join(APP, "s"), "page.tsx");

  it("finds the files (so this guard can't pass by checking nothing)", () => {
    expect(linkActionFiles.length).toBeGreaterThanOrEqual(1);
    expect(linkRoutes.length).toBeGreaterThanOrEqual(1);
    expect(linkPages.length).toBeGreaterThanOrEqual(1);
  });

  it.each(linkActionFiles.map((f) => [rel(f), f]))("%s: every exported action starts with requireShareAccess() and honours its answer", (_label, file) => {
    const source = fs.readFileSync(file, "utf8");
    expect(source.startsWith('"use server"')).toBe(true);
    const actions = exportedActions(source);
    expect(actions.length).toBeGreaterThan(0);
    for (const { name, body } of actions) {
      // Stricter than the other guards: nothing at all (not even reading the form) may run before the link is checked,
      // and a failed check must stop the action.
      expect(body, `${name} must start with requireShareAccess()`).toMatch(/^\{\s*const (\w+) = await requireShareAccess\([^)]*\);\s*if \(!\1\.ok\) return /);
    }
  });

  it.each(linkRoutes.map((f) => [rel(f), f]))("%s: every handler checks the link right after reading its params and honours the answer", (_label, file) => {
    const source = fs.readFileSync(file, "utf8");
    const handlers = exportedActions(source);
    expect(handlers.length, "no handlers found: is the route written as `export const GET = ...`?").toBeGreaterThan(0);
    for (const { name, body } of handlers) {
      expect(body, `${name} must call requireShareAccess() right after reading its params`).toMatch(
        /await params;\s*const (\w+) = await requireShareAccess\([^)]*\);\s*if \(!\1\.ok\) return /,
      );
    }
  });

  it.each(linkPages.map((f) => [rel(f), f]))("%s: the page checks the link before loading anything", (_label, file) => {
    const source = fs.readFileSync(file, "utf8");
    expect(source).toContain("requireShareAccess(");
    for (const loader of ["getShareLinkView(", "getDb()"]) {
      if (source.includes(loader)) expect(source.indexOf("requireShareAccess("), `${loader} must come after the link check`).toBeLessThan(source.indexOf(loader));
    }
  });

  it("allows no other kinds of file under a private link that could skip the check", () => {
    const allowed = new Set(["page.tsx", "layout.tsx", "actions.ts", "route.ts"]);
    for (const file of [...filesNamed(path.join(APP, "s"), /.*/), ...filesNamed(path.join(APP, "api", "s"), /.*/)]) {
      expect(allowed.has(path.basename(file)), `${rel(file)} is not a file type this guard understands: extend it before adding it`).toBe(true);
    }
  });
});

function filesNamed(dir: string, name: string | RegExp): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return filesNamed(full, name);
    return (typeof name === "string" ? entry.name === name : name.test(entry.name)) ? [full] : [];
  });
}

function routeFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(full);
    return entry.name === "route.ts" ? [full] : [];
  });
}
