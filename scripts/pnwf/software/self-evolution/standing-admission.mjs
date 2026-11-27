/** Shared request-window and standing maintenance admission policy. */
import { isDeepStrictEqual } from "node:util";
import { digest, sha } from "../../energy/contract.mjs";

const dimensions = ["maxRequests", "wallClockMs", "requestTimeoutMs"];
const positive = value => Number.isSafeInteger(value) && value > 0;
const grantSeal = grant => digest(JSON.stringify(grant));
const kinds = new Set(["maintenance-selection", "github-maintenance"]);

function windowArgument(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  if (value.grant) return { limit: true, window: value.grant.window ?? value.grant.requestWindow };
  if (value.window || value.maxSessions !== undefined || value.initial !== undefined || value.expiresAt !== undefined) {
    return { limit: true, window: value.window ?? value.requestWindow };
  }
  if (value.requestWindow) return { request: true, window: value.requestWindow };
  return { window: value };
}

function compareWindows(request, limit) {
  if (!request || !limit || !dimensions.every(key =>
    positive(request[key]) && positive(limit[key]) && request[key] <= limit[key])) return false;
  const asked = request.billingCeiling, ceiling = limit.billingCeiling;
  return ceiling === null ? asked === null || positive(asked) : positive(ceiling) && positive(asked) && asked <= ceiling;
}

/** Plain windows and numeric bounds use request-first order. */
export function windowWithin(request, limit) {
  if (typeof request === "number" || typeof limit === "number") {
    return positive(request) && positive(limit) && request <= limit;
  }
  const first = windowArgument(request), second = windowArgument(limit);
  if ((first.limit && second.limit) || (first.request && second.request)) return false;
  return first.limit || second.request ? compareWindows(second.window, first.window) : compareWindows(first.window, second.window);
}

export function unresolvedUsage(value) {
  if (typeof value === "string") {
    try { value = JSON.parse(value); } catch { return true; }
  }
  if (!value || typeof value !== "object") return false;
  return [value.usageState, value.priorUsage?.usageState, value.settlement?.usageState]
    .some(state => state === "UNKNOWN" || state === "UNCONFIRMED") ||
    ["INCOMPLETE", "UNKNOWN", "UNCONFIRMED"].includes(value.attributionState ?? value.settlement?.attributionState) ||
    (Number.isSafeInteger(value.unresolved) && value.unresolved > 0) ||
    value.blocked === true || (typeof value.blocked === "string" && /UNKNOWN|UNCONFIRMED|ATTRIBUTION/u.test(value.blocked));
}

export function validStandingExpiry(expiresAt, at) {
  if (expiresAt === null) return true;
  if (typeof expiresAt !== "string" || !Number.isFinite(at)) return false;
  const expiry = Date.parse(expiresAt);
  return Number.isFinite(expiry) && expiry > at;
}

function releaseIdentity(release) {
  if (!sha(release?.candidate) || !/^[a-f0-9]{64}$/u.test(release.buildSha256) ||
      typeof release.image !== "string" || !release.image) return null;
  return { candidate: release.candidate, buildSha256: release.buildSha256, image: release.image };
}

function sameRelease(first, second) {
  const identity = releaseIdentity(first);
  return identity !== null && isDeepStrictEqual(identity, releaseIdentity(second));
}

function evaluate({ project, mode, active, job, delegation, priorSessions = [], predecessor, at = Date.now(), scope,
  repositoryId = scope?.repositoryId, blocked } = {}) {
  const grant = delegation?.grant ?? delegation;
  const input = job?.input;
  if (!grant || !input || job.status !== "PENDING" || typeof project !== "string" || typeof mode !== "string" ||
      grant.project !== project || grant.mode !== mode || delegation.revoked || grant.revoked ||
      [delegation.status, grant.status].some(status => status !== undefined && status !== "ACTIVE")) return null;
  if (repositoryId !== undefined && grant.repositoryId !== repositoryId) return null;
  if (!sameRelease(active, input.release) || !kinds.has(input.kind) ||
      (grant.ticketKinds !== undefined && (!Array.isArray(grant.ticketKinds) || !grant.ticketKinds.includes(input.kind))) ||
      (grant.lineage !== undefined && (!Array.isArray(grant.lineage) ||
        !grant.lineage.some(release => sameRelease(release, active)))) ||
      !compareWindows(input.requestWindow, grant.window ?? grant.requestWindow) ||
      !validStandingExpiry(grant.expiresAt, at)) return null;

  const workItems = grant.work ?? [];
  if (!Array.isArray(workItems) || workItems.length > 2 || workItems.some(work => typeof work !== "string") ||
      new Set(workItems).size !== workItems.length) return null;
  const work = input.work ?? job.id;
  if (typeof work !== "string") return null;
  if (workItems.length) {
    const position = workItems.indexOf(work);
    if (position < 0 || !sha(grant.initial)) return null;
    if (position === 0 && grant.initial !== active.candidate) return null;
    if (position > 0 && (predecessor?.id !== workItems[position - 1] || predecessor.state !== "VERIFIED" ||
      !sameRelease(predecessor.release, active))) return null;
  } else if (grant.initial !== undefined && grant.initial !== active.candidate) return null;

  if ([grant, delegation, job, predecessor, { blocked }].some(unresolvedUsage) ||
      !Array.isArray(priorSessions) ||
      priorSessions.some(session => [session, session?.job, session?.job?.result ?? session?.result].some(unresolvedUsage))) return null;
  const maxSessions = grant.maxSessions ?? workItems.length, alreadyUsed = grant.usedSessions ?? 0;
  const id = delegation.id ?? grantSeal(grant), seal = delegation.delegation ?? id;
  const history = priorSessions.filter(session => session?.receipt?.consumed !== false &&
    (session?.delegation === undefined || session.delegation === seal));
  if (!positive(maxSessions) || !Number.isSafeInteger(alreadyUsed) || alreadyUsed < 0 ||
      Math.max(alreadyUsed, history.length) >= maxSessions) return null;
  return {
    admitted: true, grant: id, delegation: seal, work,
    actor: delegation.actor ?? "trusted-github-pilot",
    reason: delegation.reason ?? "Authorized maintenance work " + work + " under " + seal,
  };
}

/** Structured callers receive an explicit denial. The legacy positional policy returns null. */
export function evaluateStandingAdmission(grantOrFacts, request, scope, workId, predecessor, at, state = {}) {
  if (request === undefined) return evaluate(grantOrFacts ?? {}) ?? { admitted: false };
  if (!request || typeof request !== "object") return null;
  return evaluate({
    ...state, scope, at, predecessor, delegation: grantOrFacts,
    project: request.project ?? scope?.projectId, mode: request.mode ?? scope?.mode, active: request.release,
    job: { id: request.work, status: "PENDING",
      input: { kind: state.kind ?? request.kind ?? "github-maintenance", work: workId, release: request.release,
        requestWindow: request.requestWindow } },
  });
}
