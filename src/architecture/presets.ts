/**
 * PLMP-ARCH-3 (20 号规格): the preset library - the researched multi-agent
 * systems encoded as selectable topology prototypes. A preset is a pure
 * function from params to a ProjectProposal (zero LLM, ARCH-2 red line);
 * validation and declaration stay in proposal.ts / start()/plan() (18 号).
 * Each preset carries its lineage: it is the system's topology essence, not
 * a clone - the mapping is declared, not hidden. Roles come from the genesis
 * declared table only (PRE-A07): an undeclared role fails closed at claim
 * time, so presets never invent one. Gate ids are advisory - GATE_DEFINED
 * keeps its single declaration path (declareGate).
 */

import { pipelinePreset, type ProjectProposal, type TaskProposal } from "./proposal.js";

export interface PresetParamField {
  readonly name: string;
  readonly required: boolean;
  readonly description: string;
}

export interface PresetMeta {
  readonly id: string;
  readonly label: string;
  /** The researched system and how the mapping deviates from a clone. */
  readonly lineage: string;
  readonly description: string;
  readonly paramSpec: readonly PresetParamField[];
  /** PLMP-UAS-0 (UA-INV-8/9): presets are topology prototypes, not native
   * behavioral equivalents - the fidelity label is machine-checkable so
   * "looks like architecture X" can never be presented as "reproduces X". */
  readonly fidelity: "topology_prototype";
}

type Params = Record<string, unknown>;

const CHANGE_CLASSES = new Set([
  "metadata_only",
  "backward_compatible",
  "behavior_change",
  "contract_breaking",
]);

function str(params: Params, key: string, fallback: string): string {
  const value = params[key];
  if (value === undefined) return fallback;
  if (typeof value !== "string") throw new Error(`param "${key}" must be a string`);
  return value;
}

function changeClass(params: Params): ProjectProposal["changeClass"] {
  const value = params["changeClass"];
  if (value === undefined) return "behavior_change";
  if (typeof value !== "string" || !CHANGE_CLASSES.has(value)) {
    throw new Error(`param "changeClass" must be one of ${[...CHANGE_CLASSES].join("|")}`);
  }
  return value as ProjectProposal["changeClass"];
}

interface StageInput {
  readonly title?: unknown;
  readonly writePaths?: unknown;
  readonly requiredArtifacts?: unknown;
  readonly gateId?: unknown;
}

function strings(value: unknown, key: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error(`param "${key}" must be an array`);
  return value.map((entry) => {
    if (typeof entry !== "string") throw new Error(`param "${key}" must hold strings`);
    return entry;
  });
}

/** A proposal stage from a param shape; empty optionals stay absent (缺省省略). */
function stage(input: StageInput, role: string | undefined): TaskProposal {
  if (typeof input.title !== "string" || input.title.trim() === "") {
    throw new Error("param stage needs a non-blank title");
  }
  const writePaths = strings(input.writePaths, "writePaths");
  const requiredArtifacts = strings(input.requiredArtifacts, "requiredArtifacts");
  let gateId: string | undefined;
  if (input.gateId !== undefined) {
    if (typeof input.gateId !== "string") throw new Error("param gateId must be a string");
    gateId = input.gateId;
  }
  return {
    title: input.title,
    dependsOn: [],
    ...(writePaths === undefined ? {} : { writePaths }),
    ...(requiredArtifacts === undefined ? {} : { requiredArtifacts }),
    ...(gateId === undefined ? {} : { gateId }),
    ...(role === undefined ? {} : { role }),
  };
}

function stageList(params: Params, key: string, fallback: readonly string[]): TaskProposal[] {
  const raw = params[key];
  if (raw === undefined) return fallback.map((title) => stage({ title }, undefined));
  if (!Array.isArray(raw)) throw new Error(`param "${key}" must be an array`);
  return raw.map((entry) => stage(entry as StageInput, undefined));
}

function connect(
  stages: TaskProposal[],
  deps: ReadonlyArray<[string, readonly string[]]>,
): TaskProposal[] {
  return stages.map((task) => {
    const found = deps.find(([title]) => title === task.title);
    return found === undefined ? task : { ...task, dependsOn: [...found[1]] };
  });
}

// ---------------------------------------------------------------------------
// The six presets (spec 20 §1).
// ---------------------------------------------------------------------------

function buildPipeline(params: Params): ProjectProposal {
  const goal = str(params, "goal", "新目标");
  const raw = params["stages"];
  if (raw === undefined) {
    return buildPipeline({ ...params, stages: [{ title: "实现" }, { title: "验证" }, { title: "评审" }] });
  }
  if (!Array.isArray(raw)) throw new Error('param "stages" must be an array');
  return { ...pipelinePreset({ goal, stages: raw as never }), changeClass: changeClass(params) };
}

