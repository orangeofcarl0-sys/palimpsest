/** R3-L0C-F/I fail-stop module type declarations (harness-only). */
export declare const CLAIM_FILE: string;
export declare class FailStopStateMachine {
  get state(): string;
  get history(): readonly any[];
  get terminal(): boolean;
  transition(next: string, detail?: any): string;
  snapshot(): any;
}
export declare function inspectRunClaim(input: any): any;
export declare function claimRunRoot(input: any): any;
export declare function classifyOutcome(outcome: any, options?: any): any;
export declare function runFailStopMatrix(input: any): Promise<any>;
export declare function inspectPreservedRun(runRoot: string): any;
export declare const LAUNCH_LAW: any;
