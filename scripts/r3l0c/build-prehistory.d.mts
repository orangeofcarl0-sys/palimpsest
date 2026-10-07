/** R3-L0C build-prehistory module type declarations (harness-only). */
export declare const DIST: string;
export declare function writeProjectWorld(dir: string, corpus?: Readonly<Record<string, string>>): string;
export declare function worldDigest(corpus?: Readonly<Record<string, string>>): string;
export declare const PREHISTORY_INCIDENT_CUTOVER: string;
export declare const PREHISTORY_INCIDENT_ALIAS: string;
export declare function buildPrehistory(root: string, projectId?: string): Promise<any>;
export declare const H0_SOURCE: string;
export declare const NL: string;
export declare const load: any;
export declare const git: any;
