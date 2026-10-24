Runs one Python cell in a persistent kernel. Top-level variables, imports and functions persist across calls, including after context compaction, so don't repeat setup that already succeeded. If the result says the kernel was lost, run the setup again.
- Python runs as a plain subprocess, not IPython: no `get_ipython()`, `obj?` or `%matplotlib`. `%pip`, `%load`, `%time` and `!cmd` are translated to Python. Top-level `await` works; `asyncio.run(…)` does not.
- If a cell fails partway, earlier statements may already have taken effect; rerun only the part that failed.
- Printing an image or matplotlib figure attaches it to the result.
{{#if autoBackgroundEnabled}}
- Long cells may move to the background and deliver their result later; the kernel stays busy meanwhile. `timeout: 0` removes the cell deadline but doesn't skip backgrounding.
{{/if}}

Built-in helpers (synchronous, keyword arguments):
```
print(value, ...)  log(message)  phase(title)
read(path, offset?, limit?)  write(path, content)  env(key?, value?)  output(*ids, format?, query?, offset?, limit?)
await tool.<name>(args)   # call any session tool; args is its parameter object
```

{{#if inlineTopics}}
{{{inlineTopics}}}
{{else}}
More helpers are documented separately; `read` the doc before first use:
- `%load`, `%pip`, `read`, `write`, `env`, `output` (scripts, installs, files): `xd://eval/helpers`
{{#each preludes}}
- `{{name}}` ({{summary}}): `xd://eval/{{name}}`
{{/each}}
{{/if}}
