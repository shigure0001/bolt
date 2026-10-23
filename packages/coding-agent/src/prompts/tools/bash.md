Runs a command in a persistent shell session. Use it for builds, tests, git, package managers and other programs.
- Set `cwd` instead of running `cd`. Chain dependent commands with `&&`.
{{#if hasEval}}
- For multi-line scripts, heredocs or logic that needs variables and loops, use `eval` instead.
{{/if}}
- Use `pty: true` only for programs that need an interactive terminal.
- Internal URLs such as `artifact://<id>` or `local://<name>` work as file paths in commands and redirects.
- Long output is truncated; the result names an `artifact://<id>` holding the full output, which you can `read` in ranges. You don't need to pipe through `head` or `tail` to protect your context.
{{#if asyncEnabled}}
- `async: true` runs the command in the background and delivers its result later; the `timeout` (default {{defaultTimeoutSec}}s) still applies. Use `timeout: 0` for watchers and other long-running jobs.
{{/if}}
{{#if autoBackgroundEnabled}}
- A non-`pty` command still running after {{autoBackgroundSeconds}}s (or 1s before its `timeout`, if sooner) usually moves to a background job `bg_N` and keeps running until its timeout; the result arrives automatically as a follow-up message. Don't poll it with `sleep` or status checks; continue with other work or end your turn.
{{/if}}
{{#if hasLaunch}}
- For long-lived services (dev servers, databases), give a unique `name`. Don't combine it with `async` or `timeout`; `pty` defaults to true. `ready` waits until the service is up: a `log` regex, a `port`, or both (`host` defaults to 127.0.0.1, `ready.timeout` to 30s). `ready` requires `name`.
{{/if}}
