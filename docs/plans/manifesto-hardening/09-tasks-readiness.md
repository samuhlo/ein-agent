# 09 · Las tareas terminadas no se bloquean por cabeceras

Estado: diseño listo para ejecutar; no implementado.
Base auditada: `3b9fa420f8cd18480bee6a19dd1ed14b99bc483e` (alpha.9).
Dependencias: ninguna; coordinar edición de routing-core con 01 y 02.
Manifiesto: //004. Ejecutar sobre main limpio, nunca sobre el checkout de la auditoría.

## A. Proposal

El validador acepta una lista de tareas terminadas sin `status` y `blocked_by`,
pero el router vuelve a presentar esas ausencias como bloqueos. El handoff ordena
detenerse por ellas. Se alineará el lector con la excepción que ya declara el lint.

El cambio tiene una frontera pequeña: tareas con al menos una casilla válida y
ninguna pendiente. No elimina requisitos de tareas abiertas, bloqueos explícitos,
comandos de verificación ni protecciones de apply.

Anclas:

- `shared/sdd/sdd-routing-core.ts`: `readTasksStatus`, `resolveSddNext`,
  `sddStatusBlockers`, `readApplyOutcome`.
- `shared/sdd/sdd-artifact-validation.ts`: `lintTasksArtifact`, `allDone`.
- `ein-pi/agent/lib/sdd-router.ts`: `sddNextHandoff`.
- `shared/sdd/sdd-close-readiness.ts`: comprobación `tasks.counts.pending`.
- `tests/sdd-router.test.ts`: casos de tareas completadas y estado blocked.
- `tests/sdd-close.test.ts`: contrato de tasks y cierre.

Riesgo: confundir ausencia de tareas parseables con cero tareas pendientes.
Se exige una lista no vacía; el documento vacío o ilegible sigue siendo incompleto.

## B. Spec

1. El sistema MUST aceptar los mismos metadatos opcionales en tareas terminadas
   al validar, enrutar y presentar el siguiente paso.
   Given una o más casillas terminadas, un comando verify y ninguna pendiente,
   When faltan status y blocked_by, Then no aparecen esos dos bloqueos.
2. El sistema MUST NOT inferir que una lista vacía está terminada.
   Given texto sin casillas parseables, When se consulta el cambio,
   Then se conserva `tasks.md sin checkboxes parseables`.
3. Las tareas pendientes MUST conservar su disciplina actual.
   Given una casilla pendiente y ausencia de status, When se consulta el cambio,
   Then el diagnóstico sigue presente; no se la convierte en tarea lista.
4. Los bloqueos explícitos MUST seguir visibles.
   Given `status: blocked` y `blocked_by: decisión pendiente`, When se consulta,
   Then se conserva el bloqueo aunque las casillas estén marcadas.
5. La ausencia del comando verify MUST seguir siendo error de contrato.
   Given todas las casillas marcadas pero sin comando, When se ejecuta el lint,
   Then el lint falla; esta excepción no certifica verificación.
6. La normalización de presentación MUST NOT escribir artefactos.
   Given una lista aceptable ya terminada, When se consultan status y next,
   Then el contenido y mtime de tasks.md permanecen iguales.

## C. Decisions

En `readTasksStatus`, calcular `allDone = items.length > 0 && pending === 0`
después de parsear las casillas. Añadir los problemas por status ausente o por
blocked_by ausente solamente cuando `!allDone`.

Conservar `status: null` y `blockedBy: null` si no estaban declarados: no fabricar
`ready`, ni modificar el archivo para dar una apariencia uniforme.
Las cuentas siguen siendo derivadas de casillas; para allDone, pending y ready
son cero y done conserva su valor real.

No crear un segundo parser de tareas ni una taxonomía global de advertencias.
El lint ya expresa la excepción correcta; el lector debe aplicarla en el mismo
caso observable. Tests conjuntos impedirán que vuelvan a divergir.

