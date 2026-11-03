/**
 * PC1 S03 — the continuity tool.
 *
 * A NEW tool rather than new actions on `palimpsest_project`: the parity contract allows a reviewed
 * tool ADDITION, while changing an existing tool's action set is deliberately not grantable. The tool
 * is a thin adapter over the project workspace surface, which in turn composes the derived continuity
 * service. It reads existing owners and returns standing + basis + sources; it writes nothing.
 */
import type { PalimpsestApplicationSurface } from "../../application/surface.js";
import type { DshToolDefinition } from "../../tools/dsh_types.js";
import { tool, ToolArgsError, requiredString } from "./common.js";

export function defineContinuityTool(application: PalimpsestApplicationSurface): DshToolDefinition[] {
  const workspace = application.projectWorkspace;
  if (workspace === undefined) return [];
  return [
    tool({
      name: "palimpsest_continuity",
      description:
        "Read the project's CURRENT UNDERSTANDING with its standing and basis, or the DECISION-ORIENTED PULSE for continuing the project. `pulse` is the first read for a new Session: it combines the current goal and binding constraints, accepted assets, candidates, negative findings, open questions, recent material changes, pending Work, recorded contributions and their decision chain, in-flight / terminal / interrupted delegations, and two deliberately separate next-action lists — `mechanical` (what the product can legally execute) and `decisionRelevant` (advisory judgements, never authority). `summary` separates accepted-for-purpose facts, delivered candidates, negative findings, open questions/interpretations, pending work and blocked effects; every item carries source refs, the project revision/head it was derived at, and what would reopen it. `explain` returns the same facts for one ref (e.g. journal:pje-…, task:…, commit:…, requirement:…). `context_capsule` renders the same projection under a hard byte budget; when a section does not fit it is named in `omitted` and `complete` is false — the capsule never silently drops a safety fact. This is a DERIVED read: it owns no store and cannot accept, approve, plan or promote anything.",
      mode: "read-only",
      actions: ["pulse", "summary", "explain", "context_capsule"],
      extraProperties: {
        subject: { type: "string", description: "for explain: a projection id or source ref" },
        maxBytes: { type: "number", description: "for context_capsule: hard UTF-8 byte budget (default 8192)" },
      },
      run: async (action, object) => {
        if (action === "pulse") return workspace.pulse();
        if (action === "summary") return workspace.summary();
        if (action === "explain") return workspace.explain(requiredString(object, "subject"));
        const maxBytes = object.maxBytes;
        if (maxBytes !== undefined && (typeof maxBytes !== "number" || !Number.isSafeInteger(maxBytes) || maxBytes < 1)) {
          throw new ToolArgsError('argument "maxBytes" must be a positive integer when given');
        }
        return workspace.contextCapsule(maxBytes === undefined ? {} : { maxBytes });
      },
    }),
  ];
}
