# config-migration

Migrate a legacy service configuration document to the **v2** shape.

## Goal

Downstream services are being moved to the v2 configuration format. Legacy deployments still ship
documents written against the old conventions, so the migration has to interpret those documents
correctly — an operator's document must end up meaning the same thing after the migration as it did
before it.

Export a single function from `src/config.ts`:

```ts
export function migrateConfig(input: Record<string, unknown>): V2Config
```

where

```ts
interface V2Config {
  schemaVersion: 2;
  service: { name: string; endpoint: string };
  policy: { retries: number; timeoutMs: number };
}
```

## Acceptance

Run the oracle:

```sh
node test/check.js
```

It reports one line per case:

```
PASS <case id>
FAIL <case id> <failureClass> <detail>
```

The failure classes are `REJECTED_BUT_SHOULD_ACCEPT`, `WRONG_OUTPUT` and
`ACCEPTED_BUT_SHOULD_REJECT`. `WRONG_OUTPUT` names the first canonical path that differs from the
expected document.

`test/cases.json` holds the cases this oracle judges, including the expected v2 document for the
accepted ones. The oracle's case list is **not** the whole acceptance contract: the project also has
an independent acceptance oracle covering the same invariants with different data, and that one is the
authority. Passing `test/check.js` is necessary but not sufficient.

## Notes

- Legacy documents are hand-written and use several spellings for the same setting.
- The legacy conventions are only partly documented; the oracle is the honest source of truth about
  what is and is not acceptable.
- Downstream consumers depend on the migrated document being a faithful reading of the original.
