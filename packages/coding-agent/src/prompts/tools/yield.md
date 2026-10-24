Submit subagent output: `{ data: <your output> }` for success, `{ error: "message" }` for failure. Never both; never a bare payload outside `data`.

Omit `type` for the usual single terminal structured result. Pass `type: ["section"]` to submit an incremental, non-terminal section that accumulates.
{{#if hasOutputSchema}}
This task declares an output schema: the terminal `data` MUST be the full object matching it. A data-less `type: "result"` finalizes previously submitted incremental sections; it is invalid when no sections were submitted — prose in your last turn can never satisfy the schema.
{{else}}
Pass `type: "result"` to finalize; when `data` is omitted, your last assistant turn becomes the raw final result.
{{/if}}
