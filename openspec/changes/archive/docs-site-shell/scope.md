# Scope: docs-site-shell

## Overview

Montar el armazón web de la documentación pública de EIN con **Astro Starlight altamente personalizado**, sirviendo las 21 páginas esqueleto existentes (fases A–B cerradas) bajo `docs-site/src/content/docs/`. Sin redactar prosa (fase D) ni tocar el README (fase E).

**Riesgo de producto**: Starlight es una plantilla de documentación. El brief de producto (`docs/EIN_DOCUMENTATION_BRIEF.md`) **prohíbe explícitamente en tres sitios distintos** que el resultado parezca una plantilla genérica sin modificar. La fase se juega en resolver esa tensión mediante overrides de componentes acotados y decisiones de estilo y navegación que refuercen la identidad de EIN.

**Decisiones de entrada fijas** (no reabrir): español, `docs-site/` dentro del monorepo, Astro Starlight, página contract de 4 claves (fase A).

## Scope packet

```
scope: Montar Astro Starlight en docs-site/ con overrides mínimos de 9 componentes Starlight para cumplir el brief de producto (navegación numerada tipo tmux, cabecera sin SaaS, búsqueda con lenguaje command palette, anterior/siguiente con lenguaje buffers, móvil simplificado). Resolver conflictos de frontmatter, elegir estrategia de estilos y deploy, definir qué es testeable en CI.

budget_allocated:
  max_tokens: 90000
  max_reads: 50
  max_runtime_ms: 600000
```

## Inclusiones explícitas

### 1. Decisiones que debe resolver el scope

Este cambio no **implementa** el Astro; declara qué debe implementarse en apply. Su entregable es la arquitectura de decisiones, no el código.

| Decisión | Opciones | Criterio de selección |
|----------|----------|----------------------|
| **Búsqueda** | (A) Usar Pagefind (integrado Starlight) bajo un `Search` personalizado; (B) componente custom en MDX + Pagefind. | Starlight trae Pagefind resuelto. Opción A si Pagefind cubre "command palette" con override de UI; Opción B si requiere búsqueda distinta. Especificar aquí cuál. |
| **Estilos** | (A) CSS propio en `docs-site/src/styles/`; (B) variables CSS de Starlight extendidas; (C) Tailwind nuevo en `docs-site/`. | Repositorio no usa Tailwind hoy. Recomendación: (A) o (B). Especificar en scope por qué. |
| **Deploy** | (A) GitHub Pages (rama `gh-pages`); (B) Netlify; (C) Vercel; (D) Manual a S3/Cloudflare; (E) No especificado (dejar para fase posterior). | Hay GitHub Actions activos. (A) es más natural; si no hay razón fuerte, usar (A). Documentar en scope qué hace falta en CI. |
| **Frontmatter** | (A) Astro read Starlight `layout`, `sidebar`, etc. como atributos extra que ignora el validador de contract; (B) transformación en astro.config.mjs que inyecta frontmatter Starlight; (C) componente wrapper que consume la 4-key page. | El contrato prohíbe una quinta clave. Opción (C) es la más segura: cada página sigue siendo 4-key, Starlight no ve el FM. Especificar arquitectura. |
| **Componentes** | Decidir cuáles de los 27 se custom-overriden y en qué grado. La tabla del brief nombra 9 críticos. | Leer brief §3 y documentar si los 9 bastantes, si alguno requiere envolver vs reemplazar, si hay interdependencias. |
| **Convivencia contract + drift** | El `docs-contract` y `docs-drift-detector` deben seguir pasando en CI tras esta fase. ¿Qué cambios de ejecución hacen falta? | Ambos leen `docs-site/src/content/docs/` como markdown bruto. Astro no modifica esos archivos. Confirmar que no hay conflicto. |

### 2. Estructura de directorios y archivos esperados

```
docs-site/
  astro.config.mjs          ← config de Starlight + overrides de componentes
  package.json              ← primera vez en docs-site/
  bun.lockb                 ← generado por bun install
  tsconfig.json             ← para Astro + TypeScript components
  src/
    content/
      docs/                 ← ya existe, 21 páginas, NO TOCAR
        00-start/
        01-concepts/
        ...
      config.ts             ← Starlight collection config (si es necesario)
    pages/                  ← portada personalizada FUERA del layout doc
      index.astro           ← página de entrada libre, no hereda doc layout
    components/             ← overrides Starlight
      <9 custom components>
    styles/                 ← CSS propio si aplica
      <global.css>          ← variables, jerarquía, brutalismo
  public/
    <assets globales: favicon, logo>
```

