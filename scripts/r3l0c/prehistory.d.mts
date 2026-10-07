/** R3-L0C prehistory module type declarations (harness-only). */
export declare const DIST: string;
export declare const git: (cwd: string, args: readonly string[]) => string;
export declare function writeProjectWorld(dir: string, corpus?: Readonly<Record<string, string>>): string;
export declare function worldDigest(corpus?: Readonly<Record<string, string>>): string;
export declare function admitCapital(root: string, paths: any, projectId: string, repo: string): Promise<any>;
export declare function selectionRefs(admitted: any): readonly any[];
export declare function backingRefs(admitted: any): readonly any[];
export declare const frozenBundle: any;
export declare const bundleDigest: any;
export declare const H0_SOURCE: string;
export declare const README: string;
export declare const PACKAGE_JSON: string;
export declare const VISIBLE_ORACLE: string;
export declare const worldFiles: any;
export declare const NL: string;
