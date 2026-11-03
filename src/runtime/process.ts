/**
 * PC1 S07-R04 — stop the WHOLE process tree, not just the direct child.
 *
 * A provider/gateway child may spawn subprocesses; signalling only the parent leaves work running.
 * POSIX uses the process group this module creates (`detached: true`); Windows uses `taskkill /T /F`.
 */
import { execFileSync } from "node:child_process";

export function terminateProcessTree(pid: number): { readonly signal: string; readonly ok: boolean; readonly detail: string } {
  if (!Number.isSafeInteger(pid) || pid <= 0) return { signal: "NONE", ok: false, detail: "invalid pid" };
  if (process.platform === "win32") {
    try {
      execFileSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
      return { signal: "taskkill", ok: true, detail: "taskkill /T /F requested for the tree" };
    } catch (error) {
      return { signal: "taskkill", ok: false, detail: error instanceof Error ? error.message : String(error) };
    }
  }
  try {
    process.kill(-pid, "SIGKILL");
    return { signal: "SIGKILL", ok: true, detail: "SIGKILL sent to the process group" };
  } catch (error) {
    try {
      process.kill(pid, "SIGKILL");
      return { signal: "SIGKILL", ok: true, detail: `process group unavailable; SIGKILL sent to pid ${pid}` };
    } catch (fallback) {
      return { signal: "SIGKILL", ok: false, detail: fallback instanceof Error ? fallback.message : String(error) };
    }
  }
}