function buildFanOut(params: Params): ProjectProposal {
  const goal = str(params, "goal", "新目标");
  const workers = stageList(params, "workers", ["调研 A", "调研 B"]).map((task) => ({
    ...task,
    role: "scout",
  }));
  const rawSynthesis = (params["synthesis"] ?? { title: "综合" }) as StageInput;
  const synthesis = { ...stage(rawSynthesis, "analyst"), dependsOn: workers.map((w) => w.title) };
  return {
    goal,
    changeClass: changeClass(params),
    tasks: connect([...workers, synthesis], [[synthesis.title, workers.map((w) => w.title)]]),
  };
}

function buildHierarchy(params: Params): ProjectProposal {
  const goal = str(params, "goal", "新目标");
  const research = stageList(params, "research", ["调研"]).map((task) => ({ ...task, role: "scout" }));
  const writing = {
    ...stage((params["writing"] ?? { title: "撰写" }) as StageInput, "implementer"),
    dependsOn: research.map((task) => task.title),
  };
  const editing = {
    ...stage((params["editing"] ?? { title: "编辑" }) as StageInput, "analyst"),
    dependsOn: [writing.title],
  };
  return {
    goal,
    changeClass: changeClass(params),
    tasks: connect(
      [...research, writing, editing],
      [
        [writing.title, research.map((task) => task.title)],
        [editing.title, [writing.title]],
      ],
    ),
  };
}

const CANDIDATE_LETTERS = ["A", "B", "C", "D"];

function buildPanel(params: Params): ProjectProposal {
  const goal = str(params, "goal", "新目标");
  const rawCount = params["candidates"] ?? 2;
  if (typeof rawCount !== "number" || !Number.isInteger(rawCount) || rawCount < 1 || rawCount > 4) {
    throw new Error('param "candidates" must be an integer within 1..4');
  }
  const candidates = Array.from({ length: rawCount }, (_, index) => ({
    ...stage({ title: `方案 ${CANDIDATE_LETTERS[index]!}` }, "analyst"),
  }));
  const synthesis = {
    ...stage((params["synthesis"] ?? { title: "合成评审" }) as StageInput, "analyst"),
    dependsOn: candidates.map((task) => task.title),
  };
  return {
    goal,
    changeClass: changeClass(params),
    tasks: connect([...candidates, synthesis], [
      [synthesis.title, candidates.map((task) => task.title)],
    ]),
  };
}

function buildVerifiedDag(params: Params): ProjectProposal {
  const goal = str(params, "goal", "新目标");
  const rawUnits = params["units"];
  if (rawUnits !== undefined && !Array.isArray(rawUnits)) {
    throw new Error('param "units" must be an array');
  }
  const unitInputs = (rawUnits ?? [
    { title: "单元 A" },
    { title: "单元 B" },
  ]) as ReadonlyArray<StageInput & { dependsOn?: unknown }>;
  const units = unitInputs.map((input) => {
    const task = stage(input, "implementer");
    const dependsOn = strings(input.dependsOn, "units[].dependsOn") ?? [];
    return { ...task, dependsOn };
  });
  const review = {
    ...stage((params["review"] ?? { title: "终审" }) as StageInput, "verifier"),
    dependsOn: units.map((task) => task.title),
  };
  return { goal, changeClass: changeClass(params), tasks: [...units, review] };
}

function buildResearchLoop(params: Params): ProjectProposal {
  const goal = str(params, "goal", "新目标");
  const plan = stage((params["plan"] ?? { title: "研究计划" }) as StageInput, "analyst");
  const topics = stageList(params, "topics", ["取证 A", "取证 B"]).map((task) => ({
    ...task,
    role: "scout",
    dependsOn: [plan.title],
  }));
  const verify = {
    ...stage((params["verify"] ?? { title: "核验" }) as StageInput, "verifier"),
    dependsOn: topics.map((task) => task.title),
  };
  const synthesis = {
    ...stage((params["synthesis"] ?? { title: "综合" }) as StageInput, "implementer"),
    dependsOn: [verify.title],
  };
  return {
    goal,
    changeClass: changeClass(params),
    tasks: connect(
      [plan, ...topics, verify, synthesis],
      [
        [verify.title, topics.map((task) => task.title)],
        [synthesis.title, [verify.title]],
      ],
    ),
  };
}

export interface PresetEntry extends PresetMeta {
  readonly build: (params: Params) => ProjectProposal;
}

