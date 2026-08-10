# Resumen de cierre reconciliado: docs-site-shell

## Motivo de auditoría

Trabajo entregado en main fuera del flujo SDD; cierre reconciliado con evidencia actual y huecos separados.

Delivery occurred outside SDD.

## Entrega reconciliada

La entrega quedó repartida en los commits `ca69e81`, `b6f7b35` y `f4ebc21`:

- `ca69e81` añadió el sitio Astro/Starlight, su configuración, estilos, portada y shell personalizado con overrides de `Head`, `Header`, `Sidebar` y `Pagination`, componiendo `SiteTitle`, `Search` y `Shortcuts`.
- `b6f7b35` entregó el contenido real de las 21 páginas Markdown; junto con `index.mdx`, el sitio expone 22 rutas de contenido.
- `f4ebc21` añadió `.github/workflows/docs-deploy.yml` para publicar en GitHub Pages y actualizó la integración documental en CI y README.

El registro legacy no contiene `map.md`, `design.md`, `tasks.md`, `apply-progress.md` ni `verify-report.md`; estos artefactos estaban ausentes y no fueron reconstruidos.

## Repository verification

- `docs-site-build`: instalación reproducible con lockfile congelado y build estático de Astro completados correctamente.
- `docs-site-drift-tests`: las pruebas focalizadas del detector y del informe de drift pasaron.
- `docs-site-delivery-inventory`: inventario determinista confirmado: 21 `.md` más `index.mdx` son 22 rutas; están presentes Astro/Starlight, los cuatro overrides y la composición indicada, además de `docs-deploy.yml`.

## Successor changes

- `docs-site-mobile-surfaces`: separa el hueco móvil no entregado para `MobileMenuToggle`, `MobileMenuFooter` y `MobileTableOfContents`, preservando accesibilidad, slots y el shell de escritorio actual.
- `docs-site-contract-ci`: separa los gates de CI no entregados para validar las cuatro claves exactas del frontmatter y rechazar versiones semánticas literales en el HTML generado, sin sustituir build, drift ni deploy.
