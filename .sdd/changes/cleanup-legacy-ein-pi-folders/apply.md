# SDD Apply — cleanup-legacy-ein-pi-folders

## // 000. TAREAS COMPLETADAS

- 1.1 — Corregidas las referencias de planning de `sdd-token-budget-scope-gate` para apuntar a `ein-pi/agent/agents/`.
- 1.2 — Eliminada la carpeta legacy `ein-pi/agents/`.
- 1.3 — Eliminada la carpeta legacy `ein-pi/chains/`.
- 1.4 — Eliminada la carpeta legacy `ein-pi/openspec/`.
- 1.5 — Eliminadas las carpetas legacy `ein-pi/ein/` y `ein-pi/samuhlo/`.
- 1.6 — Eliminado el archivo legacy `ein-pi/settings.json`.
- 1.7 — Actualizado `README.md` con la estructura canónica.
- 1.8 — Añadido test Bun/TS de contrato para blindar la fuente canónica.

## // 001. ARCHIVOS CAMBIADOS

- `README.md`
- `tests/legacy-paths-veto.test.ts`
- `.sdd/changes/sdd-token-budget-scope-gate/explore.md`
- `.sdd/changes/cleanup-legacy-ein-pi-folders/tasks.md`
- Eliminados: `ein-pi/agents/`, `ein-pi/chains/`, `ein-pi/openspec/`, `ein-pi/ein/`, `ein-pi/samuhlo/`, `ein-pi/settings.json`

## // 002. DECISIONES Y DESVIACIONES

- No se tocó `ein-pi/agent/` porque el alcance protegía la fuente canónica y el ruido runtime.
- El README evita listar literalmente los paths legacy borrados para que el contrato de “sin referencias activas” pueda ser estricto en archivos clave.
- El test excluye su propio archivo porque necesita construir los patrones vetados para poder detectarlos.
- El test salta carpetas runtime/ruido dentro de `ein-pi/agent/` para no leer credenciales, sesiones, backups, `npm/`, `bin/` ni artefactos locales.

## // 003. EXPLICACION DIDACTICA POR ARCHIVO

### `README.md`

**Qué cambió:** Se reforzó la sección “Estructura del repo” para explicar que `ein-pi/agent/` es la fuente canónica, que `~/.pi/agent` es el destino instalado y que el installer empaqueta la fuente.

**Cómo funciona:** El texto crea una regla simple: se desarrolla en `ein-pi/agent/`, el installer empaqueta desde ahí, y el destino local no se edita desde el repo.

**Por qué va aquí:** El README es la puerta de entrada del proyecto. Poner esta regla aquí evita que un contribuidor busque la fuente real en carpetas antiguas.

**Decisión arquitectónica:** Una sola fuente versionada para el workbench.

**Alternativa evitada:** Crear un documento nuevo de arquitectura. Eso habría multiplicado fuentes de verdad para una regla que debe estar visible desde el inicio.

**Problema futuro que previene:** Drift entre copias antiguas y la fuente real; “drift” significa que dos copias que deberían representar lo mismo empiezan a divergir.

**Notas para aprender:** Cuando hay una carpeta deployable y un destino instalado, documenta siempre cuál se edita y cuál se genera/copia.

### `tests/legacy-paths-veto.test.ts`

**Qué cambió:** Se añadió un test de contrato. Un test de contrato verifica una regla del sistema, no un detalle interno concreto.

**Cómo funciona:** El test lee archivos clave, comprueba que `bundle-template.ts` use `ein-pi/agent`, confirma que el README declare la fuente canónica, verifica que las rutas legacy no existan, y falla si aparecen referencias activas a esas rutas.

**Por qué va aquí:** Los tests del repo ya viven en `tests/*.test.ts` y se ejecutan con Bun. Mantenerlo ahí lo integra con la suite existente sin crear tooling nuevo.

**Decisión arquitectónica:** El veto vive en CI como test, no como regla manual.

**Alternativa evitada:** Confiar en `.gitignore` o en revisión humana. Eso no detecta referencias nuevas en documentación o código.

**Problema futuro que previene:** Reintroducir rutas legacy por accidente cuando un humano o agente copie ejemplos antiguos.

**Notas para aprender:** Si un test necesita mencionar un patrón prohibido, constrúyelo desde segmentos para que el propio test no parezca una referencia activa.

### `.sdd/changes/sdd-token-budget-scope-gate/explore.md`

**Qué cambió:** Dos filas de planning ahora apuntan a `ein-pi/agent/agents/...`.

**Cómo funciona:** Solo cambia la ruta documentada; no implementa ese otro cambio.

**Por qué va aquí:** Ese planning tenía referencias incorrectas a la ubicación legacy. Corregirlo evita que el futuro apply edite los archivos borrados.

**Decisión arquitectónica:** Corregir documentación de planificación sin revertir el cambio no entregado.

**Alternativa evitada:** Borrar el planning de `sdd-token-budget-scope-gate`; el usuario pidió no revertirlo.

**Problema futuro que previene:** Que un apply futuro toque rutas inexistentes.

**Notas para aprender:** Planning también puede tener bugs; si una ruta apunta a una fuente no canónica, es un bug de alcance.

### Eliminaciones bajo `ein-pi/`

**Qué cambió:** Se borraron carpetas y archivos legacy fuera de `ein-pi/agent/`.

**Cómo funciona:** Git conserva el historial, pero el árbol actual deja una sola ubicación válida para agentes, chains, settings y assets del workbench.

**Por qué va aquí:** Las rutas estaban en la misma zona conceptual que el workbench, pero fuera de la fuente canónica.

**Decisión arquitectónica:** Borrar duplicados en vez de moverlos o fusionarlos.

**Alternativa evitada:** Mover contenido legacy dentro de la fuente. Eso habría mezclado versiones antiguas con archivos actuales.

**Problema futuro que previene:** Confusión sobre qué archivo editar y bugs por copiar reglas antiguas.

**Notas para aprender:** Si una copia vieja ya diverge de la fuente real, moverla suele preservar el problema; borrarla deja una señal clara.

## // 004. VERIFICACION

- No se ejecutaron tests, build ni typecheck durante apply por instrucción explícita del usuario.
- Verificación sugerida para la fase verify: `bun test tests/legacy-paths-veto.test.ts`.
