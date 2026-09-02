## // 000. RESUMEN

La interpretación de eventos de Pi deja de estar mezclada con el registro de hooks. Un módulo pequeño reconoce identidades de agentes, tareas, cambios explícitos y resultados terminales de participantes con degradación segura.

## // 001. QUÉ CAMBIÓ

- `ein-pi-event-contracts.ts`: nuevo dueño del subconjunto de envelopes de Pi que Ein consume.
- `ein-ai.ts`: importa siete lectores y elimina sus copias locales.
- Un test fija qué campos cuentan como identidad explícita y evita inferirla desde texto libre.

## // 002. CÓMO FUNCIONA POR DENTRO

Los lectores recorren únicamente rutas conocidas del evento. Un resultado de participante solo se acepta si hay un hijo, identidad exacta, salida acotada y una única línea de estado válida. Cualquier forma desconocida se convierte en `unavailable`; nunca se inventa éxito.

## // 003. DECISIONES

- Mantener la interpretación del envelope separada de las decisiones del hook.
- Conservar duplicados de identidad en orden: son evidencia del evento, no una colección que debamos normalizar.
- Reutilizar `isRecord` en todos los bordes de Pi para que la forma desconocida se trate igual.

## // 004. VERIFICACIÓN

- 66 tests enfocados: pass.
- Typecheck de raíz e instalador: pass.
- `git diff --check`: pass.

## // 005. PENDIENTE / RIESGOS

La coordinación de intención y los propios handlers de hooks siguen en la fachada. Ya pueden separarse sin llevarse también el parser de envelopes.
