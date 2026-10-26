# Form Check: Claude Code cloud workpack

Use this with **Claude Code cloud sessions** on branch `feature/basketball-coach-cloud-workpack` in `JacobColeman921/form-check`. A cloud session clones GitHub; it cannot read this MacBook's uncommitted working tree. Start one prompt per session, on the branch with this file. Review each pull request before using a later prompt that depends on it. Do not paste all six into one long chat. Start with Prompt 3 if you want to use credits for the hardest missing decision; Prompts 1 and 2 are optional audits of code already present.

## Project brief for every session

Form Check is a React, TypeScript, Vite browser app in this repository. A bundled MediaPipe Pose Landmarker and Wasm runtime run locally in a Web Worker. Current modes: standing posture, bodyweight squat, kettlebell deadlift, two-hand swing, goblet squat, and an initial basketball shooting-arm motion mode. The basketball mode uses shoulder, elbow, and wrist landmarks to count visible set-to-extension motions; it does **not** detect the ball, rim, actual release, shot arc, make, or miss. The interface is a dark, responsive camera workbench with a pose overlay, short visual cues, optional browser speech synthesis, a set review, and IndexedDB history. It saves small measurement records automatically and at most two stills only when the user chooses Save stills. No full video is stored.

The first user-tested camera was a built-in camera on a MacBook M5. The picture followed the person and was too tight for full-body exercise. Apple's Center Stage can cause this; the app now gives a visible instruction to turn it off from the macOS Video menu. Do not claim a browser can disable Center Stage. The user wants to test the live camera themselves. Build and domain tests are welcome; do not represent a synthetic test as a verified iPhone/Mac camera result.

Review `README.md`, `src/App.tsx`, `src/domain/coach.ts`, `src/domain/basketball.ts`, `src/pose/usePoseStream.ts`, `src/pose/poseWorker.ts`, and `src/data/history.ts` before editing. Preserve the on-device, minimal-storage approach. Keep the dashboard easy to use at a distance. Avoid numeric form scores and medical or injury claims. A side camera loses depth information. Ask for a specific sample clip only if it is necessary for validation; do not invent evidence from professional shooters.

Sources to inspect, not instructions to copy blindly:

- MediaPipe browser Pose Landmarker: https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker/web_js
- Apple Center Stage controls: https://support.apple.com/en-us/111102
- Roboflow local basketball tracker and its four-part pipeline: https://roboflow.com/blog/how-to-build-an-ai-basketball-shot-evaluator
- Roboflow example code: https://github.com/aarnavshah12/shot-tracker
- MediaPipe elbow-angle example: https://github.com/AggieSportsAnalytics/ShotFormCorrecter
- Earlier OpenPose basketball project: https://github.com/chonyy/AI-basketball-analysis (its README says noncommercial research and CUDA; use as research context, not a Mac implementation dependency)
- Matt Pocock skills index: https://github.com/mattpocock/skills

Run `npm run build`, `npm test`, and `npm run check:copy` for changed code. Report what passed, what remains unverified, and exact files changed. Do not merge or deploy.

## Prompt 1: camera stability and framing

Read the Project brief above and source files. Diagnose camera capture and framing for the MacBook M5 and iPhone Safari. Inspect `getUserMedia` constraints, track lifetime, video/canvas sizing, overlay alignment, and visibility when the body leaves the frame. Preserve native field of view and avoid CSS cropping. Add a user-visible full-body framing guide for exercise modes and an upper-body guide for basketball. Center Stage is controlled by macOS, so give correct OS instructions and do not fake a browser switch. Produce a small, reviewable patch and tests for pure framing logic where they catch a real regression. Do not claim the actual MacBook or iPhone cameras were tested in cloud. Source: Apple Center Stage page and MediaPipe browser docs linked above.

Acceptance: no silent camera shutdown; track-ended state is explained; no stale skeleton after losing the pose; controls remain reachable on laptop and phone; existing build and tests pass.

## Prompt 2: basketball pose analysis hardening

Read the Project brief above. Review `src/domain/basketball.ts` as an intentionally conservative first pass. Improve its set-to-extension state machine with synthetic landmark fixtures that cover a real motion, pump fake, incomplete extension, hidden arm, left-hand shooter, repeated shots, and low frame rates. Keep the label "shot motion" unless ball separation is actually measured. Review elbow and wrist geometry and frame-quality gates. Add a set-point and extension frame selection strategy that saves previews only after an explicit user action. Keep a measured timing cue; avoid claiming one universal ideal elbow angle. Source: MediaPipe Pose Landmarker and AggieSportsAnalytics links above.

