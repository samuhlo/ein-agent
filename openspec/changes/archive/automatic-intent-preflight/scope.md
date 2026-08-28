# Alcance: decisión automática de intención antes de construir

Ein añade un eje de decisión previo a la construcción que sustituye la superficie actual de preguntas por cambio. El flujo distingue de forma conservadora entre cambios normales y pequeños, cierra la intención con la fricción mínima necesaria y continúa por el router SDD existente.

## SCOPE PACKET

```yaml
scope: Añadir una decisión automática de intención antes de construir, consolidando únicamente las preguntas actuales del preflight. Conservar preflight.json como almacén, sdd-preflight.ts como escritor y el router, las fases, la verificación y la entrega existentes.
budget_allocated:
  max_tokens: 15000
  max_reads: 30
  max_runtime_ms: 900000
```

## Resultado esperado

- Si existe un `lane` declarado, ese valor decide el recorrido y el clasificador no lo sobrescribe.
- Si no existe un `lane` declarado, el sistema clasifica el cambio antes de construir.
- Un cambio normal recibe dos preguntas base sobre resultado, límites y criterio de terminado. Solo recibe una tercera pregunta cuando queda una decisión material abierta.
- Un cambio pequeño recibe una única línea en lenguaje llano que reformula lo entendido y continúa sin esperar respuesta.
- Después de la confirmación final del recorrido normal, el preflight persiste la intención y continúa por el router existente.

## Reglas de clasificación

| Señal | Recorrido |
|---|---|
| `lane` declarado como `standard` | Normal; prevalece sobre cualquier inferencia. |
| `lane` declarado como `micro` | Pequeño; prevalece sobre cualquier inferencia. |
| Trabajo mecánico, acotado y sin comportamiento nuevo | Pequeño. |
| Documentación o texto exclusivamente acotado | Pequeño. |
| Seguridad, datos persistentes o acciones destructivas | Normal. |
| Evidencia insuficiente, ambigüedad o incertidumbre | Normal, de forma fail-closed. |
| Cualquier otro cambio modificador | Normal. |

La clasificación solo se activa para peticiones que modifican código, configuración o datos persistentes. Las consultas de solo lectura no abren este canal.

## Superficie de interacción

### Recorrido normal

1. Formula dos preguntas que, en conjunto, cierran el resultado esperado, los límites y el criterio de terminado.
2. Formula una tercera pregunta solo si sigue abierta una decisión material. TDD o `lane` solo pueden ocuparla cuando afectan materialmente al resultado y no existe ya un valor registrado o un default aplicable.
3. Muestra la intención cerrada y exige confirmación final antes de persistir o construir.

El máximo total es de tres preguntas. Esta superficie reemplaza las preguntas por cambio existentes; no convive con un segundo cuestionario de preflight.

### Recorrido pequeño

Emite exactamente una línea que reformula lo entendido, no solicita respuesta y continúa por el router existente.

### Reutilización y reapertura

Una intención confirmada se reutiliza sin volver a preguntar. Se reabre únicamente cuando cambia de forma material el objetivo, los límites o el criterio de terminado; una reformulación equivalente no basta.

El usuario puede ordenar explícitamente que se omita el canal, excepto para cambios de seguridad, datos persistentes o acciones destructivas. Esas categorías siempre conservan el recorrido normal.

## Contratos que se conservan

- `openspec/changes/<change>/preflight.json` sigue siendo el almacén persistente por cambio.
- `ein-pi/agent/lib/sdd-preflight.ts` conserva la responsabilidad de escritura del preflight; el cambio puede ampliar la forma persistida sin introducir un segundo almacén ni otro propietario.
- Los lanes siguen siendo `standard` y `micro`, y una declaración existente mantiene precedencia absoluta.
- La continuación usa el router SDD actual.
- No cambian la secuencia `scope → map → design → tasks → apply → verify → close`, las puertas de `verify` y `close`, la entrega ni la declaración de deltas OpenSpec.

## Criterios de aceptación

- [ ] Un `lane` declarado evita la clasificación y determina el recorrido correspondiente.
- [ ] Sin `lane`, solo los cambios inequívocamente mecánicos, no conductuales o documentales/textuales acotados toman el recorrido pequeño.
- [ ] Seguridad, datos persistentes, acciones destructivas e incertidumbre toman siempre el recorrido normal.
- [ ] El recorrido normal presenta dos preguntas base y como máximo una tercera por una decisión material abierta.
- [ ] La superficie anterior de preguntas por cambio queda sustituida, sin superar tres preguntas totales.
- [ ] El recorrido pequeño emite una sola reformulación, no espera respuesta y continúa.
- [ ] El recorrido normal no persiste ni construye antes de la confirmación final.
- [ ] La intención confirmada se guarda en `preflight.json` mediante el propietario existente y se reutiliza hasta un cambio material.
- [ ] Tras persistir o completar el recorrido pequeño, el control vuelve al router existente.
- [ ] La omisión explícita funciona solo fuera de las categorías protegidas.

## Contexto técnico acotado

La implementación actual concentra el preflight en `ein-pi/agent/lib/sdd-preflight.ts`, combina postura persistida y lane en `ein-pi/agent/lib/sdd-preflight-record.ts`, define la semántica fail-closed de lanes en `ein-pi/agent/lib/sdd-lane.ts` y cablea la activación y continuación en `ein-pi/agent/extensions/ein-ai.ts`. La cobertura existente relevante se concentra en `tests/sdd-preflight-per-change.test.ts`, `tests/sdd-preflight-record.test.ts` y `tests/sdd-preflight-tdd-gate.test.ts`.

Configuración vigente: TypeScript ESM sobre Bun, `strict_tdd: true`, runner `bun test`. Esta fase no ejecuta tests, typechecks ni builds.

## Contexto OpenSpec

El cambio altera comportamiento observable del preflight y por eso incorpora un delta determinista en `openspec/changes/automatic-intent-preflight/specs/sdd-lifecycle/spec.md`. No se añade una declaración `spec_delta: none`.

## Fuera de alcance

- Rediseñar fases, artefactos posteriores, selección de participantes o presupuestos SDD.
- Cambiar las puertas de verificación, cierre, revisión o entrega.
- Sustituir `preflight.json`, crear otro almacén de intención o mover la autoridad de escritura fuera de `sdd-preflight.ts`.
- Añadir nuevos lanes o redefinir qué fases omiten `standard` y `micro`.
- Convertir el canal en una interfaz modal o en un flujo separado del preflight existente.
- Implementar código durante esta fase.

## Riesgos y preguntas técnicas para map/design

- La ampliación compatible de `preflight.json` debe conservar la lectura de registros actuales y fallar de forma segura ante datos parciales o desconocidos.
- La detección de «decisión material» y «cambio material» necesita reglas deterministas para evitar re-preguntas o silencios inconsistentes entre runtimes.
- La consolidación debe retirar únicamente la superficie duplicada de preguntas, sin perder preferencias de sesión ni defaults del proyecto.
- Pi y Claude deben observar el mismo estado persistido sin introducir escritores paralelos.

## Resolución de skills

Se aplicaron `ein-discipline`, `cognitive-doc-design`, `document-writer` e `intent-channel` mediante las rutas inyectadas. `nuxt-ui` no aplica porque el alcance no incluye componentes, formularios visuales ni una interfaz Nuxt.
