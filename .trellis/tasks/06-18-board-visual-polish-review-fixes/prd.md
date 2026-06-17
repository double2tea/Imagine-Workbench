# Record Board Visual Polish Review Fixes

## Goal

Record and commit the existing local board/workbench visual polish changes, including the OCR review follow-up fixes for the board screenshot script and asset-card popover action visibility.

## What I Already Know

- The working tree already contained local visual polish changes before this task record was created.
- The dirty files belong to one visual polish batch:
  - `app/globals.css`
  - `components/agent/AgentDock.tsx`
  - `components/assets/AssetCard.tsx`
  - `scripts/screenshot-board.mjs`
  - `outputs/board-final-redesign-screenshot.png`
  - `outputs/board-redesign-screenshot.png`
- A delegated follow-up session `019ed6c8-a9bb-7211-972e-34cb9a3738ff` confirmed and fixed the OCR review comments.

## Requirements

- Preserve the visual polish changes already present in the working tree.
- Ensure `scripts/screenshot-board.mjs` closes Chromium in a `finally` block if navigation or screenshot capture fails.
- Treat the OCR `app/globals.css:0-0` screenshot-script comment as a duplicate of the script issue, not as a CSS change.
- Keep asset-card action shells visible and interactive while `data-popover-open="true"`.
- Commit the complete task-related batch together.

## Acceptance Criteria

- [x] Board screenshot script uses `try/finally` around browser work and keeps fail-fast behavior.
- [x] Asset-card action shell popover-open state restores `opacity`, `pointer-events`, and `transform`.
- [x] Visual polish changes are grouped into a Trellis task record.
- [x] `pnpm run lint` passes.
- [x] `pnpm run typecheck` passes.
- [x] Task-related files are committed together.

## Definition of Done

- Task PRD exists.
- Relevant code, script, screenshots, and task files are staged together.
- Commit is created.
- Session journal is recorded after commit.

## Out of Scope

- Additional UI redesign beyond the existing local changes.
- Re-running browser screenshot generation unless the existing screenshots are missing.
- Changing unrelated active Trellis tasks.

## Technical Notes

- Delegated review fix thread: `codex://threads/019ed6c8-a9bb-7211-972e-34cb9a3738ff`.
- Review validation reported:
  - `pnpm run lint` passed.
  - `pnpm run typecheck` passed.
- Current main-session verification will re-check status and commit only task-related files.
