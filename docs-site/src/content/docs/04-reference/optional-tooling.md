---
title: "Integraciones opcionales"
description: "Qué aporta cada integración y qué implica omitirla."
sources: ["installer/src/core/deps.ts", "installer/README.md", "runtime/assets/orchestrator-core.md", "docs/adr/0006-remove-runtime-compressors.md"]
verified_rev: "7c3dd072fdc872b46f680e09325c722ce59efa1b"
---

Las integraciones añaden capacidades concretas; no sustituyen el contrato de trabajo ni la verificación. Una integración puede estar instalada pero desactivada, o configurada y temporalmente inaccesible.

| Integración | Utilidad | Si no está disponible |
| --- | --- | --- |
| Context7 | Documentación de librerías a demanda. | Consultar documentación o fuentes pertinentes por otra vía; declarar lo que no se pudo verificar. |
| Engram | Notas de memoria opcionales, como contexto orientativo. | Trabajar con fuentes actuales y artefactos del proyecto. |
| Linear | Operaciones sobre tickets cuando están habilitadas o se piden explícitamente. | El trabajo local sigue; una operación que necesita Linear queda pendiente hasta tener acceso. |
| Codegraph | Consultar un índice de relaciones del código cuando existe. | Usar búsqueda y lectura de fuentes; el índice no es obligatorio. |

La fuente actual y la petición vigente prevalecen sobre una nota de memoria. Engram no obliga a convertir cada sesión en memoria universal. Linear se activa por su ajuste de integración o una petición explícita, no simplemente por elegir modo auto/manual.

## Instalación y ejecución son decisiones distintas

```bash
ein-install install --runtime pi --no-engram --no-secrets --no-linear --no-codegraph
```

Omite esos pasos opcionales de instalación o configuración. No borra credenciales existentes, no desinstala herramientas usadas por otros proyectos y no garantiza ejecución sin red. En particular, `--no-codegraph` no equivale a apagar el ajuste Codegraph del proyecto.

Los ajustes del runtime se consultan y cambian en Pi o en la aplicación. Claude consume los compatibles y muestra los que no puede aplicar.

## Hypa y Headroom retirados

Ein ya no los instala, actualiza ni carga en su runtime actual. Los archivos antiguos `hypa.json` y `headroom.json` quedan ignorados incluso si contienen `on`. El flag antiguo `--no-hypa` se acepta sin efecto por compatibilidad, no como una integración opcional soportada.

Se mantienen el manejo nativo de Pi, las guardas y las vistas acotadas de verify con acceso al original. La evaluación no acreditó ahorro del flujo completo suficiente para mantener los compresores. Eso es una decisión sobre Ein, no una afirmación universal sobre esas herramientas.

Si viste «hypa actualizado» al saltar desde un instalador antiguo, consulta [la explicación de la transición](/ein-agent/05-debug/troubleshooting/#hypa-aparece-al-actualizar).
