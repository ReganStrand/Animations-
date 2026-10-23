#!/usr/bin/env bash
# Clean the voice memo into the VO stem: mono-sum, hum/whine notches, light denoise, presence,
# de-ess, gentle compression, -18 LUFS (mix.mjs lifts the VO and masters the film to -14).
# The opening "Okay," (0.81-1.18 s in the memo) is cut in the silence before "this" (1.49 s):
# the memo from 1.40 s on starts at film time 0.40 s, i.e. everything moves 1.00 s earlier.
set -euo pipefail
cd "$(dirname "$0")/../audio"
ffmpeg -hide_banner -loglevel error -y -i vo/source.m4a -af "aresample=48000,pan=mono|c0=0.5*c0+0.5*c1,highpass=f=70:poles=2,equalizer=f=83:t=q:w=8:g=-14,equalizer=f=2374:t=q:w=12:g=-14,lowpass=f=15500:poles=2,afftdn=nr=10:nf=-62:tn=1,equalizer=f=180:t=q:w=1:g=-1.5,equalizer=f=4200:t=q:w=1.2:g=1.5,deesser=i=0.35:m=0.5:f=0.5,acompressor=threshold=-26dB:ratio=2.5:attack=6:release=90:makeup=1,loudnorm=I=-18:TP=-2:LRA=11:linear=true,aresample=48000,atrim=start=1.40,asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.03,adelay=400:all=1" -ar 48000 -ac 2 -c:a pcm_s24le vo.wav
echo "-> audio/vo.wav"
