/** Deterministic model responses for qualification. All tool calls still run through real DSH. */
import { assert, BULLETIN, DELIVERABLES, REVISION_PATHS, START, SUMMARY, WORK_T2_INSTRUCTIONS } from "./contract.mjs";
import { READ_PLAN } from "./context-variants.mjs";
import { PRESERVE_CERTIFICATES } from "./revision-scope.mjs";
import { SETTLED_GUIDANCE } from "./revision-work.mjs";
import { setTimeout as delay } from "node:timers/promises";

const markdown = (title, prose, data) => `# ${title}\n\n${prose}\n\n<!-- data:start -->\n\`\`\`json\n${JSON.stringify(data)}\n\`\`\`\n<!-- data:end -->\n`;
const childPrompt = "PNWF mock revision executor. Update the two-site package from the new material in this Git worktree.";
const shell = command => ({ name: "bash", input: { command, description: "Check and record qualification artifacts" } });
const work = (action, args = {}) => ({ name: "palimpsest_work", input: { action, ...args } });
const pulse = (args = {}) => ({ name: "palimpsest_continuity", input: { action: "pulse", ...args } });
const review = (input = {}) => ({ name: "palimpsest_revision_review", input });
const finish = [{ type: "text", text: "The requested qualification step is complete." }];
const quoted = value => "'" + value.replaceAll("'", "'\\''") + "'";

function writeFiles(files) {
  const script = `const fs=require('node:fs');fs.mkdirSync('deliverables',{recursive:true});for(const [p,v] of Object.entries(${JSON.stringify(files)}))fs.writeFileSync(p,v);`;
  return `node -e ${quoted(script)} && node check.mjs --final && git add deliverables && git commit -m 'Record deployment decision package'`;
}

function packageFiles(revised) {
  const harbor = revised ? "K-900" : "S-1080";
  const total = revised ? 536000 : 485000;
  const install = revised ? "2027-02-11" : "2027-01-07";
  const commission = revised ? "2027-02-18" : "2027-01-14";
  const source = revised ? BULLETIN : "sources/capacity.csv";
  const sites = [{ site: "NR", model: "K-900" }, { site: "HF", model: harbor }];
  const line = ({ site, model }) => ({ site, model, unitPrice: model === "K-900" ? 250000 : 205000,
    freight: model === "K-900" ? 18000 : 12000, lineTotal: model === "K-900" ? 268000 : 217000 });
  const files = {
    [DELIVERABLES[0]]: markdown("Technical capacity", `North Ridge requires 850 kW at −18 °C and uses K-900. Harbor Flats requires 620 kW and uses ${harbor}. See ${source}.`, { sites }),
    [DELIVERABLES[2]]: JSON.stringify({ lines: sites.map(line), total }) + "\n",
    [DELIVERABLES[3]]: markdown("Schedule", `North Ridge installs on 2027-02-11. Harbor Flats installs on ${install}.`, { start: START, installs: [
      { ...sites[0], leadWeeks: 14, installStart: "2027-02-11", commission: "2027-02-18" },
      { ...sites[1], leadWeeks: revised ? 14 : 9, installStart: install, commission },
    ] }),
    [DELIVERABLES[4]]: markdown("Risks", `Halcyon's certificate is pending. Confirm logistics before committing funds. See ${source}.`, { risks: [
      { statement: "Halcyon does not have a current certificate", source: "sources/vendors.md" },
      { statement: revised ? "S-1080 is derated below the Harbor Flats requirement" : "Confirm site conditions before ordering", source },
    ] }),
    [DELIVERABLES[5]]: markdown("Recommendation", `Use K-900 at North Ridge and ${harbor} at Harbor Flats for USD ${total}. Check ${source}.`, {
      north: "K-900", harbor, totalUsd: total, corridorMm: 1250,
    }),
  };
  if (!revised) files[DELIVERABLES[1]] = markdown("Vendor certificates", "Kestrel and Solaris are current. Halcyon is expected, not issued.", {
    vendors: ["K-900", "S-1080", "H-1320"].map(model => ({ model, certificate: model === "H-1320" ? "EXPECTED_NOT_CURRENT" : "CURRENT" })),
  });
  return files;
}

