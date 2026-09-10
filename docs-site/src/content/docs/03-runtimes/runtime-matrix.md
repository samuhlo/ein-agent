---
title: "Matriz de runtimes"
description: "Capacidades compartidas y diferencias que importan."
sources: ["ein-pi/README.md", "ein-cc/README.md", "ein-cc/sync.ts"]
verified_rev: "7c3dd072fdc872b46f680e09325c722ce59efa1b"
---

Pi es el núcleo; Claude es un relevo opcional. Esta matriz describe capacidades del código, no una certificación de todos los proveedores y servicios externos.

| Capacidad | Pi | Claude Code |
| --- | --- | --- |
| Estado y contratos SDD | Herramientas del runtime | CLI sobre núcleo compartido |
| Acuerdo gestionado nuevo o modificado | Captura de respuesta y confirmación | Resolver primero en Pi |
| Consumir acuerdo confirmado | Sí | Sí |
| Modelos y esfuerzo por rol | Configuración en Pi | Rutas generadas por sync |
| Skills pertinentes | Resolución e inyección de rutas por Ein | Descubrimiento nativo y rutas explícitas |
| Apply Packet y extensiones de contexto | Ruta Pi para planes compatibles | Sin equivalencia completa |
| Inspección y verificación independiente | Fase verify | Fase verify adaptada |
| Índice de evidencia y previews de Pi | Extensiones de hijos | Sin equivalencia completa |
| Ajustes del proyecto | Selectores y lectura | Lectura y traducción; limitaciones visibles |
| Gate de comandos | Guardas y autorizaciones Pi | Hook Bash y permisos Claude |
| Cleaner/Architect automáticos | Participación configurable | No soportado |
| Sesiones privadas | Hogar Pi de Ein | Hogar Claude de Ein |

Un handoff usa el estado del proyecto y abre una sesión nueva; no migra conversaciones. La configuración `.pi/ein/` es del proyecto, aunque su nombre mencione Pi.

Solo `applied` indica una directiva inyectada en Claude. `unreadable`, `unsupported`, `inactive` y `unhandled` describen por qué no se aplica; no equivalen a una configuración exitosa por defecto.

Consulta [Pi](/ein-agent/03-runtimes/pi-coding-agent/), [Claude](/ein-agent/03-runtimes/claude-code/) y las [limitaciones conocidas](/ein-agent/05-debug/known-limitations/).
