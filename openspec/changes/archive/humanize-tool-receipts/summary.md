status: complete
change: humanize-tool-receipts
phase: close

# Summary — humanize-tool-receipts

## Qué cambia para quien mira la pantalla

De 18 herramientas de Ein, **16 volcaban su salida cruda al chat** y ocho de
ellas escribían JSON literal. Ahora las 18 dicen una frase corta en castellano,
y al expandir cuentan lo que hicieron en el mismo registro —no el volcado
técnico, que era la única alternativa que había antes—.

```
ein · Tamaño de la PR    312 líneas de producción, dentro del presupuesto

  El cambio toca 312 líneas de código de producción.
  Las 88 líneas de pruebas no cuentan para el presupuesto.
  El límite para una sola revisión es de 400, así que cabe entera.
```

## Cómo está montado

`ein-pi/agent/lib/tool-receipts.ts` es puro: entra el `details` de la tool, sale
`{ line, detail, bad }`. Ahí viven las 18 frases y las reglas de voz. `ein-ai.ts`
solo pinta: elige color y nivel.

El cableado no se repite 18 veces. Hay **una puerta única**, `registerEinTool`,
por la que pasa toda tool de Ein y que añade los dos renderers. Una tool nueva no
puede quedarse sin recibo por olvido: un test lee el fuente y comprueba que las
registradas son exactamente las que tienen recibo.

Lo que recibe el modelo no cambia ni una coma. Es presentación, no
comportamiento, y hay una prueba que lo sostiene.

## Reglas de voz, fijadas en tests y no a gusto

Castellano llano; cero identificadores de código; el número con su unidad en
palabras; la consecuencia antes que el dato; y el siguiente paso cuando lo hay.
Un `details` con otra forma dice "no se pudo leer el resultado" en vez de
inventarse una frase.

## El fallo propio, declarado

Un reemplazo global alcanzó la llamada de dentro del propio ayudante y dejó
`registerEinTool` llamándose a sí misma. TypeScript lo avisó —`TS7023`, "se
referencia a sí misma en su expresión de retorno"— y el aviso se silenció con una
anotación en vez de leerse. El síntoma fue un cuelgue de la suite, no un error.

Queda escrito en `apply-progress.md` con el método que lo aisló.

## Evidencia

```
26 pruebas nuevas · 0 fallos
bun test completo                              2491 pass · 2 fail
bun test completo (baseline main, con stash)   2465 pass · 2 fail
typecheck raíz e installer                     sin errores
```

Los 2 fallos no son estables ni propios: cambian de fichero cada pasada y el
baseline limpio da también 2, distintos.

## Hallazgo que vale más que el cambio

La suite local **no estaba rota**. Le faltaba un paso previo sin documentar:
`cd installer && bun run bundle-template:host`. Sin él salían 16-19 rojos; con
él, 2491 verdes. CI sí lo hace, por eso allí pasaban. Documentarlo es otro
cambio, y barato.
