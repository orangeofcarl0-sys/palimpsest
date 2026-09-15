/**
 * G10-AC — host-neutral monitor tick source.
 *
 * A tick means ONLY:
 *
 *   Re-evaluate monitored dormant state.
 *
 *   MonitorTick ≠ SemanticEvent      MonitorTick ≠ Authority
 *   MonitorTick ≠ Campaign mutation
 *
 * The tick source owns no canonical truth, has no Agent identity, and is not a
 * scheduler in the semantic sense: it merely causes the driver to look. Every
 * timer/manual/push hint converges on the SAME driver `tick()` path, so there is
 * exactly one evaluation pipeline.
 *
 * There is NO hidden default interval: an operator must configure one.
 */

export type MonitorTickTrigger = "manual" | "interval" | "signal_hint";

export interface MonitorTickSourceStatus {
  readonly running: boolean;
  readonly kind: "manual" | "interval";
  readonly intervalMs?: number | undefined;
  /** How many times this source has fired since `start()`. */
  readonly fires: number;
}

export interface MonitorTickSourcePort {
  readonly sourceId: string;
  /**
   * Begin delivering ticks. The handler is the driver's `tick()`; this source
   * never awaits it forever and never swallows a rejection into silence.
   */
  start(handler: (trigger: MonitorTickTrigger) => Promise<void> | void): Promise<void>;
  /** Stop cleanly. Idempotent. */
  stop(): Promise<void>;
  status(): MonitorTickSourceStatus;
}

export interface ManualMonitorTickSource extends MonitorTickSourcePort {
  readonly sourceId: "monitor-tick:manual";
  /** Fire one tick by hand (tests, embeddings, an operator command). */
  fire(trigger?: MonitorTickTrigger): Promise<void>;
}

/** A manual source: nothing fires unless a caller asks it to. */
export function manualMonitorTickSource(): ManualMonitorTickSource {
  let handler: ((trigger: MonitorTickTrigger) => Promise<void> | void) | undefined;
  let fires = 0;
  return Object.freeze({
    sourceId: "monitor-tick:manual" as const,
    async start(next: (trigger: MonitorTickTrigger) => Promise<void> | void): Promise<void> {
      handler = next;
    },
    async stop(): Promise<void> {
      handler = undefined;
    },
    status() {
      return Object.freeze({ running: handler !== undefined, kind: "manual" as const, fires });
    },
    async fire(trigger: MonitorTickTrigger = "manual"): Promise<void> {
      if (handler === undefined) return;
      fires += 1;
      await handler(trigger);
    },
  });
}

export interface IntervalMonitorTickSourceOptions {
  /**
   * REQUIRED. There is no hidden default: a deployment that wants periodic
   * monitoring must state its interval, because an implicit timer would be
   * exactly the "hidden background scheduler" the firewalls forbid.
   */
  readonly intervalMs: number;
  readonly onError?: ((error: unknown) => void) | undefined;
}

export interface IntervalMonitorTickSource extends MonitorTickSourcePort {
  readonly sourceId: "monitor-tick:interval";
}

/**
 * A real interval source. The timer is a deployment runtime component: it has no
 * Agent identity, its state is non-canonical, and it only ever calls `tick()`.
 *
 * Overlapping ticks are the DRIVER's problem to coalesce, not this source's: the
 * source fires on schedule and never waits for a slow tick to finish.
 */
export function intervalMonitorTickSource(
  options: IntervalMonitorTickSourceOptions,
): IntervalMonitorTickSource {
  if (
    typeof options.intervalMs !== "number" ||
    !Number.isSafeInteger(options.intervalMs) ||
    options.intervalMs < 1
  ) {
    throw new TypeError(
      "intervalMonitorTickSource requires an explicit positive integer intervalMs (there is no default interval)",
    );
  }
  let timer: ReturnType<typeof setInterval> | undefined;
  let running = false;
  let fires = 0;

  const stop = (): void => {
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
    running = false;
  };

  return Object.freeze({
    sourceId: "monitor-tick:interval" as const,
    async start(handler: (trigger: MonitorTickTrigger) => Promise<void> | void): Promise<void> {
      if (running) return;
      running = true;
      timer = setInterval(() => {
        fires += 1;
        // A tick is best-effort observation; a failure must never kill the timer
        // or vanish silently.
        void Promise.resolve()
          .then(() => handler("interval"))
          .catch((error: unknown) => {
            options.onError?.(error);
          });
      }, options.intervalMs);
      // Do not keep the process alive for a monitor timer.
      if (typeof (timer as { unref?: () => void }).unref === "function") {
        (timer as { unref: () => void }).unref();
      }
    },
    async stop(): Promise<void> {
      stop();
    },
    status() {
      return Object.freeze({
        running,
        kind: "interval" as const,
        intervalMs: options.intervalMs,
        fires,
      });
    },
  });
}
