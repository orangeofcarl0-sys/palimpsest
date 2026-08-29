/**
 * Model Performance Table (Research line R6, raw-notes 预算.txt §43).
 *
 * Real deployments accumulate telemetry per (task_type, model): attempts,
 * successes and total cost. From those we estimate the success probability
 * and the expected cost per success:
 *
 *     C_success = C_attempt / P(success)
 *
 * A strong model that is expensive per attempt can still win because its
 * success rate is higher (0.009/0.94 < 0.002/0.72 in the raw example). With
 * little data the raw ratio is unstable, so we smooth with a Gamma prior
 * (K successes observed over K attempts is blended toward a prior rate).
 * This table feeds the allocator once telemetry reaches the threshold;
 * for now it is a first-class telemetry surface the host records into.
 */

const PRIOR_ATTEMPTS = 4;
const PRIOR_SUCCESS_RATE = 0.5;

export type TaskOutcome = "success" | "failure";

export interface TelemetryRecord {
  readonly task_type: string;
  readonly model: string;
  readonly outcome: TaskOutcome;
  readonly cost: number;
}

export interface ModelStat {
  readonly task_type: string;
  readonly model: string;
  readonly attempts: number;
  readonly successes: number;
  /** Total observed attempt cost; the raw accumulator behind avgAttemptCost. */
  readonly cost: number;
  /** Smooth estimate of P(success): (successes + prior)/(attempts + prior). */
  readonly successRate: number;
  readonly avgAttemptCost: number;
  /** C_attempt / P(success); undefined when we have no attempts. */
  readonly costPerSuccess: number | undefined;
}

export interface PerformanceSnapshot {
  readonly rows: ModelStat[];
  readonly totalAttempts: number;
  readonly totalCost: number;
}

/** Gamma-prior smoothed success probability. */
function smoothedRate(successes: number, attempts: number): number {
  if (attempts === 0) return PRIOR_SUCCESS_RATE;
  return (successes + PRIOR_ATTEMPTS * PRIOR_SUCCESS_RATE) / (attempts + PRIOR_ATTEMPTS);
}

function statOf(
  task_type: string,
  model: string,
  attempts: number,
  successes: number,
  cost: number,
): ModelStat {
  const avgAttemptCost = attempts === 0 ? 0 : cost / attempts;
  const successRate = smoothedRate(successes, attempts);
  const costPerSuccess =
    attempts === 0 || successRate <= 0 ? undefined : avgAttemptCost / successRate;
  return {
    task_type,
    model,
    attempts,
    successes,
    cost,
    successRate,
    avgAttemptCost,
    costPerSuccess,
  };
}

export class ModelPerformanceTable {
  readonly #attempts = new Map<string, number>();
  readonly #successes = new Map<string, number>();
  readonly #cost = new Map<string, number>();

  #key(taskType: string, model: string): string {
    return `${taskType}\u0000${model}`;
  }

  record(input: TelemetryRecord): void {
    if (input.cost < 0 || !Number.isFinite(input.cost)) {
      throw new TypeError("cost must be a non-negative finite number");
    }
    const key = this.#key(input.task_type, input.model);
    this.#attempts.set(key, (this.#attempts.get(key) ?? 0) + 1);
    this.#cost.set(key, (this.#cost.get(key) ?? 0) + input.cost);
    if (input.outcome === "success") {
      this.#successes.set(key, (this.#successes.get(key) ?? 0) + 1);
    }
  }

  /** Telemetry for one (task_type, model) pair; undefined until first record. */
  stat(taskType: string, model: string): ModelStat | undefined {
    const key = this.#key(taskType, model);
    const attempts = this.#attempts.get(key);
    if (attempts === undefined) return undefined;
    return statOf(taskType, model, attempts, this.#successes.get(key) ?? 0, this.#cost.get(key) ?? 0);
  }

  /**
   * Inject a pre-aggregated delta (durable-telemetry replay, PLMP-TLM-1 §1).
   * The counts land exactly as given - the durable home stores aggregated
   * deltas, so there is no per-attempt cost split to replay.
   */
  addAggregated(input: {
    task_type: string;
    model: string;
    attempts: number;
    successes: number;
    cost: number;
  }): void {
    const { task_type, model, attempts, successes, cost } = input;
    if (!Number.isSafeInteger(attempts) || attempts < 1) {
      throw new TypeError("attempts must be a positive integer");
    }
    if (!Number.isSafeInteger(successes) || successes < 0 || successes > attempts) {
      throw new TypeError("successes must be an integer within [0, attempts]");
    }
    if (cost < 0 || !Number.isFinite(cost)) {
      throw new TypeError("cost must be a non-negative finite number");
    }
    const key = this.#key(task_type, model);
    this.#attempts.set(key, (this.#attempts.get(key) ?? 0) + attempts);
    this.#successes.set(key, (this.#successes.get(key) ?? 0) + successes);
    this.#cost.set(key, (this.#cost.get(key) ?? 0) + cost);
  }

  snapshot(): PerformanceSnapshot {
    const rows: ModelStat[] = [];
    for (const [key, attempts] of this.#attempts) {
      const [taskType, model] = key.split("\u0000") as [string, string];
      rows.push(statOf(taskType, model, attempts, this.#successes.get(key) ?? 0, this.#cost.get(key) ?? 0));
    }
    rows.sort((a, b) => a.task_type.localeCompare(b.task_type) || a.model.localeCompare(b.model));
    let totalCost = 0;
    for (const value of this.#cost.values()) totalCost += value;
    return {
      rows,
      totalAttempts: this.#attempts.size === 0 ? 0 : [...this.#attempts.values()].reduce((a, b) => a + b, 0),
      totalCost,
    };
  }

  /**
   * Expected cost to success for each candidate model on a task type,
   * using table data (smoothed) or a caller-supplied prior when cold.
   */
  expectedCostPerSuccess(
    taskType: string,
    candidates: readonly { model: string; cost: number; priorSuccessRate?: number }[],
  ): Array<{ model: string; costPerSuccess: number | undefined }> {
    return candidates.map((candidate) => {
      const stat = this.stat(taskType, candidate.model);
      if (stat !== undefined) {
        return { model: candidate.model, costPerSuccess: stat.costPerSuccess };
      }
      const prior = candidate.priorSuccessRate ?? PRIOR_SUCCESS_RATE;
      if (prior <= 0) return { model: candidate.model, costPerSuccess: undefined };
      return { model: candidate.model, costPerSuccess: candidate.cost / prior };
    });
  }

  /** The candidate model with the lowest expected cost per success for a task type. */
  bestModel(
    taskType: string,
    candidates: readonly { model: string; cost: number; priorSuccessRate?: number }[],
  ): string | undefined {
    const ranked = this.expectedCostPerSuccess(taskType, candidates).filter(
      (entry) => entry.costPerSuccess !== undefined,
    );
    ranked.sort((a, b) => (a.costPerSuccess! - b.costPerSuccess!));
    return ranked[0]?.model;
  }
}