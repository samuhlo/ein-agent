# 04. Puertas de recibo de entrega

**Estado:** complete (limitaciones de publicación aceptadas)

## Resultado
La ruta protegida crea un commit cuya identidad coincide de forma fuerte con el candidato verificado. Push y PR añaden un backstop de mejor esfuerzo sobre `HEAD`; no prometen la identidad exacta de lo que un comando publique.

## Problema actual
Un commit, push o PR puede divergir del contenido que superó verificación.

## En alcance
- Conservar el grant de intención de usuario existente (usos acotados con TTL y scope por cwd; la intención del usuario es pegajosa mientras dura el encargo).
- Puertas separadas de identidad de contenido antes de commit, tras commit contra `HEAD^{tree}`, antes de push y antes de PR.
- Ruta de divergencia de vuelta a verify.
- Comportamiento definido para entrega trivial/mecánica y para desajuste de cabeza de PR.

## No objetivos
- Control exacto de publicación remota: una gramática cerrada para push/PR y observación del objetivo remoto. Queda como trabajo futuro si el riesgo justifica esa superficie adicional.
- Bloqueos, grafo de autoridad, diarios, demonio, binario nativo, ni sistema de recuperación automática.

## Mecanismo interno
Cada punto recalcula o compara la identidad requerida con el recibo. La intención autoriza la acción; el recibo autoriza el contenido. Son controles distintos.

## Áreas implementadas

- `delivery-receipt.ts` (núcleo puro de decisión) y `delivery-gate.ts` (observación de git + aplicación en el hook de bash).
- `ein-git`, contrato de PR no interactivo y cobertura determinista de recibos, identidad y grants.

## Criterios de aceptación

- [x] La intención de usuario conserva su grant existente, con sus usos acotados y su TTL; este slice no lo redefine.
- [x] Pre-commit y post-commit validan de forma fuerte la identidad del commit creado por esta ruta protegida.
- [~] Pre-push y pre-PR son un BACKSTOP: comprueban solo HEAD, no el objetivo real del comando. Cubren el caso común (entregar el candidato desde HEAD); NO cubren `git push origin otra-rama`, push de tags, `--all`/`--mirror` ni `gh pr create --head otra-rama`.
- [x] Pre-commit y post-commit se aplican en el runtime, no en el prompt: la AUTORIDAD se liga en la creación del commit (índice == candidato, `HEAD^{tree}` probado tras los hooks).
- [x] Toda discrepancia regresa a `sdd-verify` y bloquea la entrega.
- [x] La entrega mecánica requiere una declaración explícita sin verificación.
- [~] La cabeza de un PR EXISTENTE (`gh pr edit <n>`) no se observa en el runtime: la puerta revalida HEAD local, no el estado remoto del PR. Requiere red y queda cubierta por el read-back de `ein-git`. Límite conocido y documentado, no un criterio cerrado.

## Matriz de verificación y pruebas

| Comprobación | Evidencia esperada |
|---|---|
| Pre-commit | Cobertura determinista rechaza árbol distinto al candidato. |
| Post-commit | Cobertura determinista compara `HEAD^{tree}` con el recibo. |
| Push y PR | Cobertura determinista revalida HEAD como backstop; no identifica el objetivo remoto exacto. |
| Regresión de grants | Conserva TTL, scope por cwd, usos acotados, legado y denegación de force-push. |
| Suite de cierre | 128 pruebas focalizadas pasan; `installer` typecheck y `git diff --check` pasan. |

## Riesgos
Los hooks pueden modificar el índice entre controles; por eso se valida en cada frontera.

## Dependencias
03.

## Límite de reversión
Desactivar las puertas nuevas como grupo, sin cambiar el grant de intención existente.

## Checklist de finalización

- [x] Cuatro fronteras instrumentadas y cubiertas: commit fuerte; publicación con backstop de mejor esfuerzo.
- [x] Desvío a `sdd-verify` visible y cubierto.
- [x] Casos mecánicos explícitos y no verificados documentados.
