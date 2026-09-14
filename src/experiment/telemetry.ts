/**
 * G10-R experiment telemetry — neutral, host-independent observation only.
 *
 *   Telemetry ≠ SemanticTruth        Proxy ≠ Truth
 *   ObservedAssociation ≠ Causation  Missing ≠ Zero
 *
 * This module is deliberately free of any host/DSH internal import: it accepts
 * a plain session summary or a sequence of opaque host events and turns them
 * into `MetricObservation`s. It never invents a value for an observation the
 * host did not report: a missing token bucket is `UNAVAILABLE`, never `0`.
 */

import { materializeMetric, unavailableMetric } from "../organization_memory/artifacts.js";
import type { MeasurementClass, MetricObservation } from "../organization_memory/artifacts.js";

/** Provenance recorded for observations derived from host session events. */
export const SESSION_TELEMETRY_PROVENANCE = "dsh.session.events";

export interface SessionTelemetryInput {
  readonly provider: string;
  readonly model: string;
  readonly turns: number;
  readonly steps: number;
  readonly toolCalls: number;
  readonly errors: number;
  readonly usage: {
    readonly inputTokens?: number;
    readonly outputTokens?: number;
    readonly cacheReadTokens?: number;
    readonly cacheWriteTokens?: number;
    readonly reasoningTokens?: number;
  };
}

/** The standard metric ids emitted for a session, with their units. */
const STANDARD_METRIC_UNITS: readonly { readonly metricId: string; readonly unit: string }[] = Object.freeze([
  { metricId: "agentTurns", unit: "count" },
  { metricId: "agentSteps", unit: "count" },
  { metricId: "toolCalls", unit: "count" },
  { metricId: "modelCalls", unit: "count" },
  { metricId: "inputTokens", unit: "tokens" },
  { metricId: "outputTokens", unit: "tokens" },
  { metricId: "cacheReadTokens", unit: "tokens" },
  { metricId: "cacheWriteTokens", unit: "tokens" },
  { metricId: "reasoningTokens", unit: "tokens" },
  { metricId: "provider", unit: "text" },
  { metricId: "model", unit: "text" },
  { metricId: "estimatedCost", unit: "usd" },
]);

/* ------------------------------------------------------------------ *
 * Individual metric construction
 * ------------------------------------------------------------------ */

function nonEmptyDetail(detail: string): string {
  return detail.length > 0 ? detail : "telemetry unavailable";
}

function countMetric(
  metricId: string,
  value: number,
  measurementClass: MeasurementClass,
  provenance: string,
): MetricObservation {
  if (!Number.isSafeInteger(value)) {
    return unavailableMetric({
      metricId,
      unit: "count",
      detail: `${metricId} was not reported as an integer`,
      provenance,
    });
  }
  return materializeMetric({
    metricId,
    unit: "count",
    measurementClass,
    state: "known",
    value,
    provenance,
  });
}

function tokenMetric(metricId: string, value: number | undefined, provenance: string): MetricObservation {
  if (value === undefined || !Number.isFinite(value) || !Number.isSafeInteger(value)) {
    return unavailableMetric({
      metricId,
      unit: "tokens",
      detail: `${metricId} not reported by the host for this session`,
      provenance,
    });
  }
  return materializeMetric({
    metricId,
    unit: "tokens",
    measurementClass: "DIRECTLY_OBSERVED",
    state: "known",
    value,
    provenance,
  });
}

function textMetric(metricId: string, text: string, provenance: string): MetricObservation {
  return materializeMetric({
    metricId,
    unit: "text",
    measurementClass: "DIRECTLY_OBSERVED",
    state: "known",
    text,
    provenance,
  });
}

/* ------------------------------------------------------------------ *
 * sessionTelemetryMetrics
 * ------------------------------------------------------------------ */

/**
 * Turn a session summary into the standard telemetry metric set.
 *
 * `modelCalls` uses `steps` as an observable model-call PROXY and is labelled
 * DERIVED_MECHANICALLY. Token buckets are DIRECTLY_OBSERVED only when the host
 * reported them; otherwise they are UNAVAILABLE with a detail — never 0.
 */
