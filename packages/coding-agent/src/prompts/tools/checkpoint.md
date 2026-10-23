Marks a point in the conversation before exploratory work. When you're done, call `rewind` with a concise report: the intermediate tool calls are removed from your context and replaced by the report. Use it for investigations that need many reads and searches whose details you won't need afterwards.
- Call `rewind` before finishing whenever a checkpoint is active, and don't start a second checkpoint while one is active.
- Typical flow: `checkpoint(goal: …)`, then the exploration, then `rewind(report: …)` with the findings.
- Subagents don't get this tool unless their agent definition lists `checkpoint` or `rewind` in `tools:` (the other is added automatically) and the `checkpoint.enabled` setting is on.
