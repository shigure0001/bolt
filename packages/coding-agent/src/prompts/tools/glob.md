Finds files and directories by glob, e.g. `src/**/*.ts` (relative to the cwd; `local://*.md` also works). Separate several patterns with `;`.
- Results are newest first within each directory; directories end with `/`.
- Hidden files are included (`hidden: false` skips them), .gitignore is respected (`gitignore: false` finds ignored files), and node_modules is skipped unless the pattern names it.
{{#if eagerDelegation}}
- For open-ended exploration of an unfamiliar codebase, consider a {{#if scoutAvailable}}`scout` {{/if}}subagent via `task`.
{{/if}}