function messages(input, role, kind) {
  return input.messages.filter(message => message.role === role).flatMap(message =>
    typeof message.content === "string" ? [{ type: "text", text: message.content }] : message.content).filter(block => block.type === kind);
}

function latestResult(input) {
  const content = messages(input, "user", "tool_result").at(-1)?.content;
  return typeof content === "string" ? content : (content ?? []).map(block => block.text ?? "").join("");
}

function expandReceipt(receipt, accepted) {
  assert(receipt.schema === "pnwf-energy-revision-receipt/v1" && receipt.basis === accepted &&
    /^[a-f0-9]{40}$/u.test(receipt.candidate) && receipt.certificate?.unchanged && receipt.paths?.length === 5,
  "MOCK_REVISION_RECEIPT_MISMATCH");
  return review({ basis: receipt.basis, candidate: receipt.candidate, path: REVISION_PATHS[0] });
}

function expectExpansion(result) {
  const value = JSON.parse(result);
  assert(value.schema === "pnwf-energy-revision-file/v1" && value.path === REVISION_PATHS[0] &&
    value.diff.includes("diff --git"), "MOCK_REVISION_EXPANSION_MISSING");
}

export function qualificationReply({ arm, session, accepted, variant }) {
  const turns = new Map();
  let advanced = false;
  let concluded = false;
  let expanded = false;
  return async (input, ordinal) => {
    const users = messages(input, "user", "text");
    const isWorker = users.some(block => block.text?.includes("You are a Palimpsest WORK WORKER"));
    const isChild = users.some(block => block.text?.includes(childPrompt));
    const role = isWorker ? "worker" : isChild ? "child" : "principal";
    const step = turns.get(role) ?? 0;
    turns.set(role, step + 1);
    if (session === "T2" && role === "principal" && step === 0) {
      assert(users.some(block => block.text?.includes(WORK_T2_INSTRUCTIONS)) === (arm === "P"), "MOCK_T2_EXECUTOR_GUIDANCE_MISMATCH");
      if (variant === "read-plan") assert(users.some(block => block.text?.includes(READ_PLAN)), "MOCK_PRINCIPAL_READ_PLAN_MISSING");
    }
    const conclude = intent => work("conclude", { intent, statement: "The committed qualification result is ready for this episode.",
      ...(intent === "DELIVER" ? { artifacts: session === "T1" ? DELIVERABLES : [SUMMARY] } : {}) });
    let command;
    if (isWorker || isChild) {
      if (isWorker && step === 0) {
        assert(users.some(block => block.text?.includes(PRESERVE_CERTIFICATES) &&
          REVISION_PATHS.every(path => block.text.includes(path))), "MOCK_WORKER_SCOPE_NOT_VISIBLE");
      }
      if (variant === "read-plan" && isWorker && step === 0) {
        assert(users.some(block => block.text?.includes(READ_PLAN)), "MOCK_WORKER_READ_PLAN_MISSING");
        command = shell(`git show HEAD:${BULLETIN}`);
      } else {
        const workerStep = step - (variant === "read-plan" && isWorker ? 1 : 0);
        if (workerStep === 0) {
          if (variant === "read-plan" && isWorker) assert(latestResult(input).includes("S-1080,HF,600"), "MOCK_BULLETIN_NOT_READ");
          command = shell(writeFiles(packageFiles(true)));
        } else if (variant === "receipt" && workerStep === 1) command = review();
        else if (variant === "receipt" && workerStep === 2) command = expandReceipt(JSON.parse(latestResult(input)), accepted);
        else if (isWorker && workerStep === (variant === "receipt" ? 3 : 1)) {
          if (variant === "receipt") expectExpansion(latestResult(input));
          command = { name: "palimpsest_worker_result", input: { kind: "READY_FOR_SETTLEMENT", summary: "The affected energy artifacts were revised and committed." } };
        }
      }
    } else if (session === "T1") {
      if (step === 0) command = shell(writeFiles(packageFiles(false)));
      else if (step === 1 && arm === "P") command = conclude("DELIVER");
    } else if (session === "T2" && arm === "P") {
      const results = latestResult(input);
      const revisionStep = step - (variant === "brief-pulse" ? 2 : 0);
      if (revisionStep === 1) assert(results.includes("ENERGY_REVISION_SCOPE_MISMATCH"), "MOCK_BROAD_PLAN_NOT_REFUSED");
      if (revisionStep === -2) command = pulse();
      else if (revisionStep === -1) {
        const value = JSON.parse(results);
        assert(value.presentation === "brief" && value.episode.state === "REOPENED" &&
          value.episode.conclusion?.conclusionId && value.coverage.omitted.length > 0, "MOCK_BRIEF_PULSE_MISSING");
        command = pulse({ detail: "full" });
      } else if (revisionStep === 0 || revisionStep === 1) {
        if (variant === "brief-pulse" && revisionStep === 0) {
          const value = JSON.parse(results);
          assert(value.digest && value.presentation === undefined && value.episode.conclusion?.check, "MOCK_FULL_PULSE_MISSING");
        }
        command = work("plan", { reason: "A supplier bulletin needs isolated revision.", tasks: [{
        task_id: "revise-energy-package", objective: "Apply the Harbor Flats supplier correction, update all affected artifacts, and commit the candidate while retaining the separate certificates.",
        depends_on: [], write_paths: revisionStep === 0 ? DELIVERABLES : REVISION_PATHS, required_artifacts: REVISION_PATHS,
        }] });
      } else if (revisionStep === 2) command = work("delegate", { taskId: "revise-energy-package" });
      else if (revisionStep === 3) command = work("workers");
      else if (!concluded && advanced) {
        if (variant === "receipt" && !expanded) {
          assert(results.includes("VERIFYING"), "MOCK_TASK_NOT_VERIFYING");
          command = expandReceipt(JSON.parse(results).revisionReceipt, accepted);
          expanded = true;
        } else {
          if (expanded) expectExpansion(results);
          else assert(results.includes("VERIFYING"), "MOCK_TASK_NOT_VERIFYING");
          command = conclude("WAIT_FOR_OPERATOR");
          concluded = true;
        }
      } else if (!concluded && /FINISHED/u.test(results) && /SETTLED/u.test(results)) {
        assert(results.includes(SETTLED_GUIDANCE.split(".")[0]), "MOCK_WORKER_SETTLEMENT_GUIDANCE_MISSING");
        command = work("run", { maxSteps: 8 });
        advanced = true;
      } else if (!concluded && revisionStep < 12 && !/RECORDED|HOST_ERROR|nothing in this project currently awaits/u.test(results)) {
        await delay(900);
        command = work("workers");
      }
    } else if (session === "T2") {
      if (step === 0) command = shell("git worktree add -b energy-candidate .palimpsest/native-candidate");
      else if (step === 1) command = { name: "subagent", input: { cwd: ".palimpsest/native-candidate", description: "Revise deployment candidate", prompt: childPrompt } };
      else if (step < 16 && !/Record deployment decision package/u.test(JSON.stringify(messages(input, "user", "tool_result").at(-1)?.content ?? ""))) {
        command = shell("sleep 1; git log -1 --format=%s energy-candidate");
      }
    } else if (session === "T3") {
      if (step === 0) command = shell(`cat acceptance.json ${DELIVERABLES[5]}`);
      else if (step === 1) command = shell(writeFiles({ [SUMMARY]: markdown("Procurement review",
        `Both sites now use K-900. The source ${BULLETIN} changes Harbor Flats capacity. The estimate increases by USD 51,000 and Harbor Flats installation starts five weeks later. Purchase and final budget approval remain pending.`,
        { north: "K-900", harbor: "K-900", previousTotalUsd: 485000, totalUsd: 536000, previousHarborLeadWeeks: 9,
          harborLeadWeeks: 14, approvedHead: accepted, pendingApprovals: ["Purchase order", "Budget release"] }) }));
      else if (step === 2 && arm === "P") command = conclude("DELIVER");
    }
    if (!command) return finish;
    assert(input.tools?.some(tool => tool.name === command.name), `MOCK_TOOL_UNAVAILABLE ${command.name} (${input.tools?.map(tool => tool.name).join(",")})`);
    return [{ type: "tool_use", id: `energy_${ordinal}_${role}`, ...command }];
  };
}
