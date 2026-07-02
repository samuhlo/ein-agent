# Slidev — Themes, Addons & Project Config

Sources: https://sli.dev/guide/theme-addon, https://sli.dev/custom/directory-structure,
https://sli.dev/custom/config-fonts

## Themes

Set in headmatter:

```yaml
---
theme: seriph
---
```

- Official/community themes: omit the `slidev-theme-` prefix (`seriph`,
  `default`, `apple-basic`, `bricks`, `shibainu`, `penguin`…).
- Local theme: relative/absolute path (`./my-theme`).
- Scoped package: full name (`@org/slidev-theme-name`).

On first run with a new theme you'll be prompted to install it, or install
manually: `npm i @slidev/theme-seriph`. Browse: https://sli.dev/resources/theme-gallery.

### Eject a theme to customize

```bash
slidev theme eject
```

Copies the theme into your project so you can edit its layouts/styles directly.

## Addons

```yaml
---
addons:
  - excalidraw
  - '@slidev/plugin-name'
---
```

Browse: https://sli.dev/resources/addon-gallery.

## Fonts

```yaml
---
fonts:
  sans: Roboto
  serif: Roboto Slab
  mono: Fira Code
  weights: '200,400,600'
  italic: false
  local: Helvetica Neue        # comma-list of locally available fonts
  provider: google             # google | coollabs | none
---
```

By default fonts load from Google Fonts via CDN; set `provider: none` for fully
local/offline decks.

## Directory structure

All folders are optional. Conventions:

| Path | Purpose |
|------|---------|
| `slides.md` | main entry (the deck) |
| `components/*.{vue,js,ts,jsx,tsx,md}` | custom components, **auto-imported** by name |
| `layouts/*.{vue,js,ts,jsx,tsx}` | custom layouts (use `layout: name`) |
| `public/` | static assets served at `/` and copied as-is to the build |
| `styles/index.{css,js,ts}` or `style.css` | global styles (UnoCSS + PostCSS) |
| `setup/*.ts` | setup hooks (e.g. `setup/shiki.ts`, `setup/main.ts`) |
| `snippets/` | reusable code snippets for `<<< @/snippets/...` imports |
| `index.html` | inject meta tags / scripts |
| `vite.config.ts` | extend Vite config |
| `uno.config.ts` | extend UnoCSS config |

### Important: style scoping

Global CSS in `styles/` also applies to the **presenter UI**. Scope your rules
under `.slidev-layout`, or use per-slide `<style>` blocks, to avoid leaking into
the presenter view.

## Custom layout example

`layouts/my-cover.vue`:

```vue
<template>
  <div class="slidev-layout my-cover">
    <slot />
  </div>
</template>
```

Use it: `layout: my-cover`.

## Custom component example

`components/Counter.vue` is auto-imported; use `<Counter :count="4" />` directly
in any slide. Slidev provides a global reactive context (`$slidev`, `$clicks`,
`$page`, `$nav`, `$renderContext`) accessible inside slides and components — e.g.
`{{ $slidev.nav.currentPage }}` / `{{ $clicks }}`.

## Setup hooks

Common files in `setup/`: `main.ts` (app setup), `shiki.ts` (highlighter themes),
`mermaid.ts`, `code-runners.ts`, `katex.ts`, `routes.ts`. Each `export default
defineXxxSetup(...)`.