`resolveSddNext` y `sddNextHandoff` mantendrán la obligación de resolver sus
bloqueos reales. No borrar `tasks.problems` al final ni filtrar cadenas de error
en el renderizador; la clasificación correcta nace en `readTasksStatus`.

Se conserva el bloqueo explícito construido por `resolveSddStatus` cuando el
documento declara blocked y un motivo. Una lista de casillas no cancela ese motivo.
Resolverlo requiere evidencia del usuario o del trabajo, fuera de este arreglo.

Compatibilidad: ninguna migración; los documentos legacy terminados mejoran al
consultarlos. Los consumidores siguen recibiendo los mismos campos y tipos.
No cambia el formato de `tasks.md`, el marcador started, las agrupaciones ni IDs.
Rollback: revertir el único cambio de producción y sus tests; no tocar documentos
de proyectos creados durante la prueba.

## D. Acceptance

Fixture positivo mínimo:

```md
## Completed work
- [x] 1 Implemented
- verify: bun test
```

Con apply completo y verify válido: `lintTasksArtifact.ok === true`,
`readTasksStatus.counts.done === 1`, `nextRecommended === "close"` y ausencia
de los dos falsos bloqueos en status, next y el handoff Pi.
Si ya se aplicó 02, preparar verify mediante el escritor con recibo vigente;
no introducir un bypass de frescura para este test.

Controles negativos:

- Casilla abierta sin status ni blocked_by conserva ambos diagnósticos.
- Documento vacío, ausente o ilegible no se considera terminado.
- Texto `todas terminadas` sin casillas conserva el diagnóstico de checklist.
- Estado blocked con motivo se conserva con casillas abiertas y terminadas.
- Todas hechas sin comando verify sigue fallando en `lintTasksArtifact`.
- Una nueva casilla abierta vuelve a activar la política de tareas pendientes.
- `[X]` es equivalente a `[x]`; conservar sintaxis actual para espacios y grupos.

Los tests deberán llamar funciones de producción y comprobar también el handoff;
no basta con una expectativa sobre una cadena del prompt.

## E. Execution packets

### 09A · Criterio único para metadatos de tareas terminadas

- read: todas las anclas A y la sección de tareas de `sddNextHandoff`.
- edit: `shared/sdd/sdd-routing-core.ts`.
- tests: ampliar `tests/sdd-router.test.ts` y `tests/sdd-close.test.ts`.
- steps: añadir primero el caso positivo que hoy produce lint verde y next bloqueado;
  añadir controles negativos; calcular allDone en el lector; condicionar solo las
  dos ausencias; comprobar que no cambia contenido/mtime del archivo consultado.
- verify: `bun test tests/sdd-router.test.ts tests/sdd-close.test.ts`
- verify: `bun run typecheck`
- stop: el caso positivo avanza, los bloqueos explícitos siguen presentes y no hay
  cambios en productores, agentes, documentos de proyecto ni formato de tareas.

### 09B · Paridad de consumidores

- read: `ein-cc/sdd-cli/cli.ts` y su uso de `resolveSddNext`; no cambiar su parser.
- edit: ninguna ruta de producción.
- tests: ampliar `tests/claude-sdd-cli-boundaries.test.ts`.
- steps: ejecutar la misma lista terminada por `ein-cc-sdd status <change>`
  en un fixture temporal, comprobar que usa la política compartida y que los bloqueos
  explícitos conservan el mismo significado que Pi.
- verify: `bun test tests/sdd-router.test.ts tests/sdd-close.test.ts tests/claude-sdd-cli-boundaries.test.ts`
- verify: `bun run typecheck`
- stop: los dos adaptadores comparten la decisión; no duplicar la excepción en CLI.

Si main ha cambiado una API o una ruta nombrada, devolver el conflicto exacto
al padre antes de escribir fuera del paquete. No ampliar el alcance.
