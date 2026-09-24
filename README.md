# EDGE-Infinity

Static interactive web app, hosted on **Cloudflare Pages**.

- **Version:** see [`VERSION`](./VERSION)
- **Changelog:** see [`CHANGELOG.md`](./CHANGELOG.md)
- **Live (Pages):** https://edge-infinity.pages.dev

## Structure

| Path | Role |
|------|------|
| `EDGE7/` | Pages output root (HTML / CSS / JS / audio) |
| `EDGE7/index.html` | App entry (from original index7) |
| `wrangler.toml` | Cloudflare Pages config |
| `VERSION` / `CHANGELOG.md` | Version management |

## Local preview

```bash
npx wrangler pages dev EDGE7
```

## Deploy

```bash
npx wrangler pages deploy EDGE7 --project-name=edge-infinity
```

Upstream concept: [Herbert-HUXK/EMP_ForMe_V2](https://github.com/Herbert-HUXK/EMP_ForMe_V2)
