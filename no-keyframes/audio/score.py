# /// script
# requires-python = ">=3.10"
# dependencies = ["numpy", "scipy", "librosa>=0.10", "soundfile"]
# ///
"""No Keyframes: the score, composed to the voice-over (scored to picture, not to a grid).

    MOTION_REEL_SKILL=<skill> uv run no-keyframes/audio/score.py      -> audio/music.wav

Every structural move sits on a spoken word from lyrics.json: the pad opens on "Claude", plucks
carry "motion graphics design", the bass climbs D-F-G-A under the four "No"s, the music cuts out
for "Oh, and don't forget", and the D minor of the whole piece resolves to D major on the last
"Code.". Hits and whooshes for the picture are sfx.mjs's job (HITS in film.js); this is the bed.
beats.json stays the film's pacing grid (contact sheets); nothing here is quantised to it.
"""
import json
import os
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

sys.path.insert(0, os.path.join(os.environ.get("MOTION_REEL_SKILL", ""), "scripts"))
from dsp import (SR, Bus, bass_note, crash, filt, hz, keys, kick, limit, pad_chord, pluck, reverb,  # noqa: E402
                 riser, seed, sub_drop, tvec)

FILM = Path(__file__).resolve().parents[1]
DUR = float(json.loads((FILM / "film.json").read_text())["duration"])
WORDS = [w for line in json.loads((FILM / "lyrics.json").read_text())["lines"] for w in line["words"]]


def wt(txt, near):
    """Start time of the spoken word `txt` nearest `near`."""
    c = [w for w in WORDS if w["w"].strip(".,?!—").lower() == txt.lower()]
    return min(c, key=lambda w: abs(w["t0"] - near))["t0"]


def wend(txt, near):
    c = [w for w in WORDS if w["w"].strip(".,?!—").lower() == txt.lower()]
    return min(c, key=lambda w: abs(w["t0"] - near))["t1"]


seed(424242)
B = 100  # Bus wants a tempo; every placement below is in seconds (at=)
pad, pulse, bass, keysb, drums, air = (Bus(DUR, B) for _ in range(6))


def put(bus, sig, t, gain=1.0, pan=0.0):
    bus.add(sig, 0, gain=gain, pan=pan, at=t)


def drone(note, length, fade_in=1.0, fade_out=1.5):
    """Sine + octave, slow swell: the floor of the void."""
    n = int(length * SR)
    t = tvec(n)
    f = hz(note)
    x = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * 2 * f * t + 0.7) + 0.12 * np.sin(2 * np.pi * 3 * f * t)
    env = np.clip(t / fade_in, 0, 1) ** 2 * np.clip((length - t) / fade_out, 0, 1)
    return x * env * (1 + 0.08 * np.sin(2 * np.pi * 0.21 * t))


def room(length, lo=300, hi=3000):
    """Filtered noise: air in the room, never silent."""
    n = int(length * SR)
    x = filt(filt(np.random.default_rng(7).standard_normal(n), "highpass", lo), "lowpass", hi)
    t = tvec(n)
    return x * np.clip(t / 0.8, 0, 1) * np.clip((length - t) / 1.2, 0, 1)


def bell(note, length=2.2):
    n = int(length * SR)
    t = tvec(n)
    f = hz(note)
    parts = [(1, 1.0, 1.2), (2.0, 0.35, 0.6), (3.01, 0.18, 0.35), (4.17, 0.08, 0.2)]
    x = sum(a * np.sin(2 * np.pi * f * r * t) * np.exp(-t / d) for r, a, d in parts)
    return x * (1 - np.exp(-t / 0.004))


