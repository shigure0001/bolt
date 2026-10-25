# eval

> Execute one Python cell in a persistent kernel. One tool call is one cell; state survives later calls.

> **Notice:** Do not shell out to `python -c` through `bash` for ad-hoc code. `eval` provides retained state, rich `print` rendering, tool bridges, streaming, cancellation, and artifact-backed truncation.

## Source
- Entry and schema: `packages/coding-agent/src/tools/eval.ts`
- Backend enablement: `packages/coding-agent/src/tools/eval-backends.ts`
- Model-facing prompt: `packages/coding-agent/src/prompts/tools/eval.md`
- Shared contracts: `packages/coding-agent/src/eval/backend.ts`, `types.ts`, `executor-base.ts`, `kernel-base.ts`
- Host bridge for `tool.<name>()`: `packages/coding-agent/src/eval/py/tool-bridge.ts`
- File/percent-command preparation: `packages/coding-agent/src/eval/input.ts`; extension preludes: `packages/coding-agent/src/eval/preludes.ts`
- Python: `packages/coding-agent/src/eval/py/`
- Output/truncation: `packages/tui/src/tools/streaming-output.ts`
- Python internals: `docs/python-repl.md`

## Inputs

The params object is one cell. There is no `cells` array, language selector, header parser, or implicit fallback. Run incremental steps as separate tool calls.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `code` | `string` | Yes | Inline Python, or one standalone `%load` / `%pip install` command. |
| `title` | `string` | No | Short transcript label. |
| `timeout` | `number` | No | Active-runtime timeout window in seconds. Default 30; `0` disables it. Nonzero values are clamped by the tool timeout policy (`TOOL_TIMEOUTS.eval`: 1–3600 s) and `tools.maxTimeout`. Paused host waits resume with a fresh window, not the unused remainder. |
| `reset` | `boolean` | No | Recreate the retained kernel before execution, discarding its variables and any still-running cell. Default `false`. |

Example across three calls:

```json
{"title":"imports","code":"import json\nfrom pathlib import Path"}
```

```json
{"title":"load config","code":"data = json.loads(read('package.json'))\nprint(data)"}
```

```json
{"title":"reuse state","code":"print(sorted(data['dependencies']))"}
```

## Scripts and dependencies

Save reusable setup in a file, then load it once:

```json
{"code":"%load ./analysis.py"}
```

Later cells reuse its definitions. Calling `%load` again executes the current file again; editing it alone does not reload it. The host reads the file (quote paths containing spaces; `local://` files are supported) and runs it with its filename: Python sets `__file__`, puts the script directory on `sys.path`, and reports tracebacks against the script.

Python dependencies install with `%pip install pillow`: the runner's pip magic runs `python -m pip` for the kernel's own interpreter (in an interpreter without pip, such as a `uv venv` env, it first installs pip with `ensurepip`, or with `uv` when that fails and `uv` is on `PATH`), pauses the cell watchdog while it runs, and keeps kernel variables. A missing-module error reminds that distribution names can differ from import names (`PIL` belongs to `pillow`).

Percent commands are standalone cells, not extra tool arguments; quote requirements containing spaces.

`%load` requires a local script or an internal URL with a local backing file; remote HTTP scripts must be downloaded and inspected first. Virtual URL documents cannot be executed directly.

Compaction receives a bounded live-kernel snapshot with environment and successfully loaded paths, not variable values. Resuming in a fresh process does not restore historical kernel state.

## Backend availability

`resolveEvalBackends(...)` combines settings with the environment override:

| Setting | Default | Environment override | Prerequisite |
| --- | --- | --- | --- |
| `eval.py` | `true` | `PI_PY` | usable configured Python interpreter/kernel |

When the backend is disabled, `eval` is not offered in the session tool set, and a direct call raises `ToolError`.

## Outputs

`execute()` returns one text content block plus any image blocks. `onUpdate` streams the active cell's output and details while it runs, coalesced at 50 ms intervals.

- Text is stdout/stderr (exactly what `print` and the trailing-expression echo wrote) plus image dimension notes.
- Image-only success reports `(displayed N image(s); no text output)`; a cell with no visible output reports `(no output)`.
- A nonzero backend exit appends `Command exited with code N`, marks the cell `error`, and sets `details.isError`.
- Cancellation returns the captured output or `Command aborted`, with `details.isError=true`.

`EvalToolDetails`:

