Runs one code cell in a persistent kernel. Top-level variables, imports and functions persist across calls, including after context compaction, so don't repeat setup that already succeeded. If the result says the kernel was lost, run the setup again.{{#if spawns}} Subagents have their own kernels.{{/if}}
{{#if py}}
- Python runs as a plain subprocess, not IPython: no `get_ipython()`, `obj?` or `%matplotlib`. `%pip`, `%load`, `%time` and `!cmd` are translated to Python. Top-level `await` works; `asyncio.run(…)` does not.
{{/if}}
{{#if js}}
- JavaScript runs in Bun (`Bun.file`, `Bun.write`, `Bun.$`); top-level `await` and `return` work.
{{/if}}
- If a cell fails partway, earlier statements may already have taken effect; rerun only the part that failed.
- Printing an image{{#if py}} or matplotlib figure{{/if}} attaches it to the result.
{{#if spawns}}{{#if eagerDelegation}}
- For two or more independent items, use a named `workpool()`; results are delivered automatically.{{#if waitTool}} If you are blocked on them, end the cell and call `wait`.{{/if}}
{{/if}}{{/if}}
{{#if autoBackgroundEnabled}}
- Long cells may move to the background and deliver their result later; the kernel stays busy meanwhile. `timeout: 0` removes the cell deadline but doesn't skip backgrounding.
{{/if}}

Built-in helpers ({{#ifAll py js}}Python: synchronous, keyword arguments; JavaScript: async, with one trailing options object{{else}}{{#if py}}synchronous, keyword arguments{{/if}}{{#if js}}async, with one trailing options object{{/if}}{{/ifAll}}):
```
print(value, ...)  log(message)  phase(title)
read(path, offset?, limit?)  write(path, content)  env(key?, value?)  output(*ids, format?, query?, offset?, limit?)
await tool.<name>(args)   # call any session tool; args is its parameter object
wait(handles, timeout?=None, raise_errors?=True)   # wait for agents/completions; ordered results; raise_errors=False returns failures instead of raising{{#if js}}; JS: wait(handles, { timeout, raiseErrors }){{/if}}
```

{{#if inlineTopics}}
{{{inlineTopics}}}
{{else}}
More helpers are documented separately; `read` the doc before first use:
- `judge`, `{{#if py}}judge_batch{{else}}judgeBatch{{/if}}`, `completion` (classification, bulk judgment, model calls): `xd://eval/judge`
- `%load`{{#if py}}, `%pip`{{/if}}{{#if js}}, `%bun add`{{/if}}, `budget`{{#if evalTools}}, `@tool`/`tool(fn)`{{/if}} (setup, installs, utilities): `xd://eval/helpers`
{{#if spawns}}
- `agent`, `workpool` (background subagents, dependency waves): `xd://eval/agents`
{{/if}}
{{#each preludes}}
- `{{name}}` ({{summary}}): `xd://eval/{{name}}`
{{/each}}
{{/if}}
