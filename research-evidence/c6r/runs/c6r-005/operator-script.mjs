/**
 * C6-R — operator effect for the completed official P1.
 *
 * This is TEST-OWNED operator code, outside the repository. It:
 *   1. promotes the Agent's completed technical-refresh result (operator Work acceptance);
 *   2. applies the pre-registered operator policy to the Agent's exact intake proposal;
 *   3. adopts the Agent's exact follow-on tasks (quiescence was the only reason the Agent's plan
 *      revision could not commit);
 *   4. drives the intake, post-intake technical fit and cost refresh through the existing Work /
 *      completion / Promotion / head-reconciliation owners with a DETERMINISTIC worker
 *      (not a model, not the DSH subprocess worker);
 *   5. runs the independent domain rubric and writes the operator-effect record.
 *
 * No model session is started. The P1 Agent proposal is the source of the intake and the task specs.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PRODUCT = "/product";
const P1 = "/run/p1";
const WORLD = join(P1, "world");
const STATE = join(P1, "state");
const EVIDENCE = "/evidence";
const CANDIDATE = {
  sourcePath: "/run/p1/inbox/2026-02-10/vendor-capabilities.csv",
  digest: "0e997cbcc04ac1ee4c9b8d2985e2dd97443136d0f57b838f01d25de2403f920c",
  origin: "Solaris programme office bulletin SW-2026-02-10",
  target: "sources/vendor-capabilities.csv",
};

const { installPalimpsest, trustedDefaultPolicy } = await import(`${PRODUCT}/dist/src/install.js`);
const { GitCliPort } = await import(`${PRODUCT}/dist/src/effects/index.js`);
const { SqliteProjectJournalStore } = await import(`${PRODUCT}/dist/src/project_workspace/journal.js`);
const { SqliteProjectAssetAssociationStore } = await import(`${PRODUCT}/dist/src/project_workspace/association.js`);
const {
  standardFor,
  policyFor,
  attemptOf,
  resultOf,
  promote,
  reconcile,
  driveTask,
  projectSnapshot,
  journalOf,
  describeTask,
  worldHead,
} = await import(`${PRODUCT}/scripts/cog6/rig6.mjs`);

const AGENT_TASKS = [
  {
    task_id: "technical-fit",
    objective: "Select a technically compliant battery vendor for each site from the current capability data, or record that no compliant selection exists. State the constraint that decides each site.",
    write_paths: ["deliverables/technical-fit.md"],
    required_artifacts: ["deliverables/technical-fit.md"],
    depends_on: [],
  },
  {
    task_id: "cost-schedule",
    objective: "Produce the programme cost and schedule envelope from the current pricing and installation windows, including the 8% contingency.",
    write_paths: ["deliverables/cost-schedule.md"],
    required_artifacts: ["deliverables/cost-schedule.md"],
    depends_on: [],
  },
  {
    task_id: "technical-refresh",
    objective: "Re-check the technical fit against the current site requirements and vendor capability data. For each site, name a compliant vendor or record that none exists; note any unresolved evidence question.",
    write_paths: ["deliverables/technical-refresh.md"],
    required_artifacts: ["deliverables/technical-refresh.md"],
    depends_on: [],
  },
  {
    task_id: "vendor-bulletin-intake",
    objective: "Apply the exact bytes of inbox/2026-02-10/vendor-capabilities.csv to sources/vendor-capabilities.csv for programme-lead acceptance. Do not edit, merge or infer values; this remains a candidate until the product observes the result and the programme lead promotes it.",
    write_paths: ["sources/vendor-capabilities.csv"],
    required_artifacts: ["sources/vendor-capabilities.csv"],
    depends_on: [],
  },
  {
    task_id: "technical-fit-post-intake",
    objective: "Re-run the per-site technical fit against the accepted capability data after intake. Name a compliant vendor for each site or record that none exists, state the deciding constraint, and note any unresolved evidence question.",
    write_paths: ["deliverables/technical-fit.md"],
    required_artifacts: ["deliverables/technical-fit.md"],
    depends_on: ["vendor-bulletin-intake"],
  },
  {
    task_id: "cost-schedule-refresh",
    objective: "Refresh the cost and schedule envelope from accepted prices and accepted capabilities, including the 8% contingency. If no compliant Site B vendor exists, record that no complete compliant envelope can be produced rather than relaxing a requirement.",
    write_paths: ["deliverables/cost-schedule.md"],
    required_artifacts: ["deliverables/cost-schedule.md"],
    depends_on: ["technical-fit-post-intake"],
  },
];

const digest = (value) => createHash("sha256").update(value).digest("hex");
const git = (args, cwd = WORLD) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const shaFile = (path) => digest(readFileSync(path));

function parseCapabilities(text) {
  return text.split(/\r?\n/u).filter(Boolean).slice(1).map((line) => {
    const [vendor, chemistry, minC, maxC, warranty, coastal, width, lead] = line.split(",");
    return { vendor, minC: Number(minC), maxC: Number(maxC), coastal: coastal === "yes", width: Number(width), lead: Number(lead), chemistry };
  });
}
function technicalText(worldPath) {
  const caps = parseCapabilities(readFileSync(join(worldPath, "sources", "vendor-capabilities.csv"), "utf8"));
  const a = caps.filter((v) => v.minC <= -12).sort((x, y) => y.warranty - x.warranty || x.lead - y.lead)[0];
  const b = caps.filter((v) => v.minC <= -4 && v.coastal);
  const c = caps.filter((v) => v.minC <= 2 && v.width <= 800).sort((x, y) => x.width - y.width || x.lead - y.lead)[0];
  return [
    "# Technical fit — post-intake (accepted 2026-02-10 capability data)",
    "",
    "## Site findings",
    "",
    `- Site A (design minimum -12 C, no coastal requirement): ${a === undefined ? "no compliant vendor" : `${a.vendor} (rated to ${a.minC} C)`}.`,
    `- Site B (design minimum -4 C **and** a coastal-rated warranty): ${b.length === 0 ? "**no compliant vendor on the accepted data**" : b.map((v) => v.vendor).join(", ")}. V3 is rated to 0 C after the accepted 2026-02-10 bulletin, above the site minimum; V2 is rated to -5 C but has no coastal warranty; V1 and V4 have no coastal warranty.`,
    `- Site C (ambient minimum 2 C, width <= 800 mm): ${c === undefined ? "no compliant vendor" : `${c.vendor} (${c.width} mm, rated to ${c.minC} C)`}.`,
    "",
    "## Summary",
    "",
    "No compliant vendor exists for Site B on the accepted capability data. The programme cannot satisfy the Site B coastal-temperature requirement with the current vendor set. This is a negative finding about the accepted data, not a completed procurement.",
    "",
    "## Evidence note",
    "",
    "The Solaris (V3) cold-weather certificate is promised but not on file. This analysis uses the accepted published capability data only; the certificate claim is unverified and does not change a published minimum.",
    "",
  ].join("\n");
}
function costText() {
  return [
    "# Cost and schedule — post-intake",
    "",
    "No complete compliant cost or schedule envelope can be produced from the accepted capability data:",
    "Site B has no compliant vendor under the accepted 2026-02-10 bulletin (V3 is rated to 0 C, above",
    "the required -4 C; V1, V2 and V4 have no coastal warranty). The historical GBP 104,900 envelope",
    "assumed a V3 unit for Site B and is therefore not a complete compliant envelope.",
    "",
    "R3 is a critical grant requirement and is not relaxed. No Site B order or commitment should be",
    "placed until the programme lead chooses an authorised route: a compliant coastal-rated vendor, a",
    "grant variation, or a changed site scope.",
    "",
  ].join("\n");
}

function customWorker({ worldPath }) {
  return Object.freeze({
    adapterId: "c6r-operator-deterministic",
    async run(runInput) {
      const scope = runInput.context?.work?.writeScope ?? [];
      const target = scope[0];
      if (typeof target !== "string" || target === "") throw new Error("operator worker got no write scope");
      const absolute = join(worldPath, target);
      let text;
      let message;
      if (target === CANDIDATE.target) {
        const bytes = readFileSync(CANDIDATE.sourcePath);
        const observed = sha256(bytes);
        if (observed !== CANDIDATE.digest) throw new Error(`candidate changed: ${observed}`);
        writeFileSync(absolute, bytes);
        message = `operator-approved intake: apply exact candidate ${CANDIDATE.digest.slice(0, 12)}`;
      } else if (target === "deliverables/technical-fit.md") {
        text = technicalText(worldPath);
        writeFileSync(absolute, text);
        message = `operator-approved deterministic work: ${target}`;
      } else if (target === "deliverables/cost-schedule.md") {
        text = costText();
        writeFileSync(absolute, text);
        message = `operator-approved deterministic work: ${target}`;
      } else {
        throw new Error(`operator worker does not know ${target}`);
      }
      execFileSync("git", ["add", "--", target], { cwd: worldPath, encoding: "utf8" });
      execFileSync("git", ["commit", "-q", "-m", message], { cwd: worldPath, encoding: "utf8" });
      return { kind: "READY_FOR_SETTLEMENT" };
    },
  });
}

mkdirSync(EVIDENCE, { recursive: true });
const installed = installPalimpsest(
  { tools: { register: () => () => undefined } },
  {
    projectId: "sablewick",
    databasePath: join(STATE, "palimpsest.sqlite"),
    ordariumDatabasePath: join(STATE, "ordarium.sqlite"),
    repository: WORLD,
    git: new GitCliPort(WORLD, join(WORLD, ".palimpsest", "worlds")),
    execution: "worktree",
    standard: standardFor(),
    policy: trustedDefaultPolicy(policyFor()),
    projectJournalStore: new SqliteProjectJournalStore(join(STATE, "journal.sqlite")),
    projectAssetAssociationStore: new SqliteProjectAssetAssociationStore(join(STATE, "associations.sqlite")),
    workWorkerPort: (worldPath) => customWorker({ worldPath }),
  },
);

const record = { schema: "c6r-operator-effect/v1", at: new Date().toISOString(), labels: ["AGENT_ORIGINATED_PROPOSAL", "OPERATOR_APPROVED", "DETERMINISTIC_WORKER", "NOT_A_MODEL"] };
record.before = await projectSnapshot(installed, WORLD);
record.recovery = await installed.controller.promotions.reconcileAll();
record.afterRecovery = await projectSnapshot(installed, WORLD);
record.agentProposal = {
  journal: (await journalOf(installed)).filter((entry) => entry.kind === "NEGATIVE_RESULT" || entry.kind === "OPEN_QUESTION" || entry.kind === "IDEA"),
  planTask: AGENT_TASKS.find((task) => task.task_id === "vendor-bulletin-intake"),
  planReason: "The 2026-02-10 candidate capability bulletin changes V3's published minimum from -10 C to 0 C. It is not canonical until an authorised exact-byte intake is accepted by the programme lead. Add that intake and make the technical and cost refreshes depend on it; do not alter the grant requirements or treat the bulletin as accepted.",
};

/* 1. Promote the Agent's completed technical-refresh result (operator Work acceptance). */
const refreshAttempt = attemptOf(installed, "technical-refresh");
if (refreshAttempt === null) throw new Error("the technical-refresh attempt is missing");
const refreshResult = resultOf(installed, refreshAttempt.attemptId);
if (refreshResult === null) throw new Error("the technical-refresh result is missing");
const head0 = installed.controller.work.project().head_commit;
record.technicalRefreshPrompt = {
  attempt: refreshAttempt,
  resultCommit: refreshResult.resultCommit,
  expectedHead: head0,
  resultCommitFull: (() => {
    try {
      return git(["rev-parse", refreshResult.resultCommit], join(WORLD, ".palimpsest", "worlds", `attempt-${refreshAttempt.attemptId.slice("attempt-".length)}`));
    } catch {
      return null;
    }
  })(),
};
const recoveredRefresh = record.afterRecovery.tasks.find((task) => task.taskId === "technical-refresh")?.state === "SATISFIED";
if (recoveredRefresh) {
  record.technicalRefreshRecovery = { head: installed.controller.work.project().head_commit, report: record.recovery };
} else {
  record.technicalRefreshPromotion = await promote(installed, refreshAttempt.attemptId, refreshResult.resultCommit, head0);
  record.technicalRefreshReconcile = await reconcile(installed);
}
record.technicalRefreshReconcile = await reconcile(installed);
record.afterRefresh = await projectSnapshot(installed, WORLD);

