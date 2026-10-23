{{#if asyncEnabled}}{{#if batchEnabled}}Starts subagents for the items in `tasks[]`; they run concurrently and their IDs return immediately.{{else}}Starts one subagent; its ID returns immediately.{{/if}}{{#if hasBlockingAgents}} BLOCKING agents return their result inline instead.{{/if}}{{else}}{{#if batchEnabled}}Runs the subagents in `tasks[]` and returns their results.{{else}}Runs one subagent and returns its result.{{/if}}{{/if}}
{{#if asyncEnabled}}{{#ifAny structured hasStructuredAgents}}

# Results
{{#if structured}}With `outputSchema`, the{{else}}STRUCTURED agents'{{/if}} parsed payload is stored even if invalid: read `agent://<id>`, or a field with `agent://<id>/<field>` (nested: `/reports/0/data`). An invalid payload is previewed inline.
{{/ifAny}}

{{asyncGuidance}}
{{/if}}

# Choosing an agent
Use the most specific agent{{#if scoutAvailable}}; `scout` suits read-only research when you don't yet know which files matter{{/if}}. One agent that investigates and edits beats a chain of agents. Omit `agent` for the default (`{{defaultAgent}}`){{#if batchEnabled}}; set it per item in `tasks[]`, not at the top level{{/if}}.
When several agents touch shared code, make one responsible for integration{{#if ircEnabled}} (siblings coordinate with `write agent://<id>`){{/if}} and define shared interfaces in {{#if batchEnabled}}`context`{{else}}the task{{/if}}. Tell agents to skip builds, tests, linters and formatters; run them yourself once all agents finish.

# Writing assignments
Subagents start with no memory of this conversation. Pass large inputs as `local://<path>` files rather than inline.
{{#if batchEnabled}}
- `context`: background shared by all tasks (goal, interfaces between slices); don't repeat it per task.
{{/if}}
- `task`: self-contained: target files and non-goals, the change, and the observable result that means done.
- `name` (optional): CamelCase, ≤32 chars, used to address the agent.
- `solutionSpace` (optional): how open the problem is, e.g. "one fix: rename, names given" or "deadlock cause unknown, no repro".
{{#if structured}}
- `outputSchema` overrides agent and session schemas. `schemaMode`: the default (permissive) warns after retries; `strict` fails.
{{/if}}
{{#if seanceGuidance}}
{{seanceGuidance}}
{{/if}}
{{#if evalToolsEnabled}}
- `tools`: tools you defined in `eval`; they run in your kernel.
{{/if}}
{{#if effortEnabled}}
- `effort`: `"lo"`, `"med"` or `"hi"`, according to how open-ended the problem is.
{{/if}}
{{#if isolationEnabled}}
- `isolated`: run in a separate git worktree; {{#if applyIsolatedChanges}}successful changes are applied back to your tree.{{else}}changes are kept in the worktree, not applied.{{/if}}
{{/if}}

# Available agents
{{#if spawningDisabled}}Agent spawning is currently disabled.
{{else}}{{#if hasModelMentions}}`m<N>` refers to a model the user tagged (`<model agent="m<N>" name="…"/>`), not a specialist; use it only when the user names it.
{{/if}}{{#list agents join=""}}- `{{name}}`{{#if readOnly}} (read-only){{/if}}{{#if blocking}} (BLOCKING: returns inline){{/if}}{{#if structured}} (STRUCTURED: returns schema output){{/if}}: {{description}}
{{/list}}{{/if}}
