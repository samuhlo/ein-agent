# Ein sobre Pi

Pi es el núcleo de Ein. La entrada habitual es `ein`; `ein-pi` es el acceso avanzado mediante una función Fish. El instalador administra ambos.

```bash
ein-install install --runtime pi
ein
```

Para obtener el instalador, sigue el [inicio rápido](../README.md). Para desarrollar desde este checkout, usa [dev:install](../installer/README.md#desarrollo); no copies manualmente piezas del despliegue.

## Aislamiento

El launcher fija `PI_CODING_AGENT_DIR` y `EIN_PI_AGENT_HOME` en `~/.pi-ein/agent` solo para la invocación. Configuración, autenticación y sesiones de Ein se resuelven en ese hogar. `pi` sigue usando su hogar habitual `~/.pi/agent`.

El instalador reconoce instalaciones antiguas mediante un marcador gestionado válido antes de migrarlas. No muevas `~/.pi-ein/agent` encima de un hogar vanilla: revisa el diagnóstico y los backups con `ein-install doctor` y `ein-install restore`. `migrate.ts` es una herramienta histórica, no el procedimiento normal de instalación o recuperación.

## Flujo actual

- El padre resuelve la intención y las decisiones. Una petición completa ya autorizada puede registrarse directamente; pregunta cuando falta una decisión material.
- Una edición pequeña puede usar apply y verify independientes sin crear `openspec/`. SDD conserva intención, diseño, tareas y evidencias en disco para cambios que necesitan ese recorrido.
- El padre carga las secciones detalladas del flujo a demanda. Los hijos reciben contexto fresco y rutas de skills seleccionadas por rol, proyecto y tarea; leen el contenido completo de las skills necesarias.
- Apply recibe un grupo acotado con contexto, cambios y comprobaciones. Verify inspecciona las fuentes modificadas y ejecuta sus propias comprobaciones. Las salidas grandes reconocidas de checks correctos pueden llegar como vistas acotadas con acceso al log original.
- Hypa y Headroom están retirados. Sus antiguos ajustes quedan ignorados; Ein no desinstala herramientas externas que uses por tu cuenta.

Consulta [contexto y ahorro](https://samuhlo.github.io/ein-agent/01-concepts/context/), [flujo](https://samuhlo.github.io/ein-agent/02-workflow/workflow-overview/) y [comandos](https://samuhlo.github.io/ein-agent/04-reference/cli/). `/ein:models` permite elegir modelos y esfuerzo por rol. La ejecución local es futura y opcional; un modelo barato alojado es válido, sujeto a las mismas exigencias de verificación.

Después de actualizar o desplegar el checkout, abre una sesión nueva de Ein. Reemplazar archivos no recarga extensiones en una sesión que ya está abierta.
