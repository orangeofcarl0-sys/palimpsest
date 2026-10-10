/** R3-L0C-G1-B — TYPES FOR scripts/r3l0c_g1b/authoritative-chain.mjs. */

export const NL: string;
export const readFileSync: any;

export function runAuthoritativeChain(input?: { mutate?: (context: any) => any; sessionId?: string; runId?: string; trustedIngestion?: boolean }): Promise<Readonly<Record<string, any>>>;
export const NEGATIVE_MUTATIONS: readonly Readonly<{ id: string; detail: string }>[];
export function runNegativeMutation(id: string): Promise<Readonly<{ id: string; attainedPositiveCorrelation: boolean; state: string; problems: readonly string[]; refused: boolean }>>;
