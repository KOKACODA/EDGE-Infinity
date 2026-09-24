# Changelog

All notable changes to EDGE-Infinity are documented in this file.

## [1.1.0] - 2026-09-24

### Changed
- Deploy target switched from Cloudflare Workers Assets to **Cloudflare Pages** (`edge-infinity.pages.dev`).
- Site entry is now only `EDGE7/index.html` (content from former `index7.html`).
- Removed unused `index7.html` and previous duplicate `index.html`.
- Commit author fixed to GitHub account **KOKACODA** (noreply email bound to user id).
- Project config uses `wrangler.toml` with `pages_build_output_dir = "EDGE7"`.

### Fixed
- Audio preload loop counts matched real file counts (go=21, stop=11, finish=9).

### Added
- `VERSION` and `CHANGELOG.md` for version management.
- Optimized `_headers` (long-cache audio/css/js, short-cache HTML).

## [1.0.0] - 2026-09-24

### Added
- Initial import from KOKACODA/EDGE with Cloudflare static hosting setup.
