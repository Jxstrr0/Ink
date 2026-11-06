# Sound credits

UI sounds played by `src/sound/synth.js` (`UI_SOUNDS`): a tap on tabs and buttons, and a chime when a toast shows. They load after the first tap on every tier (about 30 KB). The tattoo machine buzz is synthesised, not recorded. Ink only uses CC0 or CC-BY sounds, never NC or ND.

| File | Sound | Author | Licence | Source | Changes for Ink |
|---|---|---|---|---|---|
| `tap.wav` | `select_002.ogg` from Interface Sounds (1.0) | Kenney (www.kenney.nl) | CC0 1.0 | [OpenGameArt, uploaded by Kenney](https://opengameart.org/content/interface-sounds) | converted to mono 44.1 kHz 16-bit WAV with ffmpeg |
| `toast.wav` | `confirmation_001.ogg` from Interface Sounds (1.0) | Kenney (www.kenney.nl) | CC0 1.0 | [OpenGameArt, uploaded by Kenney](https://opengameart.org/content/interface-sounds) | converted to mono 44.1 kHz 16-bit WAV with ffmpeg |

kenney.nl itself was not reachable from the build machine; the same pack is mirrored on OpenGameArt by Kenney, with its CC0 licence file. Freesound needs a login, so nothing is taken from it yet.
