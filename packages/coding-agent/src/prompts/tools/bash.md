Runs a command in an embedded bash-compatible shell (brush, not system bash; POSIX syntax everywhere{{#if isWindows}}, including this Windows host: forward slashes; `cmd /c …` works; `/tmp` means `$TMPDIR` only inside the shell, so pass native programs `$TMPDIR`{{/if}}){{#if hasShellBuiltins}}; coreutils are built in{{/if}}.
- Each call starts in `cwd` (default: the working directory), so a `cd` doesn't carry over; variables and functions do. A call made while the shell is busy (e.g. parallel calls) runs in a separate shell that sees only exported variables and keeps nothing.
- Chain dependent steps with `&&`; `pty: true` only for interactive programs; `timeout` (default {{defaultTimeoutSec}}s) kills the command.
- Output over {{spillKb}}KB keeps its head and tail inline; the full text goes to an `artifact://<id>` you can `read`.
{{#ifAny asyncEnabled autoBackgroundEnabled}}
- Background jobs (`bg_N`) deliver their result later as its own message; don't poll, `wait`{{#if waitDeferred}} (load it with `load_tools`){{/if}} blocks for it.{{#if asyncEnabled}} `async: true` starts one.{{/if}}{{#if autoBackgroundEnabled}} A call whose `timeout` exceeds {{autoBackgroundSeconds}}s becomes one if still running at {{autoBackgroundSeconds}}s.{{/if}}
{{/ifAny}}
{{#if hasLaunch}}
- Services: set a unique `name` (no `async`/`timeout`); `ready` waits for a `log` regex or `port`.
{{/if}}