### 3. Frontmatter: resolución de conflicto

**Problema**: Starlight espera claves de sidebar, layout, template, etc. El contrato prohíbe una quinta clave en las páginas.

**Solución propuesta**: 
- Cada página `.md` bajo `docs-site/src/content/docs/` mantiene exactamente 4 claves (title, description, sources, verified_rev).
- `astro.config.mjs` define un layout default que Starlight aplica automáticamente a `docs/` (opción `layout`).
- Las páginas se procesan como colección Astro; Starlight lee el YAML bruto de 4 claves, lo que importa, es que el layout default sea asignado por configuración, no por frontmatter.
- Validar que Starlight no fuerza una quinta clave en el build ni en la generación estática.

### 4. Componentes a override (mínimo requerido)

Según el brief y la arquitectura Starlight:

| Componente | Razón | Grado | Notas |
|---|---|---|---|
| `Sidebar` | Navegación numerada `[0]`, `[1]`… tmux-style | Envolver (import Default + personalizar) | Starlight genera automático; necesita redeclaración visual. |
| `Header` | Sin estética SaaS; cabecera herramienta | Reemplazar | Layout, spacing, decoraciones. |
| `SiteTitle` | Identidad EIN, numeración o símbolo | Reemplazar | Breve, directo, sin marketing. |
| `SocialIcons` | Iconos de GitHub/Releases | Reemplazar o eliminar | Si mantener, hacer funcionales no decorativos. |
| `Search` | Command palette + lenguaje de buffer | Envolver Search default + Pagefind | UI y copywriting. |
| `Pagination` (anterior/siguiente) | Lenguaje de "buffers" tipo tmux | Reemplazar | Semántica de navegación buffer, no "Previous/Next". |
| `MobileMenuToggle` | Simplificar móvil | Envolver | Solo si hace falta ajustar UI. |
| `MobileMenuFooter` | Simplificar móvil | Reemplazar | Prioridades: contenido, menú, tabla de contenidos, búsqueda. |
| `MobileTableOfContents` | Simplificar móvil | Envolver | Asegurar que existe y que es legible. |

**Restricciones duras verificadas contra documentación oficial Starlight**:

1. **`PageTitle`**: DEBE inyectar `id="_top"` en su `<h1>`. Override que lo omita rompe navegación por teclado sin error de build.
2. **`PageFrame`**: Tiene slots `header` y `sidebar`; `TwoColumnContent` tiene `right-sidebar`. Override que no los transfiera hace desaparecer contenido silenciosamente.
3. **`Head`**: Documentación oficial recomienda opción `head` de config, no override. Un override ahí se lleva charset y meta.

### 5. Testing: qué es honestamente testeable

**Fase C produce configuración y componentes, no lógica testeable en sentido tradicional.**

Verificaciones que pasarán en CI:

1. **Build limpio**: `astro build` termina sin error.
2. **21 páginas generadas**: output contiene archivos HTML para cada `.md` de `docs-site/src/content/docs/`.
3. **Contrato de página sigue pasando**: `bun run docs-contract` no falla. (Hereda fase A, no cambia.)
4. **Drift sigue limpio**: `bun run docs-drift-detector` reporta todas "clean". (Hereda fase A, no cambia.)
5. **Sin literales de versión en output HTML**: búsqueda global en el HTML generado de patrones `v\d+\.\d+\.\d+`.

**Qué NO es testeable sin juicio visual**:

- Si la UI se ve como plantilla (brief L72).
- Si la identidad de EIN sale de la estructura/tipografía/ritmo.
- Si la navegación es "suficientemente evidente".
- Si el móvil "se simplificó bien".

**Decisión de entrada**: El contrato debe incluir smoke de build + validadores de estructura. El juicio visual lo hace el dueño en código review.

### 6. Dependencias: impacto en monorepo y CI

**Primera adición de `package.json` fuera de `installer/`.**

Impacto a resolver:

- `docs-site/package.json`: Astro, Starlight, Pagefind, TypeScript, posible Tailwind.
- `bun.lockb` en `docs-site/`: lockfile separado del principal.
- CI (`ci.yml`): ¿ejecutar build de docs? ¿como check obligatorio o solo informativo?
- Nota: La documentación se entrega como output estático (HTML), no como código en releases. No afecta al bundling de `installer/`.

