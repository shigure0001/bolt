Finds files and directories by glob pattern, such as `src/**/*.ts`. `path` defaults to the working directory; separate several patterns with `;`. Internal URLs work too (`local://*.md`).
- Results are sorted newest first within each directory; directories end with `/`.
- `.gitignore` is respected and hidden files are included by default. To find an ignored dotfile, set `gitignore: false`.
{{#if hasFind}}
- To find where a behavior is implemented rather than a file name, use `find`.
{{/if}}
{{#if eagerDelegation}}
- For open-ended exploration of an unfamiliar codebase, consider a {{#if scoutAvailable}}`scout` {{/if}}subagent via `task`.
{{/if}}
