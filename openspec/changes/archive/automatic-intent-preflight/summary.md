## // 000. RESUMEN
El cambio entrega un eje único de intención automática antes de construir, compartido por Pi y Claude. Clasifica de forma conservadora, conserva los contratos SDD existentes y queda listo para sincronización determinista y cierre.

## // 001. QUÉ CAMBIÓ
- `ein-pi/agent/lib/sdd-intent-preflight.ts`: decisión pura de activación, clasificación normal/pequeña, bypass protegido, preguntas adaptativas y materialidad canónica.
- `ein-pi/agent/lib/sdd-preflight-record.ts` y `sdd-preflight.ts`: `preflight.json` admite intención versionada; `sdd-preflight.ts` sigue siendo el único propietario de escritura, adopción y persistencia.
- `ein-pi/agent/lib/sdd-lane.ts`: procedencia declarada/clasificada sin cambiar lanes ni fases; el lane declarado siempre prevalece.
- `ein-pi/agent/extensions/ein-ai.ts` y `sdd-init.ts`: activación única en Pi, hooks secundarios sin re-preguntas y continuación por el router existente.
- `ein-cc/sdd-cli/cli.ts`, `ein-cc/CLAUDE.adapter.md` y `ein-cc/CLAUDE.md`: comando público Claude corregido y superficie generada en paridad con el contrato compartido.
- Tests de core, persistencia, lanes, flujo Pi, CLI/paridad, coordinadores y aceptación SDD ampliados; no se modificaron los contratos posteriores de entrega.

## // 002. CÓMO FUNCIONA POR DENTRO
La evidencia de una petición modificadora pasa por el core puro: solo evidencia positiva completa permite `small`; riesgo protegido, comportamiento nuevo, ambigüedad o falta de evidencia producen `normal`. Un lane declarado se lee antes y decide sin ser sobrescrito; sin declaración, `normal`/`small` se proyecta a `standard`/`micro`.

El recorrido normal sustituye los selectores TDD/lane por dos preguntas base, una tercera solo si queda una decisión material, y confirmación explícita antes de escribir. El pequeño emite una única reformulación y continúa sin esperar. La intención confirmada, automática o bypass se guarda en el bloque opcional versionado de `preflight.json`; sus slots generan un `materialKey` canónico para reutilizar o reabrir solo ante cambios materiales.

Pi y Claude releen el mismo registro y adoptan resoluciones existentes. `sdd-preflight.ts` relee antes de escribir, conserva TDD/records legacy y materializa lanes clasificados; después devuelve el control a `resolveSddNext`/`sddNextHandoff`. Los hooks secundarios solo adoptan o bloquean.

## // 003. DECISIONES
- Clasificación fail-closed: pequeño exige prueba positiva de trabajo mecánico, acotado y no conductual, o texto/documentación acotados.
- `preflight.json` permanece como almacén y `sdd-preflight.ts` como propietario; no se creó `intent.json` ni un escritor paralelo.
- La materialidad se calcula sobre objetivo, límites y terminado normalizados, no sobre el texto bruto, para tolerar paráfrasis equivalentes.
- Pi y Claude comparten política y persistencia; Claude actúa como adaptador fino, sin clasificador ni cuestionario paralelo.
- Se mantienen `standard`/`micro`, sus omisiones actuales, el bootstrap y la secuencia `scope → map → design → tasks → apply → verify → close`.

## // 004. VERIFICACIÓN
- Estado: **PASS**; `behavior_coverage: verified`.
- Matriz focalizada: **171/171**; suite raíz y configurada: **2861/2861**.
- `bun run typecheck` raíz y `cd installer && bun run typecheck`: pass.
- Paridad/generación Claude y `git diff --check`: pass; especificación canónica y router/verify/close/delivery permanecen sin cambios.
- Evidencia strict-TDD: `openspec/config.yaml` mantiene `strict_tdd: true`, `preflight.json` declara `tdd: strict`, y `apply-progress.md` registra RED/GREEN/TRIANGULATE/REFACTOR para los grupos 001–006.
- Correcciones guiadas por verificación: el dispatch público Claude ahora espera `runClaudeIntentPreflight` antes de la compatibilidad legacy; se reconciliaron las expectativas legacy de aceptación SDD (`ask` proyecta `auto`) sin reintroducir preguntas TDD/lane.

## // 005. PENDIENTE / RIESGOS
- No hubo pase advisory fresco: faltaban identidad y salida del participante de terminal.
- No se ejecutó smoke test interactivo real contra provider/terminal; la evidencia es determinista y automatizada.
- Tasks y verificación están completas. No hacer sync OpenSpec, archive/move, commit, push ni PR aquí; queda listo para sync y cierre deterministas del padre.
