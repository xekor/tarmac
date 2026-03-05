# Tarmac

MCP server for iOS Simulator automation. TypeScript, Node.js.

## Git Workflow

- Never commit directly to `main`.
- Create a feature branch for every change: `git checkout -b <descriptive-branch-name>`
- Make small, focused commits with clear messages.
- Push the branch and open a PR with `gh pr create`.
- Do not merge your own PRs — leave them for review.

## Dev

```sh
pnpm install
pnpm build
```

## Structure

- `src/index.ts` — MCP server entry point
- `src/tools/` — tool implementations (build, screenshot, interact, etc.)
- `src/utils/` — shared utilities
