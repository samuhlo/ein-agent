# Ein sobre Claude Code

Claude es el relevo opcional de Pi. Se instala junto al núcleo, con configuración en `~/.claude-ein`. La entrada habitual es `ein`; `ein-cc` es el acceso avanzado mediante Fish.

```bash
ein-install install --runtime both
ein
```

`CLAUDE_CONFIG_DIR` se fija solo para la invocación. Historiales, proyectos, sesiones, agentes y ajustes del hogar Ein están separados del hogar vanilla `~/.claude`. El login puede compartirse mediante el enlace de credenciales; compartir una cuenta también puede exponer sus conectores remotos. Aislar los archivos no crea una cuenta independiente.

## Qué comparte y qué adapta

`sync.ts` compone la política de `runtime/` con `CLAUDE.adapter.md`, traduce agentes y despliega skills propias y externas. `CLAUDE.md` es generado: cambia sus fuentes, no el resultado. El CLI [ein-cc-sdd](sdd-cli/README.md) se compila como binario standalone y consume el núcleo compartido por `shared/ports/sdd.ts`.

El enrutado declarado en el sincronizador usa Opus con esfuerzo alto para scope, design y tasks; Sonnet con esfuerzo bajo para apply; Haiku para map, verify, close y auxiliares. Son rutas del adaptador, no una prueba de que cualquier modelo barato o local cumpla el contrato.

Claude lee los ajustes del proyecto en `.pi/ein/`. `/ein:status` y `/ein:settings` los muestran; los selectores se cambian en Pi o en la aplicación. Las directivas no aplicables se muestran como `unsupported`, `inactive`, `unhandled` o `unreadable`, según la causa; solo `applied` representa una directiva inyectada.

## Límites del relevo

- Puede consumir acuerdos de Pi y registrar acuerdos nuevos o modificados en Claude mediante `ein-cc-sdd intent`, con procedencia explícita del coordinador.
- La selección proactiva de skills y las herramientas de contexto y evidencia de Pi no tienen equivalencia completa en Claude. Se usan descubrimiento nativo, rutas explícitas y el CLI disponible.
- El hook de Bash comparte patrones de denegación y confirmación con Pi. No intercepta todas las ediciones ni es un sandbox completo de shell.
- Context7 se configura cuando está disponible. Los smokes históricos de conexión no garantizan la disponibilidad del servicio ni paridad entre runtimes.
- Cleaner y Architect automáticos pertenecen a Pi.

`/ein:handoff status`, `/ein:handoff to pi` y `/ein:handoff to claude` operan sobre el estado del proyecto. Un handoff abre una sesión nueva; no traslada el historial privado ni reanuda la conversación del otro runtime.

El sync deja de configurar Engram y retira solo su entrada MCP anterior cuando conserva la firma gestionada por Ein. Preserva las configuraciones personalizadas, `~/.engram-ein` y el binario global; no migra notas a otro sistema. La continuidad se apoya en los archivos del proyecto, OpenSpec y Git.

## Desarrollo

Desde la raíz del repositorio:

```bash
bun ein-cc/sync.ts
```

Compila y despliega en el hogar Claude de Ein: modifica tu instalación. Para probar el producto completo desde el checkout, consulta [dev:install](../installer/README.md#desarrollo). Abre una sesión nueva tras sincronizar.

Consulta la [matriz vigente](https://samuhlo.github.io/ein-agent/03-runtimes/runtime-matrix/) antes de elegir el runtime para un cambio.

## Continuar y cerrar cambios sin Pi

Claude puede retomar una entrevista voluntaria de Pi y cerrar cambios con el CLI
standalone sin exigir un acuerdo previo. `ein-cc-sdd intent <change> show` consulta un acuerdo existente y
`ein-cc-sdd intent --help` muestra el formato de entrada para `record`.

El coordinador registra las preguntas, la respuesta literal ya recibida y el alcance
acordado mediante JSON por stdin. La procedencia `claude-coordinator` indica que el
coordinador atesta la conversación: no equivale al recibo de entrada observado por
Pi ni a una firma criptográfica del usuario. Un acuerdo confirmado con el mismo
alcance se reutiliza conservando su procedencia y su revisión. Preflight conserva
la decisión TDD existente y no vuelve a preguntar por ese acuerdo.

Para recuperar un `intent.md` escrito a mano, primero se lee `show`, se contrasta
el documento con la conversación y se pasa su `expectedDigest` junto con
`reopenReason` al registro. El CLI conserva una copia del original. Para cambiar
un acuerdo gestionado exige `expectedRevision` y un motivo; las claves de las fases
anteriores quedan obsoletas hasta su revisión. No modifica artefactos de fase.

Cada ejecutor de Claude usa un acuerdo existente como contexto cuando lo hay.
Ninguna fase exige `intent_key` para poder trabajar.
El verificador registra cada comando obligatorio con
`required_check: {"command":"bun test","exitCode":0}` usando el código real
(null si no pudo ejecutarlo). Un resultado fallido o mal formado impide cerrar,
aunque el texto del informe diga `status: pass`. Los informes históricos siguen
siendo legibles; su procedencia y contenido no se inventan al retomar.

El ejecutor de cierre usa `ein-cc-sdd summary <change>` con
`{"content":"Texto del resumen", "commands":["comando exacto del informe"]}`
por stdin. El CLI genera los metadatos y verifica la evidencia; el coordinador
termina con `ein-cc-sdd close <change>`. El archivo conserva el acuerdo, su copia
anterior si existe y los informes de aplicación, verificación y sincronización.
`--force` no permite saltarse intención pendiente, pruebas fallidas, tareas pendientes
ni conflictos de especificación.
