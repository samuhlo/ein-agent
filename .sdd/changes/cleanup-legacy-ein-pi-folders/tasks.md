# SDD Tasks — cleanup-legacy-ein-pi-folders

## // 000. OBJETIVO

Eliminar el batiburrillo de carpetas legacy en `ein-pi/` fuera de la fuente canónica `ein-pi/agent/`, documentar la estructura canónica, y añadir un test de contrato que prevenga referencias activas a los paths legacy.

---

## // 001. TAREAS

### [x] 1.1 — Corregir referencias de paths en `sdd-token-budget-scope-gate/explore.md`

**Qué busca:** Que el cambio no entregado `sdd-token-budget-scope-gate` apunte a los paths canónicos, no a los legacy.

**Por qué importa:** Actualmente su `explore.md` lista `ein-pi/agents/sdd-init.md` y `ein-pi/agents/sdd-explore.md` como archivos a modificar. Esos son los paths legacy (fuentes antiguas). La implementación real debería targetear `ein-pi/agent/agents/sdd-init.md` y `ein-pi/agent/agents/sdd-explore.md`.

**Skills:** `comment-style`

**Decisión arquitectonica:** Un archivo de planning puede actualizarse sin implementar el cambio. Esto no "revierte" el trabajo — corrige un bug de documentación en el planning.

**Alternativa a evitar:** Eliminar `sdd-token-budget-scope-gate`. El usuario dijo explícitamente no revertirlo. La alternativa correcta es parchear las refs de paths.

**Como se verificará:** `grep -r "ein-pi/agents" .sdd/changes/sdd-token-budget-scope-gate/` debe devolver 0 resultados después del fix.

---

### [x] 1.2 — Eliminar `ein-pi/agents/` (carpeta legacy)

**Qué busca:** Borrar los 11 archivos `.md` duplicados/antiguos en `ein-pi/agents/`.

**Por qué importa:** Son versiones antiguas de archivos que ya viven en `ein-pi/agent/agents/` (con contenido diferente). Generan confusión sobre cuál es la fuente canónica.

**Skills:** `github-workflow`

**Decision arquitectonica:** La fuente canónica es `ein-pi/agent/agents/`. Eliminar el duplicado legacy.

**Alternativa a evitar:** Mover en vez de borrar. Mover preserva el historial git pero复 mantiene las carpetas confusas. Si se necesita historia, está en git.

**Como se verificará:** `git ls-files ein-pi/agents/` debe devolver vacío tras el delete + commit.

---

### [x] 1.3 — Eliminar `ein-pi/chains/` (carpeta legacy)

**Qué busca:** Borrar los 3 archivos legacy de chains.

**Por qué importa:** `ein-pi/agent/chains/ein-sdd.chain.md` es la cadena canónica. Los legacy (`sdd-full.chain.md`, `sdd-plan.chain.md`, `sdd-verify.chain.md`) no se usan.

**Skills:** `github-workflow`

**Como se verificará:** `git ls-files ein-pi/chains/` debe devolver vacío.

---

### [x] 1.4 — Eliminar `ein-pi/openspec/` (carpeta legacy huérfana)

**Qué busca:** Borrar `ein-pi/openspec/README.md` y `ein-pi/openspec/config.yaml`.

**Por qué importa:** Sin referencias vivas en todo el repo. No son parte del runtime ni del installer.

**Skills:** `github-workflow`

**Como se verificará:** `git ls-files ein-pi/openspec/` debe devolver vacío.

---

### [x] 1.5 — Eliminar `ein-pi/ein/` y `ein-pi/samuhlo/` (carpetas legacy huérfanas)

**Qué busca:** Borrar `ein-pi/ein/persona.json` y `ein-pi/samuhlo/persona.json`.

**Por qué importa:** Sin referencias vivas. Possible origen de confusión sobre estructura.

**Skills:** `github-workflow`

**Como se verificará:** `git ls-files ein-pi/ein/ ein-pi/samuhlo/` debe devolver vacío.

---

