/**
 * SR-1C §21 — the golden structural parity capture.
 *
 * ONE implementation, used by `scripts/audit/application-parity.mjs` (to capture the fixture
 * from the canonical baseline) and by `test/architecture/application_parity.test.ts` (to compare
 * the refactored tree against it). Capturing it twice would let the fixture and its checker drift.
 *
 * What it records, for TWO equivalent installations:
 *
 *   packagedInstallation  the packaged deployment path with the first-party collaboration bundle
 *                         (`launchDeployment` over a normal profile) — the shape every harness and
 *                         dogfood uses. No model, no network: composing only.
 *   minimalInstallation   `installPalimpsest` with only the required options, which is where the
 *                         ABSENCE behaviour is visible: a capability that was not configured is
 *                         not a stub, it is not a key.
 *
 * Per installation: the installed capability keys, the aggregate application surface keys, the
 * DSH tool catalogue with its action sets AND its full adapter contract (description plus canonical
 * parameter schema — §8), and the faces present at runtime. All indices are sorted, so the capture
 * is deterministic; no timestamps, absolute paths or random ids are stored.
 */

import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export interface ParityToolEntry {
  readonly name: string;
  readonly mode: string;
  readonly actions: readonly string[];
  /**
   * SR-1 closure §8 — the ORIGINAL intent of this fixture was to pin the contract a host sees, but
   * it only recorded name/mode/action-enum. A structural extraction is exactly the kind of change
   * that can drop a `required` field, rename a property or narrow an enum while the action list
   * stays identical, and that would have passed. These three fields close that gap.
   */
  readonly description: string;
  /** The parameter schema as canonical JSON (recursively key-sorted; arrays keep their order). */
  readonly parameters: string;
  /** One stable digest over name + mode + description + canonical parameters. */
  readonly contractDigest: string;
}

/**
 * Canonical JSON: object keys sorted so two structurally-equal schemas serialize identically,
 * arrays left in place because enum and `required` ORDER is part of what a host renders.
 */
export function canonicalJson(value: unknown): string {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (node !== null && typeof node === "object") {
      const source = node as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(source).sort()) out[key] = walk(source[key]);
      return out;
    }
    return node;
  };
  return JSON.stringify(walk(value));
}

/** One digest over the whole adapter contract, so a single value pins it. */
export function toolContractDigest(parts: {
  readonly name: string;
  readonly mode: string;
  readonly description: string;
  readonly parameters: string;
}): string {
  return createHash("sha256")
    .update([parts.name, parts.mode, parts.description, parts.parameters].join("\u0000"))
    .digest("hex");
}

export interface ParityInstallation {
  readonly installedCapabilityKeys: readonly string[];
  readonly applicationSurfaceKeys: readonly string[];
  readonly dshTools: readonly ParityToolEntry[];
  readonly applicationFacesPresent: readonly string[];
}

export interface ParityCapture {
  readonly packagedInstallation: ParityInstallation;
  readonly minimalInstallation: ParityInstallation & {
    readonly present: readonly string[];
    readonly absent: readonly string[];
  };
  /** §11: the HTTP route contract, probed per method against each installation. */
  readonly packagedRoutes: readonly ParityRouteEntry[];
  readonly minimalRoutes: readonly ParityRouteEntry[];
  /**
   * §10/§11 — readiness VALUES, not just keys: shape alone proves nothing about state parity.
   * One field is normalized: `branchAdapter` carries a host-supplied implementation id that
   * embeds the temporary profile namespace, so it is recorded as PRESENT/ABSENT instead. Every
   * other value is the canonical enum verbatim.
   */
  readonly readiness: Readonly<Record<string, string>> | null;
  readonly lifecycle: ParityLifecycleObservation;
  /**
   * §8/§14 P6/P7 — the ORDER in which the capture ran. Route and readiness probes must happen
   * while the installation/deployment is still ACTIVE; recording the step order makes that
   * machine-checkable instead of a claim in a comment.
   */
  readonly order: readonly string[];
}

type AnyRecord = Record<string, unknown>;

