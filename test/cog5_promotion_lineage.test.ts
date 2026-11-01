/**
 * COG-5 C5-A — the POST-PROMOTION APPLICABILITY ANCHOR.
 *
 * The defect this suite pins: the packaged continuation compares a result's ORIGIN source revision to the
 * CURRENT source revision. For a promoted result, that interval includes the result's own accepted output, so
 * the result collides with itself and the product reports `INCOMPATIBLE` for a change that is its own effect.
 *
 * The correction is not a compatibility-policy change. It selects a different OBSERVED interval, and only
 * after the recorded Git graph proves the promotion lineage:
 *
 *     resultCommit ⊆ resultingHeadCommit ⊆ currentSourceRevision
 *
 * Nothing here assesses compatibility. The resolver answers one question — which accepted revision may be used
 * as the baseline for the "what changed afterwards?" question — and answers `UNPROVEN` rather than guessing.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import type { PromotionFact } from "../src/domain/project_head.js";
import {
  gitAncestryProbe,
  resolvePromotionBaseline,
  type AncestryProbe,
  type AncestryVerdict,
} from "../src/deployment/promotion_lineage.js";

const H0 = "a".repeat(40);
const RESULT = "b".repeat(40);
const HEAD1 = "c".repeat(40);
const HEAD2 = "d".repeat(40);
const OTHER = "e".repeat(40);

const fact = (overrides: Partial<PromotionFact> = {}): PromotionFact => ({
  eventId: "41",
  promotionId: "promotion-1",
  attemptId: "attempt-1",
  sourceCommit: RESULT,
  expectedHeadCommit: H0,
  resultingHeadCommit: HEAD1,
  ...overrides,
});

/** A probe that says exactly what the test tells it to, and never pretends to know an unlisted pair. */
function probeFrom(pairs: Record<string, AncestryVerdict>): AncestryProbe {
  return ({ ancestor, descendant }) =>
    pairs[`${ancestor}->${descendant}`] ?? "UNKNOWN";
}

const lineageProven = (): AncestryProbe =>
  probeFrom({
    [`${RESULT}->${HEAD1}`]: "PROVEN",
    [`${H0}->${HEAD1}`]: "PROVEN",
    [`${HEAD1}->${HEAD2}`]: "PROVEN",
    [`${HEAD1}->${HEAD1}`]: "PROVEN",
  });

describe("COG-5 §5.5 — the promotion baseline is the accepted head, not the result commit", () => {
  it("A. a promoted result with no later change uses the resulting head as its baseline", () => {
    const baseline = resolvePromotionBaseline({
      attemptId: "attempt-1",
      resultCommit: RESULT,
      currentSourceRevision: HEAD1,
      promotionFacts: [fact()],
      provesAncestry: lineageProven(),
    });
    expect(baseline.state).toBe("PROMOTED");
    if (baseline.state !== "PROMOTED") throw new Error("expected PROMOTED");
    // The result commit is NOT the accepted head. The accepted head is what the promotion recorded.
    expect(baseline.baselineRevision).toBe(HEAD1);
    expect(baseline.baselineRevision).not.toBe(RESULT);
    expect(baseline.promotionId).toBe("promotion-1");
    expect(baseline.eventId).toBe("41");
  });

  it("B. a promoted result with later external changes keeps the accepted head as the baseline", () => {
    const baseline = resolvePromotionBaseline({
      attemptId: "attempt-1",
      resultCommit: RESULT,
      currentSourceRevision: HEAD2,
      promotionFacts: [fact()],
      provesAncestry: lineageProven(),
    });
    expect(baseline.state).toBe("PROMOTED");
    if (baseline.state !== "PROMOTED") throw new Error("expected PROMOTED");
    // The change interval becomes HEAD1..HEAD2 — external changes only, not RESULT..HEAD2.
    expect(baseline.baselineRevision).toBe(HEAD1);
  });

  it("C. an unpromoted result keeps the origin interval", () => {
    const baseline = resolvePromotionBaseline({
      attemptId: "attempt-1",
      resultCommit: RESULT,
      currentSourceRevision: HEAD1,
      promotionFacts: [],
      provesAncestry: lineageProven(),
    });
    expect(baseline.state).toBe("UNPROMOTED");
  });

  it("D. a result with no source output has no promotion lineage to resolve", () => {
    const baseline = resolvePromotionBaseline({
      attemptId: "attempt-1",
      resultCommit: null,
      currentSourceRevision: HEAD1,
      promotionFacts: [fact({ sourceCommit: RESULT })],
      provesAncestry: lineageProven(),
    });
    expect(baseline.state).toBe("NO_SOURCE_RESULT");
  });

  it("E. a promotion fact for ANOTHER attempt cannot anchor this result", () => {
    const baseline = resolvePromotionBaseline({
      attemptId: "attempt-1",
      resultCommit: RESULT,
      currentSourceRevision: HEAD1,
      promotionFacts: [fact({ attemptId: "attempt-2" })],
      provesAncestry: lineageProven(),
    });
    expect(baseline.state).toBe("UNPROMOTED");
  });
});