**Recomendación de scope**: Documentar en decisiones de deploy si el build de docs es obligatorio en CI o solo manual. Esto acota el costo de cada cambio futuro a `docs-site/`.

### 7. Convivencia del contrato y el detector de drift

Fase A produjo dos artefactos en CI:

1. `docs-contract` (`bun run docs-contract` en CI): valida estructura de 21 páginas contra 4-key contract.
2. `docs-drift-detector` (`bun run docs-drift-detector`): compara `sources` de cada página contra cambios desde su `verified_rev`.

**Ambos leen `docs-site/src/content/docs/` como markdown estático.** Astro no modifica esos archivos en el build, solo los consume. **No hay conflicto**. 

Verificar en apply:
- CI job ejecuta ambos validadores tras Astro build.
- Ambos pasan (o ambos lo tienen en el roadmap de C si hay decisiones que lo requieren).

## Exclusiones explícitas

- **Redacción de prosa de las 21 páginas** → fase D.
- **Detector automático de drift y generador de bloques** → fase B (ya hecho; C solo consume).
- **Diseño visual detallado / CSS exhaustivo** → C declara decisiones, apply las implementa.
- **Portada personalizada** → va en apply; scope documenta solo dónde y cómo.
- **Deploy real a producción** → fuera de scope; C establece la estrategia.
- **README.md** → fase E (después de que sitio esté publicado).
- **Modificar las 21 páginas** → prohibido.

## Contexto del proyecto

- **Stack**: Node.js/TypeScript ESM, Bun, monorepo con installer + core EIN + docs-site.
- **Test runner**: `bun test` (strict_tdd: true en openspec/config.yaml).
- **CI**: GitHub Actions (ubuntu-latest, macos-latest).
- **Página contract**: 4 claves exactas, 7 encabezados H2 fijos, bloques PENDIENTE-D, sin versiones literales.
- **Drift detector**: por página contra verified_rev.
- **Artefactos fase A**: 21 páginas esqueleto bajo `docs-site/src/content/docs/` con 6 áreas (00–05). Archivados/cerrados.

## Artefactos esperados

1. **`scope.md`** (este archivo): decisiones, restricciones, presupuesto.
2. **Declaración de delta spec**: esta fase altera comportamiento observable (infraestructura de web pública) → incluir delta con operaciones de setup o comportamiento de frontmatter si las hubiera.

*Nota*: Astro build + componentes personalizados son code/config, no spec delta (a menos que afecten el contrato de página o el ciclo de vida de validación). Si la decisión de frontmatter requiere cambios al contrato de página, eso sería un delta. Especificar en scope aquí si hay spec delta.

## Decisión pendiente: ¿hay spec delta?

**Frontmatter**: Si se resuelve por layout default (opción propuesta), NO hay delta; páginas siguen siendo 4-key bruto. El validador sigue pasando sin cambios.

**Comportamiento observable**: Astro sirve HTML estático; no cambia el ciclo de SDD, el CI, ni la validación de contract.

**Provisión de scope**: Si la resolución de frontmatter NO requiere cambios al contrato ni al validador, **NO hay spec delta**. Si la resolución implica una quinta clave en FM o cambio del validador, SÍ lo hay.

**Determinar aquí**: ¿Se puede mantener 4-key bruto en cada página `.md` aprovechando layout default de Astro config, sin modificar el validador?

## Presupuesto y timing

- **max_tokens**: 18000 (lectura del brief, contract, drift detector, decisiones arquitectónicas estructuradas, sin implementación).
- **max_reads**: 35 (brief completo, contract/drift, tsconfig, astro docs puntuales, GitHub Actions, openspec/config).
- **max_runtime_ms**: 150000 (2.5 minutos: decisiones cuidadosas, sin exploración abierta).

Este presupuesto alcanza para una pasada de decisiones arquitectónicas claras sin implementar el Astro ni validar contra documentación oficial (eso es apply). La scope es blueprint, no código.

## Spec delta declaration
spec_delta: none
spec_delta_reason: Monta la infraestructura web consumiendo el contrato de página y sus validadores sin modificarlos; el frontmatter se resuelve por layout de Astro, no por claves extra.
