Reads files, directories, archives, SQLite, PDFs/office docs, notebooks, images and URLs. Selectors go at the end of `path` (a drive colon like `F:/x.ts:50` is fine).
- Lines: `:50-80`, `:50` (to end), `:50+20`, `:-40` (last 40), `:5-16,90-120`. `:raw` omits numbers and outline (`:50-80:raw`).
{{#if LINE_NUMBERS}}
- Rows are prefixed `42|` (not part of the file).
{{/if}}
- A bare path returns the first page; a large code file instead comes back as an outline whose long bodies fold into line ranges to read.
{{#if IS_HL_MODE}}
- File output starts with a `[file.ts#1A2B]` snapshot tag and numbered lines. Copy the tag exactly into anchored edits; never invent one.
{{/if}}
- Directories list children, up to 12 per subdirectory. `x.zip` lists members; `x.zip:inner/path` reads one. `x.json?q=<jq filter>` queries JSON. `file:conflicts` lists merge conflicts.
- SQLite: `x.db` lists tables, `x.db:table` shows schema and sample rows (filter with `?where=`), `x.db:table:key` one row; `x.db?q=SELECT …` runs a query.
- URLs return readable text; `:raw` returns the HTML.
