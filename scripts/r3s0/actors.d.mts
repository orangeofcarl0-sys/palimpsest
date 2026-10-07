/** R3-S0 deterministic test actors type declarations (harness-only). */
export declare const SCRIPTED_WORKER_ACTIONS: Readonly<{ PULL_VISIBLE_HANDLE: string; ASSERT_HANDLE_ABSENT: string; NOOP_READY: string; COMMIT_FILE: string }>;
export declare function scriptedWorker(input: any): any;
export declare function pulledBodyOf(response: any): any;
export declare const ADVERSARIAL_ATTEMPTS: Readonly<Record<string, string>>;
export declare function adversarialWorker(input: any): any;
export declare function refusedAttempts(attempts: readonly any[]): readonly string[];
export declare function acceptedAttempts(attempts: readonly any[]): readonly any[];