- `cells`: a one-element `EvalCellResult[]` with `index`, `title?`, `code`, `output`, `status`, `durationMs?`, `exitCode?`, `statusEvents?`, and `views?`. File-backed cells retain the original `%load` command for display rather than duplicating the script source.
- `cells[].views`: pretty views of printed values, in print order, as `{ text, view }` where `text` is the exact span of `output` the value printed and `view` is a `table` (data frames), `json` (dicts/lists/plain objects printing longer than 80 chars or multiple lines), or `markdown` (Python objects with `_repr_markdown_`). Renderers show the view in place of the matching text; the model only sees the text. At most 16 views per cell are kept, and a view whose JSON exceeds 32 KiB is dropped; dropped views show as their text.
- `images`: present on live updates when images have arrived; final images are content blocks.
- `statusEvents`: deduplicated helper/tool status events.
- `notice`: optional backend notice.
- `meta`: output truncation/artifact metadata supplied by `toolResult(...)`.
- `async`: present when the cell was auto-backgrounded as an async job (`{ state, jobId, type: "eval" }`).
- `isError`: set for backend failure or cancellation.

`mcp_progress` status lines show an MCP tool's name and its latest progress while an awaited call is running: the server's message with `progress/total` when a total exists, or the bare progress value when there is no message. Updates for one call replace one another, including after Eval auto-backgrounds; old MCP snapshots can be evicted under the status-log cap. Internal call ids are not displayed.

The renderer merges call and result inline, syntax-highlights the source as Python, renders cell views as tables, JSON trees, and Markdown in place of their text, and shows timeout/truncation metadata. `session.allocateOutputArtifact?.("eval")` backs spilled output; `artifact://...` in `meta` reaches the full capture.

## Execution flow

1. `EvalTool` is essential, strict, `approval="exec"`, and `concurrency="exclusive"` within one agent session.
2. `execute()` validates the cell, resolves Python availability, and reads file-backed source once. Runtime probing is bounded by the requested timeout and abort signal.
3. It obtains the retained executor id from `session.getEvalSessionId?.()` or `defaultEvalSessionId(session)`, allocates the output sink/artifact, and registers the run through `trackEvalExecution?.(...)`.
4. The timeout defaults to 30 seconds. `0` creates no watchdog. Otherwise `IdleTimeout` is combined with tool and session abort signals.
5. Package installation, delegated `tool.task()`/`tool.wait()` calls, and browser/computer preludes pause the watchdog. Resuming starts a fresh timeout window. Compute, output, status helpers, and ordinary `tool.*` calls, including MCP tools that report progress, count against it.
6. The kernel receives cwd, retained session id, session file, kernel owner, reset flag, callbacks, and cancellation signal.
7. Output chunks stream into an artifact-aware `OutputSink` and live tail. Runtime display outputs are separated into view, image, and status channels.
8. Success, nonzero exit, and cancellation are assembled into the result shapes above. The output sink is finalized even when execution fails.

## Auto-backgrounding

With `eval.autoBackground.enabled` (default `false`), a cell that outlives `eval.autoBackground.thresholdMs` (default 60000 ms) is converted into a managed async job instead of blocking the turn:

