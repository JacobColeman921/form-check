"""RF-DETR ball detection timing, for the fallback path in docs/BALL_RIM_DETECTOR.md.

Exports the public COCO RF-DETR checkpoint to ONNX once, then times ONNX
Runtime on the same frames the browser benchmark uses: synthetic frames for
speed only, or your own images or clip for a detection check. Nothing is
uploaded and nothing is saved except the exported model.

On a Mac (Apple silicon), in a fresh virtual environment:

    python3 -m venv .venv-bench
    .venv-bench/bin/pip install "rfdetr[onnx]==1.11.2" pillow
    .venv-bench/bin/python bench/rfdetr_bench.py --size nano --provider coreml
    .venv-bench/bin/python bench/rfdetr_bench.py --size nano --provider cpu

Add --images DIR (jpg/png) or --video FILE (needs opencv-python) to check
detections on real frames. The COCO checkpoint knows "sports ball" and has no
rim class.
"""

from __future__ import annotations

import argparse
import json
import math
import platform
import statistics
import time
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent
MODELS = ROOT / "models"
SPORTS_BALL = 37  # COCO category id; the COCO checkpoints keep sparse ids as logit slots.
MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)
WARMUP = 5


def export(size: str) -> Path:
    target = MODELS / f"rfdetr_{size}.onnx"
    if target.exists():
        return target
    import rfdetr

    model = {"nano": rfdetr.RFDETRNano, "small": rfdetr.RFDETRSmall}[size]()
    out = MODELS / f"rfdetr_{size}_export"
    exported = Path(model.export(output_dir=str(out), verbose=False))
    onnx_file = exported if exported.suffix == ".onnx" else next(out.rglob("*.onnx"))
    onnx_file.replace(target)
    return target


def synthetic(count: int) -> list[Image.Image]:
    """Far view of backboard, rim and a ball on an arc. Times the model; judges nothing."""
    frames = []
    w, h = 640, 360
    for i in range(count):
        img = Image.new("RGB", (w, h), (154, 163, 168))
        g = ImageDraw.Draw(img)
        g.rectangle([0, int(h * 0.61), w, h], fill=(93, 76, 60))
        g.rectangle([int(w * 0.78), int(h * 0.12), int(w * 0.92), int(h * 0.28)], fill=(244, 244, 244))
        g.ellipse([int(w * 0.76), int(h * 0.26), int(w * 0.82), int(h * 0.285)], outline=(224, 96, 42), width=3)
        s = i / max(1, count - 1)
        x = w * (0.2 + 0.59 * s)
        y = h * (0.55 - 0.9 * s + 0.62 * s * s)
        r = w * (0.022 - 0.008 * s)
        g.ellipse([x - r, y - r, x + r, y + r], fill=(214, 110, 50), outline=(42, 26, 16))
        g.line([x - r, y, x + r, y], fill=(42, 26, 16), width=1)
        g.line([x, y - r, x, y + r], fill=(42, 26, 16), width=1)
        frames.append(img)
    return frames


def from_images(directory: Path) -> list[Image.Image]:
    files = sorted(p for p in directory.iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png"})
    return [Image.open(p).convert("RGB") for p in files]


def from_video(path: Path, count: int) -> list[Image.Image]:
    import cv2

    cap = cv2.VideoCapture(str(path))
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    frames = []
    for i in range(min(count, 300)):
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(total * (i + 0.5) / min(count, 300)))
        ok, bgr = cap.read()
        if ok:
            frames.append(Image.fromarray(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)))
    cap.release()
    return frames


def to_tensor(img: Image.Image, height: int, width: int) -> np.ndarray:
    # PIL bilinear differs slightly from RFDETR.predict() resizing, so scores
    # can shift a little. That matters for thresholds, not for timing.
    arr = np.asarray(img.resize((width, height), Image.BILINEAR), dtype=np.float32) / 255.0
    return ((arr - MEAN) / STD).transpose(2, 0, 1)[None].astype(np.float32)


def session(path: Path, provider: str):
    import onnxruntime as ort

    available = ort.get_available_providers()
    wanted = {"cpu": ["CPUExecutionProvider"], "coreml": ["CoreMLExecutionProvider", "CPUExecutionProvider"]}
    if provider == "auto":
        provider = "coreml" if "CoreMLExecutionProvider" in available else "cpu"
    providers = [p for p in wanted[provider] if p in available]
    if provider == "coreml" and "CoreMLExecutionProvider" not in available:
        raise SystemExit("CoreMLExecutionProvider is not available in this onnxruntime build.")
    return ort.InferenceSession(str(path), providers=providers)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--size", choices=["nano", "small"], default="nano")
    parser.add_argument("--provider", choices=["auto", "cpu", "coreml"], default="auto")
    parser.add_argument("--frames", type=int, default=120)
    parser.add_argument("--threshold", type=float, default=0.3)
    parser.add_argument("--images", type=Path)
    parser.add_argument("--video", type=Path)
    parser.add_argument("--label", default="timing on this machine")
    args = parser.parse_args()

    MODELS.mkdir(exist_ok=True)
    model_path = export(args.size)
    started = time.perf_counter()
    sess = session(model_path, args.provider)
    load_ms = (time.perf_counter() - started) * 1000
    inp = sess.get_inputs()[0]
    _, _, height, width = inp.shape
    names = [o.name for o in sess.get_outputs()]
    logits_index = next(i for i, n in enumerate(names) if "labels" in n)

    if args.images:
        frames, source = from_images(args.images), "images"
    elif args.video:
        frames, source = from_video(args.video, args.frames), "video"
    else:
        frames, source = synthetic(30), "synthetic"
    if not frames:
        raise SystemExit("No readable frames.")
    tensors = [to_tensor(f, height, width) for f in frames]

    for i in range(WARMUP):
        sess.run(None, {inp.name: tensors[i % len(tensors)]})
    times, ball_frames, best = [], 0, 0.0
    for i in range(args.frames):
        before = time.perf_counter()
        out = sess.run(None, {inp.name: tensors[i % len(tensors)]})
        times.append((time.perf_counter() - before) * 1000)
        if i < len(tensors):
            score = float(1 / (1 + math.exp(-float(out[logits_index][0, :, SPORTS_BALL].max()))))
            ball_frames += score >= args.threshold
            best = max(best, score)

    times.sort()
    print(json.dumps({
        "label": args.label,
        "host": {"machine": platform.machine(), "system": platform.system(), "processor": platform.processor()},
        "model": f"rfdetr_{args.size}",
        "onnx_mb": round(model_path.stat().st_size / 1e6, 1),
        "input": [height, width],
        "providers": sess.get_providers(),
        "source": source,
        "load_ms": round(load_ms),
        "median_ms": round(statistics.median(times), 1),
        "p95_ms": round(times[min(len(times) - 1, math.ceil(0.95 * len(times)) - 1)], 1),
        "ball_found": f"{ball_frames} of {min(args.frames, len(tensors))}",
        "best_ball_score": round(best, 2),
    }, indent=2))


if __name__ == "__main__":
    main()
