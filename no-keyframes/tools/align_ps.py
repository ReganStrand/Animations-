# /// script
# requires-python = ">=3.10"
# dependencies = ["pocketsphinx>=5", "numpy", "soundfile", "librosa>=0.10", "scipy"]
# ///
"""Word + phone timing for the voice-over: pocketsphinx forced alignment (its bundled en-us model,
no downloads) of docs/lyrics.txt against audio/vo.wav, window by window.

    uv run no-keyframes/tools/align_ps.py no-keyframes      -> no-keyframes/lyrics.json

Same sheet format and output shape as the motion-reel align.py (which needs the MMS_FA weights):
lyrics.json {lines: [{text, section, t0, t1, words: [{w, t0, t1, score, phones: [[ph, t0, t1], ...]}]}]}
Prints word starts against the voice's own onsets as a check.
"""
import json
import re
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from pocketsphinx import Decoder
from scipy.signal import resample_poly

EXTRA = {"keyframes": "K IY F R EY M Z", "workstation": "W ER K S T EY SH AH N"}


def spoken(word):
    if "|" in word:
        return word.split("|", 1)[1].replace("_", " ").split()
    return [x for x in re.sub(r"[^a-z' ]", " ", word.lower().replace("—", " ")).split() if x]


film = Path(sys.argv[1])
y, sr = sf.read(film / "audio" / "vo.wav", dtype="float32")
y = y.mean(axis=1) if y.ndim > 1 else y
g = np.gcd(int(sr), 16000)
y16 = resample_poly(y, 16000 // g, int(sr) // g)
y16 = y16 / (np.abs(y16).max() + 1e-9) * 0.7
pcm = (y16 * 32767).astype(np.int16)

def decoder():
    # a fresh decoder per window: reusing one across set_alignment() passes crashes pocketsphinx 5
    d = Decoder(samprate=16000, bestpath=False, loglevel="ERROR")
    for w, p in EXTRA.items():
        if d.lookup_word(w) is None:
            d.add_word(w, p, False)
    return d

windows, cur = [], None
for raw in (film / "docs" / "lyrics.txt").read_text().splitlines():
    s = raw.strip()
    if not s or s.startswith("#"):
        continue
    if s.startswith("@"):
        p = s.split(maxsplit=3)
        cur = {"t0": float(p[1]), "t1": float(p[2]), "section": p[3] if len(p) > 3 else f"w{len(windows)+1}", "lines": []}
        windows.append(cur)
    else:
        cur["lines"].append(s)

out = []
for win in windows:
    seg = pcm[int(win["t0"] * 16000):int(win["t1"] * 16000)].tobytes()
    display, toks = [], []
    for li, line in enumerate(win["lines"]):
        for word in line.split():
            pieces = spoken(word)
            if pieces:
                display.append((li, word.split("|")[0], len(pieces)))
                toks.extend(pieces)
    dec = decoder()
    dec.set_align_text(" ".join(toks))
    dec.start_utt(); dec.process_raw(seg, full_utt=True); dec.end_utt()
    dec.set_alignment()
    dec.start_utt(); dec.process_raw(seg, full_utt=True); dec.end_utt()
    # copy out to plain tuples at once: alignment entries must not outlive their decoder (segfault)
    al = [(w.name, w.start, w.duration, w.score, [(ph.name, ph.start, ph.duration) for ph in w])
          for w in dec.get_alignment() if w.name not in ("<s>", "</s>", "<sil>") and not w.name.startswith("+")]
    del dec
    if len(al) != len(toks):
        sys.exit(f"window {win['section']}: aligned {len(al)} words for {len(toks)} tokens")
    k = 0
    lines = [{"text": " ".join(w.split("|")[0] for w in l.split()), "section": win["section"], "words": []} for l in win["lines"]]
    for li, word, n in display:
        ws = al[k:k + n]; k += n
        phones = [[ph, round(win["t0"] + a / 100, 3), round(win["t0"] + (a + n_) / 100, 3)] for w in ws for ph, a, n_ in w[4]]
        lines[li]["words"].append({"w": word, "t0": round(win["t0"] + ws[0][1] / 100, 3),
                                   "t1": round(win["t0"] + (ws[-1][1] + ws[-1][2]) / 100, 3),
                                   "score": int(sum(w[3] for w in ws)), "phones": phones})
    for L in lines:
        L["t0"], L["t1"] = L["words"][0]["t0"], L["words"][-1]["t1"]
        crushed = sum(1 for w in L["words"] if w["t1"] - w["t0"] < 0.05)
        print(f"{L['t0']:7.2f}-{L['t1']:7.2f} [{L['section']}] " + " ".join(f"{w['w']}@{w['t0']:.2f}" for w in L["words"]) + (f"  <- check: {crushed} crushed" if crushed >= 2 else ""))
        out.append(L)

# Refine starts after a pause: the aligner lets a word's first phone soak up the silence before
# it (the "this" after the cut started 80 ms early). Move such a start to where the voice's
# 10 ms energy first rises 15 dB over the floor, if that is within 150 ms.
hop = int(0.01 * sr)
rms = np.array([np.sqrt(np.mean(y[i:i + hop] ** 2)) for i in range(0, len(y) - hop, hop)])
db = 20 * np.log10(rms + 1e-9)
floor = np.percentile(db, 10)
prev_end = -1.0
for L in out:
    for w in L["words"]:
        if w["t0"] - prev_end > 0.05:
            i0 = int(max(w["t0"] - 0.03, 0) * 100)
            hits = np.nonzero(db[i0:i0 + 18] > floor + 15)[0]
            if len(hits):
                t_on = round((i0 + hits[0]) / 100, 3)
                if 0.005 < t_on - w["t0"] <= 0.15:
                    print(f"  refined {w['w']}: {w['t0']:.2f} -> {t_on:.2f}")
                    w["t0"] = t_on
        prev_end = w["t1"]
    L["t0"] = L["words"][0]["t0"]

(film / "lyrics.json").write_text(json.dumps({"source": "docs/lyrics.txt aligned to audio/vo.wav (pocketsphinx en-us forced alignment)", "lines": out}, indent=1))

import librosa
yv, svr = librosa.load(film / "audio" / "vo.wav", sr=22050, mono=True)
env = librosa.onset.onset_strength(y=yv, sr=svr, hop_length=110)
on = librosa.onset.onset_detect(onset_envelope=env, sr=svr, hop_length=110, backtrack=True, units="time", delta=0.05)
d = np.array([on[np.argmin(np.abs(on - w["t0"]))] - w["t0"] for L in out for w in L["words"]])
print(f"word starts vs voice onsets: median {np.median(d)*1000:+.0f} ms, {np.mean(np.abs(d) < 0.06)*100:.0f}% within 60 ms ({len(d)} words)")
print(f"-> {film}/lyrics.json ({len(out)} lines)")
