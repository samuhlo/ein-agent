## // 000. RESUMEN
Las skills de estilo se entregan de verdad: 2.010 bytes de reglas en el prompt de quien escribe código, en vez de tres rutas y la esperanza de que las abra. Y un linter de dos reglas, informativo, con cero falsos positivos sobre los 173 ficheros del repo. Suite en 2560 verde.

## // 001. QUÉ CAMBIÓ
- `ein-pi/core/skills/local/comment-style/SKILL.md` y `logging-style/SKILL.md`: cada una empieza por `## Essentials`, el núcleo operativo (1.119 B y 738 B). El resto queda debajo como referencia. No se quitó ninguna regla.
- `ein-pi/agent/lib/style-contract.ts` (nuevo): lee esa sección de cada skill y arma el bloque. Fail-closed si falta.
- `ein-pi/agent/lib/style-lint.ts` (nuevo): emojis y formato de log con tag, sobre líneas dadas.
- `ein-pi/agent/extensions/ein-skill-registry.ts`: el bloque de convenciones entrega reglas; si no puede compilarlas, cae a las rutas de antes.
- Tres ficheros de test nuevos.

## // 002. CÓMO FUNCIONA POR DENTRO
El compilador lee la sección `Essentials` de cada skill y la concatena. No guarda una copia del texto: un extracto pegado en TypeScript se queda atrás la primera vez que se edita la skill, y se queda atrás en silencio. Si una skill pierde su núcleo, falla nombrándola, porque un bloque corto sigue pareciendo un bloque.

La construcción del bloque es pura y recibe la raíz de skills ya resuelta; quien la resuelve es el borde, que la deriva de la propia entrada del registry. Eso importa: el registry lee del **home instalado**, no del checkout, así que compilar desde el repo habría entregado las skills equivocadas.

El linter recibe líneas y nunca recorre el árbol. El límite de "solo lo tocado" es estructural, no una promesa: no puede reescribir lo que no ve.

## // 003. DECISIONES
- **Adelgazar la skill en vez de compilar la gorda.** El compilador existía solo porque `comment-style` pesaba 6,4 KB. Con el núcleo delante, el compilador coge una sección y el coste baja a menos de la mitad.
- **El catálogo de tags no se cierra.** La skill dice "use these tags only when useful": sugiere. Ella misma usa `[FEATURE]` y `[CRITICAL]` fuera del catálogo universal.
- **El linter informa, no bloquea**, mientras su ruido no esté medido en uso real.
- **Se comprueba lo mecánico y se declara lo que no.** Si un comentario explica el porqué es juicio, y el informe publica sus dos comprobaciones para que su silencio no se lea como un aprobado.

## // 004. VERIFICACIÓN
`bun test`: 2560 pass, 0 fail (baseline 2530). Ambos typechecks en verde.

TDD estricto en los grupos 001, 002 y 004. **El grupo 003, el linter, se escribió implementación-primero**, y queda dicho en `apply-progress.md` en vez de disimulado.

## // 005. PENDIENTE / RIESGOS
- Este cambio se replanteó a mitad. La primera versión entregaba 4.889 bytes y su linter marcaba `// [EXPORT] Registro en Pi` como error: un comentario correcto. Leer un catálogo abierto como whitelist fue un error de diseño, y la regla se retiró entera.
- La regla de emoji marcaba los dingbats `✓ ✗ ✕` de la propia gramática de Ein: nueve falsos positivos sobre código correcto, corregidos acotando a pictogramas.
- Bun 1.3.14 devuelve `false` al alternar un rango astral con otra rama en una regex; se rodeó con dos expresiones y queda anotado con `HACK ->` en el código.
- **7B sigue abierto**: `cc-ein/CLAUDE.md` tiene una frase donde Pi recibe ahora 2 KB de reglas.
- Los núcleos están en castellano dentro de skills cuyo cuerpo está en inglés. Es lo aprobado, pero la mezcla dentro de un fichero merece una decisión.
