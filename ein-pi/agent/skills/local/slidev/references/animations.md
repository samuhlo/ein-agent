# Slidev — Animations

Source: https://sli.dev/guide/animations

A **click** is the unit of animation. Slidev counts clicks automatically; override
with `clicks: N` in slide frontmatter, or set `clicksStart`.

## Click reveals — `v-click`

As a directive or a component:

```md
<div v-click>Appears on next click</div>
<v-click>Also appears on next click</v-click>
```

`v-after` appears together with the previous `v-click`:

```md
<div v-click>First</div>
<div v-after>Same click as "First"</div>
```

Add `.hide` to reverse (visible first, hidden after the click):

```md
<div v-click.hide>Hidden after the click</div>
```

## Reveal a list — `v-clicks`

```md
<v-clicks>

- Item 1
- Item 2
- Item 3

</v-clicks>
```

Props:
- `depth="2"` — reveal nested list items level by level.
- `every="2"` — reveal items in groups of N.

## Click positioning

- **Relative** (default `+1`): `<div v-click="'+1'">` or `<div v-click="'+2'">`.
  Also `at="+1"`.
- **Absolute**: `<div v-click="3">` shows exactly at click 3.
- **Enter/leave range**: `<div v-click="[2, 4]">` visible during clicks 2–3.
  `<div v-click.hide="[2, 4]">` hidden during that range.

## Click animation presets

Set the enter/leave style globally in headmatter or per use:

```yaml
clickAnimation: up
```

Presets: `fade`, `fade-in`, `up`, `down`, `left`, `right`, `scale`, `none`.

## Motion (`v-motion`, via @vueuse/motion)

```md
<div
  v-motion
  :initial="{ x: -80, opacity: 0 }"
  :enter="{ x: 0, opacity: 1 }"
  :leave="{ x: 80 }">
  Slidev
</div>
```

Click-driven motion (v0.48.9+):

```md
<div
  v-motion
  :initial="{ y: 0 }"
  :click-1="{ y: 30 }"
  :click-2-4="{ x: 40 }">
  Moves on clicks
</div>
```

## Slide transitions

Headmatter (deck-wide) or per-slide frontmatter:

```yaml
transition: slide-left
```

Built-in: `fade`, `fade-out`, `slide-left`, `slide-right`, `slide-up`,
`slide-down`, `view-transition`.

Different forward/backward transitions:

```yaml
transition: go-forward | go-backward
```

## Sync with speaker notes

Use `[click]` markers inside the `<!-- ... -->` note block to highlight note
sections in step with the click animations (see syntax.md).
