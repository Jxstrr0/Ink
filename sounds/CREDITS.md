# Sound credits

UI sounds played by `src/sound/synth.js` (`UI_SOUNDS`): a tap on tabs and buttons, and a chime when a toast shows. They load after the first tap on every tier (about 30 KB). The tattoo machine buzz is synthesised, not recorded. Ink only uses CC0 or CC-BY sounds, never NC or ND, or Kelbo's own original work.

| File | Sound | Author | Licence | Source | Changes for Ink |
|---|---|---|---|---|---|
| `tap.wav` | `select_002.ogg` from Interface Sounds (1.0) | Kenney (www.kenney.nl) | CC0 1.0 | [OpenGameArt, uploaded by Kenney](https://opengameart.org/content/interface-sounds) | converted to mono 44.1 kHz 16-bit WAV with ffmpeg |
| `toast.wav` | `confirmation_001.ogg` from Interface Sounds (1.0) | Kenney (www.kenney.nl) | CC0 1.0 | [OpenGameArt, uploaded by Kenney](https://opengameart.org/content/interface-sounds) | converted to mono 44.1 kHz 16-bit WAV with ffmpeg |

kenney.nl itself was not reachable from the build machine; the same pack is mirrored on OpenGameArt by Kenney, with its CC0 licence file. Freesound needs a login, so nothing is taken from it yet.

## Ambience, sound effects and radio (0.1.23.0)

Played by `src/sound/synth.js` (`AMB_ROOMS`, `AMB.rain`, `SFX`, `RADIO`). All are original work, made by Kelbo with ElevenLabs (sound effects and music generation), 2026-11, levelled to mono mp3 (ambience at -30 LUFS, effects at -20 LUFS, radio at -18 LUFS).

| File | Sound | Made by | Date |
|---|---|---|---|
| `amb-back.mp3` | Arkady's back room: quiet room tone, a distant tattoo machine (24 s loop) | Kelbo with ElevenLabs (sound effects generation), original work | 2026-11 |
| `amb-chair.mp3` | a busy shop: several machines, murmur (24 s loop) | Kelbo with ElevenLabs (sound effects generation), original work | 2026-11 |
| `amb-studio.mp3` | your own studio: quiet room tone (24 s loop) | Kelbo with ElevenLabs (sound effects generation), original work | 2026-11 |
| `amb-legacy.mp3` | an established, busier studio (24 s loop) | Kelbo with ElevenLabs (sound effects generation), original work | 2026-11 |
| `amb-rain.mp3` | rain on a window (24 s loop, layered on top) | Kelbo with ElevenLabs (sound effects generation), original work | 2026-11 |
| `sfx-peel.mp3` | stencil paper peeled off the skin | Kelbo with ElevenLabs (sound effects generation), original work | 2026-11 |
| `sfx-glove.mp3` | a nitrile glove snapped on | Kelbo with ElevenLabs (sound effects generation), original work | 2026-11 |
| `sfx-wipe.mp3` | a spray bottle and a paper-towel wipe | Kelbo with ElevenLabs (sound effects generation), original work | 2026-11 |
| `sfx-ink.mp3` | an ink cap clicked open, drops into a cup | Kelbo with ElevenLabs (sound effects generation), original work | 2026-11 |
| `sfx-door.mp3` | a shop door bell and the door | Kelbo with ElevenLabs (sound effects generation), original work | 2026-11 |
| `sfx-till.mp3` | a cash drawer, notes and coins | Kelbo with ElevenLabs (sound effects generation), original work | 2026-11 |
| `sfx-paper.mp3` | a sheet of drawing paper | Kelbo with ElevenLabs (sound effects generation), original work | 2026-11 |
| `sfx-reveal.mp3` | a soft whoosh into a warm guitar chord | Kelbo with ElevenLabs (sound effects generation), original work | 2026-11 |
| `sfx-goal.mp3` | a short upbeat guitar sting | Kelbo with ElevenLabs (sound effects generation), original work | 2026-11 |
| `sfx-tray.mp3` | a machine set down on a steel tray | Kelbo with ElevenLabs (sound effects generation), original work | 2026-11 |
| `radio-1.mp3` | shop radio: laid-back surf rockabilly, instrumental (90 s) | Kelbo with ElevenLabs (music generation), original work | 2026-11 |
| `radio-2.mp3` | shop radio: late-night lo-fi, instrumental (90 s) | Kelbo with ElevenLabs (music generation), original work | 2026-11 |
