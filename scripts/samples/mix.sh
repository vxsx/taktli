#!/bin/bash
# Stage 1: mix the close/overhead mic files of each kit piece into one mono
# float WAV, using the mic balance from Big Rusty Drums' own default program
# (Programs/02-basic.sfz: set_ccN/127 * amplitude_ccN/100).
# Usage: mix.sh <raw_dir> <work_dir>
set -euo pipefail
RAW="$1"; WORK="$2"
FF=/opt/homebrew/bin/ffmpeg

# name | comma-separated list of  relpath:gain:channels[:hpf_hz]
SPEC=(
"kick|Samples/kick_24/kick/kick/k_vl11_rr1.flac:0.787:1,Samples/kick_24/kick/oh/k_vl11_rr1.flac:0.25:2:300"
"snare|Samples/snare_14/center/btm/sn_center_vl8_rr1.flac:0.787:1,Samples/snare_14/center/top/sn_center_vl8_rr1.flac:0.315:1,Samples/snare_14/center/oh/sn_center_vl8_rr1.flac:0.472:2"
"cross-stick|Samples/snare_14/sidestick/btm/sn_ss_vl3_rr1.flac:0.787:1,Samples/snare_14/sidestick/top/sn_ss_vl3_rr1.flac:0.315:1,Samples/snare_14/sidestick/oh/sn_ss_vl3_rr1.flac:0.472:2"
"hihat-closed|Samples/hihat_14/tc/cl/ht_tc_vl6_rr1.flac:0.551:1,Samples/hihat_14/tc/oh/ht_tc_vl6_rr1.flac:0.551:2"
"hihat-pedal|Samples/hihat_14/chik/cl/ht_chik_vl4_rr1.flac:0.551:1,Samples/hihat_14/chik/oh/ht_chik_vl4_rr1.flac:0.551:2"
"hihat-open|Samples/hihat_14/open/cl/ht_open_vl5_rr1.flac:0.551:1,Samples/hihat_14/open/oh/ht_open_vl5_rr1.flac:0.551:2"
"tom-1|Samples/tom_14/center/cl/t14_vl5_rr1.flac:0.787:1,Samples/tom_14/center/oh/t14_vl5_rr1.flac:0.551:2"
"tom-2|Samples/tom_15/center/cl/t15_vl6_rr1.flac:0.787:1,Samples/tom_15/center/oh/t15_vl6_rr1.flac:0.551:2"
"floor-tom|Samples/tom_18/center/cl/t18_vl6_rr1.flac:0.787:1,Samples/tom_18/center/oh/t18_vl6_rr1.flac:0.551:2"
"ride|Samples/ride_22/rd/cl/rd_vl7_rr1.flac:0.189:1,Samples/ride_22/rd/oh/rd_vl7_rr1.flac:0.472:2"
"crash|Samples/crash_17/cr/cl/cr_vl4_rr1.flac:0.220:1,Samples/crash_17/cr/oh/cr_vl4_rr1.flac:0.551:2"
)

for line in "${SPEC[@]}"; do
  name="${line%%|*}"; parts="${line#*|}"
  args=(); fc=""; labels=""; i=0
  IFS=',' read -ra items <<< "$parts"
  for it in "${items[@]}"; do
    IFS=':' read -r rel gain ch hpf <<< "$it"
    args+=(-i "$RAW/$rel")
    chain="[$i:a]"
    if [ "$ch" = "2" ]; then chain+="pan=mono|c0=0.5*c0+0.5*c1,"; fi
    if [ -n "${hpf:-}" ]; then chain+="highpass=f=$hpf:poles=2,"; fi
    chain+="volume=$gain[m$i];"
    fc+="$chain"; labels+="[m$i]"; i=$((i+1))
  done
  fc+="${labels}amix=inputs=$i:duration=longest:normalize=0,aformat=sample_fmts=flt:sample_rates=44100:channel_layouts=mono[out]"
  "$FF" -hide_banner -loglevel error -y "${args[@]}" -filter_complex "$fc" -map "[out]" -c:a pcm_f32le "$WORK/$name-mix.wav"
  echo "mixed $name"
done
