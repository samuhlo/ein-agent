---
title: "Doctor"
description: "Qué comprueba `ein-install doctor`, cómo leer su salida y qué hacer con cada nivel."
sources: ["installer/src/cli/doctor.ts", "installer/src/core/verify.ts"]
verified_rev: "eeceb7c"
---

```bash
ein-install doctor
```

Diagnostica el despliegue **sin lanzar ningún runtime**. Es el primer comando al
que volver cuando algo va raro, y el que conviene pegar si pides ayuda.

## Cómo se lee la salida

```text
/// DOCTOR EIN

resultado: WARN
fail: 0  |  warn: 2  |  total: 47

■ CORE
  ✓ OK   agent dir: ~/.pi-ein/agent
  ✓ OK   marcador: .ein-install.json válido

■ INTEGRACIONES
  ! WARN context7: sin clave configurada

■ DECISION
  usable; resolver WARN para endurecer baseline.
```

Tres niveles, y la diferencia importa:

| | Significa | Qué hacer |
| :--- | :--- | :--- |
| `✓ OK` | comprobado y correcto | nada |
| `! WARN` | funciona, pero algo falta o está degradado | se puede usar; resolver cuando puedas |
| `✗ FAIL` | roto, revísalo antes de seguir | arreglar antes de trabajar |

El comando sale con código **0** si el resultado es OK o WARN, y **1** si hay
algún FAIL. Sirve para encadenarlo en scripts.

## Qué comprueba

Nueve grupos:

| Grupo | Qué mira |
| :--- | :--- |
| **CORE** | rutas, marcador de instalación, estructura del despliegue |
| **MCP** | servidores MCP configurados |
| **AGENTES + CHAIN** | que los ejecutores de fase están y la cadena es coherente |
| **EXTENSIONES** | extensiones del runtime desplegadas |
| **SKILLS** | skills locales y descargadas |
| **GUARDRAILS** | los controles deterministas |
| **COHERENCIA** | que las piezas encajan entre sí |
| **RUNTIME** | el runtime y su versión |
| **INTEGRACIONES** | las opcionales: Context7, Engram, Linear, Codegraph |

## Qué hacer según lo que salga

**Todo OK.** Baseline estable, nada que hacer.

**Hay WARN.** Se puede trabajar. Los más frecuentes son integraciones opcionales
sin configurar, y son WARN precisamente porque no bloquean nada.

**Hay FAIL.** Antes de investigar a mano, prueba:

```bash
ein-install install
```

Repara sobre la instalación existente y crea backup antes. Resuelve la mayoría
de los FAIL, que suelen ser ficheros que faltan o una sincronización a medias.

Si persiste, [Troubleshooting](/ein-agent/05-debug/troubleshooting/) cubre los
casos concretos.

## Si EIN no está instalado

```text
Ein no esta desplegado: no existe ~/.pi-ein/agent.
Ejecuta `ein-install install` primero.
```

Sale con código 1. No es un error del doctor: es que no hay nada que
diagnosticar.

## Su límite

El doctor comprueba **el despliegue**, no tu trabajo. Que salga todo en verde
significa que EIN está bien instalado, no que tu proyecto esté bien ni que un
cambio esté correcto.

Para eso están `cc-ein-sdd check` y los artefactos del cambio.

## Siguiente

[Known Limitations](/ein-agent/05-debug/known-limitations/) — qué está probado y
qué no.