- The tool foreground-waits for `resolveAutoBackgroundWaitMs(thresholdMs, clampedCellTimeoutMs)`: the threshold, clamped down to the cell's own clamped timeout minus a 1 s buffer so a deadline expiry resolves inline rather than backgrounding moments before it fires. Raising `timeout` therefore does not extend foreground execution beyond the threshold. A threshold of `0` backgrounds immediately.
- On backgrounding, the tool returns the live output tail plus `Backgrounded as job <id> (killed once it has run <n>s in total; …)` — or `(no deadline)` under `timeout: 0` — and the no-polling instruction (`formatBackgroundNotice`), stating the cell's clamped timeout, with `details.async = { state: "running", jobId, type: "eval" }`. The deadline is the cell's runtime budget, counted from cell start (including the foreground wait), not wall-clock time left. Package installation, delegated `tool.task()`/`tool.wait()` calls, and browser/computer preludes pause the watchdog; ordinary `tool.*` calls, including MCP tools that report progress, do not. The job's completion is delivered later like a backgrounded `task`.
- A queued user/peer message (steer) arriving mid-wait backgrounds the cell immediately ("Backgrounded early to handle an incoming message; the cell keeps running.").
- At the async-job manager's running-job capacity the tool falls through to ordinary foreground execution instead of failing.
- A failed, cancelled, or timed-out cell is reported as a failed background job (an errored execution is re-entered into the job manager's failure path), never as a silent success.

## Runtime behavior

- Retained kernels are keyed by `python:${sessionId}`, normalized cwd, and interpreter. `python.kernelMode="per-call"` instead creates and shuts down a fresh kernel for each invocation.
- The runner uses one persistent asyncio event loop, so top-level `await` works; `asyncio.run(...)` is invalid there.
- The runner replaces `builtins.print` for stdout: printed images (omp image dicts, matplotlib figures, PIL images, `_repr_png_`/`_repr_jpeg_` objects) attach as images, and DataFrames/Series, Markdown objects, and large dicts/lists/tuples add views. A non-`None` trailing expression prints its `repr` the same way.
- Interactive stdin is rejected with `Kernel requested stdin; interactive input is not supported.`
- Synchronous blocks use the default executor with copied ContextVars; Python bytecode still contends on the GIL.

## Prelude helpers

- `read(path, offset?, limit?)`, `write(path, content)`, `env(...)`, `output(...)`
- `tool.<name>(args)` for a normal session tool call (`await tool.read({...})`); the provider wire spelling also resolves (`tool._read` on Claude OAuth sessions), an exactly registered name winning, and an unknown name fails with the available tool list. Dunder and `_x_` attribute probes are never treated as tools
- `log(message)`, `phase(title)`, `budget`

Python file helpers are synchronous while `tool.<name>()` is a coroutine. `read()` delegates non-`local://` schemes to the registered read tool, resolves `local://` through injected roots, and reads regular paths relative to cwd. A bare `read("artifact://<id>")` returns the artifact file's full text, with `offset`/`limit` selecting lines, whichever session's artifacts dir holds it; selector forms such as `artifact://<id>:raw:5-9` go to the read tool. `write()` accepts regular and `local://` paths but rejects other protocol URLs.

Printing an image or figure attaches it to the result for both the model and the user. Printed data frames, Markdown objects, and large structured values also carry a pretty view for the user; the model sees the printed text.

Enabled extension preludes add globals (such as `browser`) with documentation at `xd://eval/<name>`. Their host calls resolve approval and availability against the live session; disabling a prelude also prevents previously captured functions from retaining host access.

### MCP structured results

MCP calls return an object with `text` and MCP-specific `details`. When the server
supplies `structuredContent`, it is available as `details.structuredContent`:

```python
result = await tool.mcp__example_page({})
if result["hasError"]:
    raise RuntimeError(result["text"])
page = result["details"].get("structuredContent")
if page is None:
    raise RuntimeError("Server did not return structured data")
print(page["next_cursor"])
```

The property is absent when the server supplies no structured result; OMP does not infer it from
JSON-looking text. Error results can also carry structured data, so check
`hasError` before treating a payload as a successful result.

`text` remains the model-facing rendering, including any JSON echo and output
truncation notices. Truncation does not trim `details.structuredContent`: code
receives the complete server-supplied object even when the rendering spills. Use
server-side pagination/bounds for large data and print only the fields needed
by the model. The object is not validated against the server's output schema or
treated as trusted. Ordinary tools keep their existing return shapes, including
bare strings for text-only results without details.

## Side effects and cancellation

- Prelude helpers may read/write files and call arbitrary registered tools.
- Python uses a retained subprocess kernel speaking framed local IPC.
- Retained kernels have no heartbeat or idle timer; they survive calls until reset, owner disposal (`EvalRunner.disposeKernels()` calls `disposeKernelSessionsByOwner` keyed by `kernelOwnerId`, in `packages/coding-agent/src/session/eval-runner.ts`), or process exit.
- Cancellation and timeouts never kill a retained kernel: the runner interrupts the cell (`KeyboardInterrupt`) and the kernel keeps its process and variables, so a later cell can read state defined before the timeout. A cell that ignores the interrupt for 5 s is released to the caller as timed out/cancelled while it keeps running; the next call waits briefly for it to finish, then fails with an error asking for `reset: true`. Only an explicit `reset: true`, owner disposal, or shutdown kills the kernel, and a reset is destructive to concurrent work sharing that kernel session.

## Limits and errors

- Default timeout: 30 seconds; `0` disables. Nonzero timeouts are clamped through `clampTimeout("eval", ..., tools.maxTimeout)`.
- Output sink default window: 50 KiB (`DEFAULT_MAX_BYTES`); live tail: 100 KiB; truncation helpers cap at 3000 lines.
- Each cell keeps at most 16 views, each at most 32 KiB of JSON; larger or excess views show as their printed text.
- Transcript preview defaults to 10 lines.
- Malformed params are schema errors; a disabled backend and a missing session are `ToolError`s.
- Runtime exceptions become backend output with nonzero exit. Interactive stdin is an error. Output truncation does not fail the call.
- A dead retained managed kernel may be replaced and the invocation retried once by its executor.

## Notes

- One call is one cell. Use separate calls to exploit persistence and rerun only the failed step.
- The former multi-cell `cells` payload, `*** Cell` parser, sniffing fallback, and constrained `eval.lark` grammar are removed; so is the JavaScript backend, along with the `agent()`, `completion()`, `wait()`, `workpool()`, `judge()` and `judge_batch()` helpers and kernel-defined (`@tool`) tools.
- Every agent session, including `task` subagents, owns a private eval executor id; subagents never inherit their parent's kernels.
