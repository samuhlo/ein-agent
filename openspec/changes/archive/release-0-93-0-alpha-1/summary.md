## // 000. RESUMEN

La `0.93.0-alpha.1` cierra la fase de auditoría arquitectónica y eleva el
contrato de release: la estructura integrada en `main` se valida mediante una
matriz de ciclo de vida en hogares desechables y una actualización real entre
alphas publicadas.

## // 001. QUÉ CAMBIÓ

- Se sincronizaron `installer/package.json`, `INSTALLER_VERSION` y el changelog.
- `e2e/docker-test.sh` cubre Pi, Claude, ambos y uninstall recuperable; instala
  dos veces, ejecuta los contratos de update/rollback y launcher, y comprueba
  que credenciales, sesiones, secrets y ficheros ajenos sobreviven.
- `e2e/release-update-test.sh` instala una release anterior desde sus assets de
  GitHub, actualiza por el canal publicado y verifica versión, marker, `doctor`
  y estado privado.
- El workflow ejecuta ese smoke después de publicar y genera notas distintas
  para estable y alpha; una alpha ofrece canal y tag exactos.
- La documentación del instalador y el roadmap reflejan la evidencia actual.

## // 002. DECISIONES

- Los binarios que Bun recompila durante el despliegue se validan por presencia
  y ejecución, no por igualdad de bytes; el resto del árbol gestionado sí debe
  permanecer idéntico en una reinstalación.
- La prueba de uninstall invoca el `ein-install` instalado para que la
  resolución de rutas ocurra dentro del hogar desechable.
- El smoke público ocurre después de crear la GitHub Release porque la ruta que
  se quiere probar consume precisamente su API, checksum y assets publicados.
  Si falla, la prerelease existe pero el workflow queda rojo y no se considera
  promovible.

## // 003. VERIFICACIÓN

- Contrato de assets y workflow: 19 tests, 0 fallos.
- Matriz Docker: Pi, Claude, Both y uninstall-preservation completados.
- Actualización pública ensayada de `installer-v0.91.0-alpha.3` a
  `installer-v0.92.0-alpha.1`, con `doctor` y datos privados intactos.
- La publicación de esta versión debe añadir la evidencia final
  `installer-v0.92.0-alpha.1` → `installer-v0.93.0-alpha.1`.

## // 004. RIESGO RESIDUAL

El smoke post-publicación no puede ejecutarse antes de que existan los assets.
Por eso una publicación incompleta queda visible como prerelease fallida y debe
corregirse antes de anunciarla; no se degrada silenciosamente a otro canal o
tag.
