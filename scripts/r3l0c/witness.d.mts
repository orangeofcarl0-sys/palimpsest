/** R3-L0C witness module type declarations (harness-only). */
export declare const sha256: (text: string) => string;
export declare const LINK_STATES: Readonly<Record<string, string>>;
export declare const CHAIN_VERDICTS: Readonly<Record<string, string>>;
export declare function capitalWitness(input: any): any;
export declare function historyOnlyWitness(input: any): any;
export declare function trajectoryConsumption(witnesses: readonly any[]): any;
export declare function classifyInformationPath(input: any): string;
export declare const NL: string;
