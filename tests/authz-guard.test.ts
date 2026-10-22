import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every server action is a public HTTP endpoint. Authorization is the first thing each one must do, so this
 * guard reads the source and fails if an exported action doesn't start with the right check. (The e2e journey
 * only proves the happy path; this catches a dropped check.) It is deliberately strict:
 * - it looks at EVERY file marked "use server", not just files called actions.ts, and every one must be classified;
 * - the check must be the very first statement and must be awaited (a comment, or a forgotten `await`, does not count);
 * - API routes outside the auth library, the health check and the private-link area need a session check too.
 */
const APP = path.join(process.cwd(), "src", "app");

function filesUnder(dir: string, keep: (name: string) => boolean): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return filesUnder(full, keep);
    return keep(entry.name) ? [full] : [];
  });
}

const rel = (file: string) => path.relative(process.cwd(), file).split(path.sep).join("/");
const actionFiles = (dir: string) => filesUnder(dir, (name) => name === "actions.ts");

/** The index of the `{` that opens a function body, skipping braces inside the parameter list and a `Promise<{ ... }>` return type. */
function bodyStart(source: string, from: number): number {
  let parens = 0;
  let angles = 0;
  for (let i = from; i < source.length; i++) {
    const c = source[i];
    if (c === "(") parens++;
    else if (c === ")") parens--;
    else if (parens === 0 && c === "<") angles++;
    else if (parens === 0 && c === ">" && source[i - 1] !== "=") angles--;
    else if (parens === 0 && angles === 0 && c === "{") return i;
  }
  return -1;
}

/** Exported async functions (`export async function f()` and `export const f = async () =>`) with their bodies. */
function exportedActions(source: string): { name: string; body: string }[] {
  const found: { name: string; body: string }[] = [];
  const declaration = /export (?:async function (\w+)\s*\(|const (\w+)\s*=\s*async\b)/g;
  for (let match = declaration.exec(source); match; match = declaration.exec(source)) {
    const open = bodyStart(source, match.index + match[0].length - (match[1] ? 1 : 0));
    if (open === -1) continue;
    let depth = 0;
    let end = open;
    for (; end < source.length; end++) {
      if (source[end] === "{") depth++;
      else if (source[end] === "}" && --depth === 0) break;
    }
    found.push({ name: match[1] ?? match[2], body: source.slice(open, end + 1) });
  }
  return found;
}

/** The guard must be the first statement and awaited, so no work is started for an unauthorized caller. */
const firstStatementIs = (guard: string) => new RegExp(`^\\{\\s*(?:const \\w+ = )?await ${guard}\\(\\)`);

// Reachable without a session on purpose: asking for a sign-in link, accepting an invitation, signing out.
const PUBLIC_ACTION_FILES = new Set(["src/app/(auth)/invite/[token]/actions.ts", "src/app/(auth)/login/actions.ts", "src/app/actions/sign-out.ts"]);

describe("server actions authorize their caller", () => {
  const adminFiles = filesUnder(path.join(APP, "admin"), (n) => n.endsWith(".ts") || n.endsWith(".tsx")).filter((f) => fs.readFileSync(f, "utf8").startsWith('"use server"'));
  const memberFiles = filesUnder(path.join(APP, "(member)"), (n) => n.endsWith(".ts") || n.endsWith(".tsx")).filter((f) => fs.readFileSync(f, "utf8").startsWith('"use server"'));

  it("finds the action files (so this guard can't pass by checking nothing)", () => {
    expect(adminFiles.length).toBeGreaterThanOrEqual(5);
    expect(memberFiles.length).toBeGreaterThanOrEqual(1);
  });

  it("knows every file marked \"use server\": it is an admin, member, private-link or deliberately public action file", () => {
    const all = filesUnder(path.join(process.cwd(), "src"), (n) => n.endsWith(".ts") || n.endsWith(".tsx")).filter((f) => /^\s*["']use server["']/.test(fs.readFileSync(f, "utf8")));
    expect(all.length).toBeGreaterThanOrEqual(10);
    for (const file of all) {
      const name = rel(file);
      const known = name.startsWith("src/app/admin/") || name.startsWith("src/app/(member)/") || name.startsWith("src/app/s/") || PUBLIC_ACTION_FILES.has(name);
      expect(known, `${name} is a server action file this guard does not know: classify it (admin, member, private link, or add it to PUBLIC_ACTION_FILES on purpose)`).toBe(true);
    }
  });

  it.each(adminFiles.map((f) => [rel(f), f]))("%s: every exported action starts with an awaited requireAdmin()", (_label, file) => {
    const actions = exportedActions(fs.readFileSync(file, "utf8"));
    expect(actions.length).toBeGreaterThan(0);
    for (const { name, body } of actions) {
      expect(body, `${name} must start with await requireAdmin()`).toMatch(firstStatementIs("requireAdmin"));
    }
  });

  it.each(memberFiles.map((f) => [rel(f), f]))("%s: every exported action starts with an awaited requireUser()", (_label, file) => {
    const actions = exportedActions(fs.readFileSync(file, "utf8"));
    expect(actions.length).toBeGreaterThan(0);
    for (const { name, body } of actions) {
      expect(body, `${name} must start with await requireUser()`).toMatch(firstStatementIs("requireUser"));
    }
  });

  it("really can tell a guarded action from an unguarded one (so the checks above mean something)", () => {
    const good = 'export async function a(_p: S, f: FormData): Promise<{ error?: string }> {\n  const admin = await requireAdmin();\n  return {};\n}';
    const arrow = "export const b = async (f: FormData) => {\n  await requireAdmin();\n};";
    expect(exportedActions(good)).toHaveLength(1);
    expect(exportedActions(arrow)).toHaveLength(1);
    for (const { body } of [...exportedActions(good), ...exportedActions(arrow)]) expect(body).toMatch(firstStatementIs("requireAdmin"));
    const forgotAwait = exportedActions("export async function c() {\n  const admin = requireAdmin();\n  return {};\n}");
    const inComment = exportedActions("export async function d() {\n  // requireAdmin()\n  doWork();\n}");
    const late = exportedActions("export async function e() {\n  doWork();\n  await requireAdmin();\n}");
    for (const { body } of [...forgotAwait, ...inComment, ...late]) expect(body).not.toMatch(firstStatementIs("requireAdmin"));
  });
});

describe("API routes check who is asking", () => {
  // The auth library, the health check and the private-link routes (covered below) are exempt.
  const routes = filesUnder(path.join(APP, "api"), (n) => n === "route.ts").filter((f) => {
    const r = rel(f);
    return !r.includes("/api/auth/") && !r.includes("/api/health/") && !r.includes("/api/s/");
  });

  it("finds the routes (so this guard can't pass by checking nothing)", () => {
    expect(routes.length).toBeGreaterThanOrEqual(1);
  });

  it.each(routes.map((f) => [rel(f), f]))("%s: every handler starts by requiring a signed-in user and stops if there is none", (_label, file) => {
    const handlers = exportedActions(fs.readFileSync(file, "utf8"));
    expect(handlers.length, "no handlers found: is the route written as `export const GET = ...`?").toBeGreaterThan(0);
    for (const { name, body } of handlers) {
      expect(body, `${name} must check the session first`).toMatch(
        /^\{\s*(?:const \w+ = await require(?:User|Admin)\(\)|const (\w+) = await getSessionUser\(\);\s*if \(!\1\b[^)]*\) return )/,
      );
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
