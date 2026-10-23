Results are delivered to you automatically when each agent finishes; don't poll.{{#if waitTool}} If you are completely blocked on them, call `wait`.{{/if}}
{{#if ircEnabled}}While agents run you can message one with `write agent://<id>`, or all of them with `agent://all`.{{/if}}
- `completed` means the agent finished without error. Its claims about files it changed are not verified; check them.
