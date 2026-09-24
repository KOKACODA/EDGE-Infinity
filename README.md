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

## Audio ↔ text (做法 B)

Last number on each line is the wav index (not the array position):

- go: `[text, seconds, fps, audioIdx]` → `audio/go/go_{audioIdx}.wav`
- stop: `[text, seconds, audioIdx]` → `audio/stop/stop_{audioIdx}.wav`
- finish: `[text, seconds, color, fps, audioIdx]` → `audio/finish/finish_{audioIdx}.wav`

Audio is loaded on demand when a line is shown.

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
