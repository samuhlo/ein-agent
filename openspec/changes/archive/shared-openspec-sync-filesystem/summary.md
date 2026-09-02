status: complete
change: shared-openspec-sync-filesystem
work_groups: 2
verification_status: pass

## // 000. RESUMEN

Pi y Claude sincronizan OpenSpec con el mismo adaptador de disco, incluido su rollback, y la frontera baja a siete puentes SDD.

## // 001. QUÉ CAMBIÓ

- El adaptador vive en `shared/sdd/openspec-spec-sync-fs.ts`.
- Pi conserva una fachada compatible.
- El puerto público apunta a shared.
- Claude deja de empaquetar la fachada Pi.

## // 002. CÓMO FUNCIONA POR DENTRO

El adaptador lee deltas y bases, pide un plan al core compartido, publica mediante temporales y restaura lo ya escrito si una sustitución posterior falla. La mudanza conserva esas mismas costuras y su orden.

## // 003. DECISIONES

- Compartir filesystem está permitido por la frontera escrita: shared no puede lanzar procesos, tocar Git ni leer configuración de runtime.
- Conservar la fachada Pi evita una migración lateral de consumidores sin valor arquitectónico.

## // 004. VERIFICACIÓN

- verify: `bun test`
- verify: `bun run typecheck`
- verify: `cd installer && bun run typecheck`
- verify: `cd installer && bun run bundle-template:host`
- verify: `cd installer && bun run scripts/bundle-ein-cc.ts`
- verify: smoke compilado y ejecutado desde `/tmp`.
- Resultado: 2.960 pass, 0 fail.

## // 005. RIESGOS

- El adaptador conserva filesystem directo de forma deliberada; procesos, Git y configuración siguen prohibidos en shared.
- Las fachadas solo se retirarán cuando hacerlo no rompa el layout dual fuente/instalado.
