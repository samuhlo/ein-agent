status: pass
change: freeze-apply-corpus-and-packet-schema
phase: verify

# Verify — freeze-apply-corpus-and-packet-schema

## Veredicto

**pass.** Los siete criterios de éxito del diseño se cumplen con evidencia
ejecutada en esta sesión. No hay criterio verificado por lectura.

## Criterios de éxito, uno a uno

| # | Criterio | Evidencia |
|---|---|---|
| 1 | `validateApplyPacket` rechaza los siete códigos nombrando el campo, y nunca lanza | `tests/apply-packet.test.ts` — 25 pass, incluidos los casos de input basura (`undefined`, `null`, `42`, `[]`) |
| 2 | El compilador parsea las grafías conocidas, registra cuál vio y da `unknown-grammar` ante una desconocida sin barrer el cuerpo | `tests/apply-packet-compile.test.ts` — las diez grafías compilan; la regresión "rutas en el cuerpo pero no en la etiqueta" devuelve `[]`, no nueve ficheros |
| 3 | Un basename sin directorio se rechaza | caso `ambiguous-path`, y 2 apariciones reales detectadas en el archivo |
| 4 | La obsolescencia se detecta por digest de contenido | casos `stale-source`, incluido el fail-closed cuando falta el digest actual |
| 5 | La pertenencia se computa desde los cuatro hechos y cada exclusión lleva motivo | `tests/apply-corpus.test.ts` — 13 pass; `evals/apply-corpus.json` — 40 items, 16 exclusiones, 4 motivos |
| 6 | Serializar dos veces da bytes idénticos | `tests/apply-corpus-frozen.test.ts` — regenerar desde el `baseCommit` reproduce el fichero byte a byte, y archivar un cambio nuevo no lo mueve |
| 7 | Ningún módulo de fase importa el corpus | escaneo real de `ein-pi/**` y `cc-ein/**`, con el predicado probado contra ofensores sintéticos |

## Puertas

```
bun test tests/apply-packet.test.ts tests/apply-packet-compile.test.ts \
         tests/apply-corpus.test.ts tests/apply-corpus-frozen.test.ts
  63 pass · 0 fail

bun test            2317 pass · 16 fail · 9 errors
bun test (baseline) 2254 pass · 16 fail · 9 errors     ← con el trabajo en stash
bun run typecheck   sin errores
```

**Los 16 fallos y 9 errores son preexistentes en `origin/main`.** Reproducidos
con el trabajo guardado en stash: mismo número, mismos ficheros
(`updater-cli-entrypoints`, `installer-uninstall`, cierre empaquetado de
Cleaner, inventario instalado de agentes). Este cambio suma 63 verdes y cero
rojas. No se tocó ninguno de esos tests, según la condición de parada declarada
en `tasks.md // 005`.

## TDD estricto

Los cuatro bloques tienen RED registrado **antes** de producción, con el motivo
del fallo, y el ciclo completo en `apply-progress.md`. La triangulación no fue
ceremonia: encontró **cuatro defectos reales** que el GREEN no había visto —
marcador `decidir` que saltaba con prosa legítima, `**Production files:**` roto
por el orden de limpieza, fuga de frontera entre tareas hermanas, y
`**Focused tests:**` invisible para el regex de línea.

## Alcance

Ficheros nuevos: `ein-pi/agent/lib/apply-packet.ts`,
`ein-pi/agent/lib/apply-packet-compile.ts`, `ein-pi/agent/lib/apply-corpus.ts`,
`evals/build-corpus.ts`, `evals/apply-corpus.json`, y sus cuatro espejos en
`tests/`. **Ningún módulo existente modificado. Ningún artefacto archivado
reescrito. Ninguna dependencia añadida.** El radio de impacto en runtime es cero
y hay un test que lo mantiene así.

## Desviaciones declaradas

1. Dos códigos de rechazo que el diseño no tenía (`missing-field`, `malformed`),
   añadidos al diseño antes de escribir su prueba.
2. La frontera pasó a ser producción ∪ tests, y `allowedFilesGrammar` de una
   etiqueta a una lista. Descubierto por el caso contra el archivo real: bajo TDD
   estricto el ejecutor escribe el test primero, así que excluirlo lo bloquea.
3. Corregido un dato que los artefactos afirmaban de más: las grafías de
   producción reconocidas son diez, no once.
4. **El corpus se ancla a un `baseCommit`.** El defecto lo destapó el propio
   test al archivar el cambio: leyendo el árbol de trabajo, el corpus se movía
   cada vez que alguien archivaba algo. Corregido leyendo todo de git en el
   commit base. Registrado en `apply-progress.md // 006`.

## Lo que este cambio deja medido, y no arregla

```
tareas archivadas sin frontera legible   499
packets que compilan                     120
ejecutables                                0   (los 120 fallan por missing-stop)
frontera que su propio verify incumple   100 de 120
```

Cerrar esa brecha exige cambiar lo que `sdd-tasks` escribe. Está **fuera** de
este cambio a propósito: aquí solo se instala el instrumento que la mide.
