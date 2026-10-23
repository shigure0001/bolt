Code intelligence from language servers: definitions, references, renames, code actions and diagnostics that follow imports, re-exports and shadowing where text search misses call sites.
- Position-based operations take `file`, `line` (1-indexed) and `symbol` (a substring of the line; `#N` picks the Nth match). Project-wide lookups fail with an error if `symbol` is missing or ambiguous rather than guessing.
- `rename` applies by default; `apply: false` previews. `rename_file` moves a file and updates every import and reference; it also applies by default.
- `code_actions` lists available actions; apply one with `apply: true` and `query` (a title substring or index). Check it for imports, quick fixes and refactors before editing by hand.
- `diagnostics` takes a path, a glob (`src/**/*.ts`) or `file: "*"` for the whole workspace.
- `symbols` lists a file's symbols; with `file: "*"` and `query` it searches the workspace.
- `reload` restarts one server (`file`) or all of them (`*`, which also re-reads the LSP config).
- `request` sends a raw request: `query` is the method, `payload` the JSON params (built automatically if omitted).
- Timeouts: the whole call defaults to {{defaultTimeoutSec}}s, and project-wide diagnostics wait {{defaultWaitSec}}s. `timeout` sets both for one call, up to {{maxTimeoutSec}}s; raise it while a server is still indexing.
- For cross-file renames, use `rename` or `rename_file` rather than `ast_edit`, `sed` or manual edits, which silently miss call sites.
