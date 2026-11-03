# S09 — Packaging, install, upgrade and rollback

## 1. What the RC contains

`node scripts/pc1/make_rc.mjs` produces:

- `dist-rc/palimpsest-0.2.0-pc1.1.tar.gz` (local only; never published);
- `.sha256` for the tarball;
- `MANIFEST.json` over the staged bytes (path, size, sha256), with the repository commit/tree and a
  `dirty` flag.

The staged tree includes: `dist/`, `docs/programs/pc1/` (the pack, phase notes, this guide),
`examples/pc1/`, `scripts/pc1/` (runner/acceptance), the C6-R staging scripts it reuses, the COG-6
scenario fixture, `README.md`, and `package.json`.

## 2. Install from the tarball

```bash
tar -xzf palimpsest-0.2.0-pc1.1.tar.gz
cd palimpsest-0.2.0-pc1.1
node dist/src/cli.js doctor --repo=/path/to/project --state=/path/to/project/.palimpsest/state
node dist/src/cli.js init --repo=/path/to/project --project=my-project --goal="..." \
  --profile-file=/path/to/project/.palimpsest/state/product-profile.json \
  --operator=operator:alice --operator-purpose="review project changes"
```

The package is private and has no registry publication step. `dist/` is a build artifact, not a
second source of truth; the manifest records the commit/tree it was built from.

## 3. Upgrade

1. Keep the previous state directory (databases are additive; no migration is auto-applied to a real
   user's library without an operator decision).
2. Extract the new RC to a new directory.
3. Run `doctor` against the existing state.
4. Run `continue` to verify the project loads.
5. Only then switch the launcher/profile to the new path.

If a schema migration is required in a future release, it must be dry-run/backup/restore tested and
approved before it touches a real library.

## 4. Rollback

1. Stop the DSH host.
2. Point the launcher back to the previous RC directory.
3. Keep the same state directory; the previous RC reads the same canonical owners.
4. If a future migration changed the schema, restore the pre-migration backup verified during the
   upgrade.

The review store and journal are metadata/records; they are not a second canonical ledger. Rolling
back the executable does not move ProjectIR, Work, Promotion or the Ordarium ledger.

## 5. Known limitations to state at install time

- Windows: the ACL sandbox confines writes only; Linux/WSL2 is the qualified untrusted-execution
  stack.
- The live model is BLOCKED unless the owner supplies an explicit spend authorization and a provider
  configuration.
- A placed (worktree) worker settles its own attempt; the principal's `complete` facade says so
  instead of suggesting `finish`.
- The local CLI operator identity is a local assertion, not a remote identity provider.
- No live matched P/F pair has been run under PC1; the comparative value is not yet supported.
