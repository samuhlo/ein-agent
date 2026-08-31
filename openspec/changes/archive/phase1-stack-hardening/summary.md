status: complete
change: phase1-stack-hardening
work_groups: 5
verification_status: pass

## // 000. RESUMEN

La primera fase de arquitectura queda entregada como cinco cambios revisables: historial OpenSpec compacto, limpieza real del repositorio, separación de contenido propio y externo, una frontera compartida más estrecha y un relevo SDD de Claude deliberadamente pequeño.

## // 001. QUÉ CAMBIÓ

- Los cambios cerrados conservan un `summary.md` útil y eliminan los artefactos intermedios.
- El corpus de evaluaciones reconstruye tareas y verificación desde ese resumen compacto.
- Las compilaciones de sincronización y empaquetado confinan sus temporales Bun y los retiran siempre.
- El contenido propio vive en `runtime/`; las skills externas, en `vendor/skills/`.
- Claude recibe contratos mínimos y una CLI dividida, sin fingir un contexto interno de Pi.
- El modelo capaz decide `scope`, `design` y `tasks`; los modelos baratos recorren las fases mecánicas.

## // 002. CÓMO FUNCIONA POR DENTRO

El cierre valida metadatos, secciones y comandos de verificación antes de sustituir el directorio activo por su resumen. Pi sigue siendo el runtime principal. Claude consume una fachada compartida pequeña para consultar estado, continuar trabajo y ejecutar el recorrido SDD reducido; no busca paridad textual con Pi.

## // 003. DECISIONES

- El resumen es el historial duradero; no se conserva documentación de proceso por inercia.
- No se exige que los artefactos intermedios estén en Git antes de cerrar: el contrato duradero es el resumen validado.
- `shared/ports/` se declara como fachada temporal de migración, no como prueba de independencia arquitectónica.
- Los hotspots grandes restantes no se marcan como resueltos en el roadmap.

## // 004. VERIFICACIÓN

- 2897 tests, 0 fallos, 209 ficheros.
- Typecheck raíz e instalador en verde.
- Sitio documental construido: 24 páginas; 22 fuentes válidas.
- Payload de Claude empaquetado y ejecutado desde BunFS en un binario real.
- El empaquetador de la app se ejecutó sin dejar temporales Bun en el repositorio.
- verify: `bun test`
- verify: `bun run typecheck`
- verify: `cd installer && bun run typecheck`
- verify: `bun ein-pi/agent/lib/docs-site-drift-detector.ts --check-sources`
- verify: `cd docs-site && bun run build`
- verify: `cd installer && bun run scripts/bundle-ein-cc.ts`
- verify: `cd installer && bun run bundle-template:host`

## // 005. PENDIENTE / RIESGOS

- Parte de la implementación alcanzada desde `shared/ports/` todavía vive bajo Pi; la fachada hace visible esa deuda sin prometer una independencia falsa.
- `ein-ai.ts`, `runtime-session-adapters.ts`, `project-state.ts`, `sdd-preflight.ts` y `sdd-router.ts` siguen siendo hotspots pendientes de una fase posterior.