export const PRESETS: readonly PresetEntry[] = [
  {
    id: "pipeline",
    fidelity: "topology_prototype",
    label: "流水线",
    lineage: "18 号规格 ARCH-1（首批预设）",
    description: "阶段线性链：每阶段依赖上一阶段，机械推进友好。",
    paramSpec: [
      { name: "stages", required: false, description: "阶段数组（title/writePaths/requiredArtifacts/gateId），默认 实现→验证→评审" },
    ],
    build: buildPipeline,
  },
  {
    id: "fan_out",
    fidelity: "topology_prototype",
    label: "扇出-汇聚（Grok Bot·Anthropic 深研式）",
    lineage: "Grok 类型化后台子代理 + Anthropic orchestrator-worker（+90.2% 实证）；worker 并行独立上下文，综合收敛",
    description: "N 个并行调研者扇出，一个综合者汇聚全部产出。",
    paramSpec: [
      { name: "workers", required: false, description: "并行 worker（title/writePaths/requiredArtifacts），默认 2 个" },
      { name: "synthesis", required: false, description: "综合阶段（title/writePaths/gateId），默认「综合」" },
    ],
    build: buildFanOut,
  },
  {
    id: "hierarchy",
    fidelity: "topology_prototype",
    label: "角色层级（Kimi Swarm 写作式）",
    lineage: "Kimi Swarm 层级写作模式：manager→调研/撰写/编辑；映射为三段角色链",
    description: "调研喂撰写、撰写喂编辑的层级分工链。",
    paramSpec: [
      { name: "research", required: false, description: "调研阶段数组，默认 1 个「调研」" },
      { name: "writing", required: false, description: "撰写阶段（title/writePaths/requiredArtifacts/gateId），默认「撰写」" },
      { name: "editing", required: false, description: "编辑阶段（title/gateId），默认「编辑」" },
    ],
    build: buildHierarchy,
  },
  {
    id: "panel",
    fidelity: "topology_prototype",
    label: "专家团（grok-expert 同题多解式）",
    lineage: "grok-expert 聊天室协议：同模型同题并行、leader 合成（非投票共识——调研 §1.3 已澄清）",
    description: "N 个候选同题并行作答，一个合成评审汇聚定稿。",
    paramSpec: [
      { name: "candidates", required: false, description: "候选数 1..4，默认 2（>2 并行需先 declareRoleTable 提额）" },
      { name: "synthesis", required: false, description: "合成阶段（title/gateId），默认「合成评审」" },
    ],
    build: buildPanel,
  },
  {
    id: "verified_dag",
    fidelity: "topology_prototype",
    label: "验证图（Danus 逐单元门禁式）",
    lineage: "Danus 事实图：每单元验证后才被依赖、verifier 只读终审；预设只给拓扑与门禁建议，验证语义走既有 gate 通道",
    description: "知识/工程单元按依赖成图，逐单元可挂门禁，终审收口。",
    paramSpec: [
      { name: "units", required: false, description: "单元数组（title/dependsOn/writePaths/requiredArtifacts/gateId），默认 2 个互不依赖" },
      { name: "review", required: false, description: "终审阶段（title/gateId），默认「终审」" },
    ],
    build: buildVerifiedDag,
  },
  {
    id: "research_loop",
    fidelity: "topology_prototype",
    label: "研究回路（Magentic ledger 式）",
    lineage: "Magentic TaskLedger/ProgressLedger：计划→结构化核验→不过走计划修订；回路边在核验 FAIL 后由主代理 plan 修订（架构调整即计划修订）",
    description: "先计划再并行取证，核验门收口后才综合。",
    paramSpec: [
      { name: "plan", required: false, description: "计划阶段（title/writePaths），默认「研究计划」" },
      { name: "topics", required: false, description: "取证阶段数组，默认 2 个" },
      { name: "verify", required: false, description: "核验阶段（title/gateId），默认「核验」" },
      { name: "synthesis", required: false, description: "综合阶段（title/gateId），默认「综合」" },
    ],
    build: buildResearchLoop,
  },
];

export function presetMeta(): ReadonlyArray<PresetMeta> {
  return PRESETS.map(({ build: _build, ...meta }) => meta);
}

/** Build a proposal from a preset id; throws (→ serve 400) on unknown id or bad params. */
export function presetDraft(id: string, params: Params): ProjectProposal {
  const preset = PRESETS.find((entry) => entry.id === id);
  if (preset === undefined) throw new Error(`unknown preset: ${id}`);
  if (params === null || typeof params !== "object" || Array.isArray(params)) {
    throw new Error("params must be a JSON object");
  }
  return preset.build(params);
}
