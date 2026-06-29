# Slidev — CLI & Project Setup

Sources: https://sli.dev/builtin/cli and https://sli.dev/guide/install

## Create a project

```bash
npm create slidev@latest
# or
pnpm create slidev
yarn create slidev
bun create slidev
```

This scaffolds a project with `@slidev/cli` installed **locally** and the npm
scripts below. Do **not** rely on `npx slidev` (the package is `@slidev/cli`).

Try without installing: open the StackBlitz template at https://sli.dev.

## npm scripts (typical package.json)

```json
{
  "scripts": {
    "dev": "slidev --open",
    "build": "slidev build",
    "export": "slidev export"
  }
}
```

Pass extra flags through npm with `--`:

```bash
npm run dev -- --remote --port 8080 --open
```

## Commands

### `slidev [entry]` — dev server

Default entry: `slides.md`.

| Flag | Meaning |
|------|---------|
| `--port`, `-p` | port (default 3030) |
| `--open`, `-o` | open browser |
| `--remote [password]` | expose on network; optional password protects presenter |
| `--bind` | host to bind (with `--remote`) |
| `--theme`, `-t` | override theme |
| `--log` | log level |
| `--force`, `-f` | force Vite optimizer re-bundle |

### `slidev build [entry]` — static SPA

| Flag | Meaning |
|------|---------|
| `--out`, `-o` | output dir (default `dist`) |
| `--base` | base URL for sub-path hosting, e.g. `/talk/` (leading+trailing slash) |
| `--download` | include a downloadable PDF in the build |
| `--theme`, `-t` | override theme |
| `--without-notes` | strip speaker notes from output |

### `slidev export [...entry]` — PDF/PNG/PPTX/MD

Requires `playwright-chromium`: `npm i -D playwright-chromium`.

| Flag | Meaning |
|------|---------|
| `--output` | output filename |
| `--format` | `pdf` (default), `png`, `pptx`, `md` |
| `--range` | e.g. `1,6-8,10` |
| `--dark` | export dark variant |
| `--with-clicks` | one page per click step |
| `--with-toc` | add PDF outline |
| `--omit-background` | transparent background (PNG) |
| `--wait` | delay (ms) before capturing |
| `--timeout` | Playwright timeout (ms) |

Multiple decks: `slidev export slides1.md slides2.md`.

### `slidev format [entry]`

Normalizes/cleans the Markdown structure of the deck.

### `slidev theme eject [entry]`

Copies the current theme into your project for full customization.

| Flag | Meaning |
|------|---------|
| `--dir` | target directory |
| `--theme`, `-t` | theme to eject |

## Project layout

See themes-config.md for the full directory structure (`components/`, `layouts/`,
`public/`, `styles/`, `setup/`, `snippets/`, `vite.config.ts`, etc.).
