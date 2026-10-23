Structural code search with ast-grep. Use it when the shape of the syntax matters more than the text: calls with certain arguments, declarations, language constructs.
- One language and one pattern per call; make separate calls for unrelated patterns. Set `lang` when the extension is ambiguous (`cpp` for `.h`; `.cu`/`.cuh` are C++).
- Narrow `path` to the relevant directory; avoid scanning the whole repository.
- Metavariables: `$NAME` matches one node, `$_` one node without capturing, `$$$NAME` zero or more nodes, `$$$` zero or more without capturing. `$$NAME` is invalid. Names are uppercase and must stand for a whole node; `prefix$VAR` doesn't work.
- Repeating a metavariable requires identical code: `$A == $A` matches `x == x`, not `x == y`.
- The pattern must parse as a single AST node. Wrap fragments in context, e.g. `class $_ { … }`.
- C++ expression statements need the trailing `;`: `$CALLEE($ARG);`.
- TypeScript: allow for annotations, e.g. `async function $NAME($$$ARGS): $_ { $$$BODY }`.
- `function foo`, a method `foo()` and `const foo = () => {}` are different forms; search the right one before concluding something doesn't exist. The loosest existence check is a bare identifier such as `pat: "executeBash"` with a narrow `path`.
- A parse error means the query failed, not that nothing matched. Fix the pattern or narrow `path` before concluding there are no matches.
{{#if eagerDelegation}}
- For broad exploration across subsystems, start with a {{#if scoutAvailable}}`scout` {{/if}}subagent via `task`.
{{/if}}
