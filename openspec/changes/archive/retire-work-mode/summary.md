## // 000. RESUMEN
El "modo de trabajo" de dos valores desaparece. Linear pasa a ser lo que siempre fue en la práctica: una integración opcional, apagada por defecto y encendida a propósito con `/ein:linear`. Suite en 2508 verde y los dos typechecks pasan.

## // 001. QUÉ CAMBIÓ
- `ein-pi/agent/lib/mode.ts` → `linear-integration.ts`: `EinMode = "solo"|"team"` se convierte en `LinearIntegration = "off"|"on"`, con `off` de default.
- Ocho consumidores recableados: prompt, banner, línea de status, puerta de skills (`skillAllowedWithLinear`), traductor de directivas, persona, lector del advisor y el catálogo de ajustes.
- `/ein:mode` pasa a ser `/ein:linear`, con sus dos cadenas de i18n.
- Las cinco superficies de prosa que describían el modo —política compartida, prompt del orquestador, contrato de `ein-linear`, skill `ein-discipline` y la guía de workflow— hablan de la integración. `cc-ein/CLAUDE.md` se regenera desde sus fuentes.
- Cuatro contratos reescritos y uno reforzado: `linear-integration`, `skill-linear-gate`, `linear-optional-narrative`, ajustes de proyecto y paridad del coordinador.

## // 002. CÓMO FUNCIONA POR DENTRO
El lector conserva su forma —evidencia con procedencia, proyecto sobre global sobre default— y solo cambia el vocabulario que entiende. Acepta la clave nueva (`linear`) y la heredada (`mode`), traduciendo `team` a encendido y `solo` a apagado.

Dos reglas sostienen la migración. La primera: **leer no reescribe**. Un `{"mode":"team"}` resuelve a encendido y los bytes se quedan como están; una consulta que muta la configuración del usuario es una mutación disfrazada, y destruiría la evidencia con la que se diagnostica una sorpresa. El fichero adopta la clave nueva la próxima vez que algo escriba a propósito. La segunda: **si están las dos claves, gana la nueva**, porque si ganara la heredada una escritura deliberada quedaría sin efecto sin que nada lo dijera.

El módulo se renombra pero el fichero en disco no. `mode.json` es estado en la máquina del usuario; moverlo pertenece a la misma unidad de migración que los hogares del runtime, aplazada a propósito. El módulo lo documenta para que su próximo lector no lo tome por un descuido.

## // 003. DECISIONES
- El default apagado es una afirmación de producto, no una preferencia: Linear es opt-in para todo el mundo, incluida una instalación nueva con API key presente.
- La ranura genérica `mode` del advisor se documenta en vez de renombrarse: es su vocabulario para "una configuración inspeccionada", y tocarlo habría ampliado el radio a otro subsistema por una ganancia cosmética.
- No se conserva alias de `/ein:mode`: un alias oculto para un concepto retirado es justo cómo sobrevivió tanto tiempo el renombrado anterior a medias.

## // 004. VERIFICACIÓN
`bun test`: 2508 pass, 0 fail (baseline 2503; los cinco nuevos son el contrato ensanchado). `bun run typecheck` en raíz e `installer`: pass. Evidencia estricta RED → GREEN → TRIANGULATE → REFACTOR en los cuatro grupos, incluida la fase en que el compilador hizo de test para el recableado.

El guardián de narrativa quedó más fuerte que el que sustituye: además de fijar el vocabulario nuevo, exige la **ausencia** de "work mode", "team mode" y "solo mode" en el prompt, así que el ajuste retirado no puede volver sin que un test caiga.

## // 005. PENDIENTE / RIESGOS
- `.pi/ein/mode.json` guarda una clave `linear`: el fichero lleva el nombre de un concepto que ya no existe. Es deliberado y va con la migración de estado aplazada.
- Quien tenga `/ein:mode` en la memoria muscular no lo encontrará.
- El prompt del orquestador bajó de 43.006 a 42.988 bytes: el renombrado no compró prosa.
