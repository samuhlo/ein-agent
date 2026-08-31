# Slidev — Built-in Layouts

Source: https://sli.dev/builtin/layouts

Set a layout per slide via frontmatter `layout: <name>`. Custom layouts go in
`layouts/` (see themes-config.md). Themes may add more layouts.

| Layout | Description | Frontmatter props |
|--------|-------------|-------------------|
| `default` | Most basic layout for any content | — |
| `center` | Centers content in the middle of the screen | — |
| `cover` | Cover page with title/context | — |
| `intro` | Introduces the deck (title, author) | — |
| `section` | Marks the start of a new section | — |
| `statement` | A bold affirmation as main content | — |
| `fact` | Emphasizes a number/fact prominently | — |
| `quote` | Displays a quotation prominently | — |
| `end` | Final slide of the deck | — |
| `full` | Uses the entire screen | — |
| `none` | No styling at all | — |
| `image` | Image as the main content | `image`, `backgroundSize` |
| `image-left` | Image on left, content on right | `image`, `class`, `backgroundSize` |
| `image-right` | Image on right, content on left | `image`, `class`, `backgroundSize` |
| `iframe` | Web page as main content | `url` |
| `iframe-left` | Web page on left, content on right | `url`, `class` |
| `iframe-right` | Web page on right, content on left | `url`, `class` |
| `two-cols` | Two columns split by `::right::` | — |
| `two-cols-header` | Header row, then two columns | uses `::left::` / `::right::` |

## Two columns

```md
---
layout: two-cols
---

# Left

Left column content

::right::

# Right

Right column content
```

## Two columns with header

```md
---
layout: two-cols-header
---

# Header spans both columns

::left::

Left content

::right::

Right content
```

## Image layouts

```md
---
layout: image-right
image: /my-photo.png
backgroundSize: contain      # or cover (default)
class: my-custom-class
---

# Content beside the image
```

The `image` path resolves from `public/` (e.g. `/my-photo.png` → `public/my-photo.png`)
or can be an absolute URL.

## iframe layouts

```md
---
layout: iframe-right
url: https://sli.dev
---

# Embedded site on the right
```
