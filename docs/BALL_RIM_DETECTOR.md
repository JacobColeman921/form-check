# Ball and rim detector: decision record

Status: recommendation for review, before Prompt 4. Research date: 26 October 2026.
Scope: which detector can find a basketball and a rim on an M5 MacBook, offline, with no paid inference. This is research and a small benchmark, not production integration. No app code changed.

## Decision

**Recommended path: run MediaPipe EfficientDet-Lite0 (int8) in the browser for the ball, and have the user mark the rim once.**

- **Ball.** Use the MediaPipe Tasks `ObjectDetector`, restricted to the COCO `sports ball` category. It ships in the `@mediapipe/tasks-vision` package the app already bundles. The model is a single 4.6 MB file served from the same origin. It runs in a second Web Worker beside pose, so the app stays static on GitHub Pages: no companion process, no API key, no network calls during a session.
- **Rim.** Before the first shot, the user taps the rim on a paused frame. No openly licensed, ready-made detector has a rim class (see the candidate table). On a tripod the rim does not move, so one tap per session is more reliable than a weak detector. If the camera moves, the app asks for a new tap.
- **Crop before detecting.** Do not feed the detector the 640 px pose frame. At that size a ball across a driveway is about 10 to 20 px wide, and the model shrinks its input again to 320 x 320. Take a crop around the shooting wrist and the marked rim from the full-resolution camera frame instead. The pose landmarks and the rim tap already say where to look.

Tradeoffs:

- COCO `sports ball` covers every ball type and was not trained on driveway footage. Upstream reports COCO mAP of 26.4 for Lite0 across all classes. Expect missed detections on a small, motion-blurred ball. Prompt 4's tracker must treat a miss as "not seen", never as "no ball". This has **not** been measured on real basketball footage; see "What is not known yet".
- Without a rim detector there is no check that the rim is still where the user tapped. Prompt 4 should watch for camera movement, for example a large shift in the pose or frame, and ask for a new tap.
- Detection costs about 3.7 times the pose model per frame on the same CPU (measured below). It probably needs to run at a lower rate than pose, or only while a shot is in progress.

**Fallback: RF-DETR Nano, fine-tuned on an openly licensed ball and rim dataset, exported to ONNX.**

- Code and the N, S, M and L checkpoints are Apache-2.0. COCO weights download publicly from Roboflow's Google Cloud bucket, with no API key.
- It is much stronger on COCO (AP50:95 of 48.4 for Nano against 26.4 for Lite0). Fine-tuning can add a real `rim` class, which removes the manual tap.
- Cost: a training run that you own. The candidate datasets on Roboflow Universe are listed as CC BY 4.0, which requires attribution, and each dataset needs individual review. The model is also much larger (see the measurements), so in practice it belongs in a **local Mac companion process**, not in the static page. That process would run ONNX Runtime with the CoreML provider, or a CoreML export, and listen only on `localhost`. It means a Python install, a localhost API, and browser mixed-content rules for the HTTPS Pages site, which are real complexity. It is the fallback for the case where the recommended path proves too weak on your footage.

Nothing in either path sends frames off the device.

## Candidates

