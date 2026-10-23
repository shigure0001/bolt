Edits a file by replacing exact text. `old_string` must match the file's current contents; small whitespace differences are tolerated.
- Read the file in this conversation before editing it, so `old_string` matches the current contents exactly.
- Copy `old_string` from the file contents, without the `42|` line-number prefix that `read` and `grep` output may show.
- `old_string` must identify one location. If the text occurs more than once, include more surrounding lines to make it unique, or set `replace_all: true` to change every occurrence (useful for renames within a file).
- Keep `old_string` reasonably small: the lines that change plus enough context to be unique.
- To create a file or replace all of its contents, use `write`. For the same structural change across many files, use `ast_edit` if it is available.
- On success the result shows the edited region as it now reads, with `N|` line numbers. On failure (text not found, or several matches without `replace_all`) the error explains why and the file is unchanged.
