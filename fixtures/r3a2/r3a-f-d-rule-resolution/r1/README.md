# F-D — rule resolution

`resolveRule(rules, request)` selects the ONE rule that applies to a request.

## The rules

```js
[{ id: string, match: { host: string | null, path: string }, params: object }]
```

## The request

```js
{ host: string, path: string }
```

## What the contract requires

· `resolveRule` returns `{ ruleId, params }`, or `null` when no rule matches.
· Matching happens AFTER normalization: surrounding whitespace is trimmed and letters are compared
  case-insensitively, on the rule and on the request alike.
· A path is a sequence of `/`-separated segments. A pattern segment written `*` matches EXACTLY ONE
  segment: never zero segments, never more than one, and never across a `/`. A path that ends in `/` ends
  in an EMPTY segment, and no pattern segment matches an empty segment.
· `match.host` of `null` means "any host".
· The MOST SPECIFIC matching rule wins, whatever order the rules were written in. Specificity is scored as
  one point when `match.host` is not `null`, plus one point per LITERAL (non-`*`) path segment.
· Two rules whose `match` is identical after normalization are the SAME rule. They are not a tie.
· Two rules that share an `id` but have DIFFERENT matches make the rule set unusable, and it is refused by
  throwing an error with a `code`.
· If two DIFFERENT rules tie at the highest specificity, the request is ambiguous and is refused the same
  way.

## Running the checks

```
node test/check.js
```

The visible checks cover the ordinary path. They are not the whole contract.
