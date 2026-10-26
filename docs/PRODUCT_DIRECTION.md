# Form Check: personal-use product direction

Research and screen review, 2026-10-26. Audience: one person practicing squats and basketball shots with a fixed iPhone. Horizon: first dependable phone release, followed by a later pass on kettlebells and posture. Scope: capture, feedback, and review; no social features or make/miss claims.

## Executive read

The strongest pattern in current products is a guided camera setup, limited feedback that the sensor can defend, and a review that is useful after the phone is placed across the room. HomeCourt documents tripod placement, good lighting, visible shooter and hoop, audio feedback, and shot-by-shot review. Tempo documents the view and obstruction requirements for exercise tracking, acknowledges missed/double-counted reps, and adds form cues only after substantial validation. Those are product behaviors to learn from, not evidence that their proprietary models are available to reuse. Form Check already has a small local pose model and a squat analysis path. Its basketball mode currently measures shooting-arm motion, not release or flight. A generic small ball detector is a candidate, but a distant, blurred basketball and simultaneous iPhone pose inference remain unproven. The first version should make capture and uncertainty legible before expanding its list of coaching claims.

## Observed product evidence

- HomeCourt's setup guide recommends stable tripod placement, lighting, a normal-color ball, a view of shooter and hoop, and audio feedback. Its getting-started guide shows a setup → detect → record → shot-by-shot review flow. [Setup FAQ](https://www.homecourt.ai/faq/setup); [getting started](https://www.homecourt.ai/in-app/gettingstarted).
- Tempo says camera obstructions and position affect rep counts and that feedback cues do not appear every time. It says a new form cue requires extensive data collection and testing. This supports conservative feedback and explicit tracking-quality states. [Tempo form feedback](https://support.tempo.fit/support/solutions/articles/151000154714-3d-tempo-vision-form-feedback); [Tempo Move troubleshooting](https://support.tempo.fit/support/solutions/articles/151000210407-tempo-move-core-troubleshooting).
- Google offers Pose Landmarker Lite with 33 body landmarks, optimized for on-device fitness use. It estimates body position, not whether a squat is intrinsically correct. Google recommends EfficientDet-Lite0 as a small generic object detector trained on COCO; it is not a basketball shot evaluator. [Pose Landmarker guide](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker); [Object Detector guide](https://developers.google.com/edge/mediapipe/solutions/vision/object_detector).
- Google also offers MoveNet Lightning, a smaller alternative pose model. Its published 2.9 MB INT8 size and mobile benchmark are from an older Android/Pixel test, not evidence of iPhone Safari speed for this app. Switching pose runtimes should follow a measured problem. [TensorFlow MoveNet benchmark](https://blog.tensorflow.org/2021/08/pose-estimation-and-classification-on-edge-devices-with-MoveNet-and-TensorFlow-Lite.html).
- Public user evidence is thin and mixed: one older App Store review reports heat and missed actions on an iPhone 8 Plus; a current Reddit post reports a HomeCourt workout video that would not load. These are failure modes to guard against, not prevalence estimates. [App Store reviews](https://apps.apple.com/us/app/homecourt-basketball-training/id1258520424?see-all=reviews); [Reddit report](https://www.reddit.com/r/BasketballTips/comments/1vdygp2/homecourt_app_problems/).

## Ranked UX problems

| Rank | Problem and user goal | Surface and failure | Evidence | Severity / frequency signal / confidence | Product move |
| --- | --- | --- | --- | --- | --- |
| 1 | Know whether the camera can see the movement | Setup: a workout can begin with a body part, ball, or hoop outside view | HomeCourt and Tempo setup guidance; Form Check's prior zoom/framing reports | High / repeated in product documentation and this user's experience / high | Full-view preview, specific readiness checks, stable camera selection, one clear fix at a time |
| 2 | Trust the feedback | Live analysis: pose or ball is missed, but a definitive cue appears | Tempo acknowledges missed counts; current basketball mode measures arm motion only | High / documented failure mode, unknown local prevalence / high | Distinguish measured, estimated, and unknown; suppress cue when required landmarks or ball are missing |
| 3 | Understand feedback when away from the phone | During practice: small text cannot be read from court distance | HomeCourt audio option; user's stated need | High / user-specific / high | Short optional speech, large cue, post-set selected frames and path |
| 4 | Start without navigating a dense tool UI | Form Check mobile setup: six horizontal movement cards and four buttons sit above the video | Current Form Check screenshots in `.scratch/form-check-v1-wayfinder/audit/` | Medium / observed in current capture / high | Put preview first, group selection into a compact mode chooser, show only the next available primary action |
| 5 | Revisit a result reliably | Review: losing a clip or still makes an analysis hard to verify | HomeCourt's shot review model; isolated user report of failed video loading | Medium / isolated report / medium | Keep two optional stills plus compact measurements locally; confirm saved state; allow deletion |

## Model decision

Use the existing ~5.5 MB Pose Landmarker Lite bundle for squat and shooting-arm landmarks. Derive rep phases and cues from visible joint trajectories, with camera-angle limits and unknown results. A separate EfficientDet-Lite0 INT8 detector is the first ball candidate; its generic `sports ball` label is not proof it sees a small ball on a real court. Evaluate a full-resolution crop and wrist-to-rim tracking on private footage, then measure the two models together on iPhone Safari. No reviewed public low-memory model already provides reliable, complete squat coaching or basketball shot-form judgment out of the box. That is an inference from the inspected model documentation and project candidates, not a claim that none exists anywhere.

## Visual direction and current-screen review

Reading this as a phone-first practice tool for one person, with a calm dark visual language and high-contrast coaching signals. Taste dials: variance 4, motion 2, density 3. Use the current charcoal and cyan as the foundation. Reserve bright cyan for the next action and measured landmarks; use a separate muted warning color for tracking uncertainty. Keep one sans family for interface text, tabular numerals for counts and angles, and a consistent 4/8/16/24 spacing scale. Do not add decorative sport photography to the live camera surface.

Screens reviewed: [squat setup](../.scratch/form-check-v1-wayfinder/audit/01-squat-setup.png) and [basketball setup](../.scratch/form-check-v1-wayfinder/audit/02-basketball-setup.png), captured at a narrow preview width. The camera-off screen is visually clean, but its placeholder icon takes the center while the actual video begins low in the viewport. The movement strip has six options, clipped neighbors, and a visible horizontal scrollbar. Camera, calibration, set start, and voice appear as peer buttons although only one action is available. The basketball setup copy says the hoop can be out of frame; that remains true for current pose-only mode but conflicts with the planned release/path setup. The cyan mark and camera icon are simple, but the mark does not explain the product and the camera icon gives no setup guidance. This is a screen-level review; camera permission, live tracking, and completed reviews were not exercised here.

Recommended phone flow:

1. **Choose practice**: Squat or Basketball are the prominent v1 choices. Other modes can live under More. State what each can measure in a sentence.
2. **Place phone**: Show a purpose-made setup illustration for each mode. Squat: full body side-on and ground visible. Basketball: fixed rear-camera view with shooting arm, ball flight area, and hoop. The illustration must be checked against real framing; generated art is instructional, not evidence of model accuracy.
3. **Check view**: Make the live preview the largest region. Overlay simple readiness markers and one fix, such as “Move back until feet are visible” or “Hoop outside frame.” Do not ask for calibration until the required view is present.
4. **Practice**: One large primary control, one short cue, optional speech. Show tracking status without scrolling. Keep the camera image stable and avoid decorative motion.
5. **Review**: Show the selected stills/2D path first, then “what was seen,” one cue, and one next attempt. Mark gaps/unknowns. Provide a clear save/delete state.

Create two matched visual assets before polishing controls: a squat camera-placement illustration and a court-placement illustration. Generate or draw them for their measured slots and annotate with real UI text; avoid unrelated kettlebell hero images. The body skeleton and ball path should be rendered from measurements, never invented by image generation.

## Review system and proposed acceptance gates

These are proposed gates for personal testing, not current performance claims:

1. **Capture gate**: On the user's iPhone Safari, start five sessions; all five should keep a stable camera preview for a short set, with the whole required scene visible and no unexpected zoom or shutoff. Record device, browser, camera, orientation, and model rate.
2. **Squat gate**: Privately record at least 20 side-view reps with a manual tally. Target at least 18 correctly counted, with no definitive form cue on frames missing the relevant hip/knee/ankle. Review one or two representative stills after the set.
3. **Shot gate**: Privately record at least 20 releases from the fixed court view. Target at least 16 confirmed releases with no false confirmed releases during rebounds, and a visible path segment when the ball is actually detected. Label gaps; never join a rebound to the previous path. Report the counts, not the footage.
4. **Performance gate**: Run pose and ball detection together for a representative practice duration on the phone. Log inference cadence, dropped frames, camera continuity, heat/battery observations, and whether speech/review remain responsive. Adjust cadence or model only from these observations.
5. **Visual gate**: Review setup, live, and result screens at iPhone width and laptop width. Check primary action visibility, text at arm's length, button states, horizontal overflow, contrast, focus order, and a no-camera/unknown case. Capture before/after screenshots with the same viewport and state.

## Source map and opportunity timing

Searched public company help and onboarding pages, Google model documentation, and a narrow set of public app reviews/forums. Company pages explain intended behavior and failure conditions; reviews show isolated lived problems. No internal support data or independent accuracy study was available, so frequency and accuracy remain unknown. Local code and captured screens provide direct evidence of Form Check's current behavior and layout.

- **This week**: phone-first setup/review visual prototype; fix contradictory basketball setup copy when ball tracking ships; publish the current branch to HTTPS for phone checks.
- **This quarter**: validate squat cues and ball detector on private footage; integrate release/path only if the phone performance gate passes; revise the design using the same-state screenshot review.
- **Needs deeper research**: alternative ball model/training if generic COCO misses the ball; coaching cues beyond visible measurements; cross-device history; physical launch measurements.
