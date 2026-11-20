# Local review — track language labels

Audio and subtitle labels use readable language names and preserve the existing playback inputs.

- Date: 2026-11-20
- Scope: #260, six web files and the corresponding audio, subtitle and staging checks
- Product diff: `0e90652` and `fec3aeb` against `origin/main` at `2f90cf1`

## Findings and verification

| Finding | Disposition |
|---|---|
| Unrecognized tags could acquire a fabricated name with region or script qualifiers | Use the internationalization formatter's native no-name fallback and preserve the original code. The unit test includes `qaa-Latn-US`. |
| Runtime locale data could label the Bihari language group as Bhojpuri | Preserve the group code and cover both forms in the fallback test. |
| Native locale aliases can label Tagalog as Filipino and Twi as Akan | Keep Tagalog and Twi distinct for their two- and three-letter codes. The unit test checks all four languages. |
| The two codes for French can produce the same option label | The dialog test verifies that `fre` and `fra` retain separate option values and that the selected value reaches playback. |
| The fallback and inspection steps needed to be explicit | Audio and subtitle specs and the Pi checklist record the display contract, fallback order and playback index check. |
| Audio tracks with the same raw code already resolve to the first matching track | Existing audio selection behavior. Track with [#157](https://github.com/benoit-bremaud/popcorntv/issues/157), which covers duplicate audio labels. |

## Checks

- Adversarial review: round 1 on `0e90652` and verification on `fec3aeb` found no mandatory fixes. The second review requested a more precise test description for distinct codes sharing a label.
- Design, documentation and test reviews: scoped to the changed files. Source inspection confirmed that labels do not affect the subtitle URL or the serialized audio index.
- Web package: 489 tests passed, including the label fallback, subtitle attributes and audio selection. TypeScript passed.
- Signed merge gate and deployed native-menu verification: pending.