### [x] 1.6 — Eliminar `ein-pi/settings.json` (archivo legacy vacío)

**Qué busca:** Borrar `ein-pi/settings.json` (que contiene solo `{}`).

**Por qué importa:** El archivo de configuración real vive en `ein-pi/agent/settings.json` (48 líneas). Este es un placeholder vacío que genera confusión.

**Skills:** `github-workflow`

**Como se verificará:** `git ls-files ein-pi/settings.json` debe devolver empty.

---

### [x] 1.7 — Actualizar README.md para documentar estructura canónica

**Qué busca:** Clarificar en el README la estructura canónica del repo.

**Por qué importa:** El README actual dice "Los cambios al workbench van en `ein-pi/agent/`" pero no explica la relación entre `ein-pi/agent/` y el resto. Un reader no sabe si `ein-pi/agents/` es relevante.

**Skills:** `document-writer`

**Decisión arquitectonica:** La documentación viva es el README. Añadir una sección "Estructura del repo" más clara o nota inline que explique:
- `ein-pi/agent/` = fuente canónica (lo que se despliega a `~/.pi/agent`)
- `installer/` = empaqueta `ein-pi/agent/`
- Nada fuera de `ein-pi/agent/` es parte del workbench deployable

**Alternativa a evitar:** Crear un nuevo doc `ARCHITECTURE.md` o similar. El README es la fuente de verdad para estructura. No multiplicar docs.

**Como se verificará:** `grep -n "canónic\|fuente\|ein-pi/agent" README.md` muestra las aclaraciones.

---

### [x] 1.8 — Añadir test de contrato: veto de refs a paths legacy

**Qué busca:** Que CI falle si alguien añade refs activas a `ein-pi/agents`, `ein-pi/chains`, `ein-pi/openspec`, `ein-pi/ein`, `ein-pi/samuhlo`, `ein-pi/settings.json` en archivos clave.

**Por qué importa:** Previene que en el futuro alguien (o un agente) reintroduzca referencias a carpetas eliminadas.

**Skills:** `comment-style`, `vitest`

**Decision arquitectonica:** El test busca patterns en:
- `installer/**/*.ts`
- `tests/**/*.ts`
- `ein-pi/agent/**/*.md` (excepto `.sdd/` y `changelog`)
- `README.md`, `CHANGELOG.md`

**Excepciones permitidas**:
- `.sdd/` (planning histórico)
- `CHANGELOG.md` (referencias históricas a cambios pasados)
- Cualquier archivo bajo `.sdd/` (planning artifacts)

**Alternativa a evitar:** Poner la validación solo en `.gitignore` o en un script manual. Un test en CI es más robusto.

**Como se verificará:**
```bash
bun test tests/legacy-paths-veto.test.ts
```
El test debe pasar (0 refs activas) antes de merge.

---

## // 002. ORDEN DE EJECUCIÓN

1. **1.1** — Corregir refs de `sdd-token-budget-scope-gate` (parche mínimo)
2. **1.2–1.6** — Eliminar carpetas/archivos legacy (grupo atómico)
3. **1.7** — Actualizar README
4. **1.8** — Añadir test de contrato

**Riesgo de desorden**: si se hace 1.8 antes de 1.2–1.6, el test fallará.确保顺序.

---

## // 003. VERIFICACIÓN FINAL

```bash
# 1. Ningún archivo legacy en git
git ls-files ein-pi/agents/ ein-pi/chains/ ein-pi/openspec/ ein-pi/ein/ ein-pi/samuhlo/ ein-pi/settings.json

# 2. Ninguna refs activas en archivos clave
grep -r "ein-pi/agents\|ein-pi/chains\|ein-pi/openspec\|ein-pi/ein/\|ein-pi/samuhlo/" \
  installer/ tests/ ein-pi/agent/*.md ein-pi/agent/agents/*.md ein-pi/agent/chains/*.md \
  README.md CHANGELOG.md 2>/dev/null | grep -v "\.sdd/"

# 3. Test de contrato pasa
bun test tests/legacy-paths-veto.test.ts
```
