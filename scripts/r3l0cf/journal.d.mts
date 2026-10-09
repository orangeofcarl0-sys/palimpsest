/** R3-L0C-F journal module type declarations (harness-only). */
export declare const JOURNAL_FILE: string;
export declare const ABORT_MANIFEST_FILE: string;
export declare const EVIDENCE_INDEX_FILE: string;
export declare function recordDigest(record: any): string;
export declare function appendRecord(input: any): any;
export declare function readJournal(journalPath: string): any;
export declare function countRecords(journalPath: string): any;
export declare function buildGenerationRecord(input: any): any;
export declare function buildAbortManifest(input: any): any;
export declare function buildEvidenceIndex(input: any): any;
export declare function writeJsonAtomic(path: string, value: any): string;
export declare const JOURNAL_DURABILITY_PROTOCOL: any;
export declare const NL: string;
