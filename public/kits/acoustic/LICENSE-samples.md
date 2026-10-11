# Drum sample licensing

All 11 samples in this folder come from one acoustic kit, **Big Rusty Drums** by
Karoryfer Samples. It is an early-1980s Szpaderski kit (Poland) with Sabian cymbals,
all recorded in the same session with the same close mics and overhead pair.

| | |
|---|---|
| Source repository | https://github.com/sfzinstruments/karoryfer.big-rusty-drums |
| Pinned commit | `f07ce00df34a46b6b08375be56fe116cf15782bc` (2023-04-29) |
| License | **CC0 1.0 Universal (public domain dedication)** |
| License file | https://github.com/sfzinstruments/karoryfer.big-rusty-drums/blob/main/LICENSE |
| Publisher statement | https://shop.karoryfer.com/pages/free-samples |
| Attribution required | **No** (CC0) |

## Evidence

The repository's `LICENSE` file is the full CC0 legal code. Its first lines are
"Creative Commons Legal Code / CC0 1.0 Universal". GitHub's license detection
also reports `"spdx_id": "CC0-1.0"`. The waiver clause reads: "Affirmer hereby
overtly, fully, permanently, irrevocably and unconditionally waives, abandons,
and surrenders all of Affirmer's Copyright and Related Rights ... in the Work".

Karoryfer's free-samples page lists "Big Rusty Drums : 1980s drum kit made in
Poland" and says: "All our free sample libraries are under a Creative Commons
Zero license. Older downloads may include a less permissive license, but we
changed that and now they are all CC0."

## Courtesy credit (optional, not required)

> Drum samples: "Big Rusty Drums" by Karoryfer Samples, CC0 1.0
> (https://github.com/sfzinstruments/karoryfer.big-rusty-drums)

## Per-file sources

Raw URL prefix:
`https://raw.githubusercontent.com/sfzinstruments/karoryfer.big-rusty-drums/f07ce00df34a46b6b08375be56fe116cf15782bc/`

Each output is a mono mix of that hit's simultaneous mic channels. The stereo
overhead pair (`oh`) was folded to mono first. The mic gains come from the kit's
own default program, `Programs/02-basic.sfz`. All files use round-robin 1 (`rr1`).

| Output | Kit piece / articulation | Source files (mic: linear gain) |
|---|---|---|
| `kick.mp3` | 24"x18" kick, pedal, dampened, velocity layer 11/14 | `Samples/kick_24/kick/kick/k_vl11_rr1.flac` (kick mic: 0.787), `Samples/kick_24/kick/oh/k_vl11_rr1.flac` (OH: 0.25, 300 Hz high-pass) |
| `snare.mp3` | 14"x8" snare, center hit, layer 8/10 | `Samples/snare_14/center/btm/sn_center_vl8_rr1.flac` (0.787), `Samples/snare_14/center/top/sn_center_vl8_rr1.flac` (0.315), `Samples/snare_14/center/oh/sn_center_vl8_rr1.flac` (0.472) |
| `cross-stick.mp3` | 14"x8" snare, sidestick, layer 3/4 | `Samples/snare_14/sidestick/btm/sn_ss_vl3_rr1.flac` (0.787), `Samples/snare_14/sidestick/top/sn_ss_vl3_rr1.flac` (0.315), `Samples/snare_14/sidestick/oh/sn_ss_vl3_rr1.flac` (0.472) |
| `hihat-closed.mp3` | 14" Sabian HHX Evolution, tight-closed tip hit (the kit's own key-42 sound), layer 6/8 | `Samples/hihat_14/tc/cl/ht_tc_vl6_rr1.flac` (0.551), `Samples/hihat_14/tc/oh/ht_tc_vl6_rr1.flac` (0.551) |
| `hihat-pedal.mp3` | 14" hi-hat, foot chik, layer 4/5 | `Samples/hihat_14/chik/cl/ht_chik_vl4_rr1.flac` (0.551), `Samples/hihat_14/chik/oh/ht_chik_vl4_rr1.flac` (0.551) |
| `hihat-open.mp3` | 14" hi-hat, fully open tip hit, layer 5/6 | `Samples/hihat_14/open/cl/ht_open_vl5_rr1.flac` (0.551), `Samples/hihat_14/open/oh/ht_open_vl5_rr1.flac` (0.551) |
| `tom-1.mp3` | 14"x14" rack tom (high), center hit, layer 5/6 | `Samples/tom_14/center/cl/t14_vl5_rr1.flac` (0.787), `Samples/tom_14/center/oh/t14_vl5_rr1.flac` (0.551) |
| `tom-2.mp3` | 15"x15" rack tom (low), center hit, layer 6/7 | `Samples/tom_15/center/cl/t15_vl6_rr1.flac` (0.787), `Samples/tom_15/center/oh/t15_vl6_rr1.flac` (0.551) |
| `floor-tom.mp3` | 18"x16" floor tom, center hit, layer 6/8 | `Samples/tom_18/center/cl/t18_vl6_rr1.flac` (0.787), `Samples/tom_18/center/oh/t18_vl6_rr1.flac` (0.551) |
| `ride.mp3` | 22" Sabian Big & Ugly King ride, bow, layer 7/10 | `Samples/ride_22/rd/cl/rd_vl7_rr1.flac` (0.189), `Samples/ride_22/rd/oh/rd_vl7_rr1.flac` (0.472) |
| `crash.mp3` | 17" Sabian AAX V-Crash, edge, layer 4/5 | `Samples/crash_17/cr/cl/cr_vl4_rr1.flac` (0.220), `Samples/crash_17/cr/oh/cr_vl4_rr1.flac` (0.551) |

## Processing

These changes were made with ffmpeg 7.1.1. Like the source, the derived files
carry no license obligations.

- Mic mix as listed above, then mono, 44.1 kHz, MP3 CBR 128 kbps (libmp3lame).
- Leading-silence gate (`silenceremove`, peak detection, 45 dB below peak). The
  source files already start on the transient, so nothing audible was removed.
- Tail cut with a linear fade-out. Length / fade: kick 0.9/0.3 s, snare 1.0/0.4 s,
  cross-stick 0.6/0.25 s, toms 1.2/0.5 s, closed hat 0.5/0.15 s, pedal hat
  0.6/0.2 s, open hat 2.0/1.2 s, ride 2.5/1.3 s, crash 2.5/1.5 s.
- Peak level: kick and snare at -1 dBFS. The other pieces are trimmed lower so the
  kit is balanced when every channel is at the same volume. Trims: cross-stick -4,
  closed hat -3, pedal hat -8, open hat -5, tom-1 -1, tom-2 -2, floor tom -1,
  ride -2, crash -2 dB. They were chosen from EBU R128 momentary loudness.