| Candidate | Ball / rim classes | Weights you can get | License | Size and input | Where it runs | Verdict |
|---|---|---|---|---|---|---|
| **MediaPipe EfficientDet-Lite0** int8 / float16 | COCO `sports ball`; no rim | Public, no key: `storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/...` (downloaded and run here) | Runtime Apache-2.0 (`@mediapipe/tasks-vision` package.json). Upstream EfficientDet-Lite COCO checkpoints in `google/automl` are Apache-2.0. **Gap:** the MediaPipe bucket ships no license file beside the `.tflite`, and Google's model page could not be opened from this VM. Check it before shipping. COCO annotations are CC BY 4.0. | 4.6 MB int8, 7.3 MB float16; 320 x 320 | Browser, in the existing runtime | **Recommended** |
| MediaPipe EfficientDet-Lite2 int8 / float16 | Same | Public, same bucket (run here) | Same | 7.5 / 12.1 MB; 448 x 448 | Browser | Option if Lite0 misses too many balls. About 3x slower than Lite0 here |
| MediaPipe SSD MobileNet V2 | Same | Public, same bucket (size checked, not run) | Same as above | 11.3 MB float32 | Browser | Not benchmarked; Google recommends EfficientDet-Lite0 |
| **RF-DETR** Nano / Small (COCO) | COCO `sports ball`; rim only after fine-tuning | Public, no key: `storage.googleapis.com/rfdetr/nano_coco/...` (366 MB training checkpoint; ONNX size below) | Apache-2.0 (`rfdetr` wheel METADATA). XL and 2XL are PML 1.0; avoid them. | 30.5M params; 384 x 384 (N), 512 x 512 (S) | Mac companion (ONNX Runtime + CoreML). Browser possible but heavy | **Fallback** |
| Ultralytics YOLO11 / YOLO26 | COCO `sports ball`; rim after training | Public via GitHub releases (blocked from this VM, not run) | **AGPL-3.0** or a paid Enterprise license. Ultralytics says trained weights are covered too. This repository has no LICENSE file, so using it would force a licensing decision for the whole app. | 2.6M params (N); 640 x 640 | Browser (ONNX Runtime Web) or Mac | Rejected as default: license, not capability |
| Roboflow example (`aarnavshah12/shot-tracker`) | `ball`, `rim` | **Not public.** `models/registry.py` names `aarnavs-space/basketball-shooting-robot-kbsro-1-rfdetr-small-t1`, a model trained in the author's own Roboflow workspace. `models/detector.py` fetches it with `ROBOFLOW_API_KEY` through `inference==1.3.10`. Whether someone else's key can download it could not be checked, because roboflow.com does not resolve from this VM. | No LICENSE file in the repository, so default copyright applies | RF-DETR Small, 512 x 512 | Local after the keyed download; processes recorded clips only, and its README says live camera is "not implemented" | Rejected as a model source. **Its architecture is the reference for Prompt 4** (detector behind a callable, tracker, shot state machine, `clean` / `rattled` / `occluded` verdict flags). The article does not provide a ready universal model. |
| Roboflow Universe basketball datasets | Several list `ball` and `rim` | Dataset export needs a Roboflow account; hosted models are cloud inference | Datasets listed as CC BY 4.0; terms for trained weights are not stated | n/a | n/a | Possible **training data** for the fallback. Hosted inference rejected (cloud) |
| `chonyy/AI-basketball-analysis` | Ball, rim (Faster R-CNN) | In repository | OpenPose academic **noncommercial research only**; README requires CUDA | Large | NVIDIA GPU | Rejected |
| `AggieSportsAnalytics/ShotFormCorrecter` | Ball (custom YOLOv8) | Not published (`runs/detect/train/weights/best.pt` is local) | No LICENSE file; YOLOv8 is AGPL-3.0 | n/a | Python | Rejected; useful only as a pose idea |
| Roboflow Hosted API / any cloud endpoint | n/a | n/a | Paid per call | n/a | Cloud | Rejected: not local |

## Measured results

**These are cloud VM timings, not M5 measurements.** Host: 4-core Intel Xeon at 2.80 GHz with no GPU, running headless Chromium 153 under Playwright. Frames: 30 synthetic 640 x 360 frames (backboard, rim, ball on an arc), 5 warm-up runs, then 120 timed runs. They were produced by `npm run bench:detector:cloud` (see below).

| Model (CPU, WebAssembly XNNPACK) | File | Median ms | p95 ms | Cost relative to pose |
|---|---|---|---|---|
| Pose Landmarker lite (what the app runs now) | 5.8 MB | 30.9 | 44.2 | 1.0x |
| EfficientDet-Lite0 int8 | 4.6 MB | 113.9 | 178.6 | 3.7x |
| EfficientDet-Lite0 float16 | 7.3 MB | 181.8 | 233.7 | 5.9x |
| EfficientDet-Lite2 int8 | 7.5 MB | 358.6 | 486.8 | 11.6x |
| EfficientDet-Lite2 float16 | 12.1 MB | 549.4 | 694.3 | 17.8x |

