---
title: "Doctor"
description: "Qué comprueba `ein-install doctor`, cómo leer su salida y qué hacer con cada nivel."
sources: ["installer/src/cli/doctor.ts", "installer/src/core/verify.ts"]
verified_rev: "abe4ee268ab553398fdc08cf57f93a4e236551e4"
---

```bash
ein-install doctor
```

Diagnostica el despliegue **sin lanzar ningún runtime**. Es el primer comando al
que volver cuando algo va raro, y el que conviene pegar si pides ayuda.

## Cómo se lee la salida

La salida muestra el resultado global, recuentos y grupos de comprobaciones.
Los grupos completamente correctos se resumen en una línea; los avisos y fallos
muestran su detalle. El número de checks depende del despliegue, no es una cifra
fija que debas reproducir.

Tres niveles, y la diferencia importa:

| | Significa | Qué hacer |
| :--- | :--- | :--- |
| `✓ OK` | comprobado y correcto | nada |
| `! WARN` | funciona, pero algo falta o está degradado | se puede usar; resolver cuando puedas |
| `✗ FAIL` | roto, revísalo antes de seguir | arreglar antes de trabajar |

El comando sale con código **0** si el resultado es OK o WARN, y **1** si hay
algún FAIL. Sirve para encadenarlo en scripts.

## Qué comprueba

Diez grupos:

| Grupo | Qué mira |
| :--- | :--- |
| **CORE** | rutas, marcador de instalación, estructura del despliegue |
| **PAQUETES PI** | paquetes declarados del runtime |
| **MCP** | servidores MCP configurados |
| **AGENTES + CHAIN** | que los ejecutores de fase están y la cadena es coherente |
| **EXTENSIONES** | extensiones del runtime desplegadas |
| **SKILLS** | skills locales y descargadas |
| **GUARDRAILS** | los controles deterministas |
| **COHERENCIA** | que las piezas encajan entre sí |
| **RUNTIME** | el runtime y su versión |
| **INTEGRACIONES** | las opcionales: Context7, Linear, Codegraph |

## Qué hacer según lo que salga

**Todo OK.** Baseline estable, nada que hacer.

**Hay WARN.** Se puede trabajar. Los más frecuentes son integraciones opcionales
sin configurar, y son WARN precisamente porque no bloquean nada.

**Hay FAIL.** Lee primero el detalle. Si faltan archivos gestionados, puedes reparar con:

```bash
ein-install install
```

Puede reparar archivos gestionados que faltan o un despliegue incompleto. Revisa antes el fallo: una dependencia, credencial o servicio externo necesita su propia corrección. El instalador conserva estado privado y prepara recuperación según la operación.

Si persiste, [Troubleshooting](/ein-agent/05-debug/troubleshooting/) cubre los
casos concretos.

## Si EIN no está instalado

El doctor informa de que no existe el hogar de Ein y pide instalarlo. Sale con
código 1: no hay un despliegue que diagnosticar.

## Su límite

El doctor comprueba **el despliegue**, no tu trabajo. Que salga todo en verde
significa que EIN está bien instalado, no que tu proyecto esté bien ni que un
cambio esté correcto.

Para evaluar el cambio hacen falta revisión de fuentes y comprobaciones pertinentes. `ein-cc-sdd check` valida el contrato SDD en Claude; no ejecuta por sí solo toda la verificación de comportamiento.

## Siguiente

[Known Limitations](/ein-agent/05-debug/known-limitations/) — qué está probado y
qué no.
