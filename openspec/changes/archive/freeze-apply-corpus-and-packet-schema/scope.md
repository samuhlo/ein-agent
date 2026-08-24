# Scope: freeze-apply-corpus-and-packet-schema

## Summary

Este cambio ejecuta la mitad determinista de `2A` del roadmap
(`docs/roadmap-features-ein.md:180-203`): congelar el **corpus** de evaluación y
fijar el **schema del Apply Packet/IR**. No mide la línea base, no instrumenta el
runtime y no compara ningún modelo.

El motivo es medido, no doctrinal. El packet necesita, como mínimo, "outcome
exacto, archivos permitidos, ediciones ordenadas o intención acotada,
invariantes, comando enfocado, condiciones de parada y evidencia esperada". Sobre
los 51 `tasks.md` archivados, ese contrato hoy es ilegible para una herramienta:

| Campo del packet | Cómo aparece hoy en `tasks.md` | Cobertura |
|---|---|---|
| outcome | título de la casilla, prosa libre | 51/51, sin estructura |
| archivos permitidos | **10 grafías distintas** a nivel de grupo | ver abajo |
| comando enfocado | `- verify:` | 50/51 |
| invariantes | disperso entre `architecture:` y `avoid:` | 50/51 |
| condiciones de parada | `- stop:` | **0/51** |
| evidencia esperada | implícita en `verify:` | sin campo propio |

Las diez grafías para lo mismo, contadas sobre el archivo (`production_forecast:`
aparece una vez más, pero es una estimación de tamaño, no una frontera):

```
18  Production files:            10    - production paths:
11  Production files (apply touches):   7  **Production files:
 6  production-files:             6    production files:
 4    - production files:         3  production_files:
 1  - Production allowlist:       1    - production/doc paths:
```

Y el extractor que existe hoy, `extractProductionFiles`
(`ein-pi/agent/lib/sdd-router.ts:778-780`), no lee la etiqueta: aplica un regex de
rutas a todo el cuerpo del grupo y filtra las que parecen producción. Contra el
`tasks.md` mejor escrito del repo (`fix-cleaner-participant-slicing`):

```
Grupo // 001  declarado: none            extraído: 9 ficheros
Grupo // 005  declarado: 1 fichero       extraído: 2
Grupo // 007  declarado: 1 fichero       extraído: 2 (uno es un basename suelto)
```

Para el aviso `oversized-group` esa aproximación basta. Para la frontera de
escritura de un ejecutor barato no: un packet que declare "puedes tocar 9
ficheros" en un grupo que no debe tocar ninguno no es un contrato, es un permiso
accidental.

## Scope

Dos piezas. Ambas son determinismo puro: módulos sin estado global y datos en
disco. Ninguna toca el runtime, el router, el overlay ni los prompts.

### Pieza 1 — Corpus congelado

Un conjunto versionado de cambios archivados con outcome conocido, que sirve como
examen fijo para cualquier medición futura. Materia prima disponible: 51 de 56
cambios archivados tienen `tasks.md`, `design.md`, `apply-progress.md`,
`verify-report.md` y `summary.md`; 4 son de carril `micro` (sin `tasks.md`) y 1
solo conserva `summary.md`.

El corpus fija por cada ítem: identificador del cambio, carril, postura TDD,
outcome esperado, ficheros que el apply tocó de verdad y el comando de
verificación enfocado. Congelado significa inmutable: si el examen cambia, las
notas dejan de compararse entre sí.

### Pieza 2 — Schema del Apply Packet y su validador

Un tipo versionado y un validador determinista que **rechaza** un packet:

- sin invariante declarada;
- ambiguo (una decisión que el ejecutor tendría que inventar);
- obsoleto (compilado contra un `design.md`/`tasks.md` que ya cambió);
- fuera de alcance (edición o comando que sale de los ficheros permitidos).

El compilador que produce el packet desde `design.md` + `tasks.md` entra aquí
solo hasta donde el schema necesite para probarse contra el corpus real. La
adopción del packet por `sdd-apply` NO entra.

### Fuera de alcance, explícito

1. **Pasos 2 y 3 de 2A** — ejecutar la línea base y fijar umbrales. Requieren
   instrumentación que no existe (turnos, contexto pico, desviaciones, preguntas
   al supervisor) y sesiones reales. Cambio propio.
2. **Instrumentar el runtime.** Nada en `ein-pi/agent/lib/sdd-*` cambia de
   comportamiento en este cambio.