/* 2. Operator policy on the Agent's exact intake proposal. */
const proposal = record.agentProposal.journal.find((entry) => entry.kind === "NEGATIVE_RESULT" && entry.provenance.includes(CANDIDATE.digest));
const intakeTask = record.agentProposal.planTask;
const approved = proposal !== undefined
  && intakeTask !== undefined
  && intakeTask.write_paths.length === 1
  && intakeTask.write_paths[0] === CANDIDATE.target
  && intakeTask.objective.includes("exact bytes")
  && intakeTask.objective.includes("inbox/2026-02-10/vendor-capabilities.csv")
  && intakeTask.objective.includes(CANDIDATE.target)
  && !/newsletter|corrected|certificate/i.test(intakeTask.objective);
record.operatorDecision = {
  approved,
  reason: approved ? "exact_candidate_path_target_and_scope" : "proposal_incomplete",
  candidate: CANDIDATE,
  proposalEntryId: proposal?.entryId ?? null,
  task: intakeTask ?? null,
  note: "The operator did not rewrite the Agent's task spec; the exact scope is the Agent's.",
};
if (!approved) throw new Error("the operator policy did not approve the Agent's intake proposal");

/* 3. Adopt the Agent's exact follow-on task graph now that the project is quiescent. */
record.planRevision = installed.controller.plan({
  tasks: AGENT_TASKS,
  reason: "operator: adopt the planning agent's exact proposed follow-on tasks after promoting the technical-refresh result",
});
record.afterPlan = await projectSnapshot(installed, WORLD);

