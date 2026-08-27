#!/usr/bin/env bash
# =============================================================================
# E2E: instala Ein en un Ubuntu limpio (Docker) y verifica los cuatro runtimes:
# invalid, Pi por defecto, Claude-only y Both (Pi -> Claude).
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

if ! command -v docker >/dev/null 2>&1; then
  echo "E2E_RESULT=BLOCKED: docker no esta instalado" >&2
  exit 2
fi
if ! docker info >/dev/null 2>&1; then
  echo "E2E_RESULT=BLOCKED: el daemon de Docker no esta disponible" >&2
  exit 2
fi

echo "/// e2e: compilando binario ($TARGET)"
(cd "$ROOT" && bun install --frozen-lockfile)
(cd "$ROOT/installer" && bun install --frozen-lockfile && bun run build:all -- "$TARGET")
test -x "$BINARY" || { echo "[error] no existe el binario: $BINARY"; exit 1; }

echo "/// e2e: construyendo imagen"
docker build -t "$IMAGE" -f "$HERE/Dockerfile.ubuntu" "$HERE"

echo "/// e2e: ejecutando cuatro contenedores desechables"

run_scenario() {
  local scenario="$1"
  echo "/// e2e: escenario $scenario"
  docker run --rm -i \
    -v "$BINARY:/usr/local/bin/ein:ro" \
    "$IMAGE" -euo pipefail -s -- "$scenario" <<'EOF'
scenario="${1:?falta escenario}"

assert_present() {
  test -e "$1" || { echo "[assert] falta: $1" >&2; exit 1; }
}

assert_absent() {
  test ! -e "$1" || { echo "[assert] no debe existir: $1" >&2; exit 1; }
}

assert_exactly_one() {
  local directory="$1"
  local name="$2"
  local count
  count="$(find "$directory" -maxdepth 1 -type f -name "$name" | wc -l)"
  test "$count" -eq 1 || {
    echo "[assert] $directory/$name debe existir exactamente una vez (actual: $count)" >&2
    exit 1
  }
}

snapshot_state() {
  local root="$1"
  local destination="$2"
  # installedAt, installer backups, and Pi's package-manager JSON formatting are
  # intentionally mutable between passes; every other managed file must converge
  # byte-for-byte. The package list itself is still exercised by install output.
  find "$root" -type f \
    ! -path "$root/backups/*" \
    ! -name ".ein-install.json" \
    ! -name "settings.json" \
    -print0 | sort -z | xargs -0 -r sha256sum >"$destination"
}

pi_agent="$HOME/.pi-ein/agent"
pi_marker="$pi_agent/.ein-install.json"
pi_manifest="$pi_agent/template-manifest.json"
fish_functions="$HOME/.config/fish/functions"
pi_launcher="$fish_functions/pi-ein.fish"
claude_home="$HOME/.claude-ein"
claude_launcher="$fish_functions/cc-ein.fish"

assert_pi_surface() {
  assert_present "$pi_marker"
  assert_present "$pi_manifest"
  assert_present "$pi_launcher"
  assert_exactly_one "$fish_functions" "pi-ein.fish"
  grep -Fq '"version":' "$pi_marker"
  grep -Fq 'function pi-ein' "$pi_launcher"
}

assert_claude_surface() {
  assert_present "$claude_home/CLAUDE.md"
  assert_present "$claude_home/settings.json"
  assert_present "$claude_home/bin/cc-ein-sdd"
  test -x "$claude_home/bin/cc-ein-sdd"
  assert_present "$claude_launcher"
  assert_exactly_one "$fish_functions" "cc-ein.fish"
  grep -Fq 'function cc-ein' "$claude_launcher"
}

install_twice() {
  local args=("$@")
  local pass
  for pass in 1 2; do
    local log="/tmp/ein-${scenario}-${pass}.log"
    echo "== install ${scenario} pass ${pass} =="
    if ! ein install --yes --no-engram --no-secrets --no-linear "${args[@]}" >"$log" 2>&1; then
      cat "$log"
      if grep -Eiq 'network|timed out|temporary failure|could not resolve|curl:|fetch failed|ECONN' "$log"; then
        echo "E2E_RESULT=BLOCKED: dependencia externa/red en ${scenario} pass ${pass}" >&2
        exit 2
      fi
      echo "E2E_RESULT=FAIL: regresion del instalador en ${scenario} pass ${pass}" >&2
      exit 1
    fi
    cat "$log"
    case "$scenario" in
      default-pi) snapshot_state "$pi_agent" "/tmp/ein-default-pi-state-$pass" ;;
      claude-only) snapshot_state "$claude_home" "/tmp/ein-claude-only-state-$pass" ;;
      both)
        snapshot_state "$pi_agent" "/tmp/ein-both-pi-state-$pass"
        snapshot_state "$claude_home" "/tmp/ein-both-claude-state-$pass"
        ;;
    esac
  done
}