export function sessionTelemetryMetrics(input: SessionTelemetryInput): readonly MetricObservation[] {
  const provenance = SESSION_TELEMETRY_PROVENANCE;
  const usage = input.usage;
  return Object.freeze([
    countMetric("agentTurns", input.turns, "DIRECTLY_OBSERVED", provenance),
    countMetric("agentSteps", input.steps, "DIRECTLY_OBSERVED", provenance),
    countMetric("toolCalls", input.toolCalls, "DIRECTLY_OBSERVED", provenance),
    countMetric("modelCalls", input.steps, "DERIVED_MECHANICALLY", `${provenance}:steps_as_model_call_proxy`),
    tokenMetric("inputTokens", usage.inputTokens, provenance),
    tokenMetric("outputTokens", usage.outputTokens, provenance),
    tokenMetric("cacheReadTokens", usage.cacheReadTokens, provenance),
    tokenMetric("cacheWriteTokens", usage.cacheWriteTokens, provenance),
    tokenMetric("reasoningTokens", usage.reasoningTokens, provenance),
    textMetric("provider", input.provider, provenance),
    textMetric("model", input.model, provenance),
    unavailableMetric({
      metricId: "estimatedCost",
      unit: "usd",
      detail: "host exposes no dollar cost",
      provenance,
    }),
  ]);
}

/* ------------------------------------------------------------------ *
 * extractSessionTelemetry
 * ------------------------------------------------------------------ */

export interface ExtractedSessionTelemetry {
  readonly turns: number;
  readonly steps: number;
  readonly toolCalls: number;
  readonly errors: number;
  readonly usage: SessionTelemetryInput["usage"];
}

interface MutableUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
}

const USAGE_KEYS: readonly (keyof MutableUsage)[] = [
  "inputTokens",
  "outputTokens",
  "cacheReadTokens",
  "cacheWriteTokens",
  "reasoningTokens",
];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Defensively fold opaque host events into a session summary. Malformed entries
 * are ignored; a missing field never throws.
 *
 * Counts come from `turn/start`, `step/start`, `tool/call` and `agent/error`.
 * Token usage is summed from every event whose `data.usage` object carries the
 * numeric buckets (in practice `assistant/message`).
 */
export function extractSessionTelemetry(
  events: readonly { readonly type: string; readonly data?: unknown }[],
): ExtractedSessionTelemetry {
  let turns = 0;
  let steps = 0;
  let toolCalls = 0;
  let errors = 0;
  const usage: MutableUsage = {};

  const addUsage = (key: keyof MutableUsage, value: unknown): void => {
    if (typeof value !== "number" || !Number.isFinite(value)) return;
    usage[key] = (usage[key] ?? 0) + value;
  };

  for (const event of events) {
    if (!isObject(event)) continue;
    switch (event.type) {
      case "turn/start":
        turns += 1;
        break;
      case "step/start":
        steps += 1;
        break;
      case "tool/call":
        toolCalls += 1;
        break;
      case "agent/error":
        errors += 1;
        break;
      default:
        break;
    }
    const data = event.data;
    if (!isObject(data)) continue;
    const usageRaw = data.usage;
    if (!isObject(usageRaw)) continue;
    for (const key of USAGE_KEYS) {
      addUsage(key, usageRaw[key]);
    }
  }

  return { turns, steps, toolCalls, errors, usage };
}

/* ------------------------------------------------------------------ *
 * ExperimentTelemetryPort
 * ------------------------------------------------------------------ */

/** A host adapter that observes one session's telemetry. */
export interface ExperimentTelemetryPort {
  readonly adapterId: string;
  collect(): Promise<readonly MetricObservation[]>;
}

/* ------------------------------------------------------------------ *
 * unavailableTelemetry
 * ------------------------------------------------------------------ */

/**
 * The whole standard metric set, all UNAVAILABLE, for the given reason. Used
 * when a host/run produced no telemetry at all: absence is recorded as
 * absence, never as a zero measurement.
 */
export function unavailableTelemetry(reason: string): readonly MetricObservation[] {
  const detail = nonEmptyDetail(reason);
  return Object.freeze(
    STANDARD_METRIC_UNITS.map((metric) =>
      unavailableMetric({
        metricId: metric.metricId,
        unit: metric.unit,
        detail,
        provenance: SESSION_TELEMETRY_PROVENANCE,
      }),
    ),
  );
}