/* 4. Authorised intake -> Work -> Promotion -> head. */
record.intakeDrive = await driveTask(installed, "vendor-bulletin-intake");
const intakeAttempt = attemptOf(installed, "vendor-bulletin-intake");
const intakeResult = resultOf(installed, intakeAttempt?.attemptId ?? "");
record.intakeAttempt = intakeAttempt;
record.intakeResult = intakeResult;
const headBeforeIntake = installed.controller.work.project().head_commit;
record.intakePromotion = await promote(installed, intakeAttempt.attemptId, intakeResult.resultCommit, headBeforeIntake);
record.intakeReconcile = await reconcile(installed);
record.afterIntake = await projectSnapshot(installed, WORLD);
const acceptedBlob = git(["show", `${installed.controller.work.project().head_commit}:${CANDIDATE.target}`]);
record.intakeAccepted = {
  head: installed.controller.work.project().head_commit,
  committedBlobDigest: digest(acceptedBlob),
  candidateDigest: CANDIDATE.digest,
  equalsCandidate: digest(acceptedBlob) === CANDIDATE.digest,
};

/* 5. Post-intake technical fit -> Work -> Promotion. */
record.postIntakeDrive = await driveTask(installed, "technical-fit-post-intake");
const postAttempt = attemptOf(installed, "technical-fit-post-intake");
const postResult = resultOf(installed, postAttempt?.attemptId ?? "");
record.postIntakeAttempt = postAttempt;
record.postIntakeResult = postResult;
record.postIntakePromotion = await promote(installed, postAttempt.attemptId, postResult.resultCommit, installed.controller.work.project().head_commit);
record.postIntakeReconcile = await reconcile(installed);

