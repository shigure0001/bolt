<setup>
Reusable setup: write a script, run `%load <path>` in a standalone `code` cell. Quoted paths and `local://` work; source is not echoed. Definitions persist; edited files require another `%load`.
Missing Python dependency: `%pip install <distribution>` (e.g. `PIL` comes from `pillow`).
Percent commands are standalone cells. Install preserves kernel state; retry only the failed step.
</setup>
