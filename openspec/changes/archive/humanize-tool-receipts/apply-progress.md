status: complete
change: humanize-tool-receipts
phase: apply
strict_tdd: true

# Apply — humanize-tool-receipts

## RED

`bun test tests/tool-receipts.test.ts` → **0 pass / 1 fail** por módulo sin los
exports nuevos. 22 casos escritos antes de una sola línea de producción: las 18
frases visibles, las reglas de voz aplicadas a todos los recibos, el ancho, el
fail-closed y "ningún recibo lanza".

## GREEN

**22 pass / 0 fail a la primera.** El diseño ya traía la tabla de las 18
decidida, así que no quedaba nada que descubrir en la redacción.

`ein-pi/agent/lib/tool-receipts.ts` pasa de dos recibos sueltos a un registro:
`TOOL_LABELS`, `TOOL_RECEIPTS` y `receiptFor(tool, details)`.

## El cableado, y el error que costó una hora

Para no repetir 18 bloques de render, se añadió una puerta única en
`ein-ai.ts`: `registerEinTool(spec)` envuelve `pi.registerTool` y le añade
`renderCall`/`renderResult`. Después, un reemplazo global cambió
`pi.registerTool({` por `registerEinTool({`.

**Ese reemplazo alcanzó también a la llamada de dentro del propio ayudante**, así
que `registerEinTool` se llamaba a sí misma: recursión infinita. El síntoma no
fue un error, fue un **cuelgue** de `tests/agent-tools-contract.test.ts`, que
carga la extensión con un `pi` de mentira.

Lo grave no es el reemplazo: es que **TypeScript lo dijo y no lo escuché**.

```
TS7023: 'registerEinTool' implicitly has return type 'any' because it does not
have a return type annotation and is referenced directly or indirectly in one of
its return expressions.
```

"Se referencia a sí misma en su propia expresión de retorno" es literalmente la
recursión. Se silenció añadiendo `: void` — se calló el aviso en vez de leerlo.

Diagnóstico correcto, ya con método: el fichero se colgaba **también con un
timeout por test**, lo que descarta una espera dentro de un test; el mismo
fichero sobre `main` limpio pasaba en 6,4 s, lo que lo señalaba como propio.

## Tests ajenos que hubo que tocar, y por qué

Dos pruebas descubren cosas **buscando texto literal en el fuente**, y el
renombrado las dejó ciegas:

- `tests/agent-tools-contract.test.ts` encuentra las tools con un regex sobre
  `registerTool(`. Con `registerEinTool` no encontraba ninguna, así que "toda
  tool declarada existe" fallaba por no ver ninguna. Regex ampliado a
  `register(?:Ein)?Tool\(`; lo que comprueba no cambia.
- `tests/sdd-check-ux.test.ts` acota el bloque del comando hasta el siguiente
  `registerTool`. Sin ese literal, el bloque se estiraba hasta un
  `JSON.stringify` de otra tool. Mismo ajuste del terminador.

Ninguna de las dos afloja su garantía: solo dejan de depender de una grafía.

## TRIANGULATE

4 casos nuevos que atan el registro al código real, no a la palabra del autor:

- ninguna tool se registra saltándose la puerta —`pi.registerTool` aparece
  exactamente **una** vez, y nunca seguido de un `name:`;
- las tools registradas son **exactamente** las que tienen recibo, leídas del
  fuente: añadir una tool sin recibo rompe la prueba;
- el módulo de recibos no aparece en ninguna línea que construya `content`
  (R5: lo que recibe el modelo es intocable);
- el expandido pinta `receipt.detail`, y `firstText(result)` —el volcado— ya no
  existe en el fichero.

La primera nació mal: afirmaba que `pi.registerTool({` no podía existir, y el
ayudante tiene que llamarlo una vez. Se afinó al invariante de verdad.

## Puertas

```
bun test tests/tool-receipts.test.ts                  26 pass · 0 fail
bun test (los 3 ficheros tocados)                     55 pass · 0 fail
bun test completo                                     2491 pass · 2 fail
bun test completo (baseline main, con stash)          2465 pass · 2 fail
bun run typecheck                                     sin errores
cd installer && bun run typecheck                     sin errores
```

**Los 2 fallos no son estables ni son míos.** Cambian de fichero en cada pasada
(`inventario instalado`, `packaged Cleaner`, `continuity supervisor`, `Cleaner
complexity`) y el baseline sobre `main` limpio da también 2, distintos. Son
tests pesados que compiten por el mismo template extraído; en aislado pasan.

## Hallazgo que vale para el proyecto

La suite local **no está rota**: le faltaba un paso previo sin documentar.

```
cd installer && bun run bundle-template:host   # y solo entonces
bun test                                        # 2491 pass
```

Sin ese paso salían 16-19 rojos. CI sí lo hace (`ci.yml:92-94`), por eso allí
pasaban. No se documenta aquí porque toca `EIN.md` y este cambio no lo abre.
