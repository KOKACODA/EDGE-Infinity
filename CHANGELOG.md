# Changelog

## [1.7.1] - 2026-09-25

### Fixed
- **Finish phase when cum=0**: previously skipped `finish` lines and voice, only showed `gameover.nocum*`.
  Now picks from **red (deny) finish** messages, plays `finish_{audioIdx}.wav`, then appends gameover notes.
- Allow path still uses green finish lines + voice.

### Docs
- Added `DOCS-结构说明.md` (Chinese structure guide for manual edits, images/video formats).

## [1.7.0] - 2026-09-24

- 主人留音 separate table page; UI scale; larger type/progress.

## [1.6.0] – [1.0.0]

See git history.
