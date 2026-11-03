/** R3-L0A cross-trajectory probe type declarations (harness-only). */
export declare const TRAJECTORY_IDS: readonly string[];
export declare function probeTrajectory(home: string, ownTrajectoryId: string): readonly any[];
export declare function probeAll(runDir: string): Readonly<Record<string, readonly any[]>>;
export declare function summarize(probes: any): any;
