/** R2-VR reanalysis module type declarations (harness-only; consumed by the TypeScript tests). */
export declare function loadR2VRaw(root?: string): any;
export declare function trialsByArm(raw: any): Record<string, readonly any[]>;
export declare function correctedAnalysis(raw: any): any;
export declare function correctedCalibration(analysis: any, audit: any): any;
