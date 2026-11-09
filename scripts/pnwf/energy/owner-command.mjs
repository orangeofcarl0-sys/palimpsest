/** Invoked in an offline, model-free container after the model container is gone. */
import { mkdirSync } from "node:fs";
import { admitBasis, checkpoint, gateStatus, initializeProject, productFacts, profileFor, promoteCandidate } from "./product.mjs";

const [action, ...args] = process.argv.slice(2);
const world = "/run/stage/world";
const state = "/run/stage/state";
const profile = "/tmp/owner-profile.json";
mkdirSync(state, { recursive: true });
profileFor({ world, state, path: profile });
let result;
switch (action) {
  case "initialize": await initializeProject(profile, args[0]); result = { initialized: true }; break;
  case "facts": result = await productFacts(profile, state); break;
  case "basis": result = await admitBasis({ world, state, approved: args[0], mode: args[1] }); break;
  case "gate": result = await gateStatus(profile, args[0]); break;
  case "promote": result = await promoteCandidate({ profile, world, attemptId: args[0], basis: args[1], approved: args[2] }); break;
  default: throw new Error("UNKNOWN_OWNER_ACTION");
}
checkpoint(state);
process.stdout.write(`ENERGY_OWNER_RESULT ${JSON.stringify(result)}\n`);
