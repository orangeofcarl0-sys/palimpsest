import { readFileSync } from "node:fs";
const v = JSON.parse(readFileSync(0, "utf8"));
console.log(v.attempts[0].attempt_id);
