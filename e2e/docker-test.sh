#!/usr/bin/env bash
# =============================================================================
# E2E: instala Ein en Ubuntu limpio y verifica runtime, idempotencia, rollback
# determinista, launcher, preservación y uninstall recuperable.
# Uso: ./e2e/docker-test.sh          (compila el binario linux y lo prueba)
# Requiere: docker corriendo y bun en el host. La imagen aporta Node 22 como
# prerrequisito documentado; bun + pi se instalan dentro del contenedor.
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

echo "/// e2e: matriz determinista de update, rollback, uninstall y launcher"
(cd "$ROOT" && bun test \
  tests/release-update-integration.test.ts \
  tests/installer-uninstall.test.ts \
  tests/beta-launcher-e2e-hardening.test.ts)

echo "/// e2e: construyendo imagen"
docker build -t "$IMAGE" -f "$HERE/Dockerfile.ubuntu" "$HERE"

echo "/// e2e: ejecutando cinco contenedores desechables"

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
  # intentionally mutable between passes. Bun-compiled executables are not
  # reproducible byte-for-byte; their presence and executable behavior are
  # asserted below instead of pretending their hashes are stable.
  find "$root" -type f \
    ! -path "$root/backups/*" \
    ! -path "$root/bin/ein-cc-sdd" \
    ! -path "$root/bin/ein-surface-runner" \
    ! -path "$root/bin/ein-continuity" \
    ! -name ".ein-install.json" \
    ! -name "settings.json" \
    -print0 | sort -z | xargs -0 -r sha256sum >"$destination"
}

assert_same_state() {
  local first="$1"
  local second="$2"
  if ! cmp -s "$first" "$second"; then
    echo "[assert] el estado estable cambió entre instalaciones" >&2
    diff -u "$first" "$second" >&2 || true
    exit 1
  fi
}

seed_preserved_state() {
  local target="$1"
  mkdir -p "$HOME/.config/opencode-secrets"
  printf '%s\n' 'PRIVATE-TOKEN' >"$HOME/.config/opencode-secrets/token"
  if [[ "$target" == "pi" || "$target" == "both" ]]; then
    mkdir -p "$HOME/.pi-ein/agent/sessions" "$HOME/.pi-ein/agent/skills/user/private"
    printf '%s\n' 'PRIVATE-AUTH' >"$HOME/.pi-ein/agent/auth.json"
    printf '%s\n' 'PRIVATE-SESSION' >"$HOME/.pi-ein/agent/sessions/existing.json"
    printf '%s\n' 'PRIVATE-SKILL' >"$HOME/.pi-ein/agent/skills/user/private/SKILL.md"
  fi
  if [[ "$target" == "claude" || "$target" == "both" ]]; then
    mkdir -p "$HOME/.claude-ein/sessions" "$HOME/.claude-ein/agents" "$HOME/.claude-ein/commands/ein"
    printf '%s\n' 'PRIVATE-HISTORY' >"$HOME/.claude-ein/history.jsonl"
    printf '%s\n' 'PRIVATE-SESSION' >"$HOME/.claude-ein/sessions/existing.json"
    printf '%s\n' 'PRIVATE-AGENT' >"$HOME/.claude-ein/agents/mine.md"
    printf '%s\n' 'PRIVATE-COMMAND' >"$HOME/.claude-ein/commands/ein/mine.md"
  fi
}

