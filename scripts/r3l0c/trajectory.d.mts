/** R3-L0C trajectory module type declarations (harness-only). */
export declare const TEE_PATH: string;
export declare const CHILD_PROGRAM: string;
export declare function trajectoryRoot(runRoot: string): string;
export declare function trajectoryPaths(runRoot: string, trajectoryId: string): any;
export declare function trajectoryWorld(runRoot: string, trajectoryId: string): string;
export declare function trajectoryHome(runRoot: string, trajectoryId: string): string;
export declare function makeProfile(home: string, route: any, profileId: string, installHostBundle: any, dshHome: any, repoRoot?: string): string;
export declare function containmentEnvironment(runRoot: string, base?: any): any;
export declare function prepareRunLayout(runRoot: string, trajectoryIds: readonly string[]): any;
export declare function prepareTrajectory(runRoot: string, trajectoryId: string, prehistory: any): any;
export declare const ISOLATED_LAYOUT: any;
export declare const NL: string;
export declare const readFileSync: any;
export declare const rmSync: any;
export declare const writeFileSync: any;
export declare const mkdirSync: any;
export declare const pathToFileURL: any;
