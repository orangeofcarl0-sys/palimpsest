import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { gunzipSync, gzipSync } from "node:zlib";
import { regularDraftFiles } from "./queue-draft.mjs";

const path = "scripts/pnwf/software/self-maintenance-delivery-artifacts.mjs";
const compressed = readFileSync(new URL(
  "../../../../research-evidence/pnwf-software/2026-11-22/draft-queue/checkpoint/untracked.tar.gz", import.meta.url,
));

test("the untracked probe retains its original contents and mode", () => {
  assert.deepEqual(regularDraftFiles(compressed, [path]), [{
    path, size: 5887, mode: 0o600, digest: "8b57098d66c50e8241199ba95328c2dd81a9b7aa026a8eb3675fb75f1a00203d",
  }]);
});

test("restoration refuses traversal, links and undeclared paths before extraction", () => {
  const escaped = gunzipSync(compressed);
  escaped.fill(0, 0, 100);
  escaped.write("../probe.mjs");
  assert.throws(() => regularDraftFiles(gzipSync(escaped), [path]), /UNSAFE_DRAFT_PATH/u);

  const linked = gunzipSync(compressed);
  linked[156] = "2".charCodeAt(0);
  assert.throws(() => regularDraftFiles(gzipSync(linked), [path]), /DRAFT_ENTRY_NOT_ALLOWED/u);
  assert.throws(() => regularDraftFiles(compressed, []), /DRAFT_ENTRY_NOT_ALLOWED/u);
});

test("restoration refuses duplicate entries and a missing tar terminator", () => {
  const tar = gunzipSync(compressed);
  const entry = tar.subarray(0, 512 + Math.ceil(5887 / 512) * 512);
  const duplicated = Buffer.concat([entry, tar]);
  assert.throws(() => regularDraftFiles(gzipSync(duplicated), [path]), /DRAFT_ENTRY_NOT_ALLOWED/u);
  assert.throws(() => regularDraftFiles(gzipSync(entry), [path]), /BAD_DRAFT_TAR_END/u);
});