assert_preserved_state() {
  local target="$1"
  assert_present "$HOME/.config/opencode-secrets/token"
  grep -Fqx 'PRIVATE-TOKEN' "$HOME/.config/opencode-secrets/token"
  if [[ "$target" == "pi" || "$target" == "both" ]]; then
    assert_present "$HOME/.pi-ein/agent/auth.json"
    assert_present "$HOME/.pi-ein/agent/sessions/existing.json"
    assert_present "$HOME/.pi-ein/agent/skills/user/private/SKILL.md"
    grep -Fqx 'PRIVATE-AUTH' "$HOME/.pi-ein/agent/auth.json"
    grep -Fqx 'PRIVATE-SESSION' "$HOME/.pi-ein/agent/sessions/existing.json"
    grep -Fqx 'PRIVATE-SKILL' "$HOME/.pi-ein/agent/skills/user/private/SKILL.md"
  fi
  if [[ "$target" == "claude" || "$target" == "both" ]]; then
    assert_present "$HOME/.claude-ein/history.jsonl"
    assert_present "$HOME/.claude-ein/sessions/existing.json"
    assert_present "$HOME/.claude-ein/agents/mine.md"
    assert_present "$HOME/.claude-ein/commands/ein/mine.md"
    grep -Fqx 'PRIVATE-HISTORY' "$HOME/.claude-ein/history.jsonl"
    grep -Fqx 'PRIVATE-SESSION' "$HOME/.claude-ein/sessions/existing.json"
    grep -Fqx 'PRIVATE-AGENT' "$HOME/.claude-ein/agents/mine.md"
    grep -Fqx 'PRIVATE-COMMAND' "$HOME/.claude-ein/commands/ein/mine.md"
  fi
}

seed_claude_cli() {
  mkdir -p "$HOME/.local/bin"
  printf '%s\n' '#!/bin/sh' 'echo "2.1.0 (Claude Code)"' >"$HOME/.local/bin/claude"
  chmod +x "$HOME/.local/bin/claude"
  export PATH="$HOME/.local/bin:$PATH"
}

pi_agent="$HOME/.pi-ein/agent"
pi_marker="$pi_agent/.ein-install.json"
pi_manifest="$pi_agent/template-manifest.json"
fish_functions="$HOME/.config/fish/functions"
pi_launcher="$fish_functions/ein-pi.fish"
claude_home="$HOME/.claude-ein"
claude_launcher="$fish_functions/ein-cc.fish"

assert_pi_surface() {
  assert_present "$pi_marker"
  assert_present "$pi_manifest"
  assert_present "$pi_launcher"
  assert_present "$HOME/.local/bin/ein"
  test -x "$HOME/.local/bin/ein"
  PATH="$HOME/.local/bin:$PATH" "$HOME/.local/bin/ein" doctor >/tmp/ein-installed-app-doctor.log
  assert_exactly_one "$fish_functions" "ein-pi.fish"
  grep -Fq '"version":' "$pi_marker"
  grep -Fq 'function ein-pi' "$pi_launcher"
}

assert_claude_surface() {
  command -v claude >/dev/null
  claude --version | grep -Fq 'Claude Code'
  assert_present "$claude_home/CLAUDE.md"
  assert_present "$claude_home/settings.json"
  for executable in ein-cc-sdd ein-surface-runner ein-continuity; do
    assert_present "$claude_home/bin/$executable"
    test -x "$claude_home/bin/$executable"
  done
  assert_present "$claude_launcher"
  assert_exactly_one "$fish_functions" "ein-cc.fish"
  grep -Fq 'function ein-cc' "$claude_launcher"
}

install_twice() {
  local args=("$@")
  local pass
  for pass in 1 2; do
    local log="/tmp/ein-${scenario}-${pass}.log"
    echo "== install ${scenario} pass ${pass} =="
    if ! ein install --yes --no-engram --no-secrets --no-linear --no-hypa --no-codegraph "${args[@]}" >"$log" 2>&1; then
      cat "$log"
      if grep -Eiq 'network|timed out|temporary failure|could not resolve|curl:|fetch failed|ECONN' "$log"; then
        echo "E2E_RESULT=BLOCKED: dependencia externa/red en ${scenario} pass ${pass}" >&2
        exit 2
      fi
      echo "E2E_RESULT=FAIL: regresion del instalador en ${scenario} pass ${pass}" >&2
      exit 1
    fi
    cat "$log"
    if [[ "$pass" -eq 1 ]]; then
      case "$scenario" in
        default-pi) seed_preserved_state pi ;;
        both|uninstall-preservation) seed_preserved_state both ;;
      esac
    fi
    case "$scenario" in
      default-pi) snapshot_state "$pi_agent" "/tmp/ein-default-pi-state-$pass" ;;
      both|uninstall-preservation)
        snapshot_state "$pi_agent" "/tmp/ein-both-pi-state-$pass"
        snapshot_state "$claude_home" "/tmp/ein-both-claude-state-$pass"
        ;;
    esac
  done
}

