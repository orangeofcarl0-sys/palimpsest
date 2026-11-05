# Site readings service

A small service that exposes the current readings of field sites. It is used by the dispatch console
and by the fleet client.

## Layout

```
service/data.js         the readings source of truth (fixed values)
service/rest_server.js  the REST API (http)
service/rest_client.js  the REST client
test/rest.test.js       the baseline behaviour tests
```

Run the tests with `node --test`.

## Behaviour that must be preserved

- `GET /sites/:id/reading` returns one reading as `{ siteId, watts, atMs }`.
- `GET /sites/:id/readings?limit=N` returns `{ readings: [...] }` in source order.
- An unknown site is `404 { error: "unknown_site" }`, never an empty list.
- `atMs` is an epoch millisecond integer; no locale or timezone may be involved.

## Constraints

- Node.js built-ins only. The deployment has no third-party packages and must not acquire any.
- The tests run with `node --test` from the repository root.
