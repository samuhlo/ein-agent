# Documentación interna vigente

Este directorio no es un archivo de conversaciones ni investigaciones. Solo contiene:

- [`roadmap.md`](roadmap.md): trabajo actual y siguiente.
- [`adr/`](adr/): decisiones duraderas y su razón.

El comportamiento vigente vive en `openspec/specs/`, las guías de usuario en `docs-site/`, los cambios cerrados en sus resúmenes OpenSpec y el detalle histórico en Git.

## Lectura recomendada

- [Manifiesto](../MANIFIESTO.md): principio económico, calidad y simplificación.
- [Ejecución barata verificable](adr/0005-make-cheap-apply-verifiable.md): contratos para acercar apply a modelos baratos y, en el futuro, locales.
- [Retirada de compresores](adr/0006-remove-runtime-compressors.md): por qué Ein deja Hypa y Headroom, y qué conserva para ahorrar contexto.
- [Documentación pública](https://samuhlo.github.io/ein-agent/): instalación, flujos, runtimes y recuperación.
- [Changelog](../CHANGELOG.md) y [releases](https://github.com/samuhlo/ein-agent/releases): cambios incluidos en cada versión publicada.

Las guías del checkout describen su código. Un cambio integrado en `main` puede estar pendiente de release; las notas del tag indican qué binario contiene cada corrección. Los informes de `evals/` son evidencia de una revisión y escenario concretos, no una certificación permanente ni una promesa de ahorro universal.
