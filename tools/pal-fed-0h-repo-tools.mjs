#!/usr/bin/env node
/**
 * PAL-FED-0H read-only repository tools (EXPERIMENT HARNESS, not product).
 *
 * Registers list/read/search/read-only-git tools scoped to this host, jailed to
 * the peer's own workspace root. No writes, no cross-workspace access, no
 * network. Mounted identically in both treatment arms.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

import { defineTool } from "@deepseek-ai/dsh-tools";

export const name = "pal-fed-0h-repo-tools";
export const inject = ["tools"];

const GIT_READONLY = new Set(["status", "log", "show", "diff", "rev-parse", "ls-files", "branch", "describe", "cat-file", "grep"]);
const MAX_READ = 20_000;
const MAX_LIST = 400;
const MAX_GREP = 150;

function jail(root, p) {
  const abs = resolve(root, p ?? ".");
  const rel = relative(root, abs);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`path escapes the workspace: ${p}`);
  }
  return abs;
}

function text(value) {
  return [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }];
}

export function apply(ctx, config) {
  const root = resolve(config.root);
  // H2 only: model-visible source provenance sidecar. Absent/undefined in H0/H1,
  // where every result reports provenance: null. No winner/answer fields exist.
  const provenance = config.provenancePath !== undefined && existsSync(config.provenancePath)
    ? JSON.parse(readFileSync(config.provenancePath, "utf8")).sources ?? {}
    : {};
  const provFor = (rel) => provenance[String(rel).split("\\").join("/")] ?? null;
  const defs = [
    defineTool({
      name: "repo_list",
      description: "List entries of a directory in your own workspace (relative path, default '.').",
      parameters: { path: { type: "string" } },
      output: { schema: { type: "json" }, render: (_a, v) => text(v) },
      execute: async (args) => {
        const dir = jail(root, args.path);
        const entries = readdirSync(dir, { withFileTypes: true }).slice(0, MAX_LIST).map((e) => ({ name: e.name, type: e.isDirectory() ? "dir" : "file" }));
        const provenanceByPath = {};
        for (const e of entries) { const rel = (relative(root, dir) ? relative(root, dir) + "/" : "") + e.name; const p = provFor(rel); if (p !== null) provenanceByPath[rel] = p; }
        return { path: relative(root, dir) || ".", entries, provenanceByPath };
      },
    }),
    defineTool({
      name: "repo_read",
      description: `Read a text file from your own workspace (bounded to ${MAX_READ} chars).`,
      parameters: { path: { type: "string", required: true } },
      output: { schema: { type: "json" }, render: (_a, v) => text(v) },
      execute: async (args) => {
        const file = jail(root, args.path);
        if (!statSync(file).isFile()) throw new Error(`not a file: ${args.path}`);
        const content = readFileSync(file, "utf8");
        const rel = relative(root, file);
        return { path: args.path, truncated: content.length > MAX_READ, content: content.slice(0, MAX_READ), provenance: provFor(rel) };
      },
    }),
    defineTool({
      name: "repo_search",
      description: `Search text files in your own workspace for a literal string (bounded to ${MAX_GREP} matches).`,
      parameters: { query: { type: "string", required: true }, path: { type: "string" } },
      output: { schema: { type: "json" }, render: (_a, v) => text(v) },
      execute: async (args) => {
        const base = jail(root, args.path);
        const matches = [];
        const walk = (dir) => {
          if (matches.length >= MAX_GREP) return;
          for (const e of readdirSync(dir, { withFileTypes: true })) {
            if (matches.length >= MAX_GREP) return;
            if (e.name === ".git" || e.name === "node_modules") continue;
            const full = join(dir, e.name);
            if (e.isDirectory()) walk(full);
            else {
              let content;
              try { content = readFileSync(full, "utf8"); } catch { continue; }
              const lines = content.split(String.fromCharCode(10));
              for (let i = 0; i < lines.length && matches.length < MAX_GREP; i += 1) {
                if (lines[i].includes(args.query)) matches.push(`${relative(root, full)}:${i + 1}: ${lines[i].trim().slice(0, 200)}`);
              }
            }
          }
        };
        walk(base);
        const provenanceByPath = {};
        for (const m of matches) { const rel = m.split(":")[0]; const p = provFor(rel); if (p !== null) provenanceByPath[rel] = p; }
        return { query: args.query, count: matches.length, matches, provenanceByPath };
      },
    }),
    defineTool({
      name: "repo_git",
      description: "Run a read-only git inspection command (status, log, show, diff, rev-parse, ls-files, branch, describe, cat-file, grep) in your own workspace.",
      parameters: { args: { type: "array", items: { type: "string" }, required: true } },
      output: { schema: { type: "json" }, render: (_a, v) => text(v) },
      execute: async (args) => {
        const argv = Array.isArray(args.args) ? args.args.map(String) : [];
        if (argv.length === 0 || !GIT_READONLY.has(argv[0])) {
          throw new Error(`only read-only git subcommands are allowed: ${[...GIT_READONLY].join(", ")}`);
        }
        if (argv.some((a) => a.startsWith("-c") || a.includes("--exec") || a.includes("--output"))) {
          throw new Error("unsupported git argument");
        }
        const out = execFileSync("git", argv, { cwd: root, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
        return { args: argv, output: out.slice(0, MAX_READ) };
      },
    }),
  ];
  for (const def of defs) ctx.tools.register(def);
}