describe("COG-5 §5.5 — unproven lineage fails closed, never falls back to origin", () => {
  const expectUnproven = (baseline: ReturnType<typeof resolvePromotionBaseline>): void => {
    expect(baseline.state).toBe("UNPROVEN");
    if (baseline.state !== "UNPROVEN") throw new Error("expected UNPROVEN");
    expect(baseline.detail.length).toBeGreaterThan(0);
    // The whole point: no origin fallback, and no fabricated accepted head.
    expect(Object.keys(baseline)).not.toContain("baselineRevision");
  };

  it("F. two committed promotions for one attempt are ambiguous", () => {
    expectUnproven(
      resolvePromotionBaseline({
        attemptId: "attempt-1",
        resultCommit: RESULT,
        currentSourceRevision: HEAD2,
        promotionFacts: [fact(), fact({ eventId: "42", promotionId: "promotion-2", resultingHeadCommit: HEAD2 })],
        provesAncestry: lineageProven(),
      }),
    );
  });

  it("G. a promotion whose source commit is not this result cannot anchor it", () => {
    expectUnproven(
      resolvePromotionBaseline({
        attemptId: "attempt-1",
        resultCommit: RESULT,
        currentSourceRevision: HEAD1,
        promotionFacts: [fact({ sourceCommit: OTHER })],
        provesAncestry: lineageProven(),
      }),
    );
  });

  it("H. a result that Git does not prove inside the accepted head is unproven", () => {
    expectUnproven(
      resolvePromotionBaseline({
        attemptId: "attempt-1",
        resultCommit: RESULT,
        currentSourceRevision: HEAD1,
        promotionFacts: [fact()],
        provesAncestry: probeFrom({
          [`${RESULT}->${HEAD1}`]: "DISPROVEN",
          [`${H0}->${HEAD1}`]: "PROVEN",
        }),
      }),
    );
  });

  it("I. an accepted head that Git does not prove inside the current source is unproven", () => {
    expectUnproven(
      resolvePromotionBaseline({
        attemptId: "attempt-1",
        resultCommit: RESULT,
        currentSourceRevision: HEAD2,
        promotionFacts: [fact()],
        provesAncestry: probeFrom({
          [`${RESULT}->${HEAD1}`]: "PROVEN",
          [`${H0}->${HEAD1}`]: "PROVEN",
          [`${HEAD1}->${HEAD2}`]: "DISPROVEN",
        }),
      }),
    );
  });

  it("J. an UNKNOWN ancestry answer is unproven, not a pass", () => {
    expectUnproven(
      resolvePromotionBaseline({
        attemptId: "attempt-1",
        resultCommit: RESULT,
        currentSourceRevision: HEAD1,
        promotionFacts: [fact()],
        provesAncestry: probeFrom({ [`${H0}->${HEAD1}`]: "PROVEN" }),
      }),
    );
  });

  it("K. a malformed fact whose expected head is not in the accepted head is unproven", () => {
    expectUnproven(
      resolvePromotionBaseline({
        attemptId: "attempt-1",
        resultCommit: RESULT,
        currentSourceRevision: HEAD1,
        promotionFacts: [fact()],
        provesAncestry: probeFrom({
          [`${RESULT}->${HEAD1}`]: "PROVEN",
          [`${H0}->${HEAD1}`]: "DISPROVEN",
        }),
      }),
    );
  });

  it("L. an unobservable current source is unproven", () => {
    expectUnproven(
      resolvePromotionBaseline({
        attemptId: "attempt-1",
        resultCommit: RESULT,
        currentSourceRevision: null,
        promotionFacts: [fact()],
        provesAncestry: lineageProven(),
      }),
    );
  });
});

describe("COG-5 §5.5 — the Git probe answers three ways from the real graph", () => {
  const root = mkdtempSync(join(tmpdir(), "cog5-lineage-"));
  const repo = join(root, "repo");
  let result = "";
  let external = "";
  let merged = "";

  const git = (args: readonly string[]): string =>
    execFileSync("git", ["-c", "user.email=cog5@example.invalid", "-c", "user.name=cog5", ...args], {
      cwd: repo,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();

  it("prepares a real graph: H0 → result, H0 → external, merge(result, external)", () => {
    execFileSync("git", ["init", "-q", repo], { stdio: "ignore" });
    writeFileSync(join(repo, "seed.txt"), "seed\n");
    git(["add", "seed.txt"]);
    git(["commit", "-qm", "seed"]);
    writeFileSync(join(repo, "result.txt"), "result\n");
    git(["add", "result.txt"]);
    git(["commit", "-qm", "result"]);
    result = git(["rev-parse", "HEAD"]);
    git(["checkout", "-q", "-b", "external", "HEAD~1"]);
    writeFileSync(join(repo, "external.txt"), "external\n");
    git(["add", "external.txt"]);
    git(["commit", "-qm", "external"]);
    external = git(["rev-parse", "HEAD"]);
    git(["checkout", "-q", "-"]);
    git(["merge", "--no-ff", "-m", "promote result onto external", "external"]);
    merged = git(["rev-parse", "HEAD"]);

    expect(git(["rev-parse", "HEAD^{tree}"])).toMatch(/^[0-9a-f]{40}$/u);
    expect(result).not.toBe(external);
    expect(merged).not.toBe(result);
    expect(merged).not.toBe(external);
  });

  it("the probe proves the result is contained in the accepted merge", () => {
    const probe = gitAncestryProbe(repo);
    expect(probe({ ancestor: result, descendant: merged })).toBe("PROVEN");
    expect(probe({ ancestor: external, descendant: merged })).toBe("PROVEN");
    expect(probe({ ancestor: result, descendant: external })).toBe("DISPROVEN");
    expect(probe({ ancestor: external, descendant: result })).toBe("DISPROVEN");
    expect(probe({ ancestor: result, descendant: result })).toBe("PROVEN");
  });

  it("the probe reports an unobservable object as UNKNOWN, never DISPROVEN", () => {
    const probe = gitAncestryProbe(repo);
    expect(probe({ ancestor: "f".repeat(40), descendant: merged })).toBe("UNKNOWN");
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });
});
