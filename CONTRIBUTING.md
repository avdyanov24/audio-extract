# Contributing

## Getting set up

```bash
npm install
npm run dev
```

You need `yt-dlp` and `ffmpeg` on your PATH. The server refuses to start without
them and prints the install command for your platform.

## Branches and commits

Work on a branch, open a PR, squash-merge. `main` should stay readable.

Commits follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat:     new capability
fix:      bug fix
chore:    tooling, config, dependencies
docs:     documentation only
refactor: behaviour-preserving change
test:     tests only
ci:       workflow changes
```

One logical change per commit. If the change is not self-evident, the body should
explain *why* rather than restate the diff. Reference issues where relevant
(`closes #4`).

## Code style

- ES modules everywhere, `node:` prefix on builtin imports
- 2-space indent, single quotes, semicolons — see `.editorconfig`
- Comments explain intent, not mechanics. Skip the ones that restate the line below.

## Working on the backend

External tools are spawned with `spawn(bin, argsArray)` and never through a shell.
User input reaches yt-dlp only after `parseYouTubeUrl` has reduced it to a validated
11-character video id and rebuilt the URL. Keep it that way.

New failure modes belong in `server/lib/errors.js` as a rule with a title, a detail
and, where there is one, a fix. The UI shows the real reason a video failed; adding
a case that falls through to "Extraction failed" is a regression.

## Working on the frontend

The design system in `web/src/styles.css` is deliberately tight:

- Six colour tokens. `--edge` is the only border colour.
- The accent appears at most three times on screen: field focus, the primary
  action, the progress fill. Nowhere else.
- No gradients, no glows, no shadows beyond the single inset top edge on panels.
- Corner radius never above 4px.
- Every number is monospace.
- Transitions are 150ms ease-out, on colour and border only. Nothing moves or
  scales on hover; borders go `--edge` to `--ash`.

Hover rules explicitly exclude the focus state (`:hover:not(:focus)`). This is not
redundant — without it the pointer resting on a focused field overrides the accent
border.

If you change the palette or spacing, change the tokens, not the call sites.

## Before opening a PR

```bash
npm run build
```

CI runs install, lint, build and test. Lint and test run with `--if-present`, so
they are skipped until those scripts exist — see the open issues.
