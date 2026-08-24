status: pass
change: humanize-tool-receipts
phase: verify

# Verify — humanize-tool-receipts

## Veredicto

**pass.** Los seis criterios del diseño se cumplen con evidencia ejecutada en
esta sesión. Ninguno se da por bueno leyendo el código.

| # | Criterio | Evidencia |
|---|---|---|
| 1 | Las 18 herramientas tienen `renderCall` y `renderResult` | Una sola puerta (`registerEinTool`) los añade; un test lee el fuente y comprueba que las registradas son **exactamente** las 18 con recibo |
| 2 | Cada recibo tiene su prueba, incluidas las dos que no tenían ninguna | `tests/tool-receipts.test.ts` — 26 pass, 1878 aserciones |
| 3 | Ninguna línea pasa de 60 caracteres | Se mide sobre los 18 recibos × 8 entradas distintas |
| 4 | Ningún recibo contiene un identificador de código | Regex contra `algo_asi` y `camelCase` en línea y detalle, sobre todos |
| 5 | Un `details` inesperado da el recibo de fallo y nada lanza | Los 18 se golpean con `undefined`, `null`, `42`, `"texto"`, `[]`, `{}` y formas ajenas |
| 6 | El `content` de las 18 queda byte a byte idéntico | Ninguna línea que construya `content` menciona el módulo de recibos; `execute` no se tocó en ninguna tool |

## Puertas

```
bun test tests/tool-receipts.test.ts             26 pass · 0 fail
bun test (los 3 ficheros tocados)                55 pass · 0 fail
bun test completo                                2491 pass · 2 fail
bun test completo (baseline main, con stash)     2465 pass · 2 fail
bun run typecheck                                sin errores
cd installer && bun run typecheck                sin errores
```

Los 2 fallos del completo **no son estables ni propios**: cambian de fichero en
cada pasada y el baseline sobre `main` limpio da también 2, distintos. Requisito
previo para que la suite sea legible en local:
`cd installer && bun run bundle-template:host`.

## TDD estricto

RED registrado antes de producción, con su motivo. GREEN a la primera en los 22
casos iniciales. La triangulación añadió 4 casos que atan el registro al fuente
real y uno de ellos nació con la afirmación equivocada; se corrigió al invariante
verdadero en vez de relajarlo.

## El fallo propio, declarado

Un reemplazo global alcanzó la llamada de dentro del propio ayudante y dejó
`registerEinTool` llamándose a sí misma. TypeScript lo avisó (`TS7023`,
"se referencia a sí misma en su expresión de retorno") y el aviso se silenció con
una anotación en vez de leerse. El síntoma fue un cuelgue, no un error.

Queda en `apply-progress.md` con el método que lo aisló: el cuelgue sobrevivía a
un timeout por test —luego no era una espera dentro de un test— y el mismo
fichero pasaba en 6,4 s sobre `main` limpio —luego era propio—.

## Alcance

Tocados: `ein-pi/agent/lib/tool-receipts.ts` (reescrito),
`ein-pi/agent/extensions/ein-ai.ts` (puerta única de registro),
`tests/tool-receipts.test.ts` (nuevo) y dos patrones de descubrimiento en
`tests/agent-tools-contract.test.ts` y `tests/sdd-check-ux.test.ts`.

**Ningún `execute` modificado. Ninguna dependencia añadida. El overlay, el
instalador y el launcher no se tocan.**
