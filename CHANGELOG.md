# Changelog

All notable changes to EDGE-Infinity are documented in this file.

## [1.2.0] - 2026-09-24

### Fixed
- **Timer bug**: elapsed time used to start counting from page load; now starts only when the session begins.
- Timer display uses `MM:SS` and shows estimated total duration.

### Changed
- Instruction selection is **weighted by difficulty** (mode): higher difficulty favors edge / prostate / intensity tags.
- **Fleshlight option** now filters messages (fleshlight-tagged lines only appear when enabled).
- Anti-repeat: avoids consecutive identical lines; recent tag diversity soft-penalty.
- Go/Stop rhythm is no longer strict alternate-only; slight chaos + mode bias.
- Session length variance scales with difficulty (harder → tighter around selected minutes).
- Finish-phase voice playback when allowed / denied.

### Added
- Message tag map (`messageTags`) for option-aware random selection.

## [1.1.0] - 2026-09-24

### Changed
- Deploy target: Cloudflare Pages (`edge-infinity.pages.dev`).
- Entry file: only `EDGE7/index.html` (from former index7).
- Commit author bound to GitHub user **KOKACODA**.

### Fixed
- Audio preload counts matched real files (go=21, stop=11, finish=9).

### Added
- `VERSION` + `CHANGELOG.md`.
- Caching `_headers`.

## [1.0.0] - 2026-09-24

### Added
- Initial import from upstream EDGE static site.
