# Slidev — Built-in Components

Source: https://sli.dev/builtin/components

These components are available in any slide without importing. Custom components
go in `components/` and are auto-imported (see themes-config.md).

## Navigation & structure

- **`<Toc />`** — table of contents. Props: `columns`, `maxDepth`, `minDepth`,
  `mode` (`all` | `onlyCurrentTree` | `onlySiblings`), `listClass`.
  Slides with `hideInToc: true` are excluded; `level:` sets nesting.
- **`<Link to="4" title="Go" />`** — jump to a slide by number or `name` alias.
- **`<TitleRenderer no="3" />`** — render slide 3's title as HTML.
- **`<SlideCurrentNo />`** / **`<SlidesTotal />`** — current / total slide number.

## Drawing attention

- **`<Arrow x1 y1 x2 y2 />`** — line/arrow. Props: `width`, `color`, `two-way`.
- **`<VDragArrow />`** — draggable arrow (positions persist in frontmatter).
- **`<VDrag>`** — make any element draggable; positions saved to slide frontmatter.
- **`<Transform :scale="0.5" origin="top left">`** — scale/transform children.
- **`<AutoFitText :max="80" :min="20">`** — text that shrinks to fit. `modelValue`.

## Conditional rendering

- **`<RenderWhen context="presenter">`** — render only in a context: `main`,
  `visible`, `print`, `slide`, `presenter`, `previewNext`, `overview`.
- **`<LightOrDark>`** — slots `#light` / `#dark` chosen by color scheme.
- **`<VSwitch>`** — cycle through slotted content on click. Props: `unmount`,
  `tag`, `transition`. Child slots `<template #1>…</template>`.

## Media & embeds

- **`<SlidevVideo controls autoplay>`** — `<source>` children. Props: `autoplay`
  (`true`/`once`/`null`), `autopause`, `controls`, `poster`, `printPoster`,
  `timestamp`, `loop`.
- **`<Youtube id="..." :width="600" :height="400" />`** — embed a YouTube video.
- **`<Tweet id="..." :scale="0.65" conversation="none" :cards="false" />`**.
- **`<BlueSky uri="..." :scale="0.7" />`**.

## Animation components

- **`<v-click>`**, **`<v-after>`**, **`<v-clicks>`** — reveal on click.
  See animations.md.

## Misc

- **`<PoweredBySlidev />`** — attribution badge.

## Usage pattern

```vue
<Toc columns="2" maxDepth="2" />

<Link to="cover" title="Back to start" />

<SlidevVideo controls>
  <source src="/demo.mp4" type="video/mp4" />
</SlidevVideo>

<VDrag :pos="[100,100,200,_]">Drag me</VDrag>
```
