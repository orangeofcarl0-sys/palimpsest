# F-C — policy inheritance resolution

`resolvePolicies(graph)` resolves the effective policy set of every node in an inheritance graph.

## The graph

```js
{
  nodes: {
    [nodeId]: {
      policies: { [policyName]: value },
      inherits: [nodeId, ...],  // DECLARED PRECEDENCE: an earlier entry is nearer than a later one
    },
  },
}
```

## The result

```js
{ effective: { [nodeId]: { [policyName]: value } }, order: [nodeId, ...] }
```

## What the contract requires

· A node's effective policies are its OWN policies merged over the closure it inherits from.
· The NEARER declaration wins. A node's own policy beats any inherited one; between two inherited
  declarations of the same name, the one reachable through the EARLIER `inherits` entry wins.
· `order` lists every node exactly once, with a node's parents before the node itself. When several nodes
  are ready at the same time, the lexicographically smaller id comes first.
· An `inherits` entry that names a node the graph does not define is refused by throwing an error with a
  `code` — at any depth.
· A graph whose inheritance edges form a cycle, including a node that inherits itself, is refused the same
  way.
· A node's effective policies contain NOTHING from a node outside its inherited closure.

## Running the checks

```
node test/check.js
```

The visible checks cover the ordinary path. They are not the whole contract.
