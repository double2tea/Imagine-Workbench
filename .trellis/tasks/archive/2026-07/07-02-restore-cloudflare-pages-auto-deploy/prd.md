# Restore Cloudflare Pages Auto Deploy

## Goal

Restore the previous Cloudflare Pages deployment behavior so pushes or manual workflow runs can build and deploy the Pages output even while Node runtime API routes exist in the app.

## What I Already Know

* The user selected option 1: restore the old behavior.
* `ENABLE_CLOUDFLARE_PAGES_DEPLOY=true` is now set and the workflow runs.
* The latest workflow failed in `pnpm run pages:build`.
* `scripts/build-cloudflare-pages.mjs` currently blocks deployment when non-team Node runtime API routes exist.
* Older behavior hid all `runtime = "nodejs"` route files during `@cloudflare/next-on-pages`, then restored them after the build.

## Requirements

* Restore `pages:build` so it hides all Node runtime route files during the Cloudflare Pages adapter build.
* Keep the existing stale-disabled-route restoration guard.
* Keep routes restored in `finally` and signal handlers.
* Update user-facing docs that currently claim Pages builds fail fast for non-team Node runtime provider routes.
* Do not change provider/runtime architecture in this task.

## Acceptance Criteria

* [ ] `pnpm run pages:build` passes locally.
* [ ] Restored workflow deploy run reaches the Cloudflare deploy step instead of failing on the route block.
* [ ] Docs no longer say Pages builds fail fast for non-team Node runtime API routes.

## Out of Scope

* Making Node runtime API routes work on Cloudflare Pages.
* Migrating deployment to a Node runtime host.
* Refactoring provider API runtime behavior.

## Technical Notes

* Main files: `scripts/build-cloudflare-pages.mjs`, README/development/data-storage docs.
* Recent blocker: GitHub Actions run `28574020995`, `Build Cloudflare Pages output` failed with `Cloudflare Pages build blocked: non-team Node runtime API routes would be missing after deployment.`
