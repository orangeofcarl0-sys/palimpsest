import { execFileSync } from "node:child_process";
import { accessSync, constants, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  currentProcedureRevision, deriveProcedureStandings, parseProcedureRef, publishedRevisionsOf,
  retirementsOf, sameProcedureRef, SqliteProcedureStore, type ProcedureRef,
} from "../procedures/index.js";

export interface FocusedTestingSelection {
  readonly storePath: string;
  readonly procedure: ProcedureRef;
}

export const FOCUSED_VITEST_CAPABILITY = "palimpsest.focused-vitest-readonly/v1";
const argv = Object.freeze(["node", "node_modules/vitest/vitest.mjs", "run", "--configLoader", "runner", "--no-cache"]);

function observeEnvironment(repository: string): string | undefined {
  if (process.platform !== "linux" || Number(process.versions.node.split(".")[0]) < 24) return;
  const modules = join(repository, "node_modules");
  try {
    accessSync(modules, constants.W_OK);
    return;
  } catch (error) {
    if (!["EACCES", "EROFS", "EPERM"].includes((error as NodeJS.ErrnoException).code ?? "")) return;
  }
  const manifest = JSON.parse(readFileSync(join(repository, "package.json"), "utf8"));
  const runner = JSON.parse(readFileSync(join(modules, "vitest", "package.json"), "utf8"));
  if (manifest.name !== "palimpsest-dsh" || manifest.devDependencies?.vitest !== "4.1.10" || runner.version !== "4.1.10") return;
  accessSync(join(repository, argv[1]!), constants.R_OK);
  accessSync(join(repository, "vitest.config.ts"), constants.R_OK);
  const git = (...args: string[]) => execFileSync("git", ["-C", repository, ...args], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  const head = git("rev-parse", "--verify", "HEAD^{commit}");
  git("cat-file", "-e", `${head}:vitest.config.ts`);
  if (git("status", "--porcelain", "--", "package.json", "vitest.config.ts") !== "" || git("rev-parse", "HEAD") !== head) return;
  return head;
}

export function makeFocusedTesting(repository: string | undefined, selection?: FocusedTestingSelection) {
  const ref = selection && parseProcedureRef(selection.procedure);
  const path = selection?.storePath;
  return Object.freeze({
    /** An advisory read before choosing a test command. The caller retains execution and its exit status. */
    async read(): Promise<{ readonly procedure: ProcedureRef; readonly head: string; readonly argv: readonly string[] } | null> {
      if (!ref || !path || !repository || !existsSync(path)) return null;
      try {
        const store = new SqliteProcedureStore(path, { readOnly: true });
        try {
          const events = await store.replay(ref.procedureId);
          const revisions = publishedRevisionsOf(events);
          const current = currentProcedureRevision(revisions, deriveProcedureStandings(revisions, retirementsOf(events)));
          if (!current || !sameProcedureRef(current.ref, ref)) return null;
          const revision = revisions.find(row => row.revision === ref.revision);
          if (!revision?.content.capabilityHints.includes(FOCUSED_VITEST_CAPABILITY)) return null;
          const head = observeEnvironment(repository);
          return head ? Object.freeze({ procedure: ref, head, argv }) : null;
        } finally {
          store.close();
        }
      } catch {
        return null;
      }
    },
  });
}
