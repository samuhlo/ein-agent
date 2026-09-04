status: complete
change: accept-typescript-in-apply-packets
work_groups: 1
verification_status: pass

## // 000. RESUMEN

Se arregló el rechazo incorrecto de sintaxis TypeScript legítima en el validador de apply-packets. El cambio suma **dos condiciones** al discriminante de "decisión sin resolver" para separar genéricos (`Record<string, unknown>`) y el operador `??` de los placeholders reales. La prueba viva: los cinco grupos de `accept-scout-fanout-reports` que fallaban sin motivo real ahora compilan `executable`.

## // 001. QUÉ CAMBIÓ

- `ein-pi/agent/lib/apply-packet.ts:156-157` — dos regex de `UNRESOLVED_MARKERS`:
  - `/\?{3,}/` (antes `/\?{2,}/`) — solo `???` marca, `??` es sintaxis
  - `/(?<![\p{L}\p{N}_$])<[^<>\s]+>/u` (antes `/<[^<>]+>/`) — lookbehind + sin-espacios-internos
- `tests/apply-packet.test.ts:219-256` — cinco tests nuevos (notación técnica ejecutable + `???`)

## // 002. CÓMO FUNCIONA POR DENTRO

El validador barría todo el texto de un packet en busca de `UNRESOLVED_MARKERS`, una lista de cinco regex. Dos de ellos cazan sintaxis de TypeScript:

- `/<[^<>]+>/` disparaba en cualquier `<X>` sin saber si era un genérico pegado a `Record`, `Set`, `Map` (legítimo) o un hueco suelto como `tests/<change>.test.ts` (debe rechazar).
- `/\?{2,}/` disparaba en el operador de fusión `??`, que es sintaxis decidida, no un agujero.

El cambio introduce **dos condiciones** en una sola expresión:

1. **Lookbehind negativo** `(?<![\p{L}\p{N}_$])` — un `<` precedido de letra, dígito, `_` o `$` está pegado a un identificador: es un parámetro de tipo, no un placeholder. Convierte `Record<string, unknown>` (pegado) en no-marcador, pero mantiene `tests/<change>.test.ts` (espacio antes de `<`) como marcador.

2. **Sin espacios dentro** `[^<>\s]+` — un placeholder es un token compacto; una expresión con operadores lleva espacios (ej. `< 1 || x >`). Esto permite cotas escritas con comparadores sin rechazar.

Ambas condiciones son necesarias. El lookbehind solo no bastaría para `< 1 || x >` (hay espacios). La prohibición de espacios solo no bastaría para `archivo<X>.ts` (se marcaría igual).

La lista de cinco usa el mismo `unresolvedMarker()` de lectura; v1 y v2 heredan la corrección sin cambios adicionales.

## // 003. DECISIONES

**D1: Forma final de los dos regex** — Adoptada palabra por palabra del design.md. El lookbehind usa `[\p{L}\p{N}_$]` con flag `u` (Unicode) en lugar de `\w` para respetar identificadores con acentos y `$` (legal en TS).

**D2: Lookbehind en el regex, no una función auxiliar** — Se mantiene la homogeneidad de la lista (solo regex) y se conserva el contrato de mensaje: el `hit[0]` del lookbehind de ancho cero sigue siendo `<change>`, no incluye el carácter previo. Un helper de contexto habría roto el diseño.

**D3: `archivo<X>.ts` — Falso negativo aceptado** — Un placeholder pegado a una palabra ya no marca. Se acepta: no hay señal que lo separe sin semántica, y la puerta `FILE_TOKEN_RE` (luego en el pipeline) atrapa esos casos con otro código (`out-of-scope`). Frecuencia observada: cero en las 4 cadenas medidas.

**D4: Comparadores en prosa** — `< 1 || x >` hoy era un rechazo incorrecto. El validador no es corrector de estilo. La decisión ya existe (la escribió el autor), solo quedó escrita con símbolos. La condición "sin espacios" lo resuelve determinista, sin parsear.

**Alternativas rechazadas:**
- Sacar `unresolved-decision` de `REJECTED_CODES` (degradar a `incomplete`): prohibido por scope. Un placeholder real DEBE rechazar.
- Lista blanca de tipos (`Record`, `Set`, `Map`): no es determinista frente a tipos del proyecto, envejece mal.
- Función `isGenericAt()`: rompe la homogeneidad de la lista y arriesga el contrato de mensaje.

## // 004. VERIFICACIÓN

**Comportamiento observable, 10 casos de aceptación:**

- ✓ `Record<string, unknown>` → ejecutable (pegado, sin espacios)
- ✓ `Set<string>` → ejecutable (anidado: `Map<string, Set<string>>` igual)
- ✓ `??` operador → ejecutable (dos signos)
- ✓ `< 1 || x >` → ejecutable (espacios internos)
- ✓ `bun test tests/<change>.test.ts` → rechazado (no pegado: cae)
- ✓ `Decidir entre TBD y...` → rechazado (marcador intacto)
- ✓ `[decidir cual]` → rechazado (marcador intacto)
- ✓ `Resolver [decidir cómo]` en steps (v2) → rechazado (marcador intacto)
- ✓ `???` → rechazado (tres signos, regla nueva)
- ✓ `TODO` → rechazado (marcador intacto)

**Puertas de verificación:**

- `bun test` desde raíz — 3119 pass, 0 fail
- `bun run typecheck` desde raíz (cubre ein-pi/) — limpio
- `cd installer && bun run typecheck` — limpio

**Prueba de aceptación real** (accept-scout-fanout-reports):
Reinyectadas Record<string, unknown>, Set<string>, Map<string, Set<string>>, ?? en todos los `architecture:` de tasks.md, compiladas todas las 5 grupos con `compileApplyPacketV2` + `validateApplyPacketV2`:
- GROUP 001, 002, 003, 004, 005 — 5/5 executable

Antes del cambio: 0/5 ejecutables. La medición del padre (4 rechazados sin motivo real) se invierte.

Cobertura TDD: 5 tests nuevos antes del código (RED), pasan tras el cambio (GREEN). Casos de rechazo preexistentes siguen en rojo (regresión guardada). No hay refactor.

- verify: `bun test tests/apply-packet.test.ts tests/apply-packet-v2.test.ts`
- verify: `bun test`
- verify: `bun run typecheck`
- verify: `cd installer && bun run typecheck`

## // 005. PENDIENTE / RIESGOS

**Riesgos de diseño, ambos aceptados por escrito:**

- `archivo<X>.ts` — placeholder pegado a palabra, sin marca — mitigado por FILE_TOKEN_RE después (rechaza con otro código). Nunca observado.
- `<nombre archivo>` — placeholder con espacios, sin marca — convención: placeholders son tokens compactos. Genuinamente ambiguo sin leer intención.

Ninguno adicional. Las interacciones preservadas (FILE_TOKEN_RE, test vivo, otros tres marcadores, REJECTED_CODES) siguen intactas.
