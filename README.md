# Form Check

A browser tool that grades squat form from a side-on webcam, and reports the measurement
error behind every judgement.

## The point

Published concurrent-validity work puts markerless motion capture error on squat joint
angles at roughly **7 degrees RMSE, range 2.9 to 13.6**, and the 2D literature says these
systems suit tracking *relative change* rather than *absolute angle*.

So a hard traffic-light cut at 90 degrees is not defensible. A rep at 88 and a rep at 92
are the same rep inside the instrument's error.

Form Check resolves every criterion into three states, not two:

- **Met**, the value clears the threshold by more than the error band
- **Not met**, it fails by more than the band
- **Too close to call**, it lands inside the band

If too much of a set lands inside the band, the set is **not graded**, and the app says to
fix the camera instead of inventing a number.

## Running it

```bash
npm install
npm run dev
```

Then: start the camera, stand side-on about two metres back with your whole body in frame,
calibrate for three seconds, and do a set.

Calibration also checks the camera really is side-on. If you are facing it, every sagittal
angle is wrong, so the app refuses to grade rather than reporting nonsense.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Typecheck and production build |
| `npm test` | Unit tests |
| `npm run test:cov` | Coverage over `src/domain` |
| `npm run check:copy` | Fails on em dashes, emoji and promotional copy |

## Architecture

The domain layer consumes landmark arrays, never video:

```
camera -> worker -> LandmarkFrame[] -> domain (pure) -> grade
                         ^
                         |
                    JSON fixtures feed the same entry point
```

Everything in `src/domain/` is a pure function over `LandmarkFrame[]`, so the metrics, the
rep segmenter and the whole grader are testable with no camera attached. Pose inference
runs in a Web Worker and drops frames rather than queueing them, because a backlog turns
into latency and stale feedback is worse than a lower frame rate.

| Path | Role |
|---|---|
| `src/pose/poseWorker.ts` | MediaPipe PoseLandmarker, off the main thread |
| `src/pose/usePoseStream.ts` | Camera to landmarks, via `requestVideoFrameCallback` |
| `src/domain/geometry.ts` | Angles and smoothing |
| `src/domain/squat.ts` | Per-frame metrics, side selection, the side-on check |
| `src/domain/segment.ts` | Rep state machine with hysteresis |
| `src/domain/uncertainty.ts` | The error model |
| `src/domain/grade.ts` | Criteria to Met / Not met / Too close to call |

## What it cannot do

- **Knee valgus.** Frontal plane only. A side-on camera cannot see it.
- **Spinal flexion.** BlazePose has no lumbar landmark between shoulder and hip.
- **Weight distribution.** Needs a force plate.
- More than one person in frame.

## Claim boundary

This estimates joint angles in two dimensions from one camera. It is better at tracking
change in one person over time than at absolute measurement, and far better at that than
at comparing two different people. It does not detect injury risk, does not diagnose, and
is not a clinical assessment. Depth and heel thresholds are training conventions, not
medical standards.

Video never leaves the device. Nothing is recorded.

## Sources

- Concurrent validity and test reliability of markerless motion capture during the
  overhead squat, Scientific Reports, 2024.
- Validity and reliability of trunk and lower-limb kinematics using OpenCap markerless
  motion capture, Journal of Sports Sciences, 2024.
- [MediaPipe Pose Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker/web_js)
