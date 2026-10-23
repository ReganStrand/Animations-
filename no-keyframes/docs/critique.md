# No Keyframes: critique log

Pre-critique build passes (no scores): horizon seam from the tone curve's toe, muddy type, reflections
too wobbly, the prompt line colliding with CLAUDE, graphite AFTER EFFECTS unreadable on black, the
camera passing over station C, the CLAUDE CODE wall lost in fog and off-axis for the O dive, the end
card printed over CLAUDE CODE, portrait framing of wide words (wider portrait lens, thinner fog).

## Round 1
| hook | read | motion | variety | brand | sync | min |
|  6   |  7   |   8    |    7    |   9   |  8   |  6  |

Worst three (most damaging first):
1. [0-1.4 s, both] Frame 0 is a small red cursor in a mostly black frame; nothing stops a thumb until
   CLAUDE breaks the floor at 1.4 s. -> Open as a macro on the cursor (camera 1.6 m from it), the typed
   words big beside it, trucking with the cursor, then a fast pull-back that reveals CLAUDE rising.
2. [2.4-8.3 s, phone sheets] Supporting Inter words read too small on the phone pages: "to do some",
   "from", and the end card's PRODUCER / CREATIVE DIRECTOR. -> world heights 0.56 -> 0.85 and
   0.64 -> 0.95; end card label 34 -> 40 px.
3. [22.2-25.2 s] Four contact frames of the same dark frame with a caption: the light returns too
   slowly to read as an event. -> Light cues on the words: a beam snaps on at "this" (23.0) and a
   second at "done" (24.2), each with a low clunk, so the stage is visibly set for SKILL.

Also: impact rings on the top-down shot still read as circles (0.14 -> 0.08); the whip lands 0.2 s
before MOTION slides in, on an empty frame (land it on "motion").
Sync (sync.py): 24/41 hits within 20 ms, median 10.7 ms; every word-locked hit (the four NOs, NOT,
MOTION/GRAPHICS/DESIGN, INCREDIBLE, CODE) within 5 ms; the outliers are whooshes/risers/swells that
peak or end on the hit by design, and the end-card sub (soft onset under the held chord).
Checks failed: none of the banned defaults; longest gap without a new event 22.2-23.0 (0.8 s).
Verdict: ANOTHER ROUND

## Round 2
| hook | read | motion | variety | brand | sync | min |
|  8   |  8   |   7    |    8    |   9   |  8   |  7  |

Fixed from round 1: frame 0 is now a macro of the glowing cursor, the typed words big, a pull-back
reveal at "Claude"; supporting words enlarged; stage-light cues on "this" and "done" (two beams strike
on, with clunks); the cursor glides between characters (no ghost cursor under motion blur).

Worst three (most damaging first):
1. [19.3-19.9, 2.4-3.1, 11.7-12.3, the list trucks; both] The fastest moves strobe at full size: six
   sub-frames draw six stepped copies (IBLE flying in past the lens shows them plainly). -> samples(t):
   14 inside the fast windows (pull-back, whip, swoop, slice, dive, the four trucks and stamps,
   INCREDIBLE's fly-in, PROMPT's rise), 6 elsewhere.
2. [8.8-10.4, 16x9] After the slice the push is sparse: a caption pinned high, red slivers at the
   bottom edge, three near-identical contact frames. -> hold the camera on the red-hot halves sinking
   into the mirror (tilt down, slower push), caption centred and larger, then tilt up to INSIDE.
3. [25.1-25.3] "this is all done not by a" still overlaps the S of SKILL as it forms. -> fade the
   caption out 0.3 s before "skill" instead of across it.
Checks failed: none. Longest gap without a new event: 9.3-10.4 (1.1 s).
Verdict: ANOTHER ROUND

## Round 3
| hook | read | motion | variety | brand | sync | min |
|  9   |  8   |   9    |    8    |   9   |  9   |  8  |

Fixed from round 2: 14 sub-frames inside the fast windows (the INCREDIBLE fly-in, whip, dive and the
list trucks now streak instead of strobing); the post-slice push holds on the red-hot halves sinking
into the mirror with the caption clear of them; the SKILL caption is gone before the S forms.
Sound: impacts that landed on their own words (NOT, the wall, the four NOs, "incredible", the last
"Code.") keep their low thud on the word and move the crash wash just after it, so the accent never
masks the word; bed -2 dB, SFX -1 dB. Voice over the ducked bed in the speech band (300-4000 Hz):
median 21 dB, 10th percentile 8 dB, never below it. Mix -14.1 LUFS, -1.3 dBTP.
Sync (sync.py): 26/45 hits within 20 ms, median 8.7 ms; every word-locked hit within 4 ms.

Remaining (not blocking): "Oh, and don't forget" fades up 0.3 s while INCREDIBLE is still sinking
(brief overlap); the whip lands one frame before MOTION enters; in 9:16 the far constellation
words overlap each other near the top of the finale.
Checks failed: none. Longest gap without a new event: 9.9-10.4 (0.5 s). End card holds 2.7 s.
Verdict: READY
