# load_tools

> Activates deferred tools: tools matching `tools.deferred` stay registered but off the request until the model loads them by name.

## Source
- Entry: `packages/coding-agent/src/tools/load-tools.ts`
- Model-facing prompt: `packages/coding-agent/src/prompts/tools/load-tools.md`
- Key collaborators:
  - `packages/coding-agent/src/tools/deferred-tools.ts` — pattern matching, `applyToolDeferral` for the initial tool set.
  - `packages/coding-agent/src/session/session-tools.ts` — `getDeferredTools()` builds the catalog; `loadDeferredTools()` activates names and remembers them for the session.
  - `packages/coding-agent/src/tools/settings.ts` — `tools.deferred` (`cfgToolsDeferred`, `DEFAULT_DEFERRED_TOOLS`).

## Inputs

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `names` | `string[]` (min 1) | Yes | Tool names from the catalog in the description. |

## Outputs
- `Loaded: a, b. Call them directly from your next step.` for newly activated tools.
- `Already available: …` for names that were already active.
- `Unknown: …` plus the loadable names for anything not in the catalog.
- When nothing was loaded or already active, the call fails with those lines as the error.
- Details: `{ loaded: string[] }`.

## Flow
1. The description renders the deferred catalog: one line per tool, its name and a summary cut at a clause or word boundary.
2. `execute` calls the session's `loadDeferredTools(names)`, which activates matching tools through the normal active-tool path (the transcript gets the usual tool-roster notice).
3. Loaded tools stay ordinary top-level tools for the rest of the session and leave the catalog.

## Availability
- Registered only while `tools.deferred` is non-empty.
- Deferral applies only when the initial selection contains `load_tools`: explicit tool lists (subagent definitions, `--tools`) and restricted modes such as plan mode keep every selected tool active.
- Pinned tools and tools already loaded are never deferred. When nothing is left to defer, `load_tools` itself is dropped.
- Default `tools.deferred`: `task`, `eval`, `lsp`, `ask`, `wait`, `todo`, `web_search`, `github`, `mcp__*`.
