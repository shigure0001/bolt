Structural rewrites with ast-grep, for codemods where plain text replacement would be unsafe. Paths may mix languages: each file is parsed in its own language and a pattern only rewrites files where it parses.
- Metavariables captured in `pat` (`$A`, `$$$ARGS`) are substituted into `out`. Replacement is one-to-one: captures can't be split or merged.
- Patterns match AST structure, not text. `$NAME` matches one node, `$_` one node without capturing, `$$$NAME` zero or more nodes. `$$NAME` is invalid. Names are uppercase and must stand for a whole node; `prefix$VAR` doesn't work.
- Repeating a metavariable requires identical code: `$A == $A` matches `x == x`, not `x == y`.
- The pattern must parse as a single AST node. Wrap fragments in context, e.g. `class $_ { … }`.
- TypeScript: allow for annotations, e.g. `async function $NAME($$$ARGS): $_ { $$$BODY }`. An empty `out` deletes matches: `{"pat":"console.log($$$)","out":""}`.
- Matches are staged as a proposal, not applied. To apply, `write` a one-sentence reason to `xd://resolve`; to discard, write it to `xd://reject`.
- A parse error means the rewrite is malformed, not that there was nothing to change. For one-off edits, use `edit`.
