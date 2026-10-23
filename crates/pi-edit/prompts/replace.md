Replaces exact text in a file. Copy `old_string` from the file as you last read it, without the `42|` line prefix; a text differing only in whitespace or quote style still matches.
- `old_string` must match one location: add surrounding lines until it is unique, or set `replace_all: true` (renames within a file). Keep it to the changed lines plus that context.
- Use `write` to create or fully replace a file.
- Success shows the edited region with `N|` numbers; a failure (no match, several matches) leaves the file unchanged and says why.