3. **Comparar o promocionar modelos.** Es `2B`, y depende de 2 y 3.
4. **Migrar los `tasks.md` archivados** a una grafía única. El corpus documenta
   la deriva; no la reescribe. Reescribir el archivo falsearía el examen.
5. **Cambiar la gramática que `sdd-tasks` escribe.** Que el packet exija campos
   que hoy no existen (`stop`, evidencia) es un hallazgo para un cambio
   posterior, no una edición de prompts aquí.

## Budget

```
scope: Congelar el corpus de evaluación desde los cambios archivados y fijar el schema del Apply Packet/IR con su validador de rechazo, sin medir línea base ni tocar el runtime.
budget_allocated:
  max_tokens: 25000
  max_reads: 45
  max_runtime_ms: 600000
```

## Architecture

- Lógica nueva en `ein-pi/agent/lib/`, módulos `[CORE]`: no leen, no escriben, no
  ejecutan. Reciben el texto de los artefactos como parámetro y devuelven un
  resultado. La E/S se queda en el borde.
- Espejo obligatorio en `tests/<mismo-nombre>.test.ts` (convención de `EIN.md`).
- El corpus vive como dato en disco, versionado en git. Su ubicación exacta es
  decisión de `sdd-design`.
- Reutilizar la gramática ya existente donde sea correcta: partición por `##` de
  `oversizedGroupWarnings` (`sdd-guardrails.ts:149-168`) y el predicado de rutas
  de `sdd-router.ts`. No duplicar un segundo regex de ficheros: esa duplicación
  ya fue un fallo declarado en `oversizedGroupWarnings:154-156`.

## Known constraints

1. **TDD estricto** (decidido para este cambio): RED antes que GREEN, con la
   evidencia en `apply-progress.md`.
2. **Trabajo en paralelo.** Otro agente ejecuta `publish-installer-alpha` sobre
   `installer/**`, `.github/workflows/`, `tests/release-*` y `tests/install-*`.
   Este cambio corre en un worktree hermano desde `origin/main` y no toca ninguno
   de esos ficheros. Mientras dure, la puerta es el test enfocado; `bun test`
   completo desde raíz se corre al cerrar.
3. **Dos typechecks**: `bun run typecheck` en la raíz y `cd installer && bun run
   typecheck`. Este cambio solo puede afectar al primero.
4. **Sin dependencias nuevas.** `bun.lock` no se toca.
5. **El corpus no puede ser una segunda fuente de verdad.** Es un dato de
   evaluación; ninguna herramienta de fase puede leerlo para decidir routing.
6. **Fail-closed.** Un artefacto ilegible o ambiguo produce `unknown`, nunca un
   packet válido por defecto.

## Decisions deferred to sdd-design

1. **Tamaño y criterio de selección del corpus.** ¿Los 51 completos, o una
   muestra estratificada por carril, tamaño y clase de trabajo? Un corpus grande
   mide mejor y cuesta más de ejecutar en el paso 2.
2. **Formato y ubicación del corpus.** JSON versionado con esquema propio frente
   a un manifiesto declarativo más legible.
3. **Qué es "outcome conocido"** de forma computable: ¿`verify-report.md` con
   `status: pass`, el cierre archivado, o el diff real del apply?
4. **Grafía canónica de ficheros permitidos** que el packet exige, y cómo se
   comporta el compilador ante las diez grafías heredadas: ¿las tolera con
   procedencia declarada, o las rechaza y obliga a la canónica?
5. **`stop` no existe en ningún `tasks.md` archivado.** ¿El schema lo exige y
   ningún packet histórico compila —lo cual es un resultado válido y medible—, o
   lo deriva de `avoid:` con procedencia degradada?
6. **Qué significa "obsoleto"** de forma determinista: hash del artefacto de
   origen, marca de tiempo, o ambos.

---

Spec delta: PRESENTE, dominio nuevo `apply-packet`. Registrado con `cc-ein-sdd
delta freeze-apply-corpus-and-packet-schema --domain apply-packet`: 2 escenarios
ADDED. Sus requisitos transcriben lo que el roadmap ya fija
(`docs/roadmap-features-ein.md:200-203`) — rechazo de packet sin invariante,
ambiguo, obsoleto o fuera de alcance, y corpus congelado y reproducible. No son
decisiones de diseño anticipadas: `sdd-design` puede afinar el texto del
requisito y añadir escenarios, pero no puede reabrir estas dos obligaciones sin
contradecir el roadmap.
