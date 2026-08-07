# Traspaso — rama `feat/docs-site`

Estado de la documentación pública de EIN para retomar el trabajo en otra
máquina o en otra sesión. Este fichero es un punto de entrada, no la fuente de
verdad: la autoridad son los artefactos SDD en `openspec/`.

## Cómo retomar

```bash
git clone <repo> && cd ein-agent
git fetch origin
git switch feat/docs-site
```

No hace falta reproducir el worktree: existió solo para que esta rama y otra en
curso no se pisaran en la misma máquina. En un clon nuevo, `feat/docs-site` es
una rama normal.

Primer comando útil:

```bash
cc-ein-sdd status
```

## Qué es este trabajo

La documentación pública de EIN, planificada en cinco fases (A–E). Lo que hay
hecho es la fase A, partida en dos cambios SDD:

| Cambio | Áreas | Estado |
| --- | --- | --- |
| `docs-content-inventory` | `00-start`, `01-concepts`, `02-workflow` | cerrado y archivado |
| `docs-content-reference` | `03-runtimes`, `04-reference`, `05-debug` | ver `cc-ein-sdd status` |

Producen **esqueletos, no páginas redactadas**. Cada página declara su
estructura, sus fuentes reales y qué falta escribir, sin una sola afirmación sin
procedencia. La prosa es la fase D; la web, la fase C.

## Las decisiones ya tomadas (no reabrir)

- **Idioma**: español.
- **Ubicación**: `docs-site/` dentro de este monorepo, para que un check de CI
  pueda detectar que un cambio de código dejó la documentación desfasada.
- **Framework**: Astro Starlight muy personalizado. Trae búsqueda (Pagefind),
  navegación y móvil resueltos; el riesgo es que se note la plantilla, así que
  la fase C debe fijar desde el principio qué componentes se sobreescriben.
- **El brief de producto** es `docs/EIN_DOCUMENTATION_BRIEF.md` y es autoridad.

## El contrato de página

Lo fija `openspec/changes/archive/docs-content-inventory/design.md` y lo hereda
todo lo demás. Resumen:

- Frontmatter de exactamente cuatro claves en orden: `title`, `description`,
  `sources` (rutas relativas al repo, existentes), `verified_rev`.
- Siete encabezados `##` fijos y en orden, ninguno más.
- Un único bloque `:::caution[PENDIENTE-D]` por sección, con `falta:`,
  `fuentes:` y `lineas:`. Toda ruta citada debe estar en `sources`.
- **Pureza**: tras filtrar frontmatter, encabezados, bloques `PENDIENTE-D`,
  ítems de `## Fuentes` y la línea de `## Siguiente paso`, no queda ninguna
  línea. Es lo que distingue un esqueleto de una página a medio redactar, y se
  comprueba con un comando.
- **Sin literales de versión**: donde haga falta la release vigente se enlaza a
  `releases/latest`. Si ninguna página puede escribir un número, ninguna puede
  quedarse desfasada.

## Qué falta

**Inmediato**

1. Cerrar `docs-content-reference` si `cc-ein-sdd status` lo deja a medias.
2. Abrir el PR de la fase A completa (las dos mitades juntas). La primera mitad
   no se sostiene sola: son tres áreas de seis.

**Fases siguientes, en orden**

- **B — `docs-sync-contract`**: generador de bloques automáticos y detector de
  drift. Consume el contrato de página como formato de entrada: por eso se
  diseñó para que un script pueda parsearlo.
- **C — `docs-site-shell`**: Astro Starlight, navegación, búsqueda, deploy.
- **D — `docs-beta-content`**: redactar la prosa de cada bloque `PENDIENTE-D`.
- **E — `readme-slim`**: recortar el README y enlazar. **Va el último
  obligatoriamente**: si se recorta antes de que el sitio esté publicado, el
  README queda enlazando a nada.

Un PR por fase. Cada una es aditiva y segura de mergear sola, salvo E.

## Dependencias externas vivas

**Known Limitations está bloqueada.** Su fuente autoritativa —la versión nueva
de `docs/roadmap-beta.md` y `docs/roadmap-features-ein.md`— vive en la rama sin
mergear `feat/shared-project-state-contract`. La versión presente en
`feat/docs-site` es anterior: habla de `core-parity` e `installer-beta` como
pendientes y no menciona la secuencia A–E.

Desbloqueante: que esa rama entre en `main`. Hasta entonces la página tiene
esqueleto pero no puede redactarse.

**El README de `main` está desfasado** (`README.md:121` declara `EIN v0.40.0`
mientras `installer/package.json` dice `0.42.0`). La misma rama de arriba ya lo
corrige. No lo arregles desde aquí.

## Cosas que se sabe que están mal

- `gap-inventory.md` de SLICE 1 (archivado) declara `estado: esqueleto-en-A`
  para Runtime Matrix, que es falso: esa página pertenece al segundo cambio. El
  vocabulario de estados de SLICE 1 no tenía valor correcto para ese caso.
  SLICE 2 lo extiende en su propio inventario. **El archivado no se toca**: es
  evidencia inmutable.
- `02-workflow/real-workflow-example.md:110` reproduce la redacción del contrato
  (`texto plano: ...`) en lugar de aplicarla. Cosmético, corregir en la fase D.
- La cadena de `## Siguiente paso` **no cruza entre las dos mitades**: la última
  página de SLICE 1 nombra el área Runtimes en texto plano porque cuando se
  escribió no existía. Cerrar esa cadena es trabajo pendiente de C o D.

## Material para el artículo de lanzamiento

`docs/fricciones-dogfooding.md` registra las fricciones reales de EIN
encontradas al usar EIN para construir su propia documentación, con evidencia
citable. No es documentación pública: es material en crudo.

Si al continuar aparecen más, van ahí. El criterio para entrar es que señalen
algo arreglable en el harness; los fallos de infraestructura (errores de API,
timeouts) no cuentan.

## Convenciones de esta rama

- Un commit por unidad de trabajo, mensaje en español explicando qué y por qué.
- **No uses `git rebase` sobre esta rama**: ya está publicada y el guard del
  repositorio deniega `push --force` en cualquier forma. Para ponerla al día,
  `git merge main`.
- Las entregas (commit, push, PR) van por `ein-git`.
