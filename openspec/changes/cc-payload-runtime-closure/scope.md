# Scope — cc-payload-runtime-closure

scope: Retirar del payload de Claude las dependencias de interfaz que viajan sólo por tipos y hacer que el bundler calcule el cierre de ejecución con la sintaxis real de TypeScript, sin cambiar las entradas públicas ni el runtime instalado.
budget_allocated:
  max_tokens: 24000
  max_reads: 40
  max_runtime_ms: 900000

## Problema

`ein-pi/agent/lib/project-settings.ts` produce el modelo de ajustes, pero importa su tipo `Setting` desde `terminal-app.ts`. La dependencia va del dominio hacia la interfaz. Como `shared/ports/sdd.ts` alcanza el catálogo de ajustes, ese único `import type` conecta el cierre fuente de Claude con la aplicación de terminal de Pi.

`installer/scripts/bundle-ein-cc.ts` calcula el cierre mediante `IMPORT_RE`. La expresión regular no distingue una dependencia que existirá al ejecutar de una anotación que TypeScript elimina, así que el archive incluye ocho ficheros y aproximadamente 1.760 líneas que nunca se ejecutan en Claude.

La publicación compila y fuma el payload, pero los tests del bundler no fijan todavía la semántica de imports de valor, imports de tipo, reexports mixtos ni fuentes que no se pueden analizar.

## Entrega

Un único cambio SDD cubre dos PRs encadenadas:

1. Propiedad del modelo: `Setting` pasa al dominio de ajustes y la interfaz lo importa desde allí. La comparación del manifiesto separa esta corrección de propiedad de la poda efectiva del segundo PR.
2. Cierre semántico: el bundler usa el parser de TypeScript, sigue sólo dependencias relativas necesarias al ejecutar, falla cerrado ante sintaxis dudosa y fija el comportamiento con fixtures. La entrega termina compilando las cuatro entradas desde un payload aislado y ejecutando el smoke BunFS.

## Non-goals

- No mueve todavía el motor SDD a `shared/sdd/` ni reduce los diecinueve puentes autorizados.
- No cambia las cuatro entradas del payload, sus rutas instaladas, el formato del manifiesto ni el algoritmo de checksum.
- No convierte el bundler en un resolvedor general de paquetes, aliases de `tsconfig`, CommonJS o módulos externos.
- No añade un límite global de longitud, un nuevo presupuesto ni otra regla de estilo.
- No amplía CI por defecto: los tests fijan la semántica y el workflow de publicación conserva el smoke compilado. Sólo se añade una puerta si la verificación descubre un hueco mecánico real.
- No toca el presupuesto del prompt, los hotspots ni los módulos Cleaner.

## Áreas afectadas

- `ein-pi/agent/lib/project-settings.ts` — dueño del modelo de ajustes.
- `ein-pi/agent/lib/terminal-app.ts` y sus consumidores — importan el modelo desde el dominio.
- `installer/scripts/bundle-ein-cc.ts` — cálculo del cierre fuente.
- `tests/architecture-boundaries.test.ts` — dirección dominio/interfaz.
- `tests/cc-payload-bundle.test.ts` — semántica del cierre y fallos cerrados.
- `openspec/specs/claude-payload-transport/spec.md` — contrato canónico.
- `docs/roadmap.md` — retirar la fase 4 al cerrar la segunda PR.

## Riesgos

- Ignorar un import de valor dejaría el payload incompleto y el fallo aparecería al instalar o compilar en el hogar de Claude.
- Seguir un import puramente de tipo conserva peso muerto y vuelve a contradecir la frontera declarada.
- Los imports mixtos (`import { value, type Shape }`) y reexports necesitan decisión por cláusula; mirar sólo `importClause.isTypeOnly` sería insuficiente.
- `createSourceFile` devuelve un árbol incluso con errores. Si no se inspeccionan sus diagnósticos, una fuente rota podría parecer un cierre válido.
- Los roots copiados completos son deliberados y no participan en esta poda; confundir inventario explícito con cierre transitivo ampliaría el cambio.

## Condiciones de retirada

- `IMPORT_RE` desaparece en este cambio; no queda como fallback silencioso.
- No se conserva un tipo duplicado ni un reexport temporal entre interfaz y dominio.
- Si el parser no puede demostrar que una arista es sólo de tipos, el bundle falla en lugar de adivinar.
- Si la nueva lógica no puede explicarse con fixtures pequeños de import, export, mezcla, dinámico y sintaxis inválida, se considera demasiado general y se reduce antes del cierre.
