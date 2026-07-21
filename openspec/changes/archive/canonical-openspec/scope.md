# Alcance: OpenSpec canónico

Implementar la slice 02 del roadmap de calidad para que OpenSpec conserve especificaciones vigentes canónicas y deltas de comportamiento por cambio, con sincronización determinista y guardas de cierre. La adopción será incremental por dominio y mantendrá OpenSpec como fuente canónica frente a cualquier memoria opcional.

## SCOPE PACKET

```yaml
scope: Implementar la slice 02, OpenSpec canónico: especificaciones vigentes en `openspec/specs/<domain>/spec.md`; deltas de comportamiento por cambio en `openspec/changes/<change>/specs/<domain>/spec.md` usando solo ADDED/MODIFIED/REMOVED; `spec_delta: none` con razón breve para trabajo mecánico o no SDD; parser y sincronización deterministas con `sync-report.md`; guardas de cierre para deltas sin resolver, sin sincronizar o conflictivos; adopción incremental por dominio; e inputs de especificación acotados para scope/design.
budget_allocated:
  max_tokens: 15000
  max_reads: 30
  max_runtime_ms: 600000
```

## Resultado esperado

OpenSpec ofrece una ruta única y verificable para el comportamiento vigente. Cada cambio SDD declara un delta sincronizable o una ausencia explícita y justificada; el cierre solo procede cuando ese estado está resuelto y sincronizado sin conflictos.

## En alcance

- Definir el formato canónico de especificaciones vigentes en `openspec/specs/<domain>/spec.md`.
- Definir deltas por cambio en `openspec/changes/<change>/specs/<domain>/spec.md` con exclusivamente `ADDED`, `MODIFIED` y `REMOVED`.
- Exigir `spec_delta: none` y una razón breve para cambios mecánicos o no SDD.
- Implementar un parser determinista para encabezados de operación y escenarios.
- Implementar sincronización reproducible de deltas y generación determinista de `sync-report.md`.
- Bloquear el cierre ante deltas sin resolver, pendientes de sincronización o conflictivos; aceptar `spec_delta: none` válido.
- Incorporar especificaciones relevantes como entradas acotadas de scope y design, respetando el presupuesto de lectura.
- Permitir adopción incremental por dominio sin reconstruir de forma masiva el historial de comportamiento.
- Integrar el cambio con las plantillas, utilidades y guardas SDD existentes usando las convenciones Node.js, TypeScript y Bun del repositorio.

## Fuera de alcance

- Añadir una fase nueva de IA.
- Sustituir OpenSpec por Engram u otra memoria opcional.
- Reescribir masivamente el comportamiento histórico.
- Trabajo de Homebrew o de experiencia de releases.
- Cambiar el package manager, dependencias base o convenciones del proyecto sin necesidad demostrada.
- Implementación o ejecución de pruebas durante esta fase de scope.

## Restricciones y dependencias

- Fuente de verdad del alcance: `docs/quality-roadmap/02-canonical-openspec.md`.
- La slice 01 de CI en macOS está completada.
- `strict_tdd: false` para esta sesión; esto no elimina la obligación de diseñar y verificar cobertura enfocada en fases posteriores.
- OpenSpec es el registro SDD canónico; la memoria opcional solo puede ser complementaria.
- La identidad usada por `MODIFIED` debe ser estable y detectar ambigüedad en lugar de aplicar cambios de forma implícita.
- Parser y guardas deben poder revertirse juntos; las especificaciones ya creadas se conservan como evidencia.

## Criterios de aceptación

- [ ] Las especificaciones vigentes viven en `openspec/specs/<domain>/spec.md`.
- [ ] Los deltas de comportamiento viven en `openspec/changes/<change>/specs/<domain>/spec.md` y solo aceptan `ADDED`, `MODIFIED` o `REMOVED`.
- [ ] Cada SDD declara un delta o `spec_delta: none` acompañado de una razón breve válida para trabajo mecánico o no SDD.
- [ ] El parser acepta deltas válidos y rechaza operaciones, encabezados o escenarios inválidos y ambiguos.
- [ ] La misma entrada produce el mismo estado sincronizado y el mismo contenido de `sync-report.md`.
- [ ] El cierre rechaza deltas sin resolver, sin sincronizar o conflictivos, y acepta una ausencia de delta explícita y justificada.
- [ ] Scope y design reciben solo las especificaciones de dominio relevantes dentro de límites explícitos de lectura.
- [ ] La adopción puede realizarse dominio por dominio sin migración histórica masiva.
- [ ] OpenSpec continúa siendo canónico sobre cualquier memoria opcional.

## Entradas obligatorias para mapping

El mapping debe localizar los contratos actuales de cierre, guardrails, routing, plantillas y selección de contexto antes de proponer archivos. Debe identificar el runner real y confirmar comandos enfocados; la evidencia actual indica Bun y hace especialmente relevantes:

- `bun test tests/sdd-close.test.ts`
- `bun test tests/sdd-guardrails.test.ts`
- `bun test tests/sdd-scope-packet.test.ts`
- Cualquier prueba específica nueva del parser/sincronizador, ejecutada con `bun test <archivo>`.

Estos comandos son candidatos de verificación para fases posteriores, no pruebas ejecutadas ni evidencia de aprobación en scope.

## Riesgos

- Una identidad inestable para escenarios puede volver `MODIFIED` ambiguo o no determinista.
- Acoplar sincronización y cierre sin estados explícitos puede bloquear cambios legítimos o permitir deltas pendientes.
- Una selección de specs sin límites puede exceder el presupuesto de contexto de scope/design.
- La adopción masiva aumentaría el riesgo y la carga de revisión; debe mantenerse incremental.

## Declaración de delta de este cambio

Este cambio modifica comportamiento SDD, por lo que no corresponde `spec_delta: none`. En una fase posterior deberá crear sus deltas de dominio bajo `openspec/changes/canonical-openspec/specs/<domain>/spec.md`; este artefacto de scope no anticipa el dominio ni el diseño antes del mapping.
