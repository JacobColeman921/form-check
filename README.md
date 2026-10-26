# Form Check

A dark, local-first movement coach for a MacBook camera or iPhone Safari. It covers standing posture, bodyweight squat, kettlebell deadlift, two-hand swing, goblet squat, and a first basketball shooting-arm mode.

## Start

```bash
npm install
npm run fetch:model
npm run dev
```

Open the Vite URL shown in the terminal. For an iPhone, use an HTTPS deployment such as the project's GitHub Pages build; phone browsers require a secure origin for camera access. For exercise moves, place the full body in a side view and use the rear camera if it gives you more room. For basketball, the shooting shoulder, elbow and wrist are enough for upper-body analysis; knees are optional. If a MacBook camera auto-crops or follows you, turn off Center Stage in the menu bar's Video menu. The browser cannot turn that macOS feature off itself.

1. Choose a movement and start the camera.
2. Calibrate while standing still and side-on for three seconds.
3. Start a set, watch the body diagram and short cue, then finish the set.
4. Review rep notes and up to two key-frame previews. Choose **Save stills** only if you want images stored.

The camera stream and pose inference run in the browser. Session measurements save automatically in IndexedDB, capped at 60 sessions. Videos are not stored. Saved stills are optional, with at most two per session. Voice uses the browser's speech synthesis and prefers a voice installed on the device when available.

## Analysis

MediaPipe Pose Landmarker runs from bundled model and WebAssembly files in a Web Worker. The app samples camera frames, draws visible joints, and analyzes only pose landmarks. It uses movement-specific rules and a rep state machine:

| Movement | What it measures |
|---|---|
| Standing posture | Head and shoulder separation, trunk lean, and tracking quality |
| Bodyweight squat | Completed cycles, hip and knee bend, heel movement, and approximate depth |
| Kettlebell deadlift | Hinge and return cycles, hip and knee bend |
| Two-hand swing | Wrist-rise cycles and visible hip movement; the bell itself is not tracked |
| Goblet squat | Squat cycles, hip and knee bend, and visible hand position |
| Basketball shot | Shooting-arm set-to-extension motions, elbow angle, timing, and optional knee bend |

Live cues favor camera setup and clear rep observations. The review gives a coaching rule and compares rep count or hold time with the previous session of the same movement. It labels low-quality tracking instead of giving a numeric form score. These thresholds are coaching heuristics, not calibrated medical or sports-science measurements.

A single side camera cannot reliably determine spinal rounding, knee valgus, exact kettlebell path, load, internal forces, or injury risk. Changing camera position can alter apparent joint angles. Use the same setup for comparisons. The basketball mode counts visible shooting motions, not actual ball releases. It cannot measure shot arc or makes and misses until a ball-and-rim detector is added. It gives no numeric shot score.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Local development server |
| `npm run build` | Typecheck and production build |
| `npm test` | Domain unit tests |
| `npm run fetch:model` | Download local pose model into `public/models` |

## Code map

- `src/pose/usePoseStream.ts`: camera lifetime, zoom, worker, and frame sampling.
- `src/pose/poseWorker.ts`: local MediaPipe inference.
- `src/pose/skeleton.ts`: visible joint diagram.
- `src/domain/coach.ts`: movement catalogue, calibration, cues, rep segmentation, session analysis.
- `src/domain/basketball.ts`: upper-body shooting-arm tracking and shot-motion analysis.
- `src/data/history.ts`: local measurements and optional stills.
- `src/coach/voice.ts`: optional spoken cues.

The pose model and Wasm runtime are copied into the build; GitHub Pages can serve this as a static app. Browser camera access still requires HTTPS or localhost. No backend is needed for the first release.
