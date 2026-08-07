## // 000. RESUMEN
Se entregó el slice C de adaptadores normalizados de sesiones Pi/Claude sobre `ProjectStateV1`: metadata acotada, intents de creación, binding de estado, traducción de capacidades y planes de lanzamiento aislados. La verificación pasó; `behavior_coverage: partial` porque no se invocaron el ejecutor por defecto ni runtimes reales.

## // 001. QUÉ CAMBIÓ
- `ein-pi/agent/lib/runtime-session-adapters.ts`: contrato común `list/create/resume/launch`, resultados discriminados, validación de identidad/`stateRef`, referencias Pi opacas, capacidades, planes fijos, ejecución no-shell y traducción a `ProjectRuntimeMetadata`.
- `ein-pi/agent/lib/sessions.ts`: seam aditivo `scanProjectSessions`, lectura únicamente de primera línea, filtrado por proyecto antes del límite y límite de 4.096 candidatos; se preservó el lector legado.
- `tests/runtime-session-adapters.test.ts`: contrato, asimetría, privacidad, binding, create/resume, listado, lanzamiento, cancelación, errores, no-escritura y mutación de entorno.
- `tests/sessions.test.ts`: compatibilidad del lector Pi existente.

## // 002. CÓMO FUNCIONA POR DENTRO
`ProjectStateV1` aporta identidad y `git.stateRef`; los adaptadores no proyectan ni refrescan estado. Pi inspecciona metadata JSONL acotada, filtra por `cwd` exacto o raíz de repositorio, ordena por recencia y expone `pi:v1:sha256:<64 hex>`, nunca rutas, ids ni transcriptos. Claude conserva la asimetría explícita: `create/launch` disponibles; `list/resume` no soportados. Ambos `resume` permanecen `unsupported/operation-not-supported`, sin inventar flags.

`create` produce sólo un intent ligado al proyecto. `launch` construye ejecutable/argv fijos, `cwd` seleccionado y entorno aislado Pi (`PI_CODING_AGENT_DIR`, `EIN_PI_AGENT_HOME`) o Claude (`CLAUDE_CONFIG_DIR`, `PATH`); usa executor inyectable estructurado, sin shell, secretos ni escrituras de installer/runtime. Los resultados traducen únicamente capacidades, referencias opacas y códigos B sanitizados.

## // 003. DECISIONES
- Historias privadas no se migran, indexan ni persisten; la continuidad es sólo el binding de proyecto/estado.
- El resume no verificado falla cerrado, en lugar de inferir una bandera Pi o un almacén Claude.
- El límite Pi se aplica después del alcance de proyecto y el overflow devuelve `scan-limit-exceeded`, evitando resultados engañosos.
- El ejecutor real queda fuera de esta fase para preservar el límite operativo; las pruebas usan boundary inyectable.

## // 004. VERIFICACIÓN
- Strict-TDD documentado RED → GREEN → TRIANGULATE → REFACTOR para grupos 1–5 y remediación 6; remediación añadió rechazo de mutaciones de los cuatro valores de aislamiento.
- `runtime-session-adapters.test.ts`: 33 tests / 227 assertions; suites combinadas: 103 tests / 497 assertions; compatibilidad Pi/B/installer: 5, 39 y 26 tests aprobados.
- `cd installer && bun run typecheck`: aprobado. Strict global conserva sólo diagnósticos importados/preexistentes, sin diagnósticos atribuibles a los archivos modificados.
- Hygiene, privacidad, no-escritura y ausencia de archivos staged: aprobados. Cobertura honesta: `behavior_coverage: partial`.

## // 005. PENDIENTE / RIESGOS
- Persiste el baseline strict de módulos importados/preexistentes y el borde menor de request-project malformado no ejercitado.
- El ejecutor Bun por defecto, resolución contra instalaciones reales y procesos Pi/Claude reales no fueron invocados.
- El cambio supera el riesgo de revisión de 400 líneas de producción; requiere controlar/splitear la entrega según la política de review workload.
- Próximo roadmap: D, `minimal-workbench-launcher` (UI/orquestación), no ampliar este slice de adapters.
