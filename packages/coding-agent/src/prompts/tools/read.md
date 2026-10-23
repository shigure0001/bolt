Reads files, directories, archives, databases, documents, images and web pages. `path` is the only parameter; selectors such as line ranges go at the end of the path, never in separate offset/limit parameters.

Line selectors:
- `file.ts:50-80`: lines 50 through 80, inclusive.
- `file.ts:50` or `file.ts:50-`: from line 50 onward.
- `file.ts:50+20`: 20 lines starting at line 50.
- `file.ts:-40`: the last 40 lines.
- `file.ts:5-16,90-120`: several ranges; `file.ts:19,59` picks single lines.
- `:raw` returns content verbatim, with no line numbers, outlines or notices. It combines with a range: `file.ts:50-80:raw`.
To page through a long file, give the next range explicitly; reading the bare path again returns the same first page. Ranges are exact, except that a non-raw read of part of a file may add the opening and closing lines of the enclosing block, separated by `…`, for orientation.

What you get back:
{{#if LINE_NUMBERS}}
- Each line is prefixed with its number and a bar: `42|const x = 1;`. The prefix is not part of the file; leave it out of edit text.
{{/if}}
- Large code files read without a selector come back as an outline: declarations are shown and long bodies are collapsed, with their line ranges listed. Read those ranges to see the bodies; don't guess what a collapsed body contains.
{{#if IS_HL_MODE}}
- File output starts with a `[file.ts#1A2B]` snapshot tag and numbered lines. Copy the tag exactly into anchored edits; never invent one.
{{/if}}
- Directories: the root is listed in full; each child directory shows up to 12 entries (`… N more`). Read the child directory to see the rest.
- SQLite: `file.db` lists tables; `file.db:table` shows schema and rows; `file.db:table:key` fetches one row by primary key. Add `?limit=`, `?where=` or `?q=SELECT …`.
- Archives (zip, jar, whl, tar.*, 7z, rar, iso, deb, rpm, asar and more): `archive.zip` lists members; `archive.zip:path/in/archive` reads one.
- JSON, JSONL, NDJSON: `file.json?q=<jq filter>`; add `&raw=true` for unquoted strings, `&compact=true` for one-line values, `&offset=`/`&limit=` to page. Write `&` inside the filter as `%26`.
{{#if BINARY_VIEWS}}
- Executables (ELF, PE, Mach-O): an overview and function list; `bin:<func or 0xaddr>` decompiles, `bin:<func>:asm` disassembles, plus `:imports`, `:exports`, `:strings`, `:xrefs:<func>`. Line ranges apply after the view (`bin:main:10-40`); `bin:@x86_64:main` picks a slice of a universal binary.
{{/if}}
- PDFs and office documents return extracted text; notebooks return editable cells; images are shown to you directly. SVG returns its source; `:img` renders it as an image. Videos (needs ffmpeg) return a frame grid with metadata; `:90s` or `:01:23` grabs a frame at that time.
- URLs return readable text or markdown; `:raw` returns the original HTML. A bare `host:port` needs a trailing slash. Prefer this over a browser for static pages.
- `:conflicts` lists unresolved merge-conflict blocks, one per line.
