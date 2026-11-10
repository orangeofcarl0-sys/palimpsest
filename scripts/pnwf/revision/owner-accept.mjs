/** Offline owner command. Its only authorization input is the exact SHA approved by the owner. */
import { generateKeyPairSync, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { installProduct } from "../dist/src/product.js";
import { deriveProjectStandard } from "../dist/src/deployment/standard.js";
import { makeSignedOperatorAuthority, signOperatorToken, verifyOperatorToken } from "../dist/src/project_review/index.js";
import { assert, clean, head } from "../scripts/pnwf/energy/contract.mjs";
import { checkpoint } from "../scripts/pnwf/energy/product.mjs";

const [attemptId, basis, candidate, receiptId] = process.argv.slice(2);
const spec = JSON.parse(readFileSync(new URL("./scenario.json", import.meta.url)));
const repository = "/run/stage/world";
const stateDir = "/run/stage/state";
assert(head(repository) === basis && clean(repository), "ACCEPTANCE_BASIS_DRIFT");
const operatorId = spec.operatorNamespace + "-project-owner";
const actor = "operator:" + operatorId;
const purpose = "accept-revision:" + candidate;
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const token = signOperatorToken({ privateKeyPem: privateKey.export({ format: "pem", type: "pkcs8" }).toString(), claims: {
  operatorId, purpose, nonce: randomUUID(), issuedAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 60000).toISOString(),
} });
const verified = verifyOperatorToken({ token, publicKeyPem: publicKey.export({ format: "pem", type: "spki" }).toString(),
  expectedOperatorId: operatorId, expectedPurpose: purpose });
assert(verified.valid, "OPERATOR_TOKEN_REFUSED");
const standard = deriveProjectStandard({ repository, confirmed: true,
  policyCommands: spec.allowedCommands ?? [{ executable: "node", argv_prefix: ["check.mjs"] }],
  statement: spec.standard ?? "Required artifacts exist, the public format check succeeds, and all changes are within the declared scope." });
const product = installProduct({ tools: { register: () => undefined } }, {
  projectId: spec.projectId, repository, stateDir, execution: "worktree", standard,
  operatorAuthority: makeSignedOperatorAuthority({ claims: verified.claims, actor }),
});
let accepted;
try {
  const receipt = product.revision.readReceipt({ attemptId, basis, candidate });
  assert(receipt.phase === "SETTLED" && receipt.receiptId === receiptId, "APPROVAL_RECEIPT_MISMATCH");
  accepted = await product.revision.accept({ attemptId, basis, candidate, receiptId, actor });
  assert(product.controller.work.project().head_commit === accepted.resultingHeadCommit, "ACCEPTED_PROJECT_HEAD_DRIFT");
} finally { await product.dispose(); }
checkpoint(stateDir);
console.log("REVISION_ACCEPTED " + JSON.stringify({ ...accepted, actor }));
