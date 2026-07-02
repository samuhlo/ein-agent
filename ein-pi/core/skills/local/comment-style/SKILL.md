---
name: comment-style
description: Strict minimalist + brutalist + controlled vandal commenting style for JS, TS, Vue, React, Nuxt, PHP, Java, CSS, and HTML.
license: internal
---

# Comment Style - Minimalist + Brutalist + Controlled Vandal

This skill defines Samuhlo's code comment style.

Use it when editing or adding comments in:

- `.js`, `.jsx`, `.ts`, `.tsx`, `.vue`
- `.php`
- `.java`
- `.css`, `.scss`, `.sass`
- `.html`

## Core Principle

Comment the WHY, not the WHAT.

- If the code is obvious, do not comment.
- If the comment explains a decision, a trap, a business rule, or a non-obvious constraint, keep it.
- If a comment is stale, vague, decorative, or repeats the code, delete it.
- Prefer clear names over comments.

## Tone

- Style: minimalist + brutalist + controlled vandal.
- Language: follows the active response-language directive (the selected `lang`).
- Exception: if a file's existing comments are already in another language, match that file to avoid mixing languages within one file.
- Comments must be short, concrete, and scannable.
- Explain complex things simply, like a small note for the next developer.
- Identity: raw, technical, useful. No corporate filler.

## Vandal Layer

Controlled vandal is not decoration.

It means:

- strong structure
- raw clarity
- short impact phrases
- visible intent
- zero fake coolness
- no comments that only look aesthetic

Allowed vocabulary, only when it explains a real decision:

- `RUIDO` -> unnecessary data, duplicated events, visual clutter, accidental complexity
- `BLINDAJE` -> defensive guard, fallback, safety boundary
- `CORTE` -> early return, hard stop, stop condition
- `GUARD` -> visibility/security/flow guard
- `FAIL CLOSED` -> reject by default when uncertain
- `FRICTION CUT` -> removes user/dev friction
- `BUNKER` -> stable protected zone/state/config
- `FORGE` -> normalization, transformation, build-up step
- `NOISE KILL` -> dedupe, debounce, ignore noisy input
- `HARD STOP` -> explicit stop to prevent unsafe flow

Anti-cringe rules:

- Max 1 vandal accent per logical block.
- No direct punk/anime/skate/motorbike references in code comments.
- No motivational phrases.
- No emojis.
- No decorative comments.
- If the comment does not help maintenance, delete it.

## Universal Tags

Use these tags only when useful:

- `[CORE]` main logic
- `[FLOW]` important execution flow
- `[AUTH]` authentication or permissions
- `[DATA]` data transformation
- `[API]` external calls
- `[DB]` database access
- `[CACHE]` cache behavior
- `[UI]` interface logic
- `[LAYOUT]` layout structure
- `[NOTE]` important context
- `[TODO]` pending work
- `[FIX]` known bug or correction
- `[HACK]` ugly workaround forced by external constraints
- `[DEPRECATED]` do not use

## Visual Blocks

Use big blocks only when they improve navigation in non-trivial files.

### JS / TS / Vue / React / Nuxt / PHP / Java

```ts
// =============================================================================
// [CORE] BUNKER DE ESTADO
// =============================================================================

// -----------------------------------------------------------------------------
// Subsection
// -----------------------------------------------------------------------------
```

### CSS / SCSS

```css
/* ==========================================================================
   [LAYOUT] BUNKER VISUAL
   ========================================================================== */
```

### HTML

```html
<!-- ======================================================================= -->
<!-- [SECTION] HERO / FIRST HIT -->
<!-- ======================================================================= -->
```

## Inline Why Comments

Use uppercase for the reason and `->` for cause/effect.

### JS / TS / PHP / Java

```ts
// BLINDAJE -> Limpiar listener al desmontar previene fugas de memoria.
// NOISE KILL -> Ignorar eventos repetidos antes de recalcular layout.
// CORTE -> Si falta payload valido, el flujo muere aqui.
```

### CSS

```css
/* FRICTION CUT -> Reserva espacio y evita saltos durante la carga */
```

### HTML

```html
<!-- GUARD -> No pintar CTA si no hay destino real -->
```

## Function Comments

Only comment functions with non-obvious logic.

Do not add bloated parameter docs when the type/signature already explains the input.

### TypeScript / JavaScript

```ts
/**
 * [DATA] CALCULAR TOTAL
 * ---------------------------------------------------------
 * Suma impuestos + envio.
 * [CRITICAL]: Mantener tasas fuera de esta funcion.
 */
```

### PHP

```php
/**
 * [AUTH] FAIL CLOSED
 * ---------------------------------------------------------
 * BLINDAJE -> Si no se puede verificar, se deniega acceso.
 */
```

### Java

```java
/**
 * [CACHE] INVALIDAR USUARIO
 * ---------------------------------------------------------
 * BLINDAJE -> Evita datos fantasma tras cambios de permisos.
 */
```

## Vue Dog Tag

For `.vue` files with `<script setup lang="ts">`, add this header only when the file is missing a useful manifest.

```ts
/**
 * [FEATURE] :: COMPONENT_NAME
 * =====================================================================
 * DESC:   Descripcion telegrafica del proposito.
 * STATUS: STABLE
 * =====================================================================
 */
```

Allowed tags:

- `[UI_ATOM]`
- `[UI_MOLECULE]`
- `[FEATURE]`
- `[LAYOUT]`
- `[COMPOSABLE]`
- `[STORE]`
- `[SERVICE]`

## CSS / HTML Rules

- Use blocks for major page/section structure only.
- Do not comment every class.
- Comment layout traps, browser workarounds, and accessibility constraints.

Good:

```css
/* FRICTION CUT -> La imagen reserva altura antes de cargar */
.card-media {
  aspect-ratio: 16 / 9;
}
```

Bad:

```css
/* Color rojo */
.error {
  color: red;
}
```

## Magic Numbers

Prefer named constants instead of inline comments.

Good:

```ts
const TRANSITION_DURATION_MS = 500
```

Bad:

```ts
setTimeout(fn, 500) // Esperar transicion
```

## Strict Enforcement Contract

When touching supported files:

1. Enforce this style strictly in touched code blocks.
2. Normalize useful existing comments.
3. Delete low-value or outdated comments.
4. Add comments only for non-obvious decisions.
5. Keep comments useful before beautiful.
6. Never add comments just to make code look documented.
7. Use controlled vandal vocabulary only when it clarifies a real risk, guard, fallback, transformation, or flow cut.
