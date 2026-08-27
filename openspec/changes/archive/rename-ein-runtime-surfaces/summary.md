# Summary — rename-ein-runtime-surfaces

## // 000. RESUMEN

Ein adopta una nomenclatura coherente: `ein` es la puerta pública, `ein-install` la vía de instalación/reparación y `ein-pi`, `ein-cc` y `ein-cc-sdd` las superficies avanzadas. El cambio se publicó como la prerelease inmutable `0.91.0-alpha.3` sin mover los hogares de datos existentes.

## // 001. QUÉ CAMBIÓ

- El adaptador Pi quedó integrado en `ein-pi/ein-pi.fish`, `ein-pi/migrate.ts` y `ein-pi/README.md`; desapareció el root fuente `pi-ein/`.
- El adaptador Claude se movió a `ein-cc/`; su launcher es `ein-cc/ein-cc.fish` y su CLI determinista es `ein-cc-sdd`.
- `installer/src/core/`, `installer/scripts/`, CI y E2E usan el payload `ein-cc-runtime.tar.gz` y publican solo las superficies Ein-first.
- `installer/src/core/legacy-runtime-artifacts.ts` y `runtime-surface-transaction.ts` implementan retirada segura y recuperable de artefactos alpha.2.
- README, `EIN.md`, `docs/`, `docs-site/`, pruebas y cinco dominios OpenSpec sincronizados describen `ein` como entrada normal y los launchers directos como avanzados.
- La entrega pasó por PR #256 (merge `8379c2b9`) y PR #257; el tag `installer-v0.91.0-alpha.3` apunta al commit de metadata/main `ab799269`.

## // 002. CÓMO FUNCIONA POR DENTRO

- Los árboles `ein-pi/` y `ein-cc/` son las fuentes de verdad; inventario, bundle, BunFS, staging y compilación derivan de esos nombres y validan manifest, miembros y checksums en modo fail-closed.
- Install/update materializan y validan primero las superficies nuevas. Después, el clasificador devuelve `absent`, `owned` o `collision` para cada ruta legacy mediante bytes conocidos o marcador, inventario y contención exactos, sin seguir symlinks.
- Los artefactos `owned` se mueven a una cuarentena privada con manifest durable v2 antes de cada movimiento. El journal reutiliza la misma identidad para reentrada, restaura en orden inverso al fallar y elimina la cuarentena solo tras el commit global.
- Una `collision` nunca se borra: se conserva byte a byte y genera un diagnóstico acotado.
- La auditoría tipada permite nombres retirados solo como `data-home` o `legacy-migration`; cualquier uso corriente no clasificado rompe el gate.
- `~/.pi-ein/agent`, `~/.claude-ein`, `PI_CODING_AGENT_DIR`, `EIN_PI_AGENT_HOME` y `CLAUDE_CONFIG_DIR` conservan su significado y sus datos.

## // 003. DECISIONES

- Corte limpio: no se instalan aliases `pi-ein`, `cc-ein` ni `cc-ein-sdd`; solo se reconocen para migración segura.
- Un nombre/ruta coincidente no demuestra propiedad; se rechazó cualquier borrado sin prueba exacta y cualquier ampliación por substring o directorio.
- Los hogares aislados son contratos de estado, no nombres de producto, por lo que no se migraron.
- Las superficies Claude generadas se regeneran desde sus entradas autoritativas; no se parchea solo `ein-cc/CLAUDE.md`.
- La publicación es tag-driven y el tag alpha.3 no se mueve ni se republica a la fuerza.

## // 004. VERIFICACIÓN

- Verify quedó `status: pass` y con todos los gates requeridos en verde: 160 pruebas focalizadas y 2.781 pruebas completas, 0 fallos; ambos typechecks, `build:all`, build de 23 páginas, sync idempotente y auditoría con 0 referencias sin clasificar.
- Pasaron la inspección raw de portabilidad de ambos tar, el payload Linux arm64 compilado en Docker y el E2E local `invalid`/Pi/Claude/both 4/4.
- `installer-release` run 33092818447 terminó correctamente y publicó la prerelease con cuatro binarios, `checksums.txt` e `install.sh`; el checksum Linux arm64 coincide.
- El binario publicado pasó fresh smoke Docker `invalid`/Pi/Claude/both 4/4 y una segunda instalación idempotente.
- El upgrade publicado desde alpha.2 eliminó los `owned` `pi-ein` y `cc-ein-sdd`, preservó una colisión `cc-ein`, mantuvo byte-estable el estado Pi/Claude e instaló `ein-pi`, `ein-cc`, `ein-cc-sdd`, `ein` y `ein-install`.

## // 005. PENDIENTE / RIESGOS

Ninguno conocido para esta entrega. Las colisiones legacy no demostradas quedan deliberadamente preservadas para revisión del usuario; cualquier corrección posterior debe usar una versión nueva y no modificar `installer-v0.91.0-alpha.3`.
