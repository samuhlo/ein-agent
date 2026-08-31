# Slidev — Presenter Mode, Views & Shortcuts

Source: https://sli.dev/guide/ui

## Views & routes (dev server on `:<port>`, default 3030)

| View | Route | Purpose |
|------|-------|---------|
| Play / slideshow | `/` or `/1` | the audience-facing presentation |
| Quick overview | press `o` | grid of all slides to jump around |
| Slide overview | `/overview` | linear list of slides with notes |
| Presenter mode | `/presenter` | speaker view: current + next slide, notes, timer |
| Notes editor | `/notes-edit` | batch-edit all speaker notes |

Open presenter mode in one window and play mode in another — they stay in sync
automatically (and across networked clients with `--remote`).

### Presenter layouts (v0.50.0+)

- Layout 1 (default): main slide top, notes + next preview below.
- Layout 2: notes left, slides stacked right.
- Layout 3: notes + current slide left, larger next slide right.

Screen mirror: mirror another monitor/window inside presenter view (useful for
live coding demos).

## Keyboard shortcuts (play mode)

| Key | Action |
|-----|--------|
| `→` / `Space` | next click or slide |
| `←` | previous click or slide |
| `↑` / `↓` | previous / next slide (skip clicks) |
| `f` | toggle fullscreen |
| `o` | toggle quick overview |
| `d` | toggle dark mode |
| `g` | open "go to slide" input |

Shortcuts are customizable via a `setup/shortcuts.ts` hook. The navigation bar
(bottom-left in play mode) can be extended through Global Layers.

## Remote presenting

```bash
slidev --remote                 # expose on LAN
slidev --remote your-password   # password-protect the presenter route
```

Share the printed network URL; the presenter route requires the password.
