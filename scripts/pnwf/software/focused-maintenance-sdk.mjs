import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { stripVTControlCharacters } from "node:util";
import { installProduct } from "palimpsest-dsh/product";
import { makeProcedureService, SqliteProcedureStore } from "palimpsest-dsh/procedures";

const [{ procedure }, repository] = [JSON.parse(readFileSync("/sdk/approval.json", "utf8")), "/work"];
const original = "/approval.sqlite";
const product = focusedTesting => installProduct({ tools: { register: () => () => {} } }, {
  projectId: "focused-testing-sdk", repository, stateDir: "/tmp/sdk-state", focusedTesting,
});
const read = async (storePath = original, ref = procedure) => {
  const installed = product({ storePath, procedure: ref });
  try { return await installed.focusedTesting.read(); }
  finally { await installed.dispose(); }
};

const method = await read();
assert(method);
assert.deepEqual(method.procedure, procedure);
assert.equal(await read("/tmp/missing.db"), null);
assert.equal(await read(original, { ...procedure, digest: "f".repeat(64) }), null);

const retired = "/tmp/retired.sqlite";
copyFileSync(original, retired);
const store = new SqliteProcedureStore(retired);
try { await makeProcedureService({ store }).retire(procedure, "fixture withdrawal"); }
finally { store.close(); }
assert.equal(await read(retired), null);

const manifest = readFileSync("/work/package.json");
try {
  writeFileSync("/work/package.json", Buffer.concat([manifest, Buffer.from("\n")]));
  assert.equal(await read(), null);
} finally { writeFileSync("/work/package.json", manifest); }
renameSync("/work/node_modules", "/work/modules-held");
try {
  assert.equal(await read(), null);
  mkdirSync("/work/node_modules");
  assert.equal(await read(), null);
} finally {
  rmSync("/work/node_modules", { recursive: true, force: true });
  renameSync("/work/modules-held", "/work/node_modules");
}

const argv = [...method.argv, "--maxWorkers", "1", "test/alhs_episode_convergence.test.ts"];
const executed = spawnSync(argv[0], argv.slice(1), { cwd: repository, encoding: "utf8", timeout: 90_000 });
assert.equal(executed.status, 0, executed.stdout + executed.stderr);
assert.match(stripVTControlCharacters(executed.stdout), /Tests\s+9 passed/);
console.log(JSON.stringify({ method, actualInvocation: argv, exit: executed.status, packageEntry: import.meta.resolve("palimpsest-dsh/product"),
  refused: ["missing store", "wrong reference digest", "retired reference", "dirty package manifest", "missing dependencies", "writable dependencies"] }));
