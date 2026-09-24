# Changelog

## [1.3.0] - 2026-09-24

### Added
- `messages.json` — all copy, tags, phase texts, `images.go/stop/finish` placeholders, audio counts.
- `game.js` — session logic (random, timer, phases, emergency stop).
- `game.css` — dark mobile-first UI.
- **18+ age gate** (localStorage remember).
- **Emergency stop** button + `Esc` key; stops audio, progress, noSleep.
- **Cooldown tip** after stop / end.
- Session progress bar with **elapsed / remaining / target** time.
- **Phase markers**: 热身 → 加速 → 最终 → 结束.

### Changed
- Removed game logic from `minimize-js.js` (libs only: jQuery / Bootstrap / selectpicker).
- Entry HTML rebuilt for structure + a11y (`aria-live` on messages).

### Notes for media
- Put image/video URLs into `messages.json` → `images.go` / `images.stop` / `images.finish` arrays.
- Background switches via `showBg(phase)` when arrays are non-empty.

## [1.2.0] - 2026-09-24

### Fixed
- Timer started only after session begin; MM:SS display.

### Changed
- Weighted random by mode / fleshlight; anti-repeat.

## [1.1.0] - 2026-09-24

### Changed
- Cloudflare Pages deploy; single `index.html` entry.

## [1.0.0] - 2026-09-24

### Added
- Initial static site import.
