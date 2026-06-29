# Slidev — Markdown & Slide Syntax

Source: https://sli.dev/guide/syntax

## Slide separators

Slides are divided by `---` on its own line, with **blank lines before and after**.

```md
# Slide 1
Content

---

# Slide 2
More content
```

Without the surrounding blank lines, `---` is interpreted as YAML frontmatter or an `<hr>`.

## Headmatter (deck-wide config)

The **first** YAML block in the file configures the whole presentation.

```md
---
theme: seriph
title: Welcome to Slidev
titleTemplate: '%s - Slidev'
transition: slide-left
highlighter: shiki
lineNumbers: false
drawings:
  persist: false
mdc: true          # enable MDC (Markdown Components) syntax
fonts:
  sans: Roboto
  mono: Fira Code
---

# First slide
```

Common headmatter keys: `theme`, `addons`, `title`, `info`, `author`, `keywords`,
`transition`, `background`, `class`, `highlighter`, `lineNumbers`, `colorSchema`
(`light`/`dark`/`auto`), `routerMode`, `aspectRatio`, `canvasWidth`, `fonts`,
`mdc`, `drawings`, `selectable`.

## Frontmatter (per-slide config)

A YAML block immediately after a `---` separator configures that single slide.

```md
---
layout: center
background: /background-1.png
class: text-white
transition: fade
clicks: 5
---

# This slide is centered
```

Useful per-slide keys: `layout`, `class`, `background`, `backgroundSize`,
`transition`, `clicks`, `clicksStart`, `hide`, `hideInToc`, `level`, `src`,
`zoom`, `name`, `dragPos`, plus any props the chosen layout accepts.

### Alternative frontmatter delimiter

You can use `---` ... `---` even for the first slide if you also want a separator,
or use the YAML-less form. To set frontmatter on the first slide while keeping
headmatter separate, headmatter applies to slide 1 by default.

## Speaker notes

The **last** HTML comment in a slide becomes the presenter note (supports Markdown
and HTML inside).

```md
# Slide title

Visible content.

<!--
These are speaker notes.
- Bullet works
[click] markers can highlight notes per click
-->
```

`[click]` markers inside notes highlight portions in sync with click animations.

## Code blocks

Standard fenced blocks are highlighted by Shiki. See `code.md` for highlighting,
Magic Move, TwoSlash, and Monaco.

````md
```ts
console.log('Hello, World!')
```
````

## Importing slides (split a big deck)

Reuse external Markdown files via the `src` frontmatter — the imported file's
headmatter is ignored; each `---` inside it becomes additional slides.

```md
---
src: ./pages/chapter1.md
---

---
src: ./pages/chapter2.md
hide: false
---
```

This is the idiomatic way to keep a large presentation modular.

## MDC syntax (inline styling)

With `mdc: true` in headmatter you can attach classes/attributes inline:

```md
This is [red text]{style="color:red"} and a span.

![image](/img.png){width=300px}
```

## Scoped styles per slide

Add a `<style>` block inside a slide; it is automatically scoped to that slide.

```md
# Styled slide

<style>
h1 { color: #2b90b6; }
</style>
```

For global styles use a `styles/` entry (see themes-config.md), and scope under
`.slidev-layout` to avoid leaking into the presenter UI.

## Multiple entries

You can pass multiple Markdown files to the CLI, or import them with `src`. The
first file's headmatter wins for deck-wide config.