# ---------------------------------------------------------------- the words that move the music
tClaude, tCode = wt("Claude", 1.4), wt("Code", 2.1)
tTo, tMotion, tGraphics, tDesign = wt("to", 2.4), wt("motion", 3.1), wt("graphics", 3.5), wt("design", 4.0)
tIm, tNot, tCreating, tAnything = wt("I'm", 5.2), wt("not", 5.4), wt("creating", 5.6), wt("anything", 6.3)
tAfter, tEffects = wt("After", 7.9), wt("Effects", 8.3)
tSlice = wend("Effects", 8.3) - 0.12
tThis, tInside, tCl2, tCo2, tSoEnd = wt("This", 8.8), wt("inside", 10.5), wt("Claude", 11.4), wt("Code", 11.8), wend("So", 11.9)
tNo = [wt("No", x) for x in (12.9, 14.6, 15.9, 17.5)]
tKeyEnd = wend("keyframes", 17.6)
tHow, tIncredible, tIsThis = wt("How", 19.0), wt("incredible", 19.5), wt("this", 20.3)
tOh, tForget = wt("Oh", 21.2), wt("forget", 21.9)
tThis2, tDone2, tNot2, tSkill = wt("this", 23.0), wt("done", 24.2), wt("not", 24.8), wt("skill", 25.3)
tBut, tPrompt = wt("but", 26.2), wt("prompt", 26.7)
tAnd, tCl3, tCo3 = wt("and", 27.5), wt("Claude", 28.4), wt("Code", 29.6)

# ---------------------------------------------------------------- 1. the void and CLAUDE CODE (0 - 2.4)
put(pad, drone("D1", tTo + 0.6, 1.2, 0.8), 0.0, 0.5)
put(air, room(DUR - 0.2), 0.0, 0.025)
put(pad, pad_chord(["D3", "A3", "C4", "E4"], tTo - tClaude + 0.9, (260, 1500), attack=0.5, release=0.6), tClaude - 0.25, 0.32)
put(pad, pad_chord(["D2", "A2"], tTo + 0.9, (200, 600), attack=1.4, release=0.8), 0.0, 0.22)

# ---------------------------------------------------------------- 2. motion graphics design: plucks (2.4 - 5.2)
arp = ["D5", "A4", "F4", "A4", "C5", "A4", "F4", "E4"]
step = 0.15
k = 0
t = tTo
while t < tIm - 0.15:
    lvl = 0.16 + 0.12 * min(1.0, (t - tTo) / 1.6)
    put(pulse, pluck([arp[k % len(arp)]], 0.26, 2600 + 900 * ((k % 4) == 0)), t, lvl, pan=0.35 * np.sin(k * 0.9))
    t += step
    k += 1
put(pad, pad_chord(["Bb2", "F3", "A3", "D4"], tDesign - tMotion + 0.2, (500, 1400), attack=0.15, release=0.3), tMotion - 0.05, 0.26)
put(pad, pad_chord(["F2", "C3", "A3", "E4"], tIm - tDesign + 0.1, (600, 1800), attack=0.08, release=0.15), tDesign - 0.02, 0.28)
put(bass, bass_note("D2", 1.0, 700), tMotion, 0.32)
put(bass, bass_note("Bb1", 0.9, 700), tGraphics, 0.3)
put(bass, bass_note("F1", 1.0, 800), tDesign, 0.34)

# ---------------------------------------------------------------- 3. I'M NOT CREATING ANYTHING / AFTER EFFECTS (5.2 - 8.7)
put(pad, pad_chord(["G2", "D3", "Bb3", "F4"], tAfter - tIm, (380, 900), attack=0.05, release=0.4), tIm - 0.02, 0.3)
for tt, note in ((tNot, "G1"), (tCreating, "G1"), (tAnything, "Bb1")):
    put(bass, bass_note(note, 0.7, 600), tt, 0.38)
    put(drums, kick(soft=True), tt, 0.5)
put(pad, pad_chord(["A2", "E3", "G3", "C4"], tSlice - tAfter + 0.1, (300, 1600), attack=0.2, release=0.08), tAfter - 0.05, 0.3)
put(bass, bass_note("A1", 0.6, 650), tAfter, 0.36)
put(bass, bass_note("A1", 0.5, 650), tEffects, 0.36)
put(drums, riser(tSlice - tAfter + 0.05), tAfter - 0.05, 0.22)

