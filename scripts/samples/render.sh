#!/bin/bash
# Stage 2: normalize, trim leading silence, cut tail with fade-out, encode MP3.
# Usage: render.sh <work_dir> <out_dir>
set -euo pipefail
WORK="$1"; OUT="$2"
FF=/opt/homebrew/bin/ffmpeg
TARGET=-1.0   # dBFS peak of the loudest pieces (kick, snare)

# name  length_s  fade_s  trim_dB
# trim_dB lowers quieter/timekeeping voices below TARGET so that, at equal
# channel volume, the kit balance is musically sensible (based on measured
# momentary loudness, EBU R128 M, of the peak-normalized versions).
SPEC=(
"kick          0.9  0.30   0"
"snare         1.0  0.40   0"
"cross-stick   0.6  0.25  -4"
"hihat-closed  0.5  0.15  -3"
"hihat-pedal   0.6  0.20  -8"
"hihat-open    2.0  1.20  -5"
"tom-1         1.2  0.50  -1"
"tom-2         1.2  0.50  -2"
"floor-tom     1.2  0.50  -1"
"ride          2.5  1.30  -2"
"crash         2.5  1.50  -2"
)

peak_of() { "$FF" -hide_banner -nostats -i "$1" -af volumedetect -f null - 2>&1 | awk '/max_volume/{print $5}'; }

encode() { # in out gain len fade thr
  local fst; fst=$(awk -v l="$4" -v f="$5" 'BEGIN{printf "%.3f", l - f}')
  local af="volume=${3}dB,silenceremove=start_periods=1:start_threshold=${6}dB:detection=peak:window=0.0005:start_silence=0.0005,asetpts=N/SR/TB,atrim=end=${4},afade=t=out:st=${fst}:d=${5}:curve=tri"
  "$FF" -hide_banner -loglevel error -y -i "$1" -af "$af" -ac 1 -ar 44100 -c:a libmp3lame -b:a 128k "$2"
}

for line in "${SPEC[@]}"; do
  read -r name len fade trim <<< "$line"
  in="$WORK/$name-mix.wav"; out="$OUT/$name.mp3"
  want=$(awk -v t="$TARGET" -v tr="$trim" 'BEGIN{printf "%.2f", t + tr}')
  thr=$(awk -v w="$want" 'BEGIN{printf "%.1f", w - 45}')   # onset gate 45 dB under peak
  src=$(peak_of "$in")
  gain=$(awk -v w="$want" -v p="$src" 'BEGIN{printf "%.2f", w - p}')
  encode "$in" "$out" "$gain" "$len" "$fade" "$thr"
  # second pass: correct for peak change caused by the tail cut / MP3 encoding
  got=$(peak_of "$out")
  gain=$(awk -v g="$gain" -v w="$want" -v p="$got" 'BEGIN{printf "%.2f", g + (w - p)}')
  encode "$in" "$out" "$gain" "$len" "$fade" "$thr"
  echo "$name: src_peak=${src}dB gain=${gain}dB target_peak=${want}dB final_peak=$(peak_of "$out")dB len=${len}s fade=${fade}s"
done
