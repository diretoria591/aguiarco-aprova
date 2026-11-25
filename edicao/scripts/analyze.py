#!/usr/bin/env python3
"""Analyze a talking-head video: extract audio, find speech regions, transcribe each region.

Usage: python3 analyze.py VIDEO WORKDIR [--model large-v3]
Writes into WORKDIR: audio.wav, db.npy (10 ms loudness envelope), regions.json,
full.txt (whole-file transcript) and regions.txt (one line per speech region:
index, start-end, gap to previous region, text). Read regions.txt to decide the cuts.
"""
import argparse, json, os, subprocess, wave
import numpy as np

os.environ.setdefault("HF_HUB_DISABLE_XET", "1")  # Xet CDN is often blocked by egress proxies


def load_wav(path):
    w = wave.open(path)
    return np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768


def speech_regions(db, thr=-48, mingap=0.20, minlen=0.06):
    sp = db > thr
    regs, i, n = [], 0, len(sp)
    while i < n:
        if sp[i]:
            j = i
            while j < n and sp[j]:
                j += 1
            regs.append([i / 100, j / 100]); i = j
        else:
            i += 1
    merged = []
    for r in regs:
        if merged and r[0] - merged[-1][1] < mingap:
            merged[-1][1] = r[1]
        else:
            merged.append(r)
    return [r for r in merged if r[1] - r[0] >= minlen]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video"); ap.add_argument("workdir")
    ap.add_argument("--model", default="large-v3")
    ap.add_argument("--threshold", type=float, default=-48, help="dBFS above which a 10 ms frame counts as speech")
    a = ap.parse_args()
    os.makedirs(a.workdir, exist_ok=True)
    wav = os.path.join(a.workdir, "audio.wav")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", a.video, "-vn", "-ac", "1", "-ar", "16000", wav], check=True)
    x = load_wav(wav)
    n = len(x) // 160
    db = 20 * np.log10(np.sqrt((x[: n * 160].reshape(n, 160) ** 2).mean(1)) + 1e-9)
    np.save(os.path.join(a.workdir, "db.npy"), db)
    regs = speech_regions(db, a.threshold)
    json.dump(regs, open(os.path.join(a.workdir, "regions.json"), "w"))

    from faster_whisper import WhisperModel
    m = WhisperModel(a.model, device="cpu", compute_type="int8")
    segs, _ = m.transcribe(x, language="pt", condition_on_previous_text=False, beam_size=5)
    with open(os.path.join(a.workdir, "full.txt"), "w") as f:
        for s in segs:
            f.write(f"[{s.start:7.2f}-{s.end:7.2f}] {s.text.strip()}\n")
    # Per-region transcription: whisper tends to silently merge repeated phrases when it
    # sees them together, so transcribing each region alone exposes retakes much better.
    lines = []
    for k, (s, e) in enumerate(regs):
        clip = np.concatenate([np.zeros(8000, np.float32), x[int(max(0, s - 0.05) * 16000): int((e + 0.05) * 16000)], np.zeros(8000, np.float32)])
        out, _ = m.transcribe(clip, language="pt", condition_on_previous_text=False, beam_size=5)
        text = " ".join(o.text.strip() for o in out)
        gap = s - regs[k - 1][1] if k else 0.0
        peak = db[int(s * 100): int(e * 100)].max()
        lines.append(f"{k:3d} {s:7.2f}-{e:7.2f} gap {gap:5.2f} peak {peak:4.0f} | {text}")
        print(lines[-1], flush=True)
    open(os.path.join(a.workdir, "regions.txt"), "w").write("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
