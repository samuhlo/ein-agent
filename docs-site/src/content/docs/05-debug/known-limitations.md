---
title: "Limitaciones conocidas"
description: "Qué sigue requiriendo pruebas y revisión humana."
sources: ["docs/adr/0006-remove-runtime-compressors.md", "runtime/assets/orchestrator-core.md", "ein-cc/README.md", "runtime/agents/sdd-verify.md"]
verified_rev: "7c3dd072fdc872b46f680e09325c722ce59efa1b"
---

Ein está en desarrollo beta y publica prereleases alpha. Los formatos, comandos y capacidades pueden cambiar; las [notas de release](https://github.com/samuhlo/ein-agent/releases) y el [changelog](https://github.com/samuhlo/ein-agent/blob/main/CHANGELOG.md) identifican lo publicado.

## Plataformas y modelos

Se construyen binarios para Linux y macOS en ARM64 y x64. La evidencia de una plataforma o un escenario no certifica todos los entornos. Windows no está soportado.

La ejecución local es futura y opcional. No se declara validado un modelo o GPU concretos sin ejecutar pruebas con ellos. Un ejecutor barato alojado es una ruta válida, sujeto a encargos suficientemente claros y a la misma verificación.

## Coste y contexto

Menos contexto inicial no garantiza menor coste total. El padre puede compensar el ahorro con más turnos o entradas no cacheadas; los fallos y reintentos también cuentan. Los pilotos históricos describen sus escenarios, no un ahorro universal.

Contexto fresco evita heredar toda la conversación, pero incluye instrucciones, herramientas y contexto de la tarea. No tiene un tamaño fijo ni elimina el riesgo de que el hijo se equivoque.

## Calidad y controles

Un `verify: pass` describe el contrato comprobado y su cobertura declarada. No garantiza ausencia de errores ni calidad de requisitos. Build, tipos y lint solos no prueban comportamiento; los checks obligatorios bloqueados deben declararse.

Los packets y patrones de shell no son un sandbox completo. La procedencia de evidencia no demuestra su suficiencia semántica. Tampoco hay una garantía general para escritores paralelos sobre un mismo árbol: las mutaciones del flujo se mantienen secuenciales.

## Claude y servicios externos

Claude es un relevo menor que Pi. Los acuerdos gestionados nuevos o modificados deben resolverse en Pi antes del handoff. Skills, contexto, evidencia, permisos y perfiles automáticos no tienen paridad completa. Consulta la [matriz](/ein-agent/03-runtimes/runtime-matrix/).

Los smokes históricos de MCP no garantizan disponibilidad actual de credenciales o servicios. Las sesiones siguen siendo privadas por runtime; el handoff no migra conversaciones.

## Instaladores antiguos

`0.97.0-alpha.1` retira Hypa del runtime. Un proceso anterior que actualiza a esa versión todavía puede terminar su propia revisión antigua de herramientas. La corrección posterior de [PR #407](https://github.com/samuhlo/ein-agent/pull/407) está integrada en `main`, pero no forma parte de ese binario ya publicado ni lo cambia retroactivamente.

Consulta [troubleshooting](/ein-agent/05-debug/troubleshooting/) si ves ese mensaje. No indica por sí solo que Hypa siga cargándose en el runtime nuevo.
