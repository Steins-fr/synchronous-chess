# Sounds

The files of the sounds the games play (`SOUND_FILES` and `SOUND_LOOPS` of `services/sound/sound-files.ts`), played on the
sound lab (`/sound-lab`) too. All of them are under the
[CC0 license](https://creativecommons.org/publicdomain/zero/1.0/): free to use without credit.

- `card-*.mp3`, `chips-*.mp3`: [Casino Audio](https://kenney.nl/assets/casino-audio) by Kenney, converted from Ogg Vorbis
  (which older versions of Safari do not decode) to mono at 48 kHz
- `gunshot-black-powder.mp3`, `revolver-cock.mp3`: the 5th shot of
  [44_black_powder.wav](https://freesound.org/people/Jon285/sounds/34708/) by Jon285, a Rogers & Spencer black powder
  revolver, and its hammer cocked before it, in mono at 48 kHz, cut, faded out and leveled to the other sounds
- `bullet-*.mp3`: five clicks of [Revolver reloading_2](https://freesound.org/people/o_ciz/sounds/475420/) by o_ciz, in mono at
  48 kHz, cut and leveled
- `spin.mp3`: made of the clicks of
  [Revolver Cylinder Spin - Remington 1875](https://freesound.org/people/Guy_Personface/sounds/795313/) by Guy_Personface,
  in mono at 48 kHz: the cylinder slowing down to a click every 50 ms for 0.8 second, then two turns at that speed, the
  same seamless loop of 1.2 seconds (24 clicks) twice
- `dryfire.mp3`: the hammer falling of a dry fire of [Revolver Dryfire](https://freesound.org/people/AugustSandberg/sounds/508745/)
  by AugustSandberg, a Ruger GP100, in mono at 48 kHz (from 96 kHz), cut and leveled

## Encoding

Each sound was edited as a WAV file (16-bit PCM, mono, 48 kHz), then encoded once to MP3, which every browser decodes: mono
at 48 kHz, 96 kbit/s constant, by LAME (`libmp3lame` of FFmpeg), into a file and not a pipe, for the encoder to write its
gapless header (the Xing/LAME frame telling the delay and the padding of the encoder, which a browser cuts):

```bash
ffmpeg -i card-shuffle.wav -c:a libmp3lame -b:a 96k -ac 1 -ar 48000 -map_metadata -1 -fflags +bitexact \
  -flags:a +bitexact card-shuffle.mp3
```

`spin.mp3` was built of two WAV files: the start of the spin (`spin-start.wav`, 0.8 second, ending where the loop starts),
then the loop of a turn (`spin-idle.wav`, 1.2 seconds) twice, joined as PCM then encoded once, for the signal to run on
across them:

```bash
ffmpeg -i spin-start.wav -i spin-idle.wav -i spin-idle.wav \
  -filter_complex '[0:a][1:a][2:a]concat=n=3:v=0:a=1[a]' -map '[a]' \
  -c:a libmp3lame -b:a 96k -ac 1 -ar 48000 -map_metadata -1 -fflags +bitexact -flags:a +bitexact spin.mp3
```

The game plays it from its start, then loops 1.2 seconds taken across the two turns (`loopStart` and `loopEnd` of
`SOUND_LOOPS`), away from the edges of the file, where a browser ignoring the gapless header adds its silence.
