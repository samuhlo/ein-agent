## // 000. RESUMEN
El bootstrap de `installer/install.sh` ahora falla cerrado: solo publica o entrega el binario tras descargar, validar estrictamente y verificar `checksums.txt`. La cobertura ejecuta el shell real en un sandbox determinista y la verificación final pasó.

## // 001. QUÉ CAMBIÓ
- `installer/install.sh`: checksum obligatorio; valida líneas GNU completas, asset seleccionado exactamente una vez y digest SHA-256 coincidente antes de `chmod`, `mv` o handoff.
- `installer/install.sh`: usa `sha256sum` preferentemente y `shasum -a 256` como fallback; ausencia, fallo o salida inválida son errores.
- `tests/install-sh-checksum.test.ts`: añade cobertura real aislada para descarga fallida, manifest vacío/missing, malformed, duplicado, mismatch, utilidades no disponibles, fallback y éxito.
- Se preservan las pruebas WSL y el contrato de assets/checksums de release.

## // 002. CÓMO FUNCIONA POR DENTRO
El script descarga el binario y el manifest en un directorio temporal protegido por `trap`. Cada línea no vacía debe tener 64 hexadecimales minúsculos, dos espacios ASCII y un nombre de asset no vacío; se ignoran líneas vacías, pero el asset elegido debe aparecer exactamente una vez. Después calcula el digest con la utilidad disponible, valida su forma y compara exactamente antes de seleccionar directorio, cambiar permisos, publicar o ejecutar. El harness Bun sustituye `curl`, `uname`, checksum y comandos de instalación, registra orden y confina efectos al fixture.

## // 003. DECISIONES
- Se mantuvo la lógica de checksum en el bootstrap, sin acoplarla al parser TypeScript del updater.
- No se añadió bypass de checksum: `EIN_INSTALLER_REPO` continúa siendo únicamente un override de repositorio.
- Se conservaron URL de release, selección de plataforma/WSL, limpieza temporal, instalación y handoff existentes.
- Se rechazó validación parcial con `grep`/`awk` para evitar aceptar manifests malformados o duplicados.

## // 004. VERIFICACIÓN
- Strict TDD documentado en `apply-progress.md`: RED, GREEN, TRIANGULATE y REFACTOR.
- `bun test tests/install-sh-checksum.test.ts tests/install-sh-wsl.test.ts tests/release-asset-contract.test.ts`: 27 tests, 0 fallos, 241 assertions.
- `cd installer && bun run typecheck`: PASS.
- No se usaron red, build, Docker ni rutas reales de instalación.

## // 005. PENDIENTE / RIESGOS
- Ningún bloqueo identificado; el cambio está listo para cierre.
- No se ejercitaron transporte GitHub real ni instalación real, deliberadamente.
- No se ejecutó build de producción; permanece fuera de este slice.
