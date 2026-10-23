Tracks a task list that the user sees. Use it for work with three or more steps, for a list of items the user asked for, and when new instructions arrive mid-task.
- Put every item the user asked for on the list separately, so nothing is forgotten.
- Items are identified by their exact text, not by generated IDs. Keep item and phase names unique and stable; if you lose track of the wording, use `view`.
- Send todo updates in the same response as your next real tool call (for example `init` alongside your first read, `done` alongside the next action). A response containing only a todo call wastes a round trip.
- Mark items done as soon as they're finished. When nothing is in progress, the earliest pending item starts automatically, in phase order. Completed items stay completed.
- When an item is waiting on the user, an agent or a service, `block` it with a reason; the next pending item starts. `unblock` it when it can proceed. If you can clear the blocker yourself, append a task for that.
