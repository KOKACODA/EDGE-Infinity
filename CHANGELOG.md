# Changelog

## [1.4.0] - 2026-09-24

### Changed
- **Audio matching (做法 B)**: each line carries a short `audioIdx` as the last field.
  - `go`: `[text, durationSec, fps, audioIdx]` → `audio/go/go_{audioIdx}.wav`
  - `stop`: `[text, durationSec, audioIdx]` → `audio/stop/stop_{audioIdx}.wav`
  - `finish`: `[text, durationSec, color, fps, audioIdx]` → `audio/finish/finish_{audioIdx}.wav`
- Array order no longer has to match file numbers; only the last number matters.
- **On-demand audio**: clips load when first played and are cached; no bulk preload at page open.

### Added
- `getAudioIdx` / `getFps` helpers in `game.js`.

## [1.3.0] - 2026-09-24

### Added
- `messages.json` + `game.js` + `game.css` split.
- 18+ gate, emergency stop, session remain time, phase markers.
- `images.go/stop/finish` placeholders.

## [1.2.0] - 2026-09-24

### Fixed
- Timer starts only after session begin.

### Changed
- Weighted random by mode / fleshlight.

## [1.1.0] - 2026-09-24

### Changed
- Cloudflare Pages; single entry HTML.

## [1.0.0] - 2026-09-24

### Added
- Initial import.
