---
name: readme-style
description: README generator style for Samuhlo's projects: Swiss Grid Brutalism aesthetic, controlled-vandal margin notes, numbered sections, and portfolio metadata block. Load when generating or refreshing a project README.
license: internal
---

# README Style — Swiss Grid Brutalism

Generates a brutalist README from code analysis: sharp architecture table, controlled-chaos
features, core-logic snippet, and portfolio metadata block.

## When to load

Load this skill when the user asks to generate, refresh, or review a project README.
Do NOT load for generic doc tasks — only for README generation.

## Core philosophy

_"Arquitecturas sólidas como el hormigón, fluidas como el agua. Código limpio + caos
controlado."_

**Aesthetic:** Swiss Grid Brutalism (strict order) meets controlled vandalism (margin notes,
glitches, cyberpunk/anime/ignorant-art culture).

## Analysis checklist (do this first)

Read and analyze the code directly — do not ask for a description. Run this checklist
before writing:

1. **Read the vibe** — immersive (WebGL/GSAP-heavy) vs clean SaaS architecture. Calibrate
   tagline and `_note:` placement.
2. **Extract the DNA** — fill the architecture table only with technologies actually found
   in the code. No filler, no invented rows.
3. **Find the magic** — locate the file with the heaviest logic or most complex animation
   for the `CORE_LOGIC` snippet. No boilerplate.
4. **Don't invent** — no database section if there's no DB, no motion section if there's
   no motion. Omit cleanly.
5. **Stay in character** — every word should sound like Samuel wrote it at 2am after
   shipping something he's proud of.
6. **Resolve repo/live URLs** from `package.json`, git remotes, deploy config
   (`vercel.json`, `nuxt.config`, `netlify.toml`).

## Writing style

- Technical, self-assured, direct — with an edgy, sci-fi narrative undercurrent.
  Terminal/bash terminology where natural.
- Samuel's own voice: not a tool describing a project, but an architect presenting
  a blueprint.

## Markdown rules (non-negotiable)

- **H1**: project name as a script run → `# <code>./[PROJECT_NAME].sh</code>`.
- **Section headers**: uppercase, numbered, double-slash → `## // 00_ SECTION_NAME`.
- **`_note:`**: in key sections, a blockquote in italics — an honest margin note about
  a creative decision, a broken rule, or the hardest technical challenge. Not a brand
  label, a style mark.
- **Stack table**: columns `LAYER | TECH | IMPLEMENTATION DETAIL`.
- **Separators**: `___` between major sections.
- **Header & footer**: centered with `<div align="center">`.

## Master template (use this exact structure)

`````markdown
<div align="center">
  <br />
  <h1><code>./[PROJECT_NAME_UPPERCASE].sh</code></h1>

**[TAGLINE: one sharp sentence defining the visual + technical impact]**
<br />

[![Live](https://img.shields.io/badge/LIVE_DEMO-FFCA40?style=for-the-badge&logo=vercel&logoColor=black)]([DEMO_URL])
[![Status](https://img.shields.io/badge/STATUS-PRODUCTION-0C0011?style=for-the-badge)]([REPO_URL])

  <br />
</div>

---

## // 00_ THE_MISSION

[1–2 paragraphs: what is this and why does it exist? Don't say "application" —
 say "ecosystem", "experience", "architecture".]

> _note: [biggest creative challenge or the rule you chose to break.]_

---

## // 01_ THE_BLUEPRINT (ARCHITECTURE)

| LAYER      | TECH          | IMPLEMENTATION DETAIL                           |
| :--------- | :------------ | :---------------------------------------------- |
| **Core**   | `[Framework]` | [e.g. Nuxt 4 SSR + Composition API]             |
| **Motion** | `[Anim Lib]`  | [e.g. GSAP ScrollTrigger + Lenis]               |
| **Styles** | `[CSS/UI]`    | [e.g. Tailwind CSS v4 (custom brand config)]    |
| **State**  | `[Store]`     | [e.g. Pinia (setup pattern)]                    |

---

## // 02_ CONTROLLED_CHAOS (KEY FEATURES)

[3 key features — always at the intersection of code and design/UX.]

- **[Feature 1]:** [how visual fluidity was achieved]
- **[Feature 2]:** [micro-interactions, SVG drawing, hover logic]
- **[Feature 3]:** [optimization, state, or backend architecture]

---

## // 03_ CORE_LOGIC (SNIPPET)

[1-line intro: why this block is the dark magic / architectural core.]

```[language]
// [FILEPATH]
[RELEVANT CODE — complex logic, shaders, GSAP timelines, custom hooks only. No boilerplate.]
```

---

<div align="center">
<br />

<code>DESIGNED & CODED BY <a href='https://github.com/samuhlo'>samuhlo</a></code>

<small>Lugo, Galicia</small>

</div>
`````

## Portfolio metadata block

Append this HTML comment block at the very end (it feeds Samuhlo's portfolio backend —
derive every field from the code, never invent):

````text
<!--
PORTFOLIO:METADATA — DO NOT EDIT MANUALLY
====================================================================
title: [clean project title, no decorations]
tagline_en: [max 2-3 words]
tagline_es: [max 2-3 words — rewrite, not literal translation]
description_en: [150–200 chars: what it is + what makes it technically interesting]
description_es: [150–200 chars — rewrite, not translate]
tech_stack: [tech1, tech2, ...]  (every meaningful tech, no versions, comma-separated)
primary_tech: [single dominant framework/language, no version — Vue, Nuxt, React, Astro]
main_img_url: [absolute/raw-GitHub URL of the main screenshot; look in nuxt.config/index.html/app.vue/public]
images_url: [additional images, one per line]
repo_url: [full HTTPS repo URL]
live_url: [full HTTPS live URL, blank if not deployed]
year: [4-digit; from package.json/git/current year]
post_url: [optional blog/article URL]
blog_url: [optional docs/blog URL]
====================================================================
-->
````

## Visibility marker

In the final report, flag the visibility question for the parent to relay to the user:
_"¿Quieres que este proyecto aparezca en tu portfolio? (sí/no)"_.

- If **no** → append `<!-- portfolio:hidden -->` as the last line, after the metadata block.
- If **yes** → omit it; don't mention it.

Since this skill runs headless, default to **not** adding the hidden marker and flag the
question for the parent to confirm.

## Output

Write the README to `README.md` at the project root (framework-required name; do not
kebab-case it). Then report: what was generated, the URLs/assumptions resolved, and the
visibility question for the parent to relay.
