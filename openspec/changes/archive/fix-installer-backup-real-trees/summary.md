## // 000. RESUMEN
Hotfix verificado para respaldar árboles Pi reales: excluye dependencias regenerables, preserva enlaces simbólicos sin seguirlos, acepta hardlinks y mantiene recuperación fail-closed con causas accionables. El cambio está sincronizado y listo para cerrar.

## // 001. QUÉ CAMBIÓ
- `installer/src/core/backup-manifest.ts`: manifest v2 con enlaces opacos, exclusión estructural de dependencias, límites sobre estado incluido y aceptación segura de hardlinks.
- `installer/src/core/backup.ts`: staging, restore, fsync/seal y reinserción de estado excluido sin seguir enlaces; compatibilidad con manifest v1.
- `installer/src/core/install-executor.ts`, `installer/src/cli/install.ts`: propagación acotada de causas y admisión del único retry pre-mutación soportado.
- `installer/src/core/install-journal.ts`: detalle de fallo opcional, validado y acotado; reanudación exacta conservando evidencia de Claude completado.
- `tests/installer-backup.test.ts`, `tests/install-journal.test.ts`: fixtures Omarchy, seguridad de restore, causas, recuperación y regresiones de caller.
- La especificación sincronizada añadió tres escenarios de `installer-runtime`, sin conflictos.

## // 002. CÓMO FUNCIONA POR DENTRO
La colección omite raíces regenerables antes de `lstat`, recuento o lectura; el estado de usuario sigue limitado. Los manifests v2 distinguen ficheros y enlaces con target opaco, validan canonicalidad, límites y colisiones, y recrean enlaces únicamente como nodos finales con padres reales comprobados. El restore usa stages atómicos y operaciones no-follow; los ficheros hardlink se materializan independientemente.

Los fallos de backup se sanitizan y limitan a 512 bytes, conservando operación, entrada relativa y detalle útil. El journal solo reanuda un `both` con fallo `handler-failed` exactamente en `pi.backup-current`, antes de cualquier mutación; Claude completado y entradas previas permanecen completadas, mientras el resto de Pi sigue no-completo hasta éxito probado.

## // 003. DECISIONES
- Versionar el manifest en vez de reinterpretar v1, preservando snapshots existentes.
- Excluir dependencias estructuralmente, sin elevar los límites globales del estado de usuario.
- No conservar topología de hardlinks ni dereferenciar enlaces externos.
- Mantener recovery estrecho y fail-closed; estados ambiguos o posteriores a mutación siguen bloqueados.
- Remediaciones de revisión: `pi.backup-current` devuelve el detalle ya saneado; restore legacy reemplaza enlaces como nodos y evita `chmod` follow-capable.

## // 004. VERIFICACIÓN
- Verificación independiente final: `status: pass`, cobertura de requisitos 1–8 y tareas 1.1–6.1 confirmada.
- Suite focalizada: 53 pasaron, 0 fallaron, 459 aserciones.
- Suite completa: 2357 pasaron, 0 fallaron, 9596 aserciones.
- `bun run typecheck` y `cd installer && bun run typecheck`: ambos pasaron.
- Remediaciones de causa del caller y restore legacy: pasaron; `git diff --check` pasó.
- Sync OpenSpec: estado `synchronized`, 3 escenarios añadidos, 0 conflictos.

## // 005. PENDIENTE / RIESGOS
- Ningún bloqueo de verificación.
- El entorno no dispone de `timeout`; se usaron wrappers Python con límite de 300 s.
- No se ejecutó build de producción, conforme al alcance.
