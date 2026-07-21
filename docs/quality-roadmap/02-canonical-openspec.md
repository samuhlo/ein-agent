# 02. OpenSpec canónico

**Estado inicial:** planned

## Resultado
OpenSpec mantiene especificaciones actuales y deltas por cambio de comportamiento que se sincronizan de forma determinista; los cambios mecánicos o no SDD declaran explícitamente `spec_delta: none` con una razón breve.

## Problema actual
El alcance y el diseño no tienen una entrada canónica, breve y verificable para el comportamiento vigente.

## En alcance
- Especificaciones vigentes en `openspec/specs/<domain>/spec.md`.
- Deltas por cambios de comportamiento en `openspec/changes/<change>/specs/<domain>/spec.md` con `ADDED`, `MODIFIED` y `REMOVED`.
- Declaración `spec_delta: none` con razón breve para cambios mecánicos o no SDD.
- Parser, sincronización determinista y `sync-report.md`.
- Cierre que rechaza estado de delta sin resolver, sin sincronizar o en conflicto.
- Adopción incremental por dominio, sin reescritura masiva del comportamiento histórico.
- Especificaciones relevantes acotadas como entradas de scope y design.

## No objetivos
- Una fase nueva de IA.
- Sustituir OpenSpec por memoria opcional.

## Mecanismo interno
Un parser interpreta encabezados de operación y escenarios; cada SDD declara un delta de comportamiento o `spec_delta: none` con su razón. La sincronización aplica o informa conflictos de manera reproducible. El cierre consulta el informe y bloquea estado de delta sin resolver, sin sincronizar o conflictivo, no la ausencia declarada de delta.

## Archivos o áreas previstos

> Pronóstico, no contrato fijo de implementación.

- `openspec/specs/`, plantillas de cambios y utilidades de parser/sincronización.
- Guardas de cierre, scope y design.

## Criterios de aceptación

- [ ] Las especificaciones vigentes DEBEN vivir en la ruta canónica indicada.
- [ ] Los deltas de comportamiento DEBEN usar solo operaciones ADDED, MODIFIED o REMOVED.
- [ ] Cada SDD DEBE incluir un delta o `spec_delta: none` con una razón breve para cambios mecánicos o no SDD.
- [ ] La sincronización DEBE producir `sync-report.md` determinista.
- [ ] El cierre DEBE rechazar estado de delta sin resolver, sin sincronizar o conflictivo, pero aceptar una ausencia declarada mediante `spec_delta: none`.
- [ ] La adopción DEBE ser incremental por dominio y no exigir reescritura masiva del comportamiento histórico.
- [ ] OpenSpec DEBE seguir siendo canónico sobre memoria opcional.

## Matriz de verificación y pruebas

| Comprobación | Evidencia esperada |
|---|---|
| Parser | Acepta deltas válidos y rechaza operaciones inválidas. |
| Sincronización | Produce el mismo informe para la misma entrada. |
| Cierre | Falla ante delta sin resolver, pendiente o conflicto; acepta `spec_delta: none` con razón breve. |
| Declaración sin delta | Un cambio mecánico o no SDD declara `spec_delta: none`, incluye su razón y queda aceptado sin delta sincronizable. |

## Riesgos
La semántica de MODIFIED exige una identidad estable para evitar aplicar cambios ambiguos.

## Dependencias
01 para la cobertura de CI ampliada.

## Límite de reversión
Revertir parser y guardas juntos; conservar especificaciones ya escritas como evidencia.

## Checklist de finalización

- [ ] Formato de especificación definido.
- [ ] Sync report generado.
- [ ] Cierre protegido.
- [ ] Entradas de scope/design acotadas.
