Creates a file or replaces its entire contents. Use `edit` for changes to existing files. Don't create documentation files unless the user asks for them.
- `archive.zip:path/in/archive` writes a member of a ZIP, tar-family or `.asar` archive; other archive formats are read-only.
- `file.db:table` inserts a row from JSON `content`; `file.db:table:key` updates that row, and empty `content` deletes it.
