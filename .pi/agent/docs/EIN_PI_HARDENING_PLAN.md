# Ein Pi Hardening Plan

> **Documento histórico.** Plan de endurecimiento del proceso de migración. Para el estado vigente ver `AGENTS.md`, `EIN_OPERATING_SYSTEM.md` y `PI_AGENTS_ARQUITECTURA.md`. Flujo actual: único `ein-sdd` (init → explore → design → apply → verify).

Este documento convierte la migracion OpenCode -> Pi Agents en un plan de endurecimiento progresivo. La meta no es copiar OpenCode 1:1, sino hacer que Ein funcione como un workbench mas solido, barato, didactico y adaptado a Samu.

## Principio Base

- Ein es el entorno operativo principal sobre Pi.
- OpenCode queda intacto como rollback.
- Linear sigue siendo el tablero humano.
- GitHub sigue siendo la capa de entrega.
- SDD es el banco de trabajo interno.
- Engram es la memoria entre sesiones.
- Las skills no deben ser solo archivos disponibles: el sistema debe resolverlas, digerirlas y comprobar que se aplicaron.

## Fase 1: Auditoria Y Snapshot

Estado: completada como snapshot inicial.

Objetivo:

- Auditar el estado actual de `~/.pi/agent`.
- Comparar Pi contra la guia de referencia de 30 harnesses.
- Separar lo que ya esta solido de lo que falta endurecer.
- Crear una matriz clara de estado para decidir el siguiente batch.

Entregables:

- `docs/HARNESS_AUDIT.md`.
- Este plan maestro.
- Memoria Engram con las decisiones y huecos principales.

## Fase 2: Bloques 1-3

Estado: parcialmente completada.

Objetivo:

- Endurecer orquestacion, fases, artefactos, memoria, calidad y continuidad.

Cambios previstos:

- Reforzar `/ein:sdd:init` para que genere `.sdd/config.md` con stack lock, comandos, skills y herramientas prohibidas.
- Reforzar `/ein:sdd:new` para que cree tareas con `why`, `skills`, `verify`, `architecture` y `avoid`.
- Reforzar `/ein:sdd:apply` para que solo implemente tareas ya escritas.
- Reforzar `/ein:sdd:verify` para que nunca marque `Passed` sin evidencia real.
- Anadir contratos de fase: estado, artefactos leidos, artefactos escritos, riesgos y siguiente paso.
- Anadir hard stops cuando falten artefactos obligatorios.

Completado recientemente:

- Comandos SDD canonizados bajo `/ein:sdd:*`.
- Prompts base alineados con comandos canonicos.
- Help actualizado para ruta breve y `full`.

Decision Samuhlo:

- Strict TDD debe ser pragmatico, no dogmatico.
- TDD obligatorio para logica de negocio, parsers, auth, datos, bugs reproducibles y utilidades.
- TDD recomendado pero no bloqueante para cambios visuales pequenos.

## Fase 3: Bloque 4

Estado: completada como primera version funcional.

Objetivo:

- Construir el sistema real de skills y subagentes.

Cambios previstos:

- Crear `extensions/ein-skill-registry.ts`.
- Escanear `skills/local` y `skills/downloaded`.
- Extraer nombre, descripcion, triggers, stack, coste, tipo y dependencias.
- Crear herramientas como `ein_skill_registry`, `ein_skill_resolve`, `ein_skill_digest` y `ein_skill_feedback`.
- Pasar a cada subagente solo las reglas compactas que necesita para su tarea.

Completado recientemente:

- `ein_skill_registry`, `ein_skill_resolve`, `ein_skill_digest` y `ein_skill_feedback` existen.
- `/ein:skills` queda para mantenimiento de stack fijo (status/update/add/clean).
- `/ein:skills:advisor` expone resolve+digest para uso manual.
- `/skill:*` nativo sigue activo como escape hatch.

Decision Samuhlo:

- El agente no debe recibir una biblioteca entera si solo necesita 4 reglas.
- La skill debe convertirse en comportamiento verificable, no en decoracion.

## Fase 4: Subagent Isolation

Objetivo:

- Hacer que los subagentes emulados de Pi se comporten como trabajadores aislados con contrato claro.

Cambios previstos:

- Cada subagente recibe tarea concreta, cwd, fase, artefactos obligatorios, skills digeridas, permisos y output contract.
- El orquestador no pasa conversacion completa cuando no hace falta.
- Cada subagente devuelve una respuesta interna estructurada y el usuario recibe Markdown humano.

## Fase 5: Seguridad Y Recuperacion

Estado: parcialmente completada.

Objetivo:

- Reducir el riesgo de romper configuracion o filtrar secretos.

Cambios previstos:

- Revisar la excepcion de `auth.json` en guardrails.
- Mejorar `samuhlo-doctor` para detectar skills rotas, prompts faltantes, extensiones que no compilan, secretos presentes sin mostrar valores, modelos activos, Engram y bridges.
- Anadir snapshot/backup antes de mutar `~/.pi/agent`.
- Documentar rollback real a OpenCode y rollback interno de Pi.

Completado recientemente:

- `/ein:doctor-output` ahora revisa core, comandos, SDD, skills, guardrails, integraciones y contratos Linear.
- El comando redundante de estado fue eliminado.
- `/ein:status` usa salida compacta sin emojis decorativos.

## Fase 6: Manual Diario

Estado: creado y en actualizacion continua.

Objetivo:

- Crear una guia personal de uso diario.

Documento previsto:

- `docs/EIN_OPERATING_SYSTEM.md`.

Contenido previsto:

- Como empezar una tarea simple.
- Como empezar una tarea seria.
- Cuando usar Linear.
- Cuando usar GitHub.
- Cuando usar SDD.
- Cuando saltarse SDD.
- Cuando usar modelo caro.
- Como recuperar una sesion.
- Como volver a OpenCode.
- Que no debe tocar nunca el agente.

## Prioridad Actual

1. Mantener la documentacion alineada con comandos `/ein:*`.
2. Probar el flujo interactivo real de orquestador con tareas complejas.
3. Decidir si se eliminan aliases legacy cuando la interfaz Ein este consolidada.
4. Empaquetar Ein si el setup sigue estable.
