export declare const T1: "2026-02-10T09:05:00Z";
export declare const T2: "2026-02-14T09:10:00Z";
export declare const ARRIVALS_FILE: "arrivals.jsonl";

export interface ArrivalRecord {
  arrivedAt: string;
  item: string;
  kind: string;
  sha256: string;
  status: string;
}

export interface StagedFile {
  path: string;
  digest: string;
  bytes: number;
}

export interface StagingRecord {
  observationTime: string;
  releasedAt: string | null;
  visibleEvents: ArrivalRecord[];
  visibleSetDigest: string;
  treeDigest: string;
  files: StagedFile[];
  leaks: unknown[];
}

export interface ReleaseRecord extends StagingRecord {
  previouslyVisibleSetDigest: string;
  newlyVisible: ArrivalRecord[];
}

export interface StagingAudit {
  observationTime: string;
  expectedVisibleSetDigest: string;
  stagedVisibleSetDigest: string;
  missing: string[];
  unexpected: string[];
  leaks: { path: string; reason: string; identity: string }[];
}

export declare function sha256(value: string | Buffer): string;
export declare function readArrivals(source: string): ArrivalRecord[];
export declare function visibleArrivals(records: ArrivalRecord[], observationTime: string): ArrivalRecord[];
export declare function visibleSetDigest(visible: ArrivalRecord[]): string;
export declare function findFutureLeaks(
  destination: string,
  records: ArrivalRecord[],
  observationTime: string,
): { path: string; reason: string; identity: string }[];
export declare function materializeInboxAsOf(input: {
  source: string;
  observationTime: string;
  destination: string;
  digest?: (value: string | Buffer) => string;
}): StagingRecord;
export declare function releaseInboxAsOf(input: {
  source: string;
  observationTime: string;
  destination: string;
  releasedAt?: string;
  digest?: (value: string | Buffer) => string;
}): ReleaseRecord;
export declare function readStagedArrivals(destination: string): ArrivalRecord[];
export declare function auditStaging(destination: string, source: string, observationTime: string): StagingAudit;
export declare function listFiles(root: string): string[];
export declare function treeDigest(root: string): string;
export declare function isInside(child: string, parent: string): boolean;
