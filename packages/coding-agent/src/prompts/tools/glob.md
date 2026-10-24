Finds files and directories by glob. `pattern` (e.g. `src/**/*.ts`; `;` separates several; default cwd; `local://*.md` works). Newest first per directory; directories end with `/`. Defaults: hidden files included (`hidden: false` skips them), .gitignore respected (`gitignore: false` finds ignored files), node_modules skipped unless the pattern names it.
{{#if eagerDelegation}}
- For open-ended exploration of an unfamiliar codebase, consider a {{#if scoutAvailable}}`scout` {{/if}}subagent via `task`.
{{/if}}
