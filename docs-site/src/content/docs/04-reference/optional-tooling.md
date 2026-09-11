---
title: "Integraciones opcionales"
description: "Qué aporta cada integración y qué implica omitirla."
sources: ["installer/src/core/deps.ts", "installer/src/core/deploy.ts", "ein-cc/sync.ts", "runtime/AGENTS.md", "runtime/agents/ein-scout.md", "installer/README.md", "runtime/assets/orchestrator-core.md", "docs/adr/0006-remove-runtime-compressors.md"]
verified_rev: "abe4ee268ab553398fdc08cf57f93a4e236551e4"
---

Las integraciones añaden capacidades concretas; no sustituyen el contrato de trabajo ni la verificación. Una integración puede estar instalada pero desactivada, o configurada y temporalmente inaccesible.

| Integración | Utilidad | Si no está disponible |
| --- | --- | --- |
| Context7 | Documentación de librerías a demanda. | Consultar documentación o fuentes pertinentes por otra vía; declarar lo que no se pudo verificar. |
| Linear | Operaciones sobre tickets cuando están habilitadas o se piden explícitamente. | El trabajo local sigue; una operación que necesita Linear queda pendiente hasta tener acceso. |
| Codegraph | Consultar un índice de relaciones del código cuando existe. | Usar búsqueda y lectura de fuentes; el índice no es obligatorio. |

Linear se activa por su ajuste de integración o una petición explícita, no simplemente por elegir modo auto/manual.

## Instalación y ejecución son decisiones distintas

```bash
ein-install install --runtime pi --no-secrets --no-linear --no-codegraph
```

Omite esos pasos opcionales de instalación o configuración. No borra credenciales existentes, no desinstala herramientas usadas por otros proyectos y no garantiza ejecución sin red. En particular, `--no-codegraph` no equivale a apagar el ajuste Codegraph del proyecto.

Los ajustes del runtime se consultan y cambian en Pi o en la aplicación. Claude consume los compatibles y muestra los que no puede aplicar.

## Engram retirado

Ein deja de instalar, actualizar y usar Engram para reducir piezas que mantener. La continuidad se recupera desde los archivos del proyecto, los artefactos OpenSpec y la evidencia de Git. Cuando hace falta investigar, `ein-scout` reúne evidencia acotada; no se añade otro sistema de memoria ni un paso nuevo al trabajo habitual.

Al actualizar Ein o sincronizar su configuración para Claude, se retiran las conexiones MCP que mantienen la configuración original de Ein. Las configuraciones personalizadas, los datos de `~/.engram-ein` y el binario global se conservan. No se migran notas a otro sistema.

## Hypa y Headroom retirados

Ein ya no los instala, actualiza ni carga en su runtime actual. Los archivos antiguos `hypa.json` y `headroom.json` quedan ignorados incluso si contienen `on`. El flag antiguo `--no-hypa` se acepta sin efecto por compatibilidad, no como una integración opcional soportada.

Se mantienen el manejo nativo de Pi, las guardas y las vistas acotadas de verify con acceso al original. La evaluación no acreditó ahorro del flujo completo suficiente para mantener los compresores. Eso es una decisión sobre Ein, no una afirmación universal sobre esas herramientas.

Si viste «hypa actualizado» al saltar desde un instalador antiguo, consulta [la explicación de la transición](/ein-agent/05-debug/troubleshooting/#hypa-aparece-al-actualizar).