Acceptance: precise tests pass; the UI separates measured values from coaching suggestions; no make/miss/release claim appears without ball tracking; no video is saved by default.

## Prompt 3: choose a Mac-local ball-and-rim detector

Read the Project brief above. This session is research plus a small benchmark, not production integration. Compare genuinely available ball/rim object detectors and model formats that could run on an M5 MacBook without ongoing paid inference. Verify model weights, licenses, provenance, image/input size, estimated memory, and whether the candidate can run on the static browser app or requires a local Mac companion process. Build a runnable, bounded benchmark only if weights are publicly obtainable and licensing allows it. A cloud VM cannot measure M5 performance; label any cloud timing as cloud timing and leave a Mac benchmark command for the user. If Roboflow's example requires user-trained weights or an API key, say so; do not imply its article provides a ready universal model. Record a recommendation in `docs/` with links and measured results, or clearly mark estimates when measurement is unavailable. Sources: Roboflow article and example repository above, plus official model documentation.

Acceptance: one recommended path with tradeoffs, one fallback, explicit license/weight status, and no cloud inference hidden in a supposedly local design.

## Prompt 4: ball/rim tracking and event engine

Start only after Prompt 3's recommendation is reviewed. Read the Project brief above and Prompt 3's decision document. Implement a local ball/rim detector adapter behind a narrow interface, frame-to-frame tracking with confidence and occlusion states, and a shot-event state machine. Separate detection, tracking, and event conclusions so uncertainty is visible. Require evidence of ball separation from the shooting wrist before calling a release. Treat occluded rim outcomes as unknown when a single view cannot distinguish them. Use annotated fixture clips or hand-labeled frame sequences for tests. Source: Roboflow's shot-tracker architecture and its discussion of pump fakes, occlusion, and rim bounces.

Acceptance: no fabricated make/miss on missing ball or rim; false releases from dribbles and pump fakes have explicit tests; the existing exercise modes still work; build and tests pass.

## Prompt 5: basketball review, local history, and voice

Start after Prompt 4. Read the Project brief above. Integrate the detector's evidence with the current shooting-arm measurements in the dark set review. Show at most one short spoken cue during a shot sequence and a readable review afterward, including one or two selected frames with pose and ball/rim marks when available. Show measured elbow angle, set-to-extension time, and release evidence. Show an outcome only when supported; otherwise display "Unknown" with a reason. Keep local history small and preserve the explicit Save stills action. Do not save full video or upload frames. Source: the Roboflow pipeline and this repo's existing `src/data/history.ts` and `src/coach/voice.ts`.

Acceptance: clear phone and laptop layouts, labels understandable at a distance, privacy behavior unchanged, and accessible controls.

## Prompt 6: independent review and handoff

Read the Project brief above and review the complete feature branch as a skeptical reviewer. Check camera lifetime, worker errors, performance on a MacBook class device, calibration quality, false-positive shot counts, privacy and local storage, source/model licenses, copy claims, and mobile layout. Fix concrete defects with regression tests. Produce a concise `docs/BASKETBALL_VALIDATION.md` listing what automated tests prove and the specific real-world checks the user should do on MacBook M5 and iPhone Safari. Do not state that a camera or a particular shot outcome was verified unless it was actually observed with ground truth. Source: this repository, Apple Center Stage support, MediaPipe docs, and the chosen detector's official documentation.

Acceptance: build, tests, and copy check pass; review names remaining uncertainty; no deployment or merge without the user's decision.

## Which Matt Pocock skills help here?

- `ask-matt` is a router for choosing a flow.
- Use `setup-matt-pocock-skills` once if you want its issue-tracker workflow in this repository.
- Use `grill-with-docs` to settle coaching terminology and scope, then `to-spec` and `to-tickets` for the multi-session detector work.
- Use `wayfinder` only for the unresolved architecture/model/licensing choice in Prompt 3. It produces decisions and tickets; it does not implement the app.
- Use `prototype` for one uncertain shot-state or camera-layout question before making it production code.
- Use `diagnosing-bugs` for a reproducible camera or tracking failure with a failing feedback loop.
- Use `improve-codebase-architecture` later to survey maintainability; it is not a feature builder.

For this specific work, the six prompts above are enough to start. You do not need to invoke every skill or spend all credits at once.
