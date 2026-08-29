# Slidev — Export & Deploy

Sources: https://sli.dev/guide/exporting, https://sli.dev/guide/hosting

## Export (PDF / PNG / PPTX / Markdown)

Install the headless browser first:

```bash
npm i -D playwright-chromium
```

```bash
slidev export                      # -> slides-export.pdf
slidev export --format png         # one PNG per slide
slidev export --format pptx        # slides as images; notes included
slidev export --format md          # markdown with embedded PNGs
```

Common options:

| Option | Use |
|--------|-----|
| `--output my-deck` | output filename |
| `--range 1,6-8,10` | only these slides |
| `--with-clicks` | one page per click step |
| `--dark` | dark variant |
| `--with-toc` | PDF outline/bookmarks |
| `--omit-background` | transparent PNG background |
| `--wait 1000` | delay (ms) before capture |
| `--timeout 60000` | raise Playwright timeout |

Notes: in PPTX, slides are exported as images (text not selectable); presenter
notes are attached per slide. Export multiple decks: `slidev export a.md b.md`.

You can also export from the running app via the dev server / browser print, but
the CLI is the reliable path.

## Build a static SPA

```bash
slidev build                       # -> dist/
slidev build --base /talks/my-talk/   # for sub-path hosting (lead+trail slash)
slidev build --download            # embeds a downloadable PDF
slidev build --without-notes       # strip speaker notes from output
```

Serve `dist/` on any static host. Single-page app → configure SPA fallback to
`index.html`.

## GitHub Pages (Actions)

`.github/workflows/deploy.yml`:

```yaml
name: Deploy pages
on:
  push:
    branches: [main, master]
permissions:
  contents: read
concurrency:
  group: pages
  cancel-in-progress: false
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 'lts/*' }
      - run: npm i -g @antfu/ni
      - run: nci
      - run: nr build --base /${{ github.event.repository.name }}/
      - uses: actions/configure-pages@v4
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }
  deploy:
    permissions: { pages: write, id-token: write }
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    needs: build
    runs-on: ubuntu-latest
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

In repo Settings → Pages, set Source = "GitHub Actions". URL:
`https://<user>.github.io/<repo>/`.

## Netlify

`netlify.toml`:

```toml
[build]
publish = 'dist'
command = 'npm run build'

[build.environment]
NODE_VERSION = '20'

[[redirects]]
from = '/*'
to = '/index.html'
status = 200
```

## Vercel

`vercel.json`:

```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```
