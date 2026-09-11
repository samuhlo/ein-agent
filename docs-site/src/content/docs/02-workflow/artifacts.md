---
title: "Artefactos y evidencia"
description: "Qué conserva cada fase y cómo revisar el resultado."
sources: ["runtime/agents/sdd-tasks.md", "runtime/agents/sdd-verify.md", "shared/sdd/sdd-summary-write.ts", "shared/sdd/sdd-close-compaction.ts"]
verified_rev: "7c3dd072fdc872b46f680e09325c722ce59efa1b"
---

En SDD los artefactos viven en `openspec/changes/<cambio>/`. Su propósito es permitir ejecutar y revisar el trabajo sin cargar toda la conversación en cada hijo. La ruta ad-hoc no exige estos archivos.

| Archivo | Contenido |
| --- | --- |
| `intent.md` | Acuerdo gestionado y su material vigente. |
| `scope.md` | Límites, éxito y restricciones del cambio. |
| `map.md` | Fuentes y localización del trabajo. |
| `design.md` | Decisiones, comportamiento y contrato de la solución. |
| `tasks.md` | Grupos accionables con contexto, ediciones, checks y condiciones de parada. |
| `apply-progress.md` | Progreso de las tareas y evidencia de ejecución. |
| `verify-report.md` | Dictamen independiente, cobertura, comandos y bloqueos. |
| `summary.md` | Resultado duradero con evidencia conservada al cerrar. |

Los carriles e históricos admitidos pueden requerir otro conjunto. Las herramientas de estado y validación determinan el caso; no se añaden archivos vacíos para fingir fases.

## Lo que debe recibir apply

Un grupo declara un resultado observable. Cada tarea contiene las skills, lecturas, archivos que se editan, comportamiento, condición de parada y comprobaciones. Las decisiones se resuelven antes; una referencia de lectura no es permiso para ampliar las escrituras.

En Pi, `apply_group: <título exacto del siguiente grupo>` junto a la ruta del cambio permite compilar el paquete compatible. Conserva instrucciones, subpasos y notas pertinentes; valida metadatos y vigencia. Un rechazo exige corregir el encargo, no ignorar la validación. Los planes legacy mantienen su ruta compatible y este mecanismo no equivale a confinamiento total de comandos.

## Qué revisa verify

Verify inspecciona código y tests cambiados, ejecuta los checks requeridos por su cuenta y vincula resultados con comportamientos. Combina comandos exactamente duplicados cuando las asociaciones declaradas son suficientes; no inventa qué requisito cubre un test ambiguo.

El informe empieza con `status: pass` o `status: fail` y declara `behavior_coverage: verified`, `partial`, `none` o `n-a`. Un cambio de documentación puede ser `n-a`; un build correcto sobre código nuevo no basta para declarar toda su conducta verificada.

Las evidencias se referencian con comando, resultado y origen. El índice permite localizar logs y eventos nativos de la sesión sin exigir otro registro duplicado. Una vista acotada no significa que se haya leído el log entero. Las dudas requieren consultar el original.

Con TDD estricto o una obligación histórica explícita hay que acreditar la secuencia exigida. Cada bloqueo previo se resuelve individualmente; un check verde actual no borra una carencia histórica.

## Al cerrar

La herramienta de resumen deriva campos terminales de apply completo y verify vigente, con las tareas terminadas y el acuerdo correspondiente. La explicación del agente acompaña esos datos.

El cierre incorpora íntegros `apply-progress.md` y `verify-report.md` en el resumen antes de compactar los originales. También conserva `sync-report.md` cuando existe. El archivo normal queda en `openspec/changes/archive/<cambio>/summary.md`. Los logs externos referenciados no se convierten automáticamente en archivos portables: conserva sus originales si los necesitas fuera de esa máquina.
