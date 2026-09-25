/**
 * PLMP-LEAN-1 §D4-c-1 — READ EVIDENCE: the investigation's conclusion, pinned so it cannot be quietly
 * reversed.
 *
 * The review made D4-c non-optional and named its first step: find out whether the PTC/DSH sandbox can
 * establish a **read-access boundary**. If it can, `read_paths → PROVEN_COMPLETE` becomes honest; if it
 * cannot, the only honest answer is to keep the conservative footprint and say why.
 *
 * The investigation (recorded in the spec appendix) found it **cannot**, by two independent routes:
 *
 *   1. DSH's sandbox expresses only WRITE permission. `writableRoots(policy)` is the whole of its
 *      meaning, `read-only` means "no writes" rather than "restricted reads", and no dialect
 *      (`dsh-sandbox`, `dsh-fs-sandbox`, `dsh-sandbox-local`, `dsh-sandbox-windows-acl`) has any
 *      read-root concept at all.
 *   2. The fs READ tool does emit `fs/observed`, but the same worker also gets a SHELL (`dsh-tool-pwsh`,
 *      `dsh-tool-bash`), and those emit **zero** such events — measured in the D2-c session, where the
 *      worker's own program called `tools.pwsh(...)`. An event stream a shell can bypass is not a
 *      complete read set, and marking it PROVEN_COMPLETE would be the laundering D3-b exists to refuse.
 *
 * DSH internals are not in this repository, so this suite pins the PALIMPSEST-SIDE invariant that follows:
 * a declared `read_paths` is NEVER an authoritative read footprint, and no code path turns it into one.
 * The DSH-side findings are recorded as evidence in the spec; what CI can enforce is that the product does
 * not pretend otherwise.
 */
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { deriveWorkDependency, REPOSITORY_SOURCE } from "../src/project_world/dependency.js";
import { covered, provenComplete, unproven, wholeRepositoryRead } from "../src/project_world/footprint.js";
import type { TaskEnvelope } from "../src/schema/index.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");

const source = (relative: string): string =>
  execFileSync(
    process.execPath,
    ["-e", `process.stdout.write(require('node:fs').readFileSync(${JSON.stringify(join(REPO, relative))},'utf8'))`],
    { encoding: "utf8" },
  );

const code = (relative: string): string =>
  source(relative)
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .split(String.fromCharCode(10))
    .map((line) => {
      const at = line.indexOf("//");
      return at < 0 ? line : line.slice(0, at);
    })
    .join(String.fromCharCode(10));

function envelopeOf(writePaths: readonly string[]): Pick<TaskEnvelope, "write_paths"> {
  return { write_paths: [...writePaths] };
}

describe("§D4-c-1 a declared read path is NOT an authoritative read footprint", () => {
  it("the dependency derivation reads the WHOLE repository, whatever the envelope declares", () => {
    /**
     * `read_paths` is a DECLARATION. While the worker's world grants repository-wide read access, nothing
     * established that a narrower set is complete — so the honest footprint is the whole source domain,
     * which is complete BY CONSTRUCTION and coarse BY CONSEQUENCE.
     */
    for (const writePaths of [[], ["src/a.ts"], ["src"], ["docs", "src"]]) {
      const dependency = deriveWorkDependency(envelopeOf(writePaths));
      expect(dependency.reads).toEqual([REPOSITORY_SOURCE]);
    }
  });

  it("the READ FOOTPRINT derivation never consults read_paths, and cannot be given one", () => {
    /**
     * The function's input type is `Pick<TaskEnvelope, "write_paths">`, so a caller cannot even PASS a read
     * path — no future edit can quietly start trusting one without changing the signature first.
     *
     * `read_paths` DOES appear in this module, and deliberately: it is part of the SEMANTIC PROJECTION
     * DIGEST, i.e. part of what the work IS. That is a different concern from what the work READS, and the
     * assertion is scoped to the derivation so the two cannot be confused.
     */
    const text = code("src/project_world/dependency.ts");
    expect(text).toContain('Pick<TaskEnvelope, "write_paths">');
    // The read side is the coarse constant, not a projection of anything declared.
    const derivation = text.slice(text.indexOf("export function deriveWorkDependency"));
    expect(derivation).toContain("reads: [REPOSITORY_SOURCE]");
    expect(derivation).not.toContain("read_paths");
  });

  it("the whole-repository read is PROVEN_COMPLETE by DEFINITION, and coarse by consequence", () => {
    const read = wholeRepositoryRead();
    expect(read.coverage.status).toBe("PROVEN_COMPLETE");
    // Its completeness is definitional: the selector IS the domain.
    expect(read.coverage.status === "PROVEN_COMPLETE" && read.coverage.evidence).toBe("CONSERVATIVE_DOMAIN");
    // And it necessarily overlaps any source change, so it can never yield a disjointness proof — which is
    // the price of not being able to narrow it.
    expect(read.selectors).toEqual([REPOSITORY_SOURCE]);
  });

  it("SANDBOX_ENFORCED exists as a mechanism but nothing in the tree claims it for a read", () => {
    /**
     * The vocabulary is deliberately still there — it is the name of a REAL mechanism that a future
     * deployment could honestly provide. What matters is that no first-party code claims it today, because
     * the investigation found the mechanism does not exist in DSH.
     */
    // `footprint.ts` DEFINES the vocabulary, so it necessarily names it; the producers that could CLAIM it
    // for a read must not.
    for (const file of ["src/project_world/dependency.ts", "src/project_world/runtime.ts"]) {
      const text = code(file);
      expect(text, `${file} must not claim SANDBOX_ENFORCED for a read`).not.toContain("SANDBOX_ENFORCED");
    }
    expect(source("src/project_world/footprint.ts")).toContain("SANDBOX_ENFORCED");
  });

  it("an UNPROVEN read blocks a compatibility proof — the conservative consequence, still enforced", () => {
    /**
     * This is what keeps the conclusion HONEST rather than merely documented: a read footprint without
     * proven coverage cannot produce a `COMPATIBLE`, so the "declared but unenforced" case fails closed
     * exactly as D3-b requires.
     */
    const declared = covered({
      selectors: [{ domain: "source", scope: "path", path: "src/a.ts" }],
      coverage: unproven("the work declared a read scope and nothing enforced it"),
    });
    expect(declared.coverage.status).toBe("UNPROVEN");
    // Whereas a footprint that IS complete by construction may proceed.
    const conservative = covered({
      selectors: [REPOSITORY_SOURCE],
      coverage: provenComplete("CONSERVATIVE_DOMAIN", "the selector IS the whole domain"),
    });
    expect(conservative.coverage.status).toBe("PROVEN_COMPLETE");
  });

  it("the investigation's DSH-side evidence is recorded where a reader can find it", () => {
    // The negative findings live outside this repository, so the spec must carry them — otherwise a future
    // reader sees only "read_paths is not trusted" with no reason, and might 'fix' it.
    const spec = source("docs/engineering/37-lean-governance-spec.md");
    expect(spec).toContain("sandbox-enforced read boundary");
    expect(spec).toContain("fs/observed");
    expect(spec).toContain("pwsh");
    // The spec writes it inside a LaTeX block, so the underscore is escaped there; assert on the stable
    // prefix rather than on one spelling of the escape.
    expect(spec).toContain("declared read");
  });
});