case "$scenario" in
  invalid)
    echo "== invalid runtime: no side effects =="
    invalid_log=/tmp/ein-invalid.log
    if ein install --yes --runtime nope --no-engram --no-secrets --no-linear >"$invalid_log" 2>&1; then
      echo "[assert] runtime invalido fue aceptado" >&2
      exit 1
    fi
    cat "$invalid_log"
    grep -Fq "Error de opcion runtime" "$invalid_log"
    grep -Fq -- "--runtime pi|claude|both" "$invalid_log"
    assert_absent "$HOME/.bun"
    assert_absent "$pi_agent"
    assert_absent "$claude_home"
    assert_absent "$pi_launcher"
    assert_absent "$claude_launcher"
    ;;

  default-pi)
    echo "== version =="
    ein --version
    install_twice
    assert_pi_surface
    assert_absent "$claude_home"
    assert_absent "$claude_launcher"
    cmp /tmp/ein-default-pi-state-1 /tmp/ein-default-pi-state-2

    echo "== doctor =="
    ein doctor
    echo "== backups: sidecar metadata exists after rerun =="
    ls -la "$pi_agent/backups/installer/"
    ls "$pi_agent/backups/installer/"*.tar.gz >/dev/null
    ls "$pi_agent/backups/installer/"*.meta.json >/dev/null
    echo "== manifest desplegado =="
    test -f "$pi_manifest"
    echo "== dry-runs (no mutan nada) =="
    ein install --dry-run
    ein update --dry-run
    echo "== doctor final =="
    ein doctor
    ;;

  claude-only)
    install_twice --runtime claude
    assert_claude_surface
    assert_absent "$pi_agent"
    assert_absent "$pi_launcher"
    cmp /tmp/ein-claude-only-state-1 /tmp/ein-claude-only-state-2
    ;;

  both)
    install_twice --runtime both
    for pass in 1 2; do
      log="/tmp/ein-both-${pass}.log"
      pi_line="$(awk '/Pi:/{print NR; exit}' "$log")"
      claude_line="$(awk '/Claude Code:/{print NR; exit}' "$log")"
      test -n "$pi_line" || { echo "[assert] falta completion de Pi en pass $pass" >&2; exit 1; }
      test -n "$claude_line" || { echo "[assert] falta completion de Claude en pass $pass" >&2; exit 1; }
      test "$pi_line" -lt "$claude_line" || {
        echo "[assert] Pi debe completar antes que Claude (pass $pass)" >&2
        exit 1
      }
    done
    assert_pi_surface
    assert_claude_surface
    cmp /tmp/ein-both-pi-state-1 /tmp/ein-both-pi-state-2
    cmp /tmp/ein-both-claude-state-1 /tmp/ein-both-claude-state-2
    ;;

  *)
    echo "[assert] escenario desconocido: $scenario" >&2
    exit 1
    ;;
esac

echo "E2E_SCENARIO_RESULT=OK:$scenario"
EOF
}

for scenario in invalid default-pi claude-only both; do
  run_scenario "$scenario"
done

echo "/// e2e: OK"
