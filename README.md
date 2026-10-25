# bolt

A General, Context-Optimized Harness

## Installation

Just give this prompt to your harness (Windows / PowerShell):

```
Clone https://github.com/shigure0001/bolt and set it up so that typing `bolt` in PowerShell starts it.
- Install anything missing (git, Bun, rustup + MSVC Build Tools).
- In the repo root run `bun install`, then `bun run build:native`. Then run `bun run build` in packages/coding-agent; it produces dist/bolt.exe.
- Copy dist/bolt.exe to %LOCALAPPDATA%\bolt\bolt.exe and add that folder to the user PATH.
- Open a new PowerShell and check that `bolt --smoke-test` prints ok.
```

## Why bolt?

Existing harnesses have turned into slop. Every release piles on features, and the model pays for all of them: bloated system prompts, dozens of tool schemas, warnings in all caps. Thousands of tokens are gone before the work starts, and the instructions that matter get buried.

bolt is a fork of [oh-my-pi](https://github.com/can1357/oh-my-pi), cut down to what the model actually needs and rewritten to read clearly to any model.

## Pros

- **Any model.** Prompts are plain prose with no model-specific tricks. Claude, GPT, Gemini or a local model, one `/model` away.
- **Nothing to guess.** The model starts out knowing the OS, the commands on PATH and the repo state. `read`, `grep` and `edit` share one line format, and errors say what went wrong and what to do next.
- **Small context.** System prompt plus tools come to about 4k tokens. Rarely used tools load on demand, and long output is trimmed to its head and tail, with the full text one read away.
- **One shell everywhere.** A built-in bash-compatible shell, so POSIX commands work on Windows too.
- **No dead weight.** Features that don't earn their tokens are deleted, not hidden behind a setting.

## License

[MIT](LICENSE). Vendored code keeps its upstream license; see [THIRD-PARTY-NOTICES.txt](THIRD-PARTY-NOTICES.txt).
