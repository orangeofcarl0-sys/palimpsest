import io

# SR-2d3 §十九 — finish the identity layer.
#
# Two corrections to the earlier attempt, both about PRESERVING semantics exactly rather than
# approximately:
#
#   1. `parseOrganizationRef` threw `OrganizationDefinitionError`; it must keep throwing it, so the
#      identity module takes the error CONSTRUCTOR as a parameter instead of substituting a
#      different exception type. The caller (`organization/definition.ts`) passes its own class.
#   2. `parseActivationRef`'s nested `runDefinition`/`bindingResolution` were TYPED as
#      `RunDefinitionRef`/`BindingResolutionRef` from other L1 modules; the identity layer declares
#      them structurally so it stays a leaf of the two upper layers.

p = "src/identity/refs.ts"
t = io.open(p, encoding="utf-8").read()

old = '''function orgFail(message: string): never {
  throw new CoordinationStoreError(message);
}

export function parseOrganizationRef(raw: unknown, what = "OrganizationDefinitionRef"): OrganizationDefinitionRef {
  const object = strictObject(
    raw,
    { allowed: ["organizationDefinitionId", "revision", "digest"], required: ["organizationDefinitionId", "revision", "digest"] },
    what,
  );
  const revision = object.revision;
  if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 0) {
    orgFail(`${what}.revision must be a safe non-negative integer`);
  }
  return Object.freeze({
    organizationDefinitionId: requireStableId(object.organizationDefinitionId, `${what}.organizationDefinitionId`),
    revision,
    digest: requireString(object.digest, `${what}.digest`),
  });
}'''

new = '''export function parseOrganizationRef(raw: unknown, what = "OrganizationDefinitionRef"): OrganizationDefinitionRef {
  const object = strictObject(
    raw,
    { allowed: ["organizationDefinitionId", "revision", "digest"], required: ["organizationDefinitionId", "revision", "digest"] },
    what,
  );
  const revision = object.revision;
  if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 0) {
    // The owner's own error type, injected: this layer must not invent a second exception
    // vocabulary for a refusal the organization plane already names.
    throw new OrganizationRefError(`${what}.revision must be a safe non-negative integer`);
  }
  return Object.freeze({
    organizationDefinitionId: requireStableId(object.organizationDefinitionId, `${what}.organizationDefinitionId`),
    revision,
    digest: requireString(object.digest, `${what}.digest`),
  });
}

/**
 * The error the organization ref parser throws.
 *
 * A SETTER rather than a hard import, because the concrete class belongs to the organization plane
 * (`OrganizationDefinitionError`) and this layer must not depend upward to name it. The organization
 * module binds its own class at load time, so callers still catch exactly what they caught before.
 */
let OrganizationRefError: new (message: string) => Error = CoordinationStoreError;
export function bindOrganizationRefError(errorType: new (message: string) => Error): void {
  OrganizationRefError = errorType;
}'''
assert t.count(old) == 1
t = t.replace(old, new)
io.open(p, "w", encoding="utf-8", newline="\n").write(t)
print("identity refs: org error injected + ready")
