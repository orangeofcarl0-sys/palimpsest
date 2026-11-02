/**
 * PC1 S02-R01 — the tool VISIBILITY tiers.
 *
 * This module decides what a deployment ADVERTISES; it decides nothing about what a tool may do.
 * A tool that disappears from the normal catalogue is still the same tool under `expert`, with the
 * same authority. The reverse is what the tier must prevent: a normal profile that lists both the
 * legacy Work chain (`next`/`claim`/`report`) and the product facade (`begin`/`finish`/`work`) makes
 * the agent guess which one applies, and the guess is not a semantic decision the agent should have
 * to make.
 *
 * The normal catalogue is deliberately small and names the product path. Everything else is
 * reachable under `expert` (or `all`, its alias) for compatibility, debugging and research.
 */
import type { DshToolDefinition } from "../../tools/dsh_types.js";

export type ToolProfile = "legacy" | "normal" | "expert" | "all";

/** The historical nine Work tools. */
const LEGACY_BASE = [
  "palimpsest_start",
  "palimpsest_plan",
  "palimpsest_next",
  "palimpsest_preview",
  "palimpsest_run",
  "palimpsest_claim",
  "palimpsest_report",
  "palimpsest_gate",
  "palimpsest_status",
] as const;

/**
 * The normal product path. Names are exact; a tool that is not composed simply does not appear.
 *
 * `palimpsest_work` is the one work facade (status/plan/next/run/begin/complete/propose).
 * `palimpsest_project` is the derived project view/journal/proposal surface.
 * The collaboration/verification facades are included only when their owners compose them.
 */
const NORMAL_VISIBLE = new Set<string>([
  "palimpsest_start",
  "palimpsest_status",
  "palimpsest_project",
  "palimpsest_work",
  "palimpsest_continuity",
  "palimpsest_review",
  "palimpsest_surfaces",
  "palimpsest_verification",
  "palimpsest_collaborate",
  "palimpsest_delegate",
  "palimpsest_cross_project",
]);

export function applyToolProfile(
  tools: readonly DshToolDefinition[],
  profile: ToolProfile | undefined,
): readonly DshToolDefinition[] {
  const effective: ToolProfile = profile ?? "expert";
  if (effective === "all" || effective === "expert") return tools;
  if (effective === "legacy") {
    const base = new Set<string>(LEGACY_BASE);
    return tools.filter((tool) => base.has(tool.name));
  }
  return tools.filter((tool) => NORMAL_VISIBLE.has(tool.name));
}

/** The tier names this build understands, for a profile validator/doctor. */
export const TOOL_PROFILES: readonly ToolProfile[] = ["legacy", "normal", "expert", "all"];
