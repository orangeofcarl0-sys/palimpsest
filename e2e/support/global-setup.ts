/**
 * Spec 36 §12: the E2E suite exercises the REAL built product stack
 * (dist/src kernel + dist/web bundle). A stale or missing build would
 * silently test the wrong stack - fail fast with the exact remedy.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

export default function globalSetup(): void {
  const root = process.cwd();
  for (const relative of ["dist/src/serve.js", "dist/src/state/index.js", "dist/web/index.html"]) {
    if (!existsSync(join(root, relative))) {
      throw new Error(
        `E2E needs the built product stack - '${relative}' is missing. Run: pnpm build && pnpm build:web (pnpm test:e2e runs both via its pretest hook).`,
      );
    }
  }
}
