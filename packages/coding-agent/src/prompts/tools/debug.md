Debugger access through the Debug Adapter Protocol. Prefer it over print statements for inspecting program state, setting breakpoints, stepping and examining threads.
- Only one debug session can be active at a time.
- `program` is the path of the program to debug, not a shell command. Debugging a directory needs an adapter that supports it (such as `dlv`).
