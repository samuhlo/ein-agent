---
title: "Flujo de trabajo"
description: "La ruta mínima útil, con decisiones claras y verificación independiente."
sources: ["runtime/assets/orchestrator-core.md", "runtime/agents/sdd-tasks.md", "runtime/agents/sdd-verify.md"]
verified_rev: "7c3dd072fdc872b46f680e09325c722ce59efa1b"
---

Primero se entiende el resultado. Después se elige la ruta más pequeña que permita hacerlo y comprobarlo bien. Los modelos caros resuelven decisiones para que los ejecutores puedan trabajar con menos razonamiento y contexto.

## Antes de modificar

Una petición completa y autorizada puede registrarse directamente. Si faltan decisiones materiales, el padre pregunta y espera la respuesta real. Un cambio de objetivo reabre el acuerdo e invalida lo que ya no corresponda; el modo auto no inventa consentimiento.

Una consulta de solo lectura no necesita este expediente.

## Ad-hoc: una edición acotada

```text
acuerdo → apply → verify independiente → explicación
```

El encargo define resultado, archivos, contexto y comprobaciones. Apply edita; otro hijo con contexto fresco revisa y comprueba. No se exige crear un directorio SDD ni un informe en disco para justificar una modificación pequeña.

## SDD standard

```text
scope → map → design → tasks → apply → verify → close
```

| Fase | Responsabilidad |
| --- | --- |
| scope | Fijar límites, éxito y restricciones. |
| map | Localizar fuentes y puntos de intervención. |
| design | Resolver comportamiento, decisiones y riesgos. |
| tasks | Convertir el diseño en grupos ejecutables y verificables. |
| apply | Implementar el grupo asignado y registrar progreso y evidencia. |
| verify | Inspeccionar cambios, ejecutar checks propios y juzgar cobertura. |
| close | Preparar el resumen y archivar con evidencia, cuando los controles lo permiten. |

El padre valida la fase terminada y sigue la navegación calculada. No da un cambio por verificado porque apply diga que terminó. Un plan incompleto vuelve a la fase pensante correspondiente: tasks y apply no rebajan criterios para poder avanzar.

## Micro y TDD

El carril micro existente usa `scope → design → apply → verify → close`. El carril y la postura TDD pertenecen al cambio; no se convierten automáticamente por contar archivos o encontrar un runner. Una petición explícita de SDD se respeta.

Con TDD estricto se exige evidencia de los ciclos declarados, incluida la secuencia histórica. Con TDD desactivado no se inventa un historial RED/GREEN; siguen siendo necesarias las comprobaciones pertinentes. Un test verde hoy no prueba que fallara antes ni subsana una evidencia histórica obligatoria ausente.

## Entrega

La respuesta explica resultado, pruebas y límites. Commit, PR, merge y publicación siguen la autorización existente del usuario. Cerrar el expediente SDD no publica el proyecto por sí mismo.

Consulta [artefactos](/ein-agent/02-workflow/artifacts/) y [un ejemplo histórico real](/ein-agent/02-workflow/real-workflow-example/).
