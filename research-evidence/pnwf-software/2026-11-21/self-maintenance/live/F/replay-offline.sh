test "$(git rev-parse HEAD)" = "02a5160c2361bb70a2127574a76ea6e571b296a8"
git apply --check /source.patch
git apply /source.patch
test "$(git diff --name-only)" = package.json
node -e 'const assert=require("node:assert/strict"),cp=require("node:child_process"),fs=require("node:fs"); const before=JSON.parse(cp.execFileSync("git",["show","HEAD:package.json"]));const after=JSON.parse(fs.readFileSync("package.json"));assert.equal(typeof after.scripts["test:focused"],"string");delete after.scripts["test:focused"];assert.deepEqual(after,before);'
node node_modules/typescript/bin/tsc -b
node --run test:focused -- test/alhs_episode_convergence.test.ts test/pnwf_cq_basis_admission.test.ts
printf '%s\n' "import {it,expect} from 'vitest';it('host failure witness',()=>expect(1).toBe(2));" > test/host-offline-witness.test.ts
status=0
node --run test:focused -- test/host-offline-witness.test.ts || status=$?
test "$status" = 1
printf 'WORKING_TREE_OFFLINE_PASS\n'