# ---------------------------------------------------------------- 4. after the cut: air, then INSIDE builds to the O (8.7 - 12.3)
put(pad, drone("D1", tInside - tSlice + 0.5, 0.3, 0.6), tSlice, 0.45)
put(pad, pad_chord(["D3", "F3", "A3"], tInside - tThis + 0.4, (240, 520), attack=0.6, release=0.5), tThis - 0.1, 0.2)
build = tSoEnd - tInside
put(pad, pad_chord(["D3", "G3", "A3", "D4"], build + 0.05, (300, 4200), attack=0.4, release=0.05), tInside - 0.05, 0.3)
put(drums, riser(build + 0.02), tInside, 0.3)
# an accelerating heartbeat into the O
beats = []
t, gap = tInside, 0.42
while t < tSoEnd - 0.05:
    beats.append(t)
    t += gap
    gap = max(0.07, gap * 0.8)
for i, tt in enumerate(beats):
    put(drums, kick(soft=True), tt, 0.32 + 0.3 * i / max(1, len(beats) - 1))
put(bass, bass_note("D2", 0.5, 500), tCl2, 0.34)
put(bass, bass_note("D2", 0.45, 600), tCo2, 0.36)

# ---------------------------------------------------------------- 5. the gallery: the bass climbs D F G A on the four "No"s (12.3 - 18.4)
chords = [["D3", "A3", "C4", "F4"], ["F2", "C3", "A3", "E4"], ["G2", "D3", "Bb3", "F4"], ["A2", "E3", "A3", "C#4"]]
roots = ["D1", "F1", "G1", "A1"]
for i, tt in enumerate(tNo):
    end = tNo[i + 1] if i < 3 else tKeyEnd + 0.05
    put(pad, pad_chord(chords[i], end - tt + 0.05, (500 + 300 * i, 1300 + 500 * i), attack=0.02, release=0.06), tt - 0.01, 0.3 + 0.03 * i)
    put(bass, bass_note(roots[i].replace("1", "2"), end - tt, 500 + 120 * i), tt, 0.4)
    put(bass, drone(roots[i], end - tt + 0.1, 0.02, 0.15), tt, 0.4)
    put(drums, kick(), tt, 0.62 + 0.06 * i)
# a ticking pulse underneath, tightening as it goes
t = tNo[0]
while t < tKeyEnd - 0.1:
    k = (t - tNo[0]) / (tKeyEnd - tNo[0])
    put(pulse, pluck(["A5"], 0.06, 5000), t, 0.05 + 0.07 * k, pan=0.5 * np.sin(t * 7))
    t += 0.15
# silence after the crack, a breath before "How"

# ---------------------------------------------------------------- 6. INCREDIBLE (19.4 - 21.0)
big = ["Bb1", "Bb2", "F3", "Bb3", "D4", "F4", "C5"]
put(pad, pad_chord(big, tOh - tIncredible + 0.3, (900, 3200), attack=0.03, release=0.5, voices=5), tIncredible - 0.01, 0.42)
put(bass, drone("Bb0", tOh - tIncredible, 0.02, 0.5), tIncredible, 0.55)
put(drums, sub_drop(1.4, 80, 28), tIncredible, 0.5)
put(drums, crash(2.0), tIncredible, 0.12)
put(keysb, bell("D6", 2.6), tIncredible + 0.02, 0.1, pan=0.3)

# ---------------------------------------------------------------- 7. "Oh, and don't forget": the music lets go (21.2 - 22.6)
put(keysb, bell("A5", 3.0), tOh, 0.08, pan=-0.2)
put(pad, drone("D2", 2.2, 0.4, 1.2), tOh - 0.1, 0.18)

