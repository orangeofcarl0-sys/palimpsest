import {readFileSync} from "node:fs";
import {apply as registerDesk} from "./desk.js";
import {terminalTrial} from "./review-trial.mjs";
export {name,inject} from "./desk.js";

const pinnedSha = readFileSync(new URL("./pinned-sha", import.meta.url), "utf8");
export function apply(ctx) {
  registerDesk({tools:{register:definition => ctx.tools.register(terminalTrial(definition, pinnedSha))}});
}
