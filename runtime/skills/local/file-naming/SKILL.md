---
name: file-naming
description: "Samuhlo's file/folder naming rule: kebab-case for files and folders, idiomatic casing inside code. Trigger: creating, renaming or refactoring files/folders/components/routes in Vue, Nuxt, React, Next, Astro or any Linux/CI-deployed project."
license: internal
metadata:
  author: samuhlo
---

# File Naming — kebab-case files, idiomatic code

Samuhlo's default for naming files and folders in production projects. Apply it whenever you **create or rename a file/folder**, scaffold a component, or refactor structure.

## Rule

| Layer | Convention | Example | Why |
| :--- | :--- | :--- | :--- |
| Files & folders | `kebab-case` | `user-profile.vue`, `auth-service.ts` | Safe across Linux, Git, URLs, CI/CD |
| Components / classes | `PascalCase` | `UserProfile`, `AuthService` | Language/framework convention |
| Variables / functions | `camelCase` | `userProfile`, `fetchUserProfile()` | Natural reading inside JS/TS |

The file is the armored transport box; the code inside is the real logic. They serve different functions, so they don't share a convention.

## Why it matters (not aesthetics)

It removes dumb breakage points between local → Git → CI → production.

- Locally (macOS/Windows) the filesystem is often case-insensitive: `HeaderNav.vue`, `headernav.vue` and `HEADERNAV.vue` can behave as the same file.
- Production is almost always Linux, which is case-sensitive: `HeaderNav.vue` ≠ `headerNav.vue`.
- Classic bug: rename a component changing only a letter's case, Git doesn't track it cleanly, it builds locally, then Vercel/CI fails with `File not found`.

kebab-case kills it at the root: all lowercase, all explicit, zero ambiguity between OSes.

## File-based routing (Nuxt / Next / Astro)

When the filename becomes a URL, naming stops being internal — it's public interface.

```text
pages/PanelUsuario.vue   ->  /PanelUsuario     ❌
pages/panel-usuario.vue  ->  /panel-usuario     ✅  legible, web-aligned, SEO-friendly
```

## Examples

```text
components/
  header-nav.vue          # PascalCase component name inside: HeaderNav
  user-card.vue
  project-grid.vue
services/
  auth-service.ts         # class inside: AuthService
  user-profile-service.ts
layouts/
  main-layout.vue
```

```ts
// Inside the code the convention changes, because the layer changes.
class AuthService {}
const userProfile = await fetchUserProfile();
```

## Enforcement Contract

When creating or touching files:

1. New files/folders → `kebab-case`, always lowercase, hyphen-separated.
2. Framework exceptions win when the framework **requires** a specific name (e.g. `App.vue`, `[id].vue`, `+page.svelte`, `README.md`, `Dockerfile`). Follow the framework, don't fight it.
3. When renaming case only, do it in two Git steps (`git mv` to a temp name, then to the final) so Linux/CI see the change.
4. Keep imports in sync after any rename; never leave a dangling case-only reference.
