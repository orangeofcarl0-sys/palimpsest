// Sablewick programme data integrity check. This checks the DATA, not whether a commercial
// selection is possible: a valid negative finding is a legitimate programme outcome.
import { readFileSync } from "node:fs";

function readCsv(path) {
  const lines = readFileSync(path, "utf8").split(/\r?\n/u).filter((line) => line.trim() !== "");
  const header = lines[0].split(",");
  return { header, rows: lines.slice(1).map((line) => Object.fromEntries(line.split(",").map((value, index) => [header[index], value]))) };
}

const failures = [];
const caps = readCsv(new URL("./sources/vendor-capabilities.csv", import.meta.url));
for (const column of ["vendor", "chemistry", "min_c", "max_c", "warranty_years", "coastal_warranty", "unit_width_mm", "lead_weeks"]) {
  if (!caps.header.includes(column)) failures.push(`capabilities: missing column ${column}`);
}
const seen = new Set();
for (const row of caps.rows) {
  if (seen.has(row.vendor)) failures.push(`capabilities: duplicate vendor ${row.vendor}`);
  seen.add(row.vendor);
  const min = Number(row.min_c);
  const max = Number(row.max_c);
  const width = Number(row.unit_width_mm);
  const lead = Number(row.lead_weeks);
  const warranty = Number(row.warranty_years);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) failures.push(`capabilities: ${row.vendor} has an invalid temperature range`);
  if (!Number.isFinite(width) || width <= 0) failures.push(`capabilities: ${row.vendor} has an invalid width`);
  if (!Number.isFinite(lead) || lead <= 0) failures.push(`capabilities: ${row.vendor} has an invalid lead time`);
  if (!Number.isFinite(warranty) || warranty <= 0) failures.push(`capabilities: ${row.vendor} has an invalid warranty`);
  if (row.coastal_warranty !== "yes" && row.coastal_warranty !== "no") failures.push(`capabilities: ${row.vendor} has an invalid coastal_warranty`);
}

const pricing = readCsv(new URL("./sources/vendor-pricing.csv", import.meta.url));
for (const column of ["vendor", "unit_cost_gbp", "install_cost_gbp"]) {
  if (!pricing.header.includes(column)) failures.push(`pricing: missing column ${column}`);
}
for (const row of pricing.rows) {
  if (!seen.has(row.vendor)) failures.push(`pricing: ${row.vendor} has no capability row`);
  if (!(Number(row.unit_cost_gbp) > 0) || !(Number(row.install_cost_gbp) > 0)) failures.push(`pricing: ${row.vendor} has an invalid cost`);
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`Sablewick data integrity: ${caps.rows.length} vendors, ${pricing.rows.length} price rows, 0 failures`);
