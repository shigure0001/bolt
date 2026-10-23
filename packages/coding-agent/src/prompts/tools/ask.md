Asks the user one or more multiple-choice questions and waits for the answers. Use it only for decisions that are genuinely the user's, where the options lead to materially different outcomes. If the code, config, docs or conventions answer the question, act on them instead; if several options are reasonable, pick the conventional one, proceed, and mention it.
- Batch related questions into one call. Give each 2–5 distinct options with short labels, and put the tradeoffs in `description`.
- `recommended` marks the suggested option (the UI appends " (Recommended)"). `multi: true` allows several selections.
- Don't add an "Other" option; the UI always offers a free-text answer. If the user's free-text answer leaves something unresolved, answer what you can and ask again only about the rest.
