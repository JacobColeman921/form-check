# Form Check iPhone v1 wayfinder

## Destination

A decision-ready spec for a personal-use iPhone Safari practice app with two dependable basics: a side-view bodyweight squat cue and basketball release plus a 2D ball path. Both are based on measurements from the live camera, with a clear unknown state when the camera cannot see enough. Other movement modes can remain in the app, but they do not define this first milestone.

## Notes

- Base: `feature/form-check-ui-polish` has six pose modes, local review/history, optional stills and speech, and a ball-detector benchmark. Ball/rim detection is not wired into the live app. GitHub Pages deploys `main`, not this branch.
- The user chose a public HTTPS app URL with camera frames and history kept on device; direct iPhone Safari use; one fixed court view; a 2D path; private footage testing with metrics shared; short spoken cues; and workout cues/review without a numeric score.
- Personal use is the current scope. Prioritize an honest, usable squat and shot workflow over more features, a large training database, or a conversational coach.
- A short ball disappearance during a shot is an observation gap. A rebound and later release begin a new shot. The tracker must not join those paths into one.
- Keep the language in [CONTEXT.md](../../CONTEXT.md): shot motion, release, and shot outcome mean different things.
- HomeCourt's public setup guidance is a reference for rear-camera framing, short live feedback, and replay/review, not a source of proprietary model behavior: https://www.homecourt.ai/faq/setup
- Treat visual guidance as part of the first milestone: purposeful camera-placement illustrations, a stable live overlay, and a readable review when the phone is far away. See [product research and screen review](../../docs/PRODUCT_DIRECTION.md).
- Reverse-engineer-anything is configured and its cached CLI diagnostic reports healthy under Node 24, but its MCP tools are absent in this chat. Use it later only for a supplied app artifact or an actual running target whose behavior public evidence cannot answer.
- This map records decisions. Implementation starts after its open questions have answers.

## Decisions so far

None. The user choices above are the starting constraints for this map.

## Not yet specified

- If the small ball detector fails on cropped real court footage, choose a fallback only after seeing the failure mode and iPhone performance.
- Decide what, if any, physical shot measurements are possible after a 2D path works consistently from one fixed view.
- Decide whether a later Mac companion or cross-device sync is useful after direct phone sessions are dependable.
- Decide whether a specialized squat classifier adds value only after the landmark-and-rule approach is checked against private reps.

## Out of scope

- Automatic make/miss calls in v1.
- A universal numeric form score or medical posture judgment.
- A conversational local language model in v1.
- Validation of the additional kettlebell and posture modes for this first milestone; they remain available for a later pass.
- Copying HomeCourt's proprietary models, assets, or branded drills.
