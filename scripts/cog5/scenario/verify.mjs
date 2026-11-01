import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

function fail(message) {
  console.error(message);
  process.exit(1);
}

const changed = execFileSync("git", ["diff", "--name-only", "HEAD^", "HEAD"], { encoding: "utf8" })
  .split(/\r?\n/u)
  .filter((path) => path !== "");
const deliverable = changed.find((path) => path.startsWith("deliverables/") && path.endsWith(".md"));
if (deliverable === undefined) fail("no deliverable markdown changed in the work commit");

const text = readFileSync(deliverable, "utf8");
if (deliverable.endsWith("technical-fit.md")) {
  for (const site of ["Site A", "Site B", "Site C"]) {
    if (!text.includes(`## ${site}`)) fail(`missing section: ${site}`);
  }
  if (!/Vendor:\s*V[1-4]/u.test(text)) fail("no vendor selection recorded");
  if (!text.includes("## Constraint")) fail("no constraint section");
} else if (deliverable.endsWith("cost-schedule.md")) {
  for (const heading of ["## Budget", "## Sequence", "## Total"]) {
    if (!text.includes(heading)) fail(`missing heading: ${heading}`);
  }
  if (!/£\s?[\d,]+/u.test(text)) fail("no GBP total");
} else if (deliverable.endsWith("continuation-note.md")) {
  for (const heading of ["## Prior work", "## Current status", "## Next action"]) {
    if (!text.includes(heading)) fail(`missing heading: ${heading}`);
  }
} else {
  fail(`unexpected deliverable: ${deliverable}`);
}

console.log(`completion check passed for ${deliverable}`);
