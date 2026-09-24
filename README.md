# EDGE-Infinity

Adult 18+ static interactive session tool on **Cloudflare Pages**.

- **Live:** https://edge-infinity.pages.dev
- **Version:** see `VERSION`
- **Changelog:** see `CHANGELOG.md`

## Structure

| Path | Role |
|------|------|
| `EDGE7/messages.json` | Copy, tags, image URL placeholders |
| `EDGE7/game.js` | Game logic |
| `EDGE7/game.css` | Dark mobile UI |
| `EDGE7/minimize-js.js` | jQuery + Bootstrap only |
| `EDGE7/audio/` | Voice clips aligned by index |

## Add background media later

Edit `messages.json`:

```json
"images": {
  "go": ["https://.../a.jpg"],
  "stop": ["https://.../b.jpg"],
  "finish": ["https://.../c.jpg"]
}
```

## Deploy

```bash
npx wrangler pages deploy EDGE7 --project-name=edge-infinity
```
