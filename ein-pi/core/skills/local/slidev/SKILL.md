---
name: slidev
description: Build, edit, and export developer presentations with Slidev (sli.dev), the Markdown + Vue slides framework. Use when creating or editing slides.md decks, configuring slide layouts/themes/animations, embedding code/diagrams/components, or exporting/deploying a Slidev presentation to PDF, PNG, PPTX, or a static site.
license: internal
metadata:
  author: samuhlo
---

# Slidev

Slidev (sli.dev) is a web-based presentation framework for developers. You write
slides in **Markdown** (`slides.md`), and it renders them with **Vue 3 + Vite +
UnoCSS**, with first-class support for code highlighting, diagrams, math,
interactive components, and click animations.

Requirement: **Node.js >= 20.12.0**. Package name is `@slidev/cli`.

## When to use this skill

- Scaffolding a new deck or editing an existing `slides.md`.
- Choosing/configuring layouts, themes, addons, or fonts.
- Adding code blocks (highlighting, Magic Move, TwoSlash, Monaco), diagrams
  (Mermaid), math (KaTeX/LaTeX), icons, or Vue components.
- Building click/motion/slide-transition animations.
- Exporting to PDF/PNG/PPTX or deploying a static SPA.

## Quickstart

```bash
npm create slidev@latest      # scaffold a project (interactive)
cd my-slides
npm install
npm run dev                   # dev server at http://localhost:3030 (add -- --open)
npm run build                 # static SPA into dist/
npm run export                # PDF (needs playwright-chromium installed)
```

Minimal `slides.md`:

```md
---
theme: seriph
title: My Talk
transition: slide-left
---

# My Talk
Subtitle text

<!-- speaker note for this slide -->

---
layout: two-cols
---

# Left column

::right::

# Right column
```

## Core model (read this first)

- **Slides are separated by `---`** on its own line, with blank lines around it.
- **Headmatter**: the YAML block at the very top of the file configures the whole
  deck (theme, title, fonts, transition…).
- **Frontmatter**: a YAML block right after a `---` separator configures that one
  slide (`layout`, `class`, `background`, `clicks`, `transition`…).
- **Notes**: an HTML comment `<!-- ... -->` at the end of a slide becomes the
  presenter note.
- Anything that isn't Markdown is treated as **HTML/Vue** — you can drop in Vue
  components and `v-*` directives anywhere.

## Reference index

Load the file that matches the task — don't read them all up front.

| Topic | File | Use when |
|-------|------|----------|
| Markdown & slide syntax | [references/syntax.md](references/syntax.md) | separators, headmatter/frontmatter, notes, importing slides, scoped CSS |
| CLI & project setup | [references/cli.md](references/cli.md) | create/dev/build/export/format/theme commands and flags |
| Built-in layouts | [references/layouts.md](references/layouts.md) | choosing `layout:` and its frontmatter props |
| Built-in components | [references/components.md](references/components.md) | Toc, Link, Arrow, VDrag, SlidevVideo, Youtube, etc. |
| Animations | [references/animations.md](references/animations.md) | `v-click`, `v-clicks`, `v-motion`, slide transitions |
| Code & diagrams | [references/code.md](references/code.md) | line highlighting, Magic Move, TwoSlash, Monaco, Mermaid, LaTeX, icons |
| Themes, addons, config | [references/themes-config.md](references/themes-config.md) | theme/addons frontmatter, fonts, directory structure, custom components/layouts |
| Export & deploy | [references/export-deploy.md](references/export-deploy.md) | PDF/PNG/PPTX export, static build, GitHub Pages/Netlify/Vercel |
| Presenter & navigation | [references/presenter.md](references/presenter.md) | presenter mode, views, keyboard shortcuts |

## Common pitfalls

- The `---` slide separator needs blank lines around it; otherwise it's parsed as
  an `<hr>` or YAML.
- Magic Move uses **four** backticks (`` ```` ``), not three.
- Global CSS leaks into the presenter UI — scope styles under `.slidev-layout` or
  per slide (see themes-config.md).
- Don't use `npx slidev`; install `@slidev/cli` locally and use npm scripts.
- Pass CLI flags through npm scripts with `--`: `npm run dev -- --port 8080`.
- Export needs `playwright-chromium` installed as a dev dependency.

Official docs: https://sli.dev/guide/
