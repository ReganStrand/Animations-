# Animations-
Text animations

## No Keyframes (`no-keyframes/`)

A 33.5 s kinetic typography film cut to Regan's voice memo: *"This is me using Claude Code to do some
motion graphics design. I'm not creating anything from After Effects…"* Every frame is rendered from
code: a three.js world (mirror floor, studio light, volumetric beams, extruded Anton type) composited
into a canvas film that is a pure function of time. No keyframes.

- **Deliverables:** `out/no-keyframes/final.mp4` (16:9) and `final_9x16.mp4` (vertical), 1080p, 24 fps,
  -14 LUFS; `final_nomusic*.mp4` carry voice + SFX only, for laying a different track.
- **Look:** Regan Strand brand: Anton + Inter, off-white `#F0ECE4` on near-black `#0C0D0E`, tally red
  `#E22822` as the one accent, no blue.
- **Sync:** words are forced-aligned to the voice (`no-keyframes/lyrics.json`, median 14 ms from the
  audio onsets) and every on-screen word and accent is timed from those word times.

### Rebuild

```sh
npm install                                   # three, opentype.js, playwright (uses the system Chromium)
SKILL=<path to the motion-reel skill>
bash no-keyframes/tools/vo.sh                 # clean the memo -> audio/vo.wav ("Okay," cut)
uv run no-keyframes/tools/align_ps.py no-keyframes          # word times -> lyrics.json
MOTION_REEL_SKILL=$SKILL uv run no-keyframes/audio/score.py # the score -> audio/music.wav
node $SKILL/scripts/sfx.mjs no-keyframes                    # SFX from the film's hit list
node $SKILL/scripts/render.mjs --film no-keyframes --fps 24 --format 16x9 --video-only
node $SKILL/scripts/render.mjs --film no-keyframes --fps 24 --format 9x16 --video-only
node $SKILL/scripts/mix.mjs no-keyframes --music-db -2 --sfx-db -1   # master + mux the finals
```

Open `no-keyframes/index.html` through any static server (from the repo root) to scrub it live:
space plays, arrows step, `?format=9x16` previews the vertical cut.

### Where things live

| file | what |
|------|------|
| `no-keyframes/film.js` | the film: 13 shots as stations in one world, camera paths, captions, end card, hit list |
| `no-keyframes/lib/stage.js` | the 3-D engine: renderer, tone curve, floor, light, dust, beams, glyphs |
| `no-keyframes/audio/score.py` | the score, composed to the word times |
| `no-keyframes/docs/shotlist.md` | the approved shot list |
| `no-keyframes/docs/critique.md` | three review rounds and what each fixed |