- **RF-DETR Nano: not measured here.** The COCO checkpoint downloaded fine, but PyTorch is needed for the ONNX export. The only PyTorch build this VM can reach is PyPI's Linux build, which will not import without about 2 GB of NVIDIA CUDA libraries, and PyPI downloads ran at about 0.4 MB/s. The Mac's PyTorch build has no CUDA dependency, so the command below should work there. `bench/rfdetr_bench.py` was tested end to end against a stand-in ONNX model with the same input and outputs (synthetic and image inputs, the CPU provider, the missing-CoreML error). The real export path in that script is untested. **Size estimate, not measured:** 30.5M parameters is about 120 MB as float32 ONNX, or about 60 MB at half precision. That is 13 to 26 times the Lite0 file, which is why the fallback points to a companion process rather than the page.

- **GPU delegate: not measured.** With no GPU, Chromium falls back to software WebGL (SwiftShader), and the run did not finish in 10 minutes. On the Mac the GPU delegate is the one that matters.
- **Ball found** on synthetic frames is deliberately left out of the table. A drawn orange circle says nothing about a real basketball. For the record, Lite0 int8 scored at least 0.3 on 3 of 30 synthetic frames and the others on at most 1. That is consistent with small balls being hard, but it is not evidence.
- **Memory** was not measured; the browser does not report WebAssembly heap per model. The model file size is the only measured number, and runtime memory will be several times that. Check Safari's Web Inspector, under Timelines and Memory, during the Mac run.

### Estimate for the M5 (not measured)

The only portable number here is the ratio to the pose model. If the ratio holds on the Mac, Lite0 int8 costs about 3 to 4 pose inferences per frame. Running both on every frame would cut the frame rate to roughly a quarter of pose alone. That is why the plan crops, runs ball detection at a lower rate (for example every second or third frame), and spends the full rate only between set point and the ball reaching the rim. GPU and CPU ratios can differ a lot, so treat this as a planning assumption until the Mac run below replaces it.

## Run it on the Mac

Browser benchmark: this measures Safari or Chrome on the M5, GPU included.

```bash
npm install
npm run fetch:model
npm run fetch:detectors          # downloads 4 detector files into bench/models (gitignored)
npm run dev
# open http://localhost:5173/form-check/bench/detector.html in Safari, then Chrome
# Run once with Delegate = GPU and once with CPU, and keep the JSON block shown under the table.
```

The page only exists on the dev server; `npm run build` does not ship it or the detector files. For a detection check, choose **My images or one video** and pick a short clip of your own shooting. It is read in the page, sampled at up to 300 frames, and never saved or uploaded. The "Ball found" column describes detection on a **640 px full frame**. The proposed full-resolution wrist-to-rim crop is not implemented in this benchmark, so this result cannot decide by itself whether the cropped detector is good enough.

Fallback benchmark (RF-DETR, ONNX Runtime with CoreML):

```bash
python3 -m venv .venv-bench
.venv-bench/bin/pip install "rfdetr[onnx]==1.11.2" pillow
.venv-bench/bin/python bench/rfdetr_bench.py --size nano --provider coreml
.venv-bench/bin/python bench/rfdetr_bench.py --size nano --provider cpu
# add --video path/to/clip.mov (pip install opencv-python) for a detection check
```

The first run downloads the 366 MB COCO checkpoint and exports ONNX into `bench/models`.

## What is not known yet

1. Whether Lite0 finds a real basketball often enough, at court distance, on your camera. **This decides between the recommended path and the fallback.** It needs one sample clip that only you can provide: 20 to 30 seconds from where you will really put the tripod, with the rim in the upper third of the frame and a few shots. The current benchmark gives a first check on the full 640 px frame. Before choosing a fallback, implement and test the planned full-resolution crop on that same clip. If Lite0 with the crop finds the ball in most frames between set and rim, take the recommended path.
2. M5 latency and memory for every candidate.
3. Whether the MediaPipe `.tflite` files carry a license beyond the Apache-2.0 upstream checkpoints. Check Google's object detector page before shipping.
4. Whether the shot-tracker model ID is downloadable with someone else's Roboflow key. It does not change the decision.

## Notes for Prompt 4

