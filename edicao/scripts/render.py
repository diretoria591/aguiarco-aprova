#!/usr/bin/env python3
"""Render the edit: drop retakes, tighten pauses, add subtle hard-cut punch-in zooms.

Usage: python3 render.py VIDEO WORKDIR EDIT.json OUTPUT.mp4
EDIT.json:
{
  "cuts":  [[12.45, 14.0], ...],          # source-time ranges to remove (retakes, false starts)
  "start": 2.85, "end": 122.95,           # optional trim of head/tail
  "zooms": [[16.3, 18.5, "já foi muito difícil"], ...],  # source-time emphasis windows
  "zoom_amount": 0.05,                    # 5% punch-in; the client found 7-10% too much
  "anchor": [0.5, 0.42]                   # zoom centre as fraction of width/height (face)
}
Pauses longer than ~0.28 s between kept speech are shortened to ~0.2 s, which also
removes breaths (they sit below the speech threshold). Writes OUTPUT and WORKDIR/edit_audio.wav
for verification, and prints the zoom times on the output timeline.
"""
import json, os, shutil, subprocess, sys

video, wd, editf, out_path = sys.argv[1:5]
E = json.load(open(editf))
regs = json.load(open(os.path.join(wd, "regions.json")))
CUTS = [tuple(c[:2]) for c in E.get("cuts", [])]
START, END = E.get("start", 0.0), E.get("end", 1e9)
CUTS = [(0.0, START)] * (START > 0) + CUTS
PRE, POST, MAXGAP = 0.10, 0.10, 0.28

pieces_all = []
for a, b in regs:
    pieces = [(a, min(b, END))] if a < END else []
    for c0, c1 in CUTS:
        nxt = []
        for x, y in pieces:
            if y <= c0 or x >= c1:
                nxt.append((x, y))
            else:
                if x < c0: nxt.append((x, c0))
                if y > c1: nxt.append((c1, y))
        pieces = nxt
    pieces_all += [p for p in pieces if p[1] - p[0] > 0.05]

segs = []
for a, b in pieces_all:
    at_cut_a = any(abs(a - c1) < 1e-6 for _, c1 in CUTS)   # starts exactly at a cut: no pre-roll
    at_cut_b = any(abs(b - c0) < 1e-6 for c0, _ in CUTS)   # ends exactly at a cut: no post-roll
    s = a if at_cut_a else a - PRE
    e = b if at_cut_b else b + POST
    if segs and s - segs[-1][1] <= MAXGAP - PRE - POST and not at_cut_a:
        segs[-1][1] = e
    else:
        segs.append([max(0.0, s), e])
merged = []
for s, e in segs:
    if merged and s <= merged[-1][1]:
        merged[-1][1] = max(merged[-1][1], e)
    else:
        merged.append([s, e])
json.dump(merged, open(os.path.join(wd, "segments.json"), "w"))

fps = subprocess.check_output(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                               "stream=r_frame_rate", "-of", "csv=p=0", video]).decode().strip()
fps_f = eval(fps)
pd = os.path.join(wd, "parts"); shutil.rmtree(pd, ignore_errors=True); os.makedirs(pd)
# Cut each segment to its own intermediate at 1440 wide (or native if smaller): concatenating
# many 4K trims inside one filtergraph runs out of memory.
durs = []
for i, (s, e) in enumerate(merged):
    d = e - s; f = min(0.012, d / 3)
    fn = os.path.join(pd, f"p{i:03d}.mov")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{s:.3f}", "-i", video, "-t", f"{d:.3f}",
                    "-map", "0:v:0", "-map", "0:a:0",
                    "-vf", f"scale='min(1440,iw)':-2:flags=lanczos,fps={fps},format=yuv420p",
                    "-af", f"afade=t=in:d={f:.3f},afade=t=out:st={d - f:.3f}:d={f:.3f}",
                    "-c:v", "libx264", "-preset", "fast", "-crf", "12", "-c:a", "pcm_s16le", "-ar", "48000", fn], check=True)
    durs.append(float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", fn])))


def src2out(t):
    acc = 0.0
    for (s, e), d in zip(merged, durs):
        if t < s: return acc
        if t <= e: return acc + t - s
        acc += d
    return acc


amt = E.get("zoom_amount", 0.05); ax, ay = E.get("anchor", [0.5, 0.42])
terms = []
for z in E.get("zooms", []):
    a, b = src2out(z[0]) - 0.05, src2out(z[1]) + 0.15
    print(f"zoom {a:6.2f}-{b:6.2f} {z[2] if len(z) > 2 else ''}")
    terms.append(f"between(t,{a:.2f},{b:.2f})")
zexpr = f"1+{amt}*({'+'.join(terms)})" if terms else "1"
vf = (f"scale=w='trunc(1080*({zexpr})/2)*2':h='trunc(1920*({zexpr})/2)*2':eval=frame:flags=lanczos,"
      f"crop=1080:1920:x='(iw-1080)*{ax}':y='(ih-1920)*{ay}',setsar=1,format=yuv420p")
n = len(merged)
inputs = sum([["-i", os.path.join(pd, f"p{i:03d}.mov")] for i in range(n)], [])
fc = "".join(f"[{i}:v][{i}:a]" for i in range(n)) + f"concat=n={n}:v=1:a=1[cv][ca];[cv]{vf}[vo];[ca]asplit[ca1][ca2];" \
     "[ca1]loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[ao];[ca2]aresample=16000,aformat=channel_layouts=mono[aw]"
subprocess.run(["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", fc,
                "-map", "[vo]", "-map", "[ao]", "-r", fps, "-c:v", "libx264", "-preset", "slow", "-b:v", "9M",
                "-maxrate", "12M", "-bufsize", "18M", "-profile:v", "high", "-c:a", "aac", "-b:a", "192k",
                "-movflags", "+faststart", out_path,
                "-map", "[aw]", "-c:a", "pcm_s16le", os.path.join(wd, "edit_audio.wav")], check=True)
print(f"{n} segments, output {sum(durs):.1f}s -> {out_path}")
