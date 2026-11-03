export interface ProviderKind {
  method: "POST";
  path: string;
  upstreamPath: string;
  authHeader: "x-api-key" | "authorization";
}
export declare const PROVIDER_KINDS: Readonly<Record<"anthropic" | "openai", ProviderKind>>;
export declare function providerRouteAllowedFor(kind: string, method: string, path: string): boolean;
export declare function providerRouteAllowed(method: string, path: string): boolean;
export declare function providerAuthHeaders(kind: string, key: string): Record<string, string>;
export declare const ALLOWED_PROVIDER_ROUTES: readonly string[];
