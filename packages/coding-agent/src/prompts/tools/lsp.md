Code intelligence from language servers: definitions, references, renames, code actions and diagnostics that follow imports, re-exports and shadowing where text search misses call sites.
- Position-based actions take `file`, `line` (1-indexed) and `symbol` (a substring of that line; `#N` picks the Nth match). Missing or ambiguous symbols are an error, not a guess.
- `rename` and `rename_file` (moves a file and fixes every import) apply by default; `apply: false` previews. Prefer them to `ast_edit`, `sed` or manual edits for cross-file renames.
- `code_actions` lists imports, quick fixes and refactors; `apply: true` with `query` (title substring or index) applies one.
- `diagnostics`: a path, a glob or `file: "*"` (workspace). `symbols`: a file's symbols, or a workspace search with `file: "*"` and `query`.
- `reload` restarts one server (`file`) or all (`*`). `request` sends a raw method (`query`) with JSON `payload`.
- Calls time out after {{defaultTimeoutSec}}s (workspace diagnostics wait {{defaultWaitSec}}s); raise `timeout` (≤{{maxTimeoutSec}}) while a server is indexing.
