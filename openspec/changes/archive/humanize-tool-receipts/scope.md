# Scope: humanize-tool-receipts

## Summary

`ein-pi/agent/extensions/ein-ai.ts` registra **18 herramientas** y solo **2**
—`ein_sdd_status` y `ein_sdd_check`— definen `renderCall`/`renderResult`. Las
otras 16 vuelcan su salida cruda al chat. Y de esas 16, **ocho devuelven
`JSON.stringify(...)` como texto**: literalmente JSON en pantalla.

El diagnóstico ya está escrito en `ein-pi/agent/lib/tool-receipts.ts:5-16`: ese
texto tiene **dos públicos confundidos en uno**. El modelo necesita los hechos
para enrutar; el humano necesita saber qué acaba de pasar. Pi permite separarlos
sin perder nada — el `content` sigue yendo íntegro al modelo y `renderResult`
decide qué se pinta.

Hay una segunda mitad que el plan de dogfooding (`B1`) no cubría y que sí entra
aquí: hoy `receiptResult` (`ein-ai.ts:551-560`) devuelve **el volcado técnico
crudo** al expandir. Es decir, el humano elige entre no ver nada o ver JSON.

## Scope

Una sola pieza, en dos capas que ya existen.

1. **`ein-pi/agent/lib/tool-receipts.ts`** (módulo puro `[CORE]`) gana un recibo
   por herramienta: entra el `details` de la tool, sale `{ line, detail }`.
   - `line`: una frase corta en lenguaje llano, siempre visible.
   - `detail`: un bloque en lenguaje llano para el expandido. **No** el volcado.
2. **`ein-pi/agent/extensions/ein-ai.ts`** cablea `renderCall`/`renderResult` en
   las 16 que faltan, con el mismo patrón que ya usan las dos hechas.

Además, el módulo pasa a tener pruebas: hoy `statusReceipt`, `checkReceipt` y
`statusBlocked` **no tienen ninguna** (`tests/` no contiene `tool-receipts`).

### Registro de la voz

Decidido con el usuario antes de empezar: llano, no técnico. "3 hallazgos, 1
bloquea", no "findings=3 blocking=1". El nombre de la herramienta se dice en
castellano y por lo que hace, no por su identificador.

### Fuera de alcance, explícito

1. **Qué devuelven las tools al modelo.** El `content` no se toca: ni una coma.
   Cambiarlo sería cambiar el comportamiento del agente, no su presentación.
2. **El overlay.** Ya proyecta cambio, carril, fase, progreso, raíl de fases y
   tareas (`sdd-overlay.ts:156-215`). Es otra superficie y otro cambio.
3. **El instalador y el launcher.** Es el hito 5 del roadmap.
4. **El rename `pi-ein`/`cc-ein` y el logo.** El plan los manda al final.
5. **Los 16 fallos locales de la suite.** Diagnosticados aparte: les falta
   `bun run bundle-template:host`, no están rotos.

## Budget

```
scope: Dar recibo humano —línea siempre visible y bloque legible al expandir— a las 16 herramientas de Ein que hoy vuelcan salida cruda, sin tocar lo que reciben los modelos.
budget_allocated:
  max_tokens: 30000
  max_reads: 50
  max_runtime_ms: 600000
```

## Architecture

- Toda la redacción vive en `tool-receipts.ts`, módulo puro: entra el `details`,
  sale texto. Sin Pi, sin UI, sin disco. Es lo que lo hace probable sin arrancar
  un runtime.
- `ein-ai.ts` solo pinta: elige color y decide colapsado/expandido. Ninguna
  frase se escribe ahí.
- Espejo obligatorio en `tests/tool-receipts.test.ts`.

## Known constraints

1. **TDD estricto** (decidido para este cambio): cada frase que verá el usuario
   se fija en una prueba antes de existir.
2. **Carril `micro`**: alcance, diseño, ejecución, verificación y cierre.
   `verify` y `close` siguen siendo puertas duras.
3. **El `content` al modelo es intocable.** Una prueba debe demostrarlo, no
   prometerlo.
4. **Sin dependencias nuevas.** `bun.lock` no se toca.
5. **Ancho de terminal.** La línea siempre visible convive con recibos de otras
   herramientas; tiene que caer bien en 80 columnas.
6. **`ToolTheme` es la única API de color** disponible en el punto de render
   (`ein-ai.ts:534`): `fg(token, text)` y `bold(text)`.

---

## Spec delta declaration
spec_delta: none
spec_delta_reason: Solo decide qué se pinta en pantalla; el `content` que recibe el modelo queda byte a byte idéntico, así que no altera comportamiento observable ni ninguna especificación.
