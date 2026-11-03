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
 * APS-A deliberately REDUCES this tier to the six verbs an ordinary project session needs:
 *
 *   start       create the project / its first plan
 *   work        the one Work facade (status/plan/next/run/start/begin/complete/propose/explore)
 *   continuity  the derived current understanding and the decision-oriented pulse
 *   project     the derived workspace, journal and decisions
 *   delegate    async RESEARCH delegation (when composed)
 *   contribute  record another executor's finding and connect it to the plan (when composed)
 *
 * `collaborate`, `cross_project`, `outcome`, `verification`, `review`, `surfaces` and the legacy
 * chain remain available under `expert`/`all`. They are not removed; they stop competing for the
 * ordinary session's attention.
 */
const NORMAL_VISIBLE = new Set<string>([
  "palimpsest_start",
  "palimpsest_project",
  "palimpsest_work",
  "palimpsest_continuity",
  "palimpsest_delegate",
  "palimpsest_contribute",
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
