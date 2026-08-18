/**
 * Structural DSH host contract for the Palimpsest tool surface.
 *
 * These types mirror the DSH adapter contract consumed by @ordarium/dsh
 * (packages/dsh/src/advanced.ts): tools are registered into a host tool
 * registry, and every execution receives a run context carrying stable call
 * identity, the calling agent/session and an AbortSignal.
 *
 * Known limitation (Ordarium G9 exit §5): the real DSH plugin manifest is
 * pending the public DSH package; these structural types are the stand-in
 * so Palimpsest's tool surface is defined and testable today. When the real
 * manifest lands, the switch is expected to be contract-zero.
 */

export interface DshContentBlock {
  readonly type: string;
  [key: string]: unknown;
}

export interface DshToolRunContext {
  readonly callId: string;
  readonly rootCallId: string;
  readonly name: string;
  readonly arguments: unknown;
  readonly agent?: unknown;
  readonly parent?: unknown;
  readonly signal: AbortSignal;
  deferContext?(context: unknown): void;
  concludeTurn?(): void;
}

export interface DshToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
  readonly output: {
    readonly schema: Record<string, unknown>;
    render(args: unknown, value: unknown): DshContentBlock[];
  };
  readonly timeoutMs?: number | undefined;
  isConcurrencySafe?(args: unknown): boolean;
  execute(args: unknown, context: DshToolRunContext): Promise<unknown>;
}

export interface DshToolRegistry {
  register(definition: DshToolDefinition): void | (() => void) | { dispose(): void };
}

export interface DshPluginContext {
  tools: DshToolRegistry;
}
