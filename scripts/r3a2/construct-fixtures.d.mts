/** R3-A2 construct-fixtures module type declarations (harness-only; consumed by the TypeScript tests). */
export declare const FIXTURE_ROOT: string;
export declare function constructFixture(spec: any, root?: string): Readonly<{ fixtureId: string; fixtureRevision: number; dir: string; files: readonly unknown[]; contentDigest: string }>;
