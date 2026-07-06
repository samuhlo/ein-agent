#!/usr/bin/env bash
# =============================================================================
# E2E: instala Ein en un Ubuntu limpio (Docker) y verifica el ciclo completo:
# install -> doctor -> reinstalacion (backup + dedup) -> dry-runs.
# Uso: ./e2e/docker-test.sh          (compila el binario linux y lo prueba)
# Requiere: docker corriendo y bun en el host. Necesita red (bun + pi se
# instalan dentro del contenedor).
# =============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"
IMAGE="ein-e2e-ubuntu"

# Binario linux acorde a la arquitectura del host (en CI: x64).
case "$(uname -m)" in
  arm64|aarch64) TARGET="linux-arm64" ;;
  *) TARGET="linux-x64" ;;
esac
BINARY="$ROOT/installer/dist/ein-installer-$TARGET"

echo "/// e2e: compilando binario ($TARGET)"
(cd "$ROOT/installer" && bun install --frozen-lockfile && bun run build:all -- "$TARGET")
test -x "$BINARY" || { echo "[error] no existe el binario: $BINARY"; exit 1; }

echo "/// e2e: construyendo imagen"
docker build -t "$IMAGE" -f "$HERE/Dockerfile.ubuntu" "$HERE"

echo "/// e2e: ejecutando ciclo install → doctor → reinstall → dry-run"
docker run --rm \
  -v "$BINARY:/usr/local/bin/ein:ro" \
  "$IMAGE" -euo pipefail -c '
    echo "== version =="
    ein --version

    echo "== install (fresh) =="
    ein install --yes --no-engram --no-secrets --no-linear

    echo "== doctor =="
    ein doctor

    echo "== reinstall sobre arbol existente (backup previo + rollback armado) =="
    ein install --yes --no-engram --no-secrets --no-linear

    echo "== backups v2: existe al menos un tar.gz con sidecar de meta =="
    ls -la "$HOME/.pi/agent/backups/installer/"
    ls "$HOME/.pi/agent/backups/installer/"*.tar.gz >/dev/null
    ls "$HOME/.pi/agent/backups/installer/"*.meta.json >/dev/null

    echo "== manifest desplegado =="
    test -f "$HOME/.pi/agent/template-manifest.json"

    echo "== dry-runs (no mutan nada) =="
    ein install --dry-run
    ein update --dry-run

    echo "== doctor final =="
    ein doctor
    echo "E2E_RESULT=OK"
  '

echo "/// e2e: OK"
