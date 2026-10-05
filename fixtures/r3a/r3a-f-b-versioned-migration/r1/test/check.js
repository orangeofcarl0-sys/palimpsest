import assert from "node:assert/strict";
import { migrateDocument } from "../src/config.mjs";

// A v1 document gains the current shape.
{
  const out = migrateDocument({ version: 1, retry_count: 5 });
  assert.equal(out.version, 2, "the migrated document must be the current version");
  assert.equal(out.retryCount, 5, "retry_count must be carried across");
  assert.equal(out.timeoutMs, 3000, "an absent timeout must take the default");
}

// A field the contract does not define survives the migration.
{
  const out = migrateDocument({ version: 1, retry_count: 1, featureFlag: true });
  assert.equal(out.featureFlag, true, "a field the contract does not define must be preserved");
}

// The caller's document is not modified.
{
  const input = { version: 1, retry_count: 2 };
  const before = JSON.stringify(input);
  migrateDocument(input);
  assert.equal(JSON.stringify(input), before, "migrateDocument must not mutate its argument");
}

process.stdout.write("ok" + String.fromCharCode(10));
