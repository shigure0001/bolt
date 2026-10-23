Searches file contents with a regular expression (Rust regex syntax, falling back to PCRE2 for lookaround and backreferences). Case-sensitive by default; set `case: false` to ignore case. Respects .gitignore unless `gitignore: false`.
- `path` defaults to the working directory. It accepts a file, directory, glob or URL; separate several with `;`. A glob like `*.ts` matches at any depth, `dir/*.ts` only direct children of `dir`, and `dir/**/*.ts` recurses.
- A single file can be narrowed to a line range: `src/foo.ts:50-100`.
- Writing `\n` in the pattern enables matching across lines.
- Results are grouped by file. Matching lines are marked with `*` before the line number and surrounded by a few context lines. When more files match than fit, use `skip` to page through them.
{{#if hasFind}}
- To locate behavior or a symbol you can't name exactly, use `find`; use `grep` for literals and known patterns.
{{/if}}
{{#if eagerDelegation}}
- If finding something will take many rounds of searching, consider a {{#if scoutAvailable}}`scout` {{/if}}subagent via `task`.
{{/if}}
