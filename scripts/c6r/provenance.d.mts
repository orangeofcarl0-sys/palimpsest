export declare const SOURCE_EVALUATION_SCHEMA: "c6r-source-evaluation/v1";

export interface SourceEvaluationInput {
  readBlob: (input: { head: string; path: string }) => string | null;
  resolveHead: (ref: string) => string | null;
  observedHead: string;
  path: string;
  at: string;
  subject: { kind: string; id: string };
  expected?: { digest: string; source?: string } | undefined;
  workingTreeDigest?: string | undefined;
  digest: (text: string) => string;
}

export interface SourceEvaluation {
  schema: "c6r-source-evaluation/v1";
  qualified: boolean;
  unqualifiedReason: string | null;
  canonicalBasis: "COMMITTED_BLOB";
  evaluationAt?: string;
  subject?: { kind: string; id: string };
  path?: string;
  observedHead?: string;
  committedBlobDigest?: string;
  expectedDigest?: string | null;
  equalsExpected?: boolean | null;
  expectedSource?: string | null;
  workingTree?: {
    digest: string;
    canonical: false;
    relation: "SAME_BYTES" | "DIFFERENT_RENDERING_OR_CONTENT";
    note: string;
  } | null;
}

export declare function evaluateCanonicalSource(input: SourceEvaluationInput): SourceEvaluation;

export interface WorldSourceEvaluationInput {
  workDir: string;
  git: (args: string[], options: { cwd: string; encoding: "utf8" }) => string;
  readFile: (path: string) => string;
  digest: (text: string | Buffer) => string;
  join: (...parts: string[]) => string;
  observedHead: string;
  path: string;
  at: string;
  subject: { kind: string; id: string };
  expected?: { digest: string; source?: string } | undefined;
}

export declare function evaluateCanonicalSourceInWorld(input: WorldSourceEvaluationInput): SourceEvaluation;

export declare function requireQualified(record: SourceEvaluation): SourceEvaluation;