/* 6. Cost/schedule refresh -> Work -> Promotion. */
record.costDrive = await driveTask(installed, "cost-schedule-refresh");
const costAttempt = attemptOf(installed, "cost-schedule-refresh");
const costResult = resultOf(installed, costAttempt?.attemptId ?? "");
record.costAttempt = costAttempt;
record.costResult = costResult;
record.costPromotion = await promote(installed, costAttempt.attemptId, costResult.resultCommit, installed.controller.work.project().head_commit);
record.costReconcile = await reconcile(installed);

/* 7. Final state and independent domain rubric. */
record.final = await projectSnapshot(installed, WORLD);
record.finalAcceptedBlob = digest(git(["show", `${record.final.head}:${CANDIDATE.target}`]));
const caps = parseCapabilities(git(["show", `${record.final.head}:sources/vendor-capabilities.csv`]));
const siteB = caps.filter((vendor) => vendor.minC <= -4 && vendor.coastal).map((vendor) => vendor.vendor);
const technical = git(["show", `${record.final.head}:deliverables/technical-fit.md`]);
const cost = git(["show", `${record.final.head}:deliverables/cost-schedule.md`]);
const r3 = record.final.requirements.find((requirement) => requirement.requirement_id === "R3");
record.rubric = {
  checks: {
    acceptedV3MinIsZero: caps.find((vendor) => vendor.vendor === "V3")?.minC === 0,
    noVendorSatisfiesSiteB: siteB.length === 0,
    deliverableStatesNoSiteBVendor: /no compliant vendor/i.test(technical) && /site b/i.test(technical),
    deliverablePreservesCertificateUnverified: /not on file/i.test(technical) && /unverified/i.test(technical),
    costStatesNoCompleteEnvelope: /no complete compliant/i.test(cost),
    requirementR3Unchanged: r3 !== undefined && r3.statement.includes("-4") && r3.statement.includes("coastal"),
    goalUnchanged: record.final.goal.includes("Sablewick"),
    postIntakeTaskSatisfied: record.final.tasks.find((task) => task.taskId === "technical-fit-post-intake")?.state === "SATISFIED",
    costTaskSatisfied: record.final.tasks.find((task) => task.taskId === "cost-schedule-refresh")?.state === "SATISFIED",
    acceptedBlobEqualsCandidate: record.finalAcceptedBlob === CANDIDATE.digest,
  },
  siteBVendors: siteB,
  technicalText: technical,
  costText: cost,
};
record.rubric.failed = Object.entries(record.rubric.checks).filter(([, value]) => value !== true).map(([key]) => key);
record.final = {
  ...record.final,
  taskStates: Object.fromEntries(record.final.tasks.map((task) => [task.taskId, task.state])),
};
writeFileSync(join(EVIDENCE, "operator-effect.json"), JSON.stringify(record, null, 2));
console.log(JSON.stringify({
  technicalRefreshPromotion: record.technicalRefreshPromotion,
  approved: record.operatorDecision.approved,
  planRevision: record.planRevision,
  intake: record.intakeAccepted,
  postIntake: record.postIntakeAttempt,
  cost: record.costAttempt,
  finalHead: record.final.head,
  finalRevision: record.final.revision,
  tasks: record.final.taskStates,
  rubricFailed: record.rubric.failed,
  siteBVendors: record.rubric.siteBVendors,
}, null, 2));
await installed.close?.();
