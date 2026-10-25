Runs a command in an embedded bash-compatible shell (brush, not system bash) with POSIX syntax on every OS{{#if hasShellBuiltins}} and coreutils built in{{/if}}.
{{#if isWindows}}
- On this Windows host, use forward slashes; `cmd /c …` works. `/tmp` maps to `$TMPDIR` only inside the shell, so give native programs `$TMPDIR` paths.
{{/if}}
- Each call starts in `cwd` (default: the working directory), so a `cd` doesn't carry over; variables and functions do. A call made while the shell is busy (e.g. parallel calls) runs in a separate shell that sees only exported variables and keeps nothing.
- Chain dependent steps with `&&`; `pty: true` only for interactive programs; `timeout` (default {{defaultTimeoutSec}}s) kills the command.
- Output over {{spillKb}}KB keeps its head and tail inline; the full text goes to an `artifact://<id>` you can `read`.
{{#ifAny asyncEnabled autoBackgroundEnabled}}
- Background jobs (`bg_N`) deliver their result later as its own message; don't poll, `wait`{{#if waitDeferred}} (load it with `load_tools`){{/if}} blocks for it.{{#if asyncEnabled}} `async: true` starts one.{{/if}}{{#if autoBackgroundEnabled}} A call whose `timeout` exceeds {{autoBackgroundSeconds}}s becomes one if still running at {{autoBackgroundSeconds}}s.{{/if}}
{{/ifAny}}
{{#if hasLaunch}}
- Services: set a unique `name` (no `async`/`timeout`); `ready` waits for a `log` regex or `port`.
{{/if}}