const toolEntries = (
  tools: readonly { readonly name: string; readonly mode?: string; readonly description?: string; readonly parameters?: unknown }[],
): ParityToolEntry[] =>
  tools
    .map((tool) => {
      const mode = typeof tool.mode === "string" ? tool.mode : "unknown";
      const description = typeof tool.description === "string" ? tool.description : "";
      const parameters = canonicalJson(tool.parameters ?? {});
      return {
        name: tool.name,
        mode,
        actions: [
          ...(((tool.parameters as { readonly properties?: { readonly action?: { readonly enum?: readonly string[] } } })
            ?.properties?.action?.enum ?? []) as readonly string[]),
        ],
        description,
        parameters,
        contractDigest: toolContractDigest({ name: tool.name, mode, description, parameters }),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

/**
 * Capture one installation. `distRoot` is the BUILT tree to load from, so the same code can
 * capture a baseline worktree and the branch's own build.
 */
export async function captureApplicationParity(distRoot: string): Promise<ParityCapture> {
  const dist = (relative: string): string => pathToFileURL(join(distRoot, "dist", "src", relative)).href;
  const { installPalimpsest } = (await import(dist("install.js"))) as {
    readonly installPalimpsest: (context: unknown, options: AnyRecord) => AnyRecord & { readonly dispose?: () => Promise<void> };
  };
  const { launchDeployment, parseDeploymentProfile } = (await import(dist("deployment/index.js"))) as {
    readonly launchDeployment: (profile: unknown) => { readonly installed: AnyRecord; readonly close: () => Promise<void> };
    readonly parseDeploymentProfile: (raw: unknown) => unknown;
  };
  const { handleApplicationRequest, applicationErrorStatus } = (await import(dist("application/http.js"))) as {
    readonly handleApplicationRequest: (input: AnyRecord) => Promise<AnyRecord | undefined>;
    readonly applicationErrorStatus: (error: unknown) => number;
  };
  const { defineApplicationTools } = (await import(dist("tools/application_tools.js"))) as {
    readonly defineApplicationTools: (application: unknown) => readonly { readonly name: string; readonly mode?: string; readonly parameters?: unknown }[];
  };

  const tmp = mkdtempSync(join(tmpdir(), "palimpsest-parity-"));
  const order: string[] = [];
  const registered: unknown[] = [];
  const context = { tools: { register: (definition: unknown) => (registered.push(definition), () => {}) } };

  const installed = installPalimpsest(context, {
    projectId: "parity-project",
    repository: distRoot,
    databasePath: join(tmp, "orchestration.sqlite"),
    ordariumDatabasePath: join(tmp, "ordarium.sqlite"),
  });
  const installedKeys = Object.keys(installed).sort();
  const minimalApplication = installed.application as AnyRecord;
  const minimal: ParityInstallation & { present: readonly string[]; absent: readonly string[] } = {
    installedCapabilityKeys: installedKeys,
    applicationSurfaceKeys: Object.keys(minimalApplication).sort(),
    dshTools: toolEntries(defineApplicationTools(minimalApplication)),
    applicationFacesPresent: Object.keys(minimalApplication).filter((key) => minimalApplication[key] !== undefined),
    present: installedKeys.filter((key) => installed[key] !== undefined),
    absent: installedKeys.filter((key) => installed[key] === undefined),
  };
  /* §8: probed while the installation is ACTIVE. */
  order.push("minimal:routes");
  const minimalRoutes = await probeRoutes(handleApplicationRequest, applicationErrorStatus, installed.application);

  order.push("minimal:dispose");
  await installed.dispose?.();

  const profile = parseDeploymentProfile({
    schemaVersion: 1,
    profileId: "parity-packaged",
    projectId: "parity-packaged-project",
    localPeer: "parity-peer",
    persistentPoint: "pp-parity",
    repository: distRoot,
    transport: { namespace: "parity", databasePath: join(tmp, "transport.sqlite") },
    databases: {
      orchestration: join(tmp, "p-orchestration.sqlite"),
      ordarium: join(tmp, "p-ordarium.sqlite"),
      coordination: join(tmp, "p-coordination.sqlite"),
      transportCursors: join(tmp, "p-cursors.sqlite"),
      attentionMarks: join(tmp, "p-attention.sqlite"),
    },
    directory: [{ peerId: "parity-peer", competenceTags: ["parity"] }],
    projectDirectory: [
      {
        projectId: "parity-packaged-project",
        displayName: "the parity project",
        aliases: ["parity"],
        peerId: "parity-peer",
        competenceTags: ["parity"],
      },
    ],
    reasoning: {},
    attention: { policyId: "parity-attention", cooldownMs: 0, activation: "none" },
  });
  const deployment = launchDeployment(profile);
  const packagedInstalled = deployment.installed as AnyRecord;
  const packagedApplication = packagedInstalled.application as AnyRecord;
  const packagedKeys = Object.keys(packagedInstalled).sort();
  const packaged: ParityInstallation = {
    installedCapabilityKeys: packagedKeys,
    applicationSurfaceKeys: Object.keys(packagedApplication).sort(),
    dshTools: toolEntries(defineApplicationTools(packagedApplication)),
    applicationFacesPresent: Object.keys(packagedApplication).filter((key) => packagedApplication[key] !== undefined),
  };
  /* §8: captured while the deployment is ACTIVE, before any store closes. */
  order.push("packaged:routes");
  const packagedRoutes = await probeRoutes(handleApplicationRequest, applicationErrorStatus, packagedApplication);

  order.push("packaged:readiness");
  const readiness = (() => {
    const read = (deployment as { readonly collaborationReadiness?: () => unknown }).collaborationReadiness;
    if (typeof read !== "function") return null;
    const value = read();
    if (value === null || typeof value !== "object") return null;
    const out: Record<string, string> = {};
    for (const key of Object.keys(value as AnyRecord).sort()) {
      const raw = (value as AnyRecord)[key];
      // Documented normalization: an implementation id that embeds the temp profile namespace.
      const unstable = typeof raw === "string" && (raw.includes(tmp) || raw.includes(distRoot));
      out[key] = unstable ? "PRESENT" : raw === undefined ? "ABSENT_FIELD" : String(raw);
    }
    return out;
  })();

  order.push("packaged:close");
  await deployment.close();

  /* §11: the route contract, probed against the PACKAGED installation (faces present) and the */
  /* MINIMAL one (most faces absent), so surface-absent behaviour is recorded behaviourally.  */

  /* §13: deterministic readiness and lifecycle observations. */
  /* §8/§11: readiness and the route probes are captured WHILE THE DEPLOYMENT IS ACTIVE — never */
  /* against closed stores, which would record post-disposal behaviour as the canonical contract. */
  const lifecycle: ParityLifecycleObservation = {
    disposeIsIdempotent: await (async () => {
      const fresh = installPalimpsest(context, {
        projectId: "parity-lifecycle",
        repository: distRoot,
        databasePath: join(tmp, "l-orchestration.sqlite"),
        ordariumDatabasePath: join(tmp, "l-ordarium.sqlite"),
      });
      await fresh.dispose?.();
      try {
        await fresh.dispose?.();
        return true;
      } catch {
        return false;
      }
    })(),
  };

  return {
    packagedInstallation: packaged,
    minimalInstallation: minimal,
    packagedRoutes,
    minimalRoutes,
    readiness,
    lifecycle,
    order,
  };
}

export interface ParityBaselineFile {
  readonly note: string;
  readonly capture: { readonly packagedInstallation: ParityInstallation; readonly minimalInstallation: ParityInstallation };
}

export interface ParityDifference {
  readonly where: string;
  readonly detail: string;
}


/**
 * RS-1 closure §20 — routes added AFTER the canonical baseline, each with a reason.
 *
 * The parity gate exists to catch an ACCIDENTAL change to the route surface, and exact two-way
 * equality is what gives it teeth. An intentional product addition is the one case the gate cannot
 * decide on its own, so it is recorded here explicitly, in the same idiom as the architecture
 * checker's permitted edge exceptions: a named path with a written reason. The gate keeps both
 * teeth — `missing` must still be empty (no canonical route may disappear) and any route NOT in this
 * list is still an unexpected addition that fails.
 */
export const REVIEWED_ROUTE_ADDITIONS: readonly { readonly path: string; readonly reason: string }[] = Object.freeze([
  {
    path: "/api/reasoning/cells",
    reason:
      "The reasoning index. Every other /api/reasoning/* route requires a cellId, so a client could " +
      "only reach a cell whose id it had been told out of band — the dashboard had no way to show " +
      "what had already been explored, and reaching a practice required hand-typing the id.",
  },
]);

/**
 * Tools added AFTER the canonical baseline, each with a reason.
 *
 * Routes have had this escape since the reasoning index was added; tools had none, which made a new
 * tool inexpressible. That is a real gap rather than a deliberate strictness: the product grows by
 * adding tools, and the only alternatives were re-capturing the baseline — which would erase the
 * very thing the fixture exists for — or never adding one.
 *
 * Teeth are the same as the route list and no looser: the name set is still compared in BOTH
 * directions, so a REMOVED tool still fails, an unlisted ADDITION still fails, and a listed addition
 * must carry a written reason. Nothing here relaxes an existing tool's contract; that is
 * `REVIEWED_TOOL_CONTRACT_CHANGES`, which covers the description alone.
 */
export const REVIEWED_TOOL_ADDITIONS: readonly { readonly name: string; readonly reason: string }[] = Object.freeze([
  {
    name: "palimpsest_finish",
    reason:
      "PLMP-LEAN-1 appendix A. The agent could state done-ness only by operating the governance " +
      "machinery itself — choosing a predicate, naming a gate id, running the command and reporting " +
      "the result — and the live sessions measured the cost: work finished with the attempt left " +
      "RUNNING, because the last step was the product's job done by hand. This tool lets the agent " +
      "say it once and the product derive the rest (which commands to run, what the write scope " +
      "actually was, whether the declared artifacts exist), with every mechanical fact OBSERVED " +
      "rather than reported. It adds a tool and changes no existing contract.",
  },
  {
    name: "palimpsest_begin",
    reason:
      "PLMP-LEAN-1 appendix E (phase 2A-B). There was a FINISH protocol and no BEGIN protocol, which " +
      "the 2A final live gate measured: an agent that worked correctly and called finish was told " +
      "'no attempt is running', because reaching a claimable attempt still required operating the " +
      "scheduler by hand — start, advance it N times, claim. An honest agent refuses to mint that " +
      "governance state itself, so the product left it two bad choices. This tool lets the agent " +
      "state what the work is (goal + intended write scope, i.e. work semantics) while the product " +
      "establishes the managed work position mechanically (project, task, envelope, attempt, claim), " +
      "with every precondition checked before anything is written. It adds a tool and changes no " +
      "existing contract.",
  },
  {
    name: "palimpsest_delegate",
    reason:
      "PLMP-LEAN-1 appendix C (phase D1-e). `palimpsest_collaborate` could only ever CONFIRM a task: " +
      "it runs its branches and returns, so an agent that wanted to research one question while " +
      "continuing its own work had no way to say so — it either blocked or dropped the question. This " +
      "is the same cognition backend and the same settlement path on a different interaction " +
      "lifecycle (§C.12/§C.13), so the blocking path is unchanged and the async one is additive: " +
      "`start` returns as soon as the branch job exists, the branch reads a FROZEN snapshot of the " +
      "committed head (§C.11 ②), and the terminal result reaches the principal on its own. It creates " +
      "no Work truth — no Task, no Attempt, no EvidenceAtom, no verification, no promotion. It is " +
      "composed only where a reasoning store, a repository and an async branch host are all present, " +
      "and neither captured installation wires one, so both still show the canonical catalogue plus " +
      "this named entry. It adds a tool and changes no existing contract.",
  },
]);

/**
 * Tool contracts changed AFTER the canonical baseline, each with a reason.
 *
 * Same idiom, deliberately narrower teeth. The allowance covers the DESCRIPTION of the named tool
 * and nothing else: a changed parameter schema, action set or mode on a listed tool still fails,
 * and an unlisted tool still fails on any contract change at all. A listing that no longer
 * describes a change — the tool is back to its canonical contract — is itself reported, so the
 * list cannot quietly rot into a blanket permission.
 *
 * The description is the one part of a contract that is prose for a model rather than an interface
 * for a caller: it changes what the model knows, never what a caller may pass.
 */
export const REVIEWED_TOOL_CONTRACT_CHANGES: readonly {
  readonly tool: string;
  /** The description text changed after the baseline. */
  readonly descriptionChanged?: boolean;
  /**
   * The parameter schema changed after the baseline. Mode and action sets can NEVER be granted.
   * Reserved and currently unexercised: the gate tool's schema lives outside this fixture (the
   * golden covers the DSH adapter catalogue), so no entry needs it yet — the flag exists so that
   * when a fixture-covered schema ever changes lawfully, the grant is named here and nowhere else.
   */
  readonly schemaChanged?: boolean;
  readonly reason: string;
}[] = Object.freeze([
  {
    tool: "palimpsest_surfaces",
    descriptionChanged: true,
    reason:
      "The description now carries the whole 'where does a human watch' answer, because the agent is " +
      "the primary surface and the person it talks to has no other console: asked 'which address do I " +
      "open?', the agent first called no tool and answered the CLI default port; after the url reached " +
      "the payload it answered correctly but had to add 'I cannot get the token', because the DSH-style " +
      "split leaves the credential on a stdout nobody reads. The description now states the two access " +
      "modes (fence: the address alone; token: the handoff link file) so the answer is complete and a " +
      "token is never quoted into the conversation.",
  },
]);

/**
 * §11 — the HTTP route contract inventory, read off the CANONICAL adapter before any split.
 * Each path is probed with every method in `HTTP_METHODS`; the recorded values are coarse outcome
 * classes plus the accepted-method set derived from the adapter's own method guard.
 *
 * SR-1 closure §19: this list is a hand-read census of the canonical switchboard, so it can only
 * prove that a KNOWN route did not move. Auditing it against the canonical source before R3B found
 * exactly one real route it had never covered — `/api/external-assets/approve-publish` — which is
 * why that path is here now. The static manifest in `src/adapters/http/` is what makes the
 * inventory complete going forward; this list is its canonical counterpart.
 */
const ROUTE_PATHS: readonly string[] = [
"/api/advisor/recommend",
  "/api/application/surfaces",
  "/api/attention",
  "/api/boundary/current",
  "/api/boundary/decide",
  "/api/boundary/membership",
  "/api/boundary/observation",
  "/api/boundary/pending",
  "/api/boundary/propose",
  "/api/boundary/submit_remote",
  "/api/boundary/workspace",
  "/api/campaign/view",
  "/api/collaboration/plan",
  "/api/collaboration/run",
  "/api/cross-project/acknowledge",
  "/api/cross-project/ask",
  "/api/cross-project/pending",
  "/api/cross-project/prepare",
  "/api/cross-project/projects",
  "/api/cross-project/receive",
  "/api/cross-project/respond",
  "/api/cross-project/status",
  "/api/dynamics/diagnose",
  "/api/dynamics/freshness",
  "/api/dynamics/impact",
  "/api/dynamics/observe",
  "/api/dynamics/propose",
  "/api/evolution/advance",
  "/api/evolution/advance_runtime",
  "/api/evolution/inspect",
  "/api/evolution/inspect_runtime",
  "/api/evolution/prepare",
  "/api/experiments",
  "/api/experiments/corrections",
  "/api/experiments/evaluations",
  "/api/experiments/experiment",
  "/api/experiments/run",
  "/api/experiments/runs",
  "/api/experiments/scenarios",
  "/api/experiments/variants",
  "/api/external-assets/approve-publish",
  "/api/external-assets/commit-import",
  "/api/external-assets/commit-reference",
  "/api/external-assets/inspect",
  "/api/external-assets/prepare-import",
  "/api/external-assets/prepare-publication",
  "/api/external-assets/prepare-reference",
  "/api/external-assets/providers",
  "/api/external-assets/search",
  "/api/federation/commitment",
  "/api/federation/commitments",
  "/api/federation/contact",
  "/api/federation/inbox",
  "/api/federation/message",
  "/api/federation/remote_decision",
  "/api/federation/thread",
  "/api/manage/activity",
  "/api/manage/preview",
  "/api/manage/recommend",
  "/api/manage/request_mode_change",
  "/api/manage/request_work_mode_change",
  "/api/manage/run",
  "/api/manage/status",
  "/api/manage/step",
  "/api/memory/interventions",
  "/api/memory/similar_runs",
  "/api/memory/structural_history",
  "/api/monitor/preview",
  "/api/monitor/status",
  "/api/organization/institution",
  "/api/organization/institutions",
  "/api/organization/retirements",
  "/api/organization/view",
  "/api/project/assets",
  "/api/project/association",
  "/api/project/decision",
  "/api/project/history",
  "/api/project/journal",
  "/api/project/journal/resolve",
  "/api/project/open_loops",
  "/api/project/operating-history",
  "/api/project/operating-posture",
  "/api/project/opportunity/promote",
  "/api/project/reconcile_head",
  "/api/project/workspace",
  "/api/projection/collaboration",
  "/api/projection/organization",
  "/api/projection/reasoning",
  "/api/projection/runtime",
  "/api/projection/work",
  "/api/proof/analyze",
  "/api/proof/claims",
  "/api/proof/claims/inspect",
  "/api/proof/claims/reassess",
  "/api/proof/claims/why",
  "/api/proof/disclosure/approve_export",
  "/api/proof/disclosure/history",
  "/api/proof/disclosure/preview",
  "/api/proof/evidence",
  "/api/proof/publication/evaluate",
  "/api/proof/publication/prepare",
  "/api/proof/sources",
  "/api/proof/sources/import",
  "/api/proof/sources/inspect",
  "/api/proof/sources/read_explicit",
  "/api/proof/sources/revisions",
  "/api/reasoning/branch",
  "/api/reasoning/brief",
  "/api/reasoning/candidate",
  "/api/reasoning/evaluate",
  "/api/reasoning/frontier",
  "/api/reasoning/graph",
  "/api/reasoning/invalidate",
  "/api/reasoning/view",
  "/api/recipes",
  "/api/recipes/compile",
  "/api/recipes/execute",
  "/api/recipes/readiness",
  "/api/recipes/recipe",
  "/api/runtime/holon",
  "/api/runtime/scope",
  "/api/runtime/scopes",
  "/api/verification/history",
  "/api/verification/status",
  "/api/verification/verify_current_head",
  "/api/",
  "/api/evolution/",
  "/api/manage/activity/",
];

export interface ParityRouteEntry {
  readonly path: string;
  readonly get: string;
  readonly post: string;
  /**
   * SR-1 closure §20 — the methods this route actually ACCEPTS, derived black-box rather than
   * declared: every method in `HTTP_METHODS` is probed and the ones answered with the adapter's
   * own method guard are excluded. Recorded because a static route manifest must be comparable to
   * the canonical route set, and the outcome classes alone cannot tell "this route wants POST"
   * apart from "this route rejected the body".
   */
  readonly methods: readonly string[];
}

/**
 * The probe methods. GET and POST are the adapter's real vocabulary; PUT/DELETE/PATCH exist only so
 * the accepted-method set can be read off the guard instead of trusted from a hand-written list.
 */
const HTTP_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH"] as const;

/** The adapter's own wrong-method refusal, e.g. `route /api/proof/claims requires GET`. */
const METHOD_GUARD = /^route \/api\/.* requires (?:GET|POST)$/u;

async function probeRoutes(handle: (input: AnyRecord) => Promise<AnyRecord | undefined>, statusOf: (error: unknown) => number, application: unknown): Promise<ParityRouteEntry[]> {
  const probe = async (method: string, pathname: string): Promise<{ readonly outcome: string; readonly detail: string | undefined }> => {
    try {
      const result = await handle({ application, method, pathname, query: new URLSearchParams(), body: {} });
      if (result === undefined) return { outcome: "unrouted", detail: undefined };
      const body = result.body as { readonly error?: { readonly detail?: unknown } } | undefined;
      const detail = body?.error?.detail;
      return { outcome: `ok:${String(result.status)}`, detail: typeof detail === "string" ? detail : undefined };
    } catch (error) {
      return { outcome: `error:${String(statusOf(error))}`, detail: error instanceof Error ? error.message : String(error) };
    }
  };
  const out: ParityRouteEntry[] = [];
  /* Probed but NOT canonical: a reviewed post-baseline addition still has to be observed, otherwise
     the comparison would report the allowance as stale the moment it was granted. */
  const probedPaths = [...ROUTE_PATHS, ...REVIEWED_ROUTE_ADDITIONS.map((entry) => entry.path)];
  for (const pathname of probedPaths) {
    const outcomes = new Map<string, { readonly outcome: string; readonly detail: string | undefined }>();
    for (const method of HTTP_METHODS) outcomes.set(method, await probe(method, pathname));
    out.push({
      path: pathname,
      get: outcomes.get("GET")!.outcome,
      post: outcomes.get("POST")!.outcome,
      methods: HTTP_METHODS.filter((method) => {
        const detail = outcomes.get(method)!.detail;
        return detail === undefined || !METHOD_GUARD.test(detail);
      }),
    });
  }
  return out;
}

/**
 * §13 — lifecycle observations. Every field here is COMPUTED; there are no placeholders, because
 * a golden fixture carrying an assumed value would pass for the wrong reason. Resource-closure
 * ORDER (which resource closes, in what sequence, and which caller-supplied store is retained) is
 * pinned separately and exhaustively by `test/composition/lifecycle_ownership.test.ts`.
 */
export interface ParityLifecycleObservation {
  /** A second `dispose()` is a no-op rather than an error. */
  readonly disposeIsIdempotent: boolean;
}
/** Compare a live capture against the recorded baseline: every key and every action set. */
export function compareParity(baseline: ParityCapture, live: ParityCapture): readonly ParityDifference[] {
  const differences: ParityDifference[] = [];
  /**
   * §2/§3 — EXACT two-way collection parity. Missing AND unexpected entries are both failures:
   * a subset check would let an accidentally-added surface, tool, action or route pass, which is
   * not zero-semantic-change parity.
   */
  const compareList = (where: string, expected: readonly string[], actual: readonly string[]): void => {
    const missing = expected.filter((entry) => !actual.includes(entry)).sort();
    const unexpected = actual.filter((entry) => !expected.includes(entry)).sort();
    if (missing.length > 0) differences.push({ where, detail: `missing: ${missing.join(", ")}` });
    if (unexpected.length > 0) differences.push({ where, detail: `unexpected: ${unexpected.join(", ")}` });
  };
  const compareInstallation = (label: string, expected: ParityInstallation, actual: ParityInstallation): void => {
    compareList(`${label}.installedCapabilityKeys`, expected.installedCapabilityKeys, actual.installedCapabilityKeys);
    compareList(`${label}.applicationSurfaceKeys`, expected.applicationSurfaceKeys, actual.applicationSurfaceKeys);
    compareList(`${label}.applicationFacesPresent`, expected.applicationFacesPresent, actual.applicationFacesPresent);
    /* §2/§3 with the one reasoned escape the routes already have: a tool added after the baseline
       and recorded in REVIEWED_TOOL_ADDITIONS is not an "unexpected" entry — while a REMOVED tool,
       or an addition nobody recorded, still is. */
    const reviewedTools = new Set(REVIEWED_TOOL_ADDITIONS.map((entry) => entry.name));
    compareList(
      `${label}.dshTools`,
      expected.dshTools.map((tool) => tool.name),
      actual.dshTools.map((tool) => tool.name).filter((name) => !reviewedTools.has(name)),
    );
    for (const tool of expected.dshTools) {
      const found = actual.dshTools.find((candidate) => candidate.name === tool.name);
      if (found === undefined) continue;
      if (found.mode !== tool.mode) differences.push({ where: `${label}.${tool.name}.mode`, detail: `${tool.mode} → ${found.mode}` });
      compareList(`${label}.${tool.name}.actions`, tool.actions, found.actions);
      /* §8: the rest of the adapter contract. A digest mismatch is reported with the description
         and the canonical schema next to each other, because "the digest changed" alone is not a
         diagnosable failure. */
      if (found.contractDigest !== tool.contractDigest) {
        /* A reviewed change tolerates a new description for that ONE tool, and only when everything
           else in the contract is byte-identical. `parameters` is compared as the canonical JSON
           string, and `actions`/`mode` were already compared above — so a schema change smuggled in
           alongside an allowed description change is still caught, twice.

           Staleness ("the entry no longer describes a change") is deliberately NOT checked here,
           for the same reason route staleness is not: this comparison runs against the CANONICAL
           fixture, which by definition predates the change and never contains it. The check belongs
           where the LIVE tree is captured — `application_parity.test.ts` asserts each listed tool's
           live digest really does differ from canonical, and differs in the description alone. */
        const reviewed = REVIEWED_TOOL_CONTRACT_CHANGES.find((entry) => entry.tool === tool.name);
        const actionsUnchanged =
          found.mode === tool.mode && JSON.stringify(found.actions) === JSON.stringify(tool.actions);
        const descriptionChanged = found.description !== tool.description;
        const schemaChanged = found.parameters !== tool.parameters;
        const tolerated =
          reviewed !== undefined &&
          actionsUnchanged &&
          (descriptionChanged ? reviewed.descriptionChanged === true : true) &&
          (schemaChanged ? reviewed.schemaChanged === true : true);
        if (!tolerated) {
          const parts: string[] = [`digest ${tool.contractDigest.slice(0, 12)} → ${found.contractDigest.slice(0, 12)}`];
          if (found.description !== tool.description) parts.push(`description changed (${tool.description.length} → ${found.description.length} chars)`);
          if (found.parameters !== tool.parameters) parts.push(`parameters: ${tool.parameters} → ${found.parameters}`);
          if (reviewed !== undefined) parts.push("(reviewed, but this change exceeds what the entry grants)");
          differences.push({ where: `${label}.${tool.name}.contract`, detail: parts.join("; ") });
        }
      }
    }
  };
  compareInstallation("packagedInstallation", baseline.packagedInstallation, live.packagedInstallation);
  compareInstallation("minimalInstallation", baseline.minimalInstallation, live.minimalInstallation);

  /* §11/§37: the HTTP route contract, path by path and method by method. */
  const routeKey = (entry: ParityRouteEntry): string => entry.path;
  const baselineRoutes = new Map(baseline.packagedRoutes.map((entry) => [routeKey(entry), entry]));
  const minimalRoutes = new Map(baseline.minimalRoutes.map((entry) => [routeKey(entry), entry]));
  const compareRoutes = (label: string, expected: Map<string, ParityRouteEntry>, actual: readonly ParityRouteEntry[]): void => {
    const actualByPath = new Map(actual.map((entry) => [routeKey(entry), entry]));
    /* §5/§6: EXACT route-set equality — an added route must fail, not just a removed one — with the
       single, reasoned exception for a reviewed post-baseline addition.

       Staleness of an allowance ("it is no longer routed") is deliberately NOT checked here: this
       comparison runs against the CANONICAL fixture, which by definition predates the addition and
       therefore never contains it. That check belongs to the static manifest gate, which reads the
       live manifest and can tell whether the allowed path is still declared. */
    const reviewed = new Set(REVIEWED_ROUTE_ADDITIONS.map((entry) => entry.path));
    const unexpectedRoutes = [...actualByPath.keys()].filter((path) => !expected.has(path) && !reviewed.has(path)).sort();
    if (unexpectedRoutes.length > 0) {
      differences.push({ where: `${label}.routes`, detail: `unexpected: ${unexpectedRoutes.join(", ")}` });
    }
    for (const [path, entry] of expected) {
      const found = actualByPath.get(path);
      if (found === undefined) {
        differences.push({ where: `${label}.routes`, detail: `missing route ${path}` });
        continue;
      }
      if (found.get !== entry.get) differences.push({ where: `${label}.${path}.GET`, detail: `${entry.get} → ${found.get}` });
      if (found.post !== entry.post) differences.push({ where: `${label}.${path}.POST`, detail: `${entry.post} → ${found.post}` });
      /* §20: the accepted-method set is compared exactly, in both directions. */
      const missingMethods = entry.methods.filter((method) => !found.methods.includes(method));
      const unexpectedMethods = found.methods.filter((method) => !entry.methods.includes(method));
      if (missingMethods.length > 0 || unexpectedMethods.length > 0) {
        differences.push({
          where: `${label}.${path}.methods`,
          detail: `${entry.methods.join("|")} → ${found.methods.join("|")}`,
        });
      }
    }
  };
  compareRoutes("packagedRoutes", baselineRoutes, live.packagedRoutes);
  compareRoutes("minimalRoutes", minimalRoutes, live.minimalRoutes);

  /* §12/§13: readiness parity is an EXACT key+value map comparison, with no missing and no
     unexpected field, and no changed value. */
  if (baseline.readiness !== null) {
    compareList("readiness.keys", Object.keys(baseline.readiness).sort(), Object.keys(live.readiness ?? {}).sort());
    for (const [key, value] of Object.entries(baseline.readiness)) {
      const actual = (live.readiness ?? {})[key];
      if (actual !== value) differences.push({ where: `readiness.${key}`, detail: `${value} → ${String(actual)}` });
    }
  }
  if (baseline.lifecycle.disposeIsIdempotent !== live.lifecycle.disposeIsIdempotent) {
    differences.push({ where: "lifecycle.disposeIsIdempotent", detail: `${String(baseline.lifecycle.disposeIsIdempotent)} → ${String(live.lifecycle.disposeIsIdempotent)}` });
  }
  return differences;
}
