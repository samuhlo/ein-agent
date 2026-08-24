status: complete
change: freeze-apply-corpus-and-packet-schema
phase: close

# Summary — freeze-apply-corpus-and-packet-schema

## Qué se construyó

La mitad determinista de `2A`: el examen congelado y la hoja de encargo que un
ejecutor barato debe poder seguir sin decidir nada.

- **`apply-packet/v1`** — schema versionado y validador que responde
  *ejecutable*, *incompleto* (falta contenido) o *rechazado* (afirma algo falso o
  sale de su frontera), nombrando siempre el campo culpable. Nunca lanza.
- **Compilador** desde `tasks.md`, que lee la frontera de escritura de **la
  etiqueta** y solo de ahí, reconociendo un conjunto cerrado de grafías.
- **`apply-corpus/v1`** — corpus cuya pertenencia se calcula desde cuatro hechos
  comprobables, con serialización canónica y digest.
- **`evals/apply-corpus.json`** — 40 ítems, 16 exclusiones con motivo, anclado a
  un `baseCommit` y regenerable byte a byte desde el historial de git.

## Por qué era necesario

El campo más importante del encargo —qué ficheros puede tocar el ejecutor— era
ilegible para una herramienta. Diez grafías distintas para la etiqueta de
producción y once para la de tests, y el único extractor existente
(`extractProductionFiles`, `sdd-router.ts:778`) ni siquiera la lee: barre el
cuerpo del grupo entero. Contra el `tasks.md` mejor escrito del repo, un grupo
que declara `none` le devolvía nueve ficheros.

Para avisar de un grupo demasiado grande esa aproximación vale. Como permiso de
escritura de un modelo barato, es un permiso accidental.

## Lo que quedó medido

Ejecutando el compilador y el validador contra los 51 `tasks.md` archivados:

```
tareas sin frontera legible              499
packets que compilan                     120
ejecutables                                0
  todos fallan por                       missing-stop
frontera que su propio `verify:` incumple  100 de 120
```

Tres hechos, ninguno supuesto. El caso típico de los 499 narra los ficheros
dentro del título de la tarea ("Crear `x.ts` … y añadir la matriz en
`y.test.ts`"): un ejecutor no puede derivar un permiso de escritura de una frase.
Y la condición de parada no existe en la gramática actual — 0 de 51.

Cerrar esa brecha exige cambiar lo que `sdd-tasks` escribe. Queda **fuera** de
este cambio a propósito: aquí solo se instala el instrumento que la mide, y el
recuento es un test vivo que se moverá cuando la gramática cambie.

## Decisiones que cambiaron durante el trabajo

1. **La frontera es producción ∪ tests.** Lo destapó la prueba contra un cambio
   real: bajo TDD estricto el ejecutor escribe el test primero, así que una
   frontera que lo excluye lo bloquea en el primer ciclo.
2. **Dos códigos de rechazo nuevos** (`missing-field`, `malformed`) que el diseño
   no tenía y que RED hizo evidentes.
3. **Diez grafías de producción, no once.** `production_forecast:` es una
   estimación de tamaño, no una frontera.
4. **El corpus se ancla a un commit base.** Al archivar este mismo cambio, el
   test de congelado falló: el recolector leía el árbol de trabajo, así que el
   corpus se movía cada vez que alguien archivaba algo — empezando por el cambio
   que lo creó, que se incluía a sí mismo. Ahora todo se lee de git en el commit
   base y el árbol de trabajo no influye.

## Evidencia

```
63 pruebas nuevas · 0 fallos
bun test            2317 pass · 16 fail   (los 16 preexisten en main)
bun test baseline   2254 pass · 16 fail   (mismo trabajo en stash)
bun run typecheck   sin errores
```

La triangulación y el gate de cierre encontraron cinco defectos que el GREEN no
vio: el marcador
`decidir` saltando con prosa legítima, `**Production files:**` roto por el orden
de limpieza, fuga de frontera entre tareas hermanas y `**Focused tests:**`
invisible para el regex de línea.

## Alcance y aislamiento

Cinco ficheros nuevos de producción y datos, cuatro espejos en `tests/`. Ningún
módulo existente modificado, ninguna dependencia añadida, ningún artefacto
archivado reescrito. El radio de impacto en runtime es cero, y un test escanea
`ein-pi/**` y `cc-ein/**` para que siga siéndolo.
