/** R3-L0 trajectory module type declarations (harness-only). */
export declare const TEE_PATH: string;
export declare const CHILD_PROGRAM: string;
export declare function trajectoryRoot(label: string): string;
export declare function trajectoryPaths(root: string): any;
export declare function writeProjectWorld(dir: string, source: string): string;
export declare function makeProfile(home: string, route: any, profileId: string): string;
export declare function runVisibleOracle(repo: string): any;
export declare function sha256(text: string): string;
