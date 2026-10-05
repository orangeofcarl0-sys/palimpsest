# F-B — versioned document migration

`migrateDocument(input)` migrates ONE configuration document to the current shape.

## What the contract requires

· It returns a NEW document. It never modifies the document it was given.
· `version` must be `1` or `2`. Any other version is refused.
· A version-1 document uses the old spelling `retry_count`; the migrated document uses `retryCount`, and
  the old spelling does not survive.
· `timeoutMs` (or `timeout_ms` in version 1) takes the default `3000` ONLY when the key is absent.
· A field the contract does not define is preserved verbatim.
· A nested value, if present, must be an object.
· An unusable value is refused by throwing an error with a `code` — it is never repaired into a default.

## Running the checks

```
node test/check.js
```

The visible checks cover the ordinary path. They are not the whole contract.