case "$scenario" in
  invalid)
    echo "== invalid and Claude-only installs: no side effects =="
    for invalid_runtime in nope claude; do
      invalid_log="/tmp/ein-invalid-$invalid_runtime.log"
      if ein install --yes --runtime "$invalid_runtime" --no-engram --no-secrets --no-linear >"$invalid_log" 2>&1; then
        echo "[assert] runtime inválido fue aceptado: $invalid_runtime" >&2
        exit 1
      fi
      cat "$invalid_log"
      grep -Fq "Error de opción runtime" "$invalid_log"
      grep -Fq -- "--runtime pi|both" "$invalid_log"
    done
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
    assert_preserved_state pi
    assert_absent "$claude_home"
    assert_absent "$claude_launcher"
    assert_same_state /tmp/ein-default-pi-state-1 /tmp/ein-default-pi-state-2

    echo "== doctor =="
    ein doctor
    echo "== backups: snapshot transaccional valido tras rerun =="
    backup_dir="$pi_agent/backups/installer"
    ls -la "$backup_dir"
    snapshot_count="$(find "$backup_dir" -mindepth 1 -maxdepth 1 -type d -name '*.snapshot' | wc -l)"
    test "$snapshot_count" -eq 1 || {
      echo "[assert] debe existir exactamente un backup .snapshot (actual: $snapshot_count)" >&2
      exit 1
    }
    snapshot_dir="$(find "$backup_dir" -mindepth 1 -maxdepth 1 -type d -name '*.snapshot' -print -quit)"
    assert_present "$snapshot_dir/manifest.json"
    assert_present "$snapshot_dir/metadata.json"
    assert_present "$snapshot_dir/content"
    grep -Fq '"schemaVersion":1' "$snapshot_dir/manifest.json"
    grep -Fq '"schemaVersion":1' "$snapshot_dir/metadata.json"
    echo "== manifest desplegado =="
    test -f "$pi_manifest"
    echo "== dry-runs (no mutan nada) =="
    PATH="$HOME/.local/bin:$PATH" ein-install install --dry-run
    PATH="$HOME/.local/bin:$PATH" ein-install update --dry-run
    echo "== doctor final =="
    ein doctor
    ;;

  omarchy-bun-global-bin)
    echo "== bun redirigido como en Omarchy =="
    curl -fsSL https://bun.sh/install | bash
    export PATH="$HOME/.bun/bin:$HOME/.local/bin:$PATH"
    mkdir -p "$HOME/.local/bin"
    printf '%s\n' '#!/bin/bash' 'mise use -g --quiet "claude" || exit 1' \
      'exec mise x "claude" -- "claude" "$@"' >"$HOME/.local/bin/claude"
    chmod +x "$HOME/.local/bin/claude"
    bun install -g @earendil-works/pi-coding-agent@0.84.4
    test "$("$HOME/.bun/bin/pi" --version)" = "0.84.4"
    export BUN_INSTALL_GLOBAL_DIR="$HOME/.omarchy/bun/global"
    export BUN_INSTALL_BIN="$HOME/.omarchy/bun/bin"

    echo "== reproducir instalación incompleta de alpha.1 =="
    case "$(uname -m)" in
      arm64|aarch64) prior_asset="ein-installer-linux-arm64" ;;
      *) prior_asset="ein-installer-linux-x64" ;;
    esac
    curl -fsSL -o /tmp/ein-alpha1 \
      "https://github.com/samuhlo/ein-agent/releases/download/installer-v0.93.0-alpha.1/$prior_asset"
    chmod +x /tmp/ein-alpha1
    if /tmp/ein-alpha1 install --yes --no-engram --no-secrets --no-linear \
      --no-hypa --no-codegraph --release-channel alpha \
      --release-tag installer-v0.93.0-alpha.1 >/tmp/ein-alpha1-failure.log 2>&1; then
      echo "[assert] alpha.1 debía reproducir el fallo de Pi" >&2
      exit 1
    fi
    cat /tmp/ein-alpha1-failure.log
    grep -Fq "Pi 0.84.4 detectado; Ein requiere 0.84.3" /tmp/ein-alpha1-failure.log
    assert_present "$HOME/.ein-installer/install-execution-v1.json"

    candidate_version="$(ein --version | sed -n 's/^ein-installer //p')"
    echo "== recuperar primero el diario Pi de alpha.1 =="
    ein install --yes --runtime pi --no-engram --no-secrets --no-linear \
      --no-hypa --no-codegraph --release-channel alpha \
      --release-tag "installer-v$candidate_version"
    echo "== completar Pi + Claude desde el estado ya recuperado =="
    install_twice --runtime both --release-channel alpha --release-tag "installer-v$candidate_version"
    test "$("$HOME/.bun/bin/pi" --version)" = "0.84.3"
    test "$("$HOME/.omarchy/bun/bin/pi" --version)" = "0.84.3"
    assert_pi_surface
    assert_claude_surface
    fish -c "source '$claude_launcher'; ein-cc --version" | grep -Fq 'Claude Code'
    ein doctor
    ;;

  both)
    seed_claude_cli
    install_twice --runtime both
    for pass in 1 2; do
      log="/tmp/ein-both-${pass}.log"
      pi_line="$(awk 'tolower($0) ~ /pi: ein listo/{print NR; exit}' "$log")"
      claude_line="$(awk 'tolower($0) ~ /claude code: ein listo/{print NR; exit}' "$log")"
      test -n "$pi_line" || { echo "[assert] falta completion de Pi en pass $pass" >&2; exit 1; }
      test -n "$claude_line" || { echo "[assert] falta completion de Claude en pass $pass" >&2; exit 1; }
      test "$pi_line" -lt "$claude_line" || {
        echo "[assert] Pi debe completar antes que Claude (pass $pass)" >&2
        exit 1
      }
    done
    assert_pi_surface
    assert_claude_surface
    assert_preserved_state both
    assert_same_state /tmp/ein-both-pi-state-1 /tmp/ein-both-pi-state-2
    assert_same_state /tmp/ein-both-claude-state-1 /tmp/ein-both-claude-state-2
    ;;

  uninstall-preservation)
    seed_claude_cli
    install_twice --runtime both
    assert_pi_surface
    assert_claude_surface
    assert_preserved_state both
    assert_same_state /tmp/ein-both-pi-state-1 /tmp/ein-both-pi-state-2
    assert_same_state /tmp/ein-both-claude-state-1 /tmp/ein-both-claude-state-2

    echo "== uninstall recuperable con estado privado =="
    PATH="$HOME/.local/bin:$PATH" ein-install uninstall --yes --runtime both
    assert_absent "$pi_marker"
    assert_absent "$pi_manifest"
    assert_absent "$pi_launcher"
    assert_absent "$claude_home/CLAUDE.md"
    assert_absent "$claude_launcher"
    assert_absent "$HOME/.local/bin/ein"
    assert_absent "$HOME/.local/bin/ein-install"
    assert_preserved_state both
    recovery_root="$HOME/.ein-installer/uninstall-recovery"
    recovery_dir="$(find "$recovery_root" -mindepth 1 -maxdepth 1 -type d -print -quit)"
    test -n "$recovery_dir" || { echo "[assert] falta recuperación de uninstall" >&2; exit 1; }
    assert_present "$recovery_dir/manifest.json"
    ;;

  *)
    echo "[assert] escenario desconocido: $scenario" >&2
    exit 1
    ;;
esac

echo "E2E_SCENARIO_RESULT=OK:$scenario"
EOF
}

for scenario in invalid default-pi omarchy-bun-global-bin both uninstall-preservation; do
  run_scenario "$scenario"
done

echo "/// e2e: OK"
