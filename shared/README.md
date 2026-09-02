# Shared

Esta raíz es la frontera ejecutable entre los adaptadores de Ein.

- `contracts/` contiene implementaciones agnósticas. No puede importar desde
  `ein-pi/`, `ein-cc/` ni `installer/`.
- `sdd/` contiene el núcleo SDD agnóstico y sus contratos propios.
- `ports/` publica capacidades con una API explícita. Es el único lugar donde
  se permiten puentes hacia implementaciones que todavía viven en Pi. Es una
  fachada de migración visible, no una prueba de que esas implementaciones ya
  sean agnósticas.

El código compartido puede leer y escribir directamente los artefactos del
proyecto que forman su protocolo público, como `openspec/changes/` y
`openspec/specs/`. No puede conocer hogares, configuración privada o interfaz de
un runtime, ni lanzar procesos. Git, reloj y ejecución de comandos llegan como
dependencias explícitas. La decisión completa vive en
`docs/adr/0003-shared-runtime-boundary.md`.

Claude y el instalador consumen estas rutas públicas y nunca interiores de
`ein-pi/agent/`. `tests/architecture-boundaries.test.ts` hace cumplir la regla y
obliga a declarar cualquier puente nuevo.

## Puentes SDD supervivientes

Estos cinco puentes no son cinco trozos de cerebro pendientes de mover. Son los
enchufes con los que el cerebro compartido pide capacidades que pertenecen al
runtime. La tabla es parte de la frontera: el test de arquitectura exige que
coincida exactamente con los imports autorizados de `shared/ports/sdd.ts`.

| Puente | Por qué cruza Pi | Propietario | Condición de retirada |
| --- | --- | --- | --- |
| `../../ein-pi/agent/lib/git-baseline.ts` | Ejecuta Git para leer baseline, árbol de trabajo e identidad HEAD/tree; shared no puede lanzar procesos. | `ein-pi/agent/lib/git-baseline.ts` | Cuando exista un proveedor Git neutral fuera de Pi, con los mismos límites y fallos cerrados, consumido por ambos runtimes. |
| `../../ein-pi/agent/lib/guardrails.ts` | Traduce comandos a allow, ask o deny y conserva la política de ejecución de Pi que Claude reutiliza. | `ein-pi/agent/lib/guardrails.ts` | Cuando los patrones puros tengan dueño compartido y cada runtime conserve aparte sus grants y confirmaciones, con paridad completa. |
| `../../ein-pi/agent/lib/project-directives.ts` | Lee configuración y directivas cuya persistencia sigue perteneciendo al runtime. | `ein-pi/agent/lib/project-directives.ts` | Cuando exista un contrato neutral de configuración del proyecto y cada runtime adapte su almacenamiento sin inventar valores. |
| `../../ein-pi/agent/lib/sdd-lane.ts` | Persiste y recupera el lane declarado del cambio. | `ein-pi/agent/lib/sdd-lane.ts` | Cuando el lane sea parte del protocolo persistido compartido y una migración instalada preserve los registros existentes. |
| `../../ein-pi/agent/lib/sdd-preflight-record.ts` | Persiste intención, stance TDD y procedencia previa al flujo. | `ein-pi/agent/lib/sdd-preflight-record.ts` | Cuando esos registros tengan almacenamiento neutral versionado y la compatibilidad con hogares ya instalados esté probada. |

El template de Pi deriva el inventario de todos los `.ts` regulares situados en
la raíz de `contracts/` y `sdd/`. Ambos se despliegan a un único `lib/`, por lo
que dos módulos compartidos con el mismo nombre son una colisión y bloquean el
bundle.