- Keep detection, tracking and events in separate layers, as shot-tracker does. The detector returns boxes and scores. The tracker returns positions with `seen`, `predicted` or `lost`. Only the event layer may say `release` or `make`.
- Release needs the ball box to separate from the shooting wrist landmark and keep moving away over several frames. A pump fake keeps the ball near the wrist; a dribble moves it down.
- With a tapped rim only, a ball passing behind the rim, or a single side view, cannot always tell a make from a front-rim bounce. Report `Unknown` with the reason, as shot-tracker's `occluded` flag does.
- Detector input: crop from the full-resolution frame, as described above, instead of the 640 px pose frame.

## Shooting research: Lethal Shooter, Stephen Curry and the literature

This was added at the user's request. It informs **cue wording and test fixtures**, never thresholds and never a comparison with a professional. Most sources below are coaching media, not measurement. The article hosts did not resolve from this VM, so the summaries come from search results and the pages themselves were not opened. Treat them as leads to read, not as verified quotes.

**Chris "Lethal Shooter" Matthews** (private shooting coach to NBA and WNBA players). Recurring themes in interviews:

- Daily **form shooting close to the rim**, slowly. Red Bull's tips piece describes attention to each phase: dip, jump, set, release, follow-through.
- Extending range only once the form holds at short range.
- **Filming yourself** when no coach is watching.
- Consistency and the mental side: he is quoted as saying shooting is mostly mental.

Sources: [Red Bull, five tips](https://www.redbull.com/us-en/theredbulletin/lethal-shooter-basketball-tips), [Sports Illustrated, 2020](https://www.si.com/nba/2020/06/25/lethal-shooter-nba-shooting-coach), [SLAM interview](https://www.slamonline.com/international/the-lethal-shooter-interview-with-chris-matthews/).

**Stephen Curry**:

- Coaching analyses describe a **one-motion** shot: the ball reaches the set point early, then goes up and at the basket without a pause or loop. Two-motion shots, with a distinct pause at the set point, are also widely taught.
- ESPN Sport Science is repeatedly reported as timing his release at about **0.4 s**. Secondary sources disagree, saying just under 0.4 s or under 0.46 s. The primary measurement could not be opened, and its start and end events are not the app's "set to extension".

Sources: [ESPN Magazine, "Sports' perfect 0.4 seconds"](https://africa.espn.com/nba/story/_/id/10703246/golden-state-warriors-stephen-curry-reinventing-shooting-espn-magazine), [Breakthrough Basketball, quick release](https://www.breakthroughbasketball.com/fundamentals/shooting/three-components-of-a-quick-release), [Breakthrough Basketball, one-motion shooting](https://www.breakthroughbasketball.com/fundamentals/one-motion-shooting).

**Biomechanics literature:**

- Cabarkapa et al., *Sports* 2022, 10(1):2, [doi:10.3390/sports10010002](https://doi.org/10.3390/sports10010002). 29 recreational men took 1,740 shots. Proficient and non-proficient groups differed in elbow height, ball height and flexion during preparation, and the differences were not the same for 2-point and 3-point shots. The same group's free-throw study reported *lower* elbow height for proficient shooters.
- A 2025 study concludes each shooter's technique is shaped by body size and experience, and that there is no single "perfect" technique. This is a search-result summary; the paper was not read.

What this means for the app (Prompts 2 and 5):

1. **No universal elbow angle and no "like Curry" target.** The literature shows group tendencies that change with shot distance, not one ideal. The current README already avoids a target angle; keep it that way.
2. **Use the coaching phase words** (dip, set, release, follow-through) in cues and the review. They match what coaches say and what the pose data can see.
3. **Coach consistency against the user's own baseline**, as Matthews' repetition theme suggests. "Your set-to-extension time varied from 0.4 to 0.9 s" is measurable and fair. "Too slow compared with an NBA player" is not.
4. **Prompt 2 should add a one-motion fixture.** `analyzeBasketball` waits at least 180 ms after the first frame that looks like a set position before it accepts extension. A quick one-motion shot needs a test showing it is still counted, alongside the two-motion and pump-fake fixtures the workpack already lists.
5. **Support a close-range form-shooting session.** Close to the rim, framing is easier and the camera sees the whole arm. That is the drill Matthews recommends most.
6. Do not use broadcast clips of professionals as fixtures. They are copyrighted, and a broadcast camera is not a tripod view. Use hand-built landmark sequences and, later, the user's own clips.
