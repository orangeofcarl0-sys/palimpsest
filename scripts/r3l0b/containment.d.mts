/** R3-L0B containment module type declarations (harness-only). */
export declare const ISOLATED_LAYOUT: any;
export declare function isolatedRoots(root: string): readonly any[];
export declare function layoutShape(root: string, unitIds: readonly string[]): any;
export declare function discoverLayout(root: string, unitIds: readonly string[]): any;
export declare function buildIsolatedLayout(root: string, unitIds: readonly string[]): any;
export declare function buildSharedParentLayout(root: string, unitIds: readonly string[]): any;
export declare function declaredProtectedRoots(root: string): readonly string[];
export declare function containmentEnvironment(root: string, base?: any): any;
export declare function writeCanaries(root: string, unitIds: readonly string[]): any;
export declare function runContainmentGate(input: any): any;
export declare function runOutcomeBlindnessGate(input: any): any;
export declare function mutationVerdict(input: any): any;
export declare function envelopeForReport(): any;
export declare function fold(text: string): string;
export declare function dirname(path: string): string;
export declare function homedir(): string;
export declare function existsSync(path: string): boolean;
export declare function readFileSync(path: string, encoding: string): string;
