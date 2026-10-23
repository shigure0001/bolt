{{#if asyncEnabled}}{{#if batchEnabled}}Starts subagents for the items in `tasks[]`; they run concurrently and their IDs return immediately.{{else}}Starts one subagent; its ID returns immediately.{{/if}}{{#if hasBlockingAgents}} BLOCKING agents return their result inline instead.{{/if}}{{else}}{{#if batchEnabled}}Runs the subagents in `tasks[]` and returns their results.{{else}}Runs one subagent and returns its result.{{/if}}{{/if}}
{{#if asyncEnabled}}{{#ifAny structured hasStructuredAgents}}

# Results
{{#if structured}}With `outputSchema`, the{{else}}STRUCTURED agents'{{/if}} parsed payload is stored even if invalid: read `agent://<id>`, or a field with `agent://<id>/<field>` (nested: `/reports/0/data`). An invalid payload is previewed inline.
{{/ifAny}}

{{asyncGuidance}}
{{/if}}

# Choosing an agent
Pick the most specific agent for the job.{{#if scoutAvailable}} Use `scout` for read-only research when you don't yet know which files matter.{{/if}} Prefer one agent that both investigates and edits over separate agents for each step. Omit `agent` to get the default (`{{defaultAgent}}`).
{{#if batchEnabled}}Set `agent` on each item in `tasks[]`, not at the top level.
{{/if}}
When several agents edit shared code, make one of them responsible for integrating it{{#if ircEnabled}}; siblings can coordinate with `write agent://<id>`{{/if}}. Define shared interfaces in {{#if batchEnabled}}`context`{{else}}the task{{/if}}. Tell agents to skip builds, tests, linters and formatters; run them once yourself after all agents finish.

# Writing assignments
Subagents start with no memory of this conversation{{#if ircEnabled}}, though you can message them while they run{{/if}}. Pass large inputs as files via `local://<path>` rather than pasting them inline.
{{#if batchEnabled}}
- `context`: shared background for all tasks, such as the goal and the interfaces between slices. Don't repeat it in each task.
{{/if}}
- `task`: a self-contained assignment. Name the target files and non-goals, the change to make, and the observable result that means it's done.
- `name` (optional): a CamelCase name up to 32 characters, used to address the agent.
- `solutionSpace` (optional): how open the problem is, such as "one fix: rename, names given" or "deadlock cause unknown, no repro". It helps the agent judge how much to explore.
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
