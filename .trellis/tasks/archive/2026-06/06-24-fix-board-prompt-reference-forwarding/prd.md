# Fix board prompt node reference forwarding

## Goal

Fix the board generation input chain so a Prompt node connected to a generation node carries its own connected reference media into the generation request. This removes the current UX split where users must connect the same reference asset both to the Prompt node for prompt authoring and to the generation node for actual submission.

## What I Already Know

* The user reported that reference images connected to a Prompt node are not sent when that Prompt node is connected to a generation node.
* Board port rules define Prompt nodes as accepting asset input and outputting prompt text.
* Board port rules define asset/result/reference-group to Prompt `asset-in` connections as `reference` edges.
* Prompt reference UI already resolves connected references for Prompt nodes.
* Generation execution currently resolves prompt text through a `prompt-in` edge but resolves references only from direct `reference-in` edges on the generation node.
* Generation input summary also counts only direct `reference-in` edges.

## Requirements

* When an executable board node uses a connected Prompt node, include references connected to that Prompt node in the executable node's generation inputs.
* Preserve direct references connected to the executable node's `reference-in` port.
* Deduplicate references by stable asset/url identity before validation and request submission.
* Keep existing model capability validation as the enforcement point for unsupported media types or reference counts.
* Keep the behavior one-hop only: `reference -> prompt -> executable`.
* Keep API/provider request shape unchanged.
* Make UI input summary and actual execution agree on the resolved reference count/previews.

## Acceptance Criteria

* [ ] For `asset/reference-group -> prompt -> image-generate`, executing the image generation node sends the connected reference image(s).
* [ ] Direct `asset/reference-group -> image-generate` references still work.
* [ ] If both prompt-linked and direct executable references include the same asset/url, it is sent once.
* [ ] Existing unsupported reference media/type/count validation still fails explicitly through current generation checks.
* [ ] Selected generation node input summary reflects prompt-linked references.
* [ ] Lint passes.

## Out of Scope

* No general DAG traversal.
* No automatic reference propagation through multiple Prompt nodes or arbitrary chains.
* No provider adapter changes.
* No new fallback behavior or silent reference coercion.
* No UI redesign.

## Technical Notes

* `lib/board/ports.ts` declares Prompt nodes with `asset-in` and `prompt-out` ports.
* `lib/board/ports.ts` allows asset/result/reference-group outputs to connect to Prompt `asset-in` as `reference` edges.
* `lib/board/prompt-references.ts` collects `referenceCandidatesByPromptNode` for Prompt node references, but `generateReferenceCandidatesFromIndex` currently only returns direct generation-node `reference-in` references.
* `components/board/BoardPageClient.tsx` `resolveExecutableNodeInputs` resolves prompt text from a connected Prompt node while references are only read from direct generation-node `reference-in` edges.
* `components/board/BoardWorkspace.tsx` `generateInputSummaryForNode` similarly summarizes only direct generation-node `reference-in` edges.

## Definition of Done

* Minimal code change implements the one-hop reference forwarding contract.
* Verification covers lint and the relevant board input resolution path.
