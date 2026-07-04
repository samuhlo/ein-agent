---
name: readme-style
description: "Samuhlo's README style: Swiss Grid Brutalism — script-run H1, numbered // sections, honest _note: margins, stack table with real tech only. Load when generating or refreshing a project README."
license: internal
metadata:
  author: samuhlo
---

# README Style — Swiss Grid Brutalism

Samuhlo's READMEs: strict order on the grid, controlled vandalism in the margins.
Load when generating or refreshing a project README — not for generic doc tasks.

## Philosophy

_"Arquitecturas sólidas como el hormigón, fluidas como el agua. Código limpio + caos
controlado."_

A README is an architect presenting a blueprint, not a tool describing a project.
Technical, self-assured, direct, with an edgy sci-fi undercurrent and terminal/bash
vocabulary where it fits naturally. Every word should sound like Samuel wrote it at 2am
after shipping something he's proud of.

## Before writing

Read the code — never ask for a description.

1. **Read the vibe** — immersive (WebGL/GSAP-heavy) vs clean SaaS architecture. Calibrate
   the tagline and where `_note:` lands.
2. **Extract the DNA** — stack table only with tech actually found in the code. No filler,
   no invented rows.
3. **Find the magic** — the file with the heaviest logic or best animation is the snippet.
   No boilerplate.
4. **Don't invent** — no database section without a DB, no motion section without motion.
   Omit cleanly.
5. **Resolve URLs** from `package.json`, git remotes, deploy config (`vercel.json`,
   `nuxt.config`, `netlify.toml`).

## Signature marks

These are what make it a Samuhlo README. Everything else is flexible:

- **H1 as a script run** — `# <code>./[PROJECT_NAME].sh</code>`, uppercase.
- **Numbered section headers** — `## // 00_ SECTION_NAME`, uppercase, double slash.
- **`_note:` margins** — an italic blockquote with an honest margin note: a broken rule,
  a creative decision, the hardest problem. One or two per README, only where they earn
  their place.
- **Stack table** — columns `LAYER | TECH | IMPLEMENTATION DETAIL`.
- **Footer** — centered: `DESIGNED & CODED BY samuhlo`, `Lugo, Galicia`.

## Reference shape (adapt, don't fill in)

The classic flow is mission → blueprint → features → core snippet, but bend it to the
project: a CLI may want usage before architecture, a library wants install + API, a
small experiment might be mission + snippet and nothing else. Sections that don't apply
don't exist.

`````markdown
<div align="center">
  <h1><code>./[PROJECT_NAME].sh</code></h1>

**[TAGLINE: one sharp sentence defining the visual + technical impact]**

[![Live](https://img.shields.io/badge/LIVE_DEMO-FFCA40?style=for-the-badge&logo=vercel&logoColor=black)]([DEMO_URL])

</div>

---

## // 00_ THE_MISSION

[1–2 paragraphs: what is this and why does it exist.]

> _note: [the biggest creative challenge, or the rule you chose to break.]_

---

## // 01_ THE_BLUEPRINT

| LAYER      | TECH          | IMPLEMENTATION DETAIL                        |
| :--------- | :------------ | :------------------------------------------- |
| **Core**   | `[Framework]` | [e.g. Nuxt 4 SSR + Composition API]          |
| **Motion** | `[Anim Lib]`  | [e.g. GSAP ScrollTrigger + Lenis]            |

---

## // 02_ CONTROLLED_CHAOS

[Key features at the intersection of code and design/UX.]

---

## // 03_ CORE_LOGIC

[1-line intro: why this block is the dark magic.]

```[language]
// [FILEPATH]
[relevant code — complex logic, shaders, timelines. No boilerplate.]
```

---

<div align="center">

<code>DESIGNED & CODED BY <a href='https://github.com/samuhlo'>samuhlo</a></code>

<small>Lugo, Galicia</small>

</div>
`````

## Output

Write to `README.md` at the project root (framework-required name; do not kebab-case it).
Report what was generated and which URLs/assumptions were resolved.
