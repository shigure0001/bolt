Regex search over file contents (Rust regex; PCRE2 fallback for lookaround/backreferences). Case-sensitive and gitignore-respecting by default.
- `path` defaults to cwd. `*.ts` matches at any depth, `dir/*.ts` only direct children; `file.ts:50-100` limits one file to a range. `\n` in the pattern matches across lines.
- Output groups by file; matching lines are marked `*N|` amid context ({{contextBefore}} before, {{contextAfter}} after; `context: N` sets both). Page with `skip` when files overflow.
{{#if hasFind}}
- To locate behavior you can't name exactly, use `find`.
{{/if}}
{{#if eagerDelegation}}
- If finding something will take many rounds of searching, consider a {{#if scoutAvailable}}`scout` {{/if}}subagent via `task`.
{{/if}}
