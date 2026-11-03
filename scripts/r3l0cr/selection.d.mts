/** R3-L0C-R selection module type declarations (harness-only). */
export declare const SUPPORTED_KINDS: readonly string[];
export declare const KIND_FIELDS: Readonly<Record<string, readonly string[]>>;
export declare const SELECTION_REFUSALS: Readonly<Record<string, string>>;
export declare class SelectionContractRefusal extends Error {
  readonly code: string;
  readonly detail: string;
}
export declare function validateSelection(request: any): any;
export declare function selectionIsEmpty(request: any): boolean;
export declare function selectionItemCount(request: any): number;
export declare function buildSelection(input: any): any;
export declare const REAL_MODEL_LAUNCHES_ON_REFUSAL: number;
export declare function attemptSelection(build: () => any): any;
export declare const NL: string;
