/** R3-A2 fixture-audit module type declarations (harness-only; consumed by the TypeScript tests). */
export declare const MODEL_CONSULTATION_PATTERNS: readonly RegExp[];
export declare function constructionAudit(spec: any, root?: string): Promise<any>;
export declare function preconditionOf(spec: any, root?: string): Promise<any>;
export declare function allConstructionAudits(root?: string): Promise<readonly any[]>;
export declare function allPreconditions(root?: string): Promise<Readonly<Record<string, any>>>;
export declare function preconditionSatisfied(precondition: any): boolean;
