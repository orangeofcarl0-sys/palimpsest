import { DatabaseSync } from "node:sqlite";
const ops = new DatabaseSync(process.env.OPS);
try {
  const rows = ops
    .prepare("SELECT namespace, COUNT(*) AS c FROM ordarium_state_revisions GROUP BY namespace")
    .all();
  console.log("state revisions by namespace:", JSON.stringify(rows));
} catch (error) {
  console.log("state table query error:", error.message);
}
const opsOps = ops.prepare("SELECT COUNT(*) AS c FROM ordarium_operations").get().c;
console.log("operations:", opsOps);