# ---------------------------------------------------------------- 8. light returns: keys (22.9 - 25.8)
put(keysb, keys(["D4", "F4", "A4", "E5"], 2.0), tThis2, 0.3)
put(keysb, keys(["Bb3", "D4", "F4", "C5"], 1.6), tDone2, 0.28)
put(keysb, keys(["C4", "E4", "G4", "D5"], 1.4), tSkill, 0.28)
put(pad, pad_chord(["D3", "A3", "E4"], tBut - tThis2 + 0.3, (220, 900), attack=1.6, release=0.4), tThis2 - 0.2, 0.2)

# ---------------------------------------------------------------- 9. the prompt types; PROMPT (25.8 - 27.4)
t, k = tSkill + 0.5, 0
typing = ["D5", "F5", "A5", "C6", "A5", "F5"]
while t < tPrompt - 0.04:
    put(pulse, pluck([typing[k % len(typing)]], 0.12, 4200), t, 0.1 + 0.1 * (t - tSkill - 0.5), pan=0.4 * np.sin(k))
    t += max(0.06, 0.13 - 0.008 * k)
    k += 1
put(drums, riser(tPrompt - tSkill - 0.4), tSkill + 0.4, 0.2)
put(pad, pad_chord(["F2", "C3", "A3", "C4", "G4"], tCl3 - tPrompt + 0.4, (800, 2400), attack=0.04, release=0.5), tPrompt - 0.01, 0.34)
put(bass, bass_note("F1", 1.4, 500), tPrompt, 0.42)
put(drums, kick(), tPrompt, 0.5)

# ---------------------------------------------------------------- 10. finale: CLAUDE ... CODE. resolves to D major (27.5 - end)
put(pad, pad_chord(["G2", "D3", "Bb3", "E4"], tCl3 - tAnd + 0.2, (500, 1500), attack=0.4, release=0.2), tAnd - 0.05, 0.28)
put(pad, pad_chord(["A2", "E3", "G3", "C#4", "E4"], tCo3 - tCl3 + 0.05, (600, 3400), attack=0.1, release=0.04), tCl3 - 0.02, 0.32)
put(bass, bass_note("A1", tCo3 - tCl3, 500), tCl3, 0.4)
put(drums, kick(), tCl3, 0.45)
put(drums, riser(tCo3 - tCl3 - 0.1), tCl3 + 0.1, 0.26)
tail = DUR - tCo3
put(pad, pad_chord(["D2", "A2", "D3", "F#3", "A3", "D4", "F#4", "A4"], tail, (1400, 500), attack=0.02, release=2.2, voices=5), tCo3 - 0.01, 0.46)
put(bass, drone("D1", tail, 0.02, 2.4), tCo3, 0.6)
put(drums, sub_drop(1.8, 90, 30), tCo3, 0.55)
put(drums, crash(3.0), tCo3, 0.14)
put(keysb, bell("F#5", 3.4), tCo3 + 0.03, 0.12, pan=-0.25)
put(keysb, bell("A5", 3.4), tCo3 + 0.06, 0.09, pan=0.25)

# ---------------------------------------------------------------- mix the bed
n = int(DUR * SR)
mix = np.zeros((2, n))
for b, g in ((pad, 1.0), (pulse, 0.9), (bass, 0.95), (keysb, 0.9), (drums, 1.0), (air, 1.0)):
    mix += g * b.x[:, :n]
mix = reverb(mix, wet=0.28, length=2.4, decay=0.7)
mix = np.stack([filt(ch, "highpass", 28) for ch in mix])
# fade the very end to silence
t = tvec(n)
mix *= np.clip((DUR - t) / 0.6, 0, 1)
peak = np.abs(mix).max()
mix = limit(mix / peak * 10 ** (-6 / 20), ceiling_db=-3.0)
out = FILM / "audio" / "music.wav"
sf.write(out, mix.T, SR, subtype="FLOAT")
print(f"-> {out}  ({DUR:.2f} s)")
