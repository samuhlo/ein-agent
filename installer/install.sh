#!/usr/bin/env bash
# =============================================================================
# Ein installer bootstrap
# Detects platform, downloads the matching prebuilt binary from GitHub Releases,
# installs it to ~/.local/bin/ein (or /usr/local/bin if writable), then tells
# you to run `ein`.
#
#   curl -fsSL https://raw.githubusercontent.com/samuhlo/ein-agent/main/installer/install.sh | bash
# =============================================================================
set -euo pipefail

REPO="${EIN_INSTALLER_REPO:-samuhlo/ein-agent}"
BINARY_NAME="ein"

# --- pretty output (gold #FFCA40 when the terminal supports truecolor) -------
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  GOLD=$'\033[38;2;255;202;64m'; BOLD=$'\033[1m'; RESET=$'\033[0m'
else
  GOLD=""; BOLD=""; RESET=""
fi
info()  { printf '%s\n' "  $*"; }
step()  { printf '%s\n' "${GOLD}▸${RESET} $*"; }
ok()    { printf '%s\n' "${GOLD}✓${RESET} $*"; }
fatal() { printf '%s\n' "✗ $*" >&2; exit 1; }

banner() {
  printf '%s' "${GOLD}${BOLD}"
  cat <<'EOF'
  ████████  ██████  ██    ██
  ██          ██    ███   ██
  ██████      ██    ████  ██
  ██          ██    ██ ██ ██
  ██          ██    ██  ████
  ████████  ██████  ██   ███
EOF
  printf '%s\n' "${RESET}"
}

# --- platform detection ------------------------------------------------------
detect_platform() {
  local uname_os uname_arch
  uname_os="$(uname -s)"
  uname_arch="$(uname -m)"
  case "$uname_os" in
    Darwin) OS="darwin" ;;
    Linux)  OS="linux" ;;
    *) fatal "SO no soportado: $uname_os (solo macOS y Linux)" ;;
  esac
  case "$uname_arch" in
    arm64|aarch64) ARCH="arm64" ;;
    x86_64|amd64)  ARCH="x64" ;;
    *) fatal "Arquitectura no soportada: $uname_arch" ;;
  esac
  ASSET="ein-installer-${OS}-${ARCH}"
  # WSL is Linux under the hood: the linux build + /dev/tty path work as-is.
  # Detect it only to tell the Windows user what's happening.
  if grep -qiE 'microsoft|wsl' /proc/version 2>/dev/null || [ -n "${WSL_DISTRO_NAME:-}" ]; then
    IS_WSL=1
  else
    IS_WSL=0
  fi
}

# --- prerequisites -----------------------------------------------------------
need() { command -v "$1" >/dev/null 2>&1 || fatal "falta '$1' en PATH"; }

# --- install dir -------------------------------------------------------------
pick_install_dir() {
  if [ -d "/usr/local/bin" ] && [ -w "/usr/local/bin" ]; then
    INSTALL_DIR="/usr/local/bin"
  else
    INSTALL_DIR="${HOME}/.local/bin"
    mkdir -p "$INSTALL_DIR"
  fi
}

ensure_on_path() {
  case ":${PATH}:" in
    *":${INSTALL_DIR}:"*) ;;
    *) info "Anade ${INSTALL_DIR} a tu PATH (reinicia el shell o ejecuta: export PATH=\"${INSTALL_DIR}:\$PATH\")" ;;
  esac
}

main() {
  banner
  step "Instalador Ein"
  detect_platform
  info "plataforma: ${OS}/${ARCH}  ·  asset: ${ASSET}"
  [ "${IS_WSL:-0}" = "1" ] && info "WSL detectado — instalando la build de Linux (${ARCH}). Trabaja dentro del FS de WSL (~), no en /mnt/c."
  need curl

  local base url tmp checksum_url
  base="https://github.com/${REPO}/releases/latest/download"
  url="${base}/${ASSET}"
  checksum_url="${base}/checksums.txt"
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT

  step "Descargando binario"
  if ! curl -fsSL -o "${tmp}/${BINARY_NAME}" "$url"; then
    fatal "no se pudo descargar ${url} (¿existe una release con ese asset?)"
  fi

  # Optional checksum verification if checksums.txt is published.
  if curl -fsSL -o "${tmp}/checksums.txt" "$checksum_url" 2>/dev/null; then
    step "Verificando checksum"
    local expected actual
    expected="$(grep " ${ASSET}\$" "${tmp}/checksums.txt" | awk '{print $1}' || true)"
    if [ -n "$expected" ]; then
      if command -v sha256sum >/dev/null 2>&1; then
        actual="$(sha256sum "${tmp}/${BINARY_NAME}" | awk '{print $1}')"
      else
        actual="$(shasum -a 256 "${tmp}/${BINARY_NAME}" | awk '{print $1}')"
      fi
      [ "$expected" = "$actual" ] || fatal "checksum no coincide"
      ok "checksum verificado"
    fi
  fi

  pick_install_dir
  chmod 755 "${tmp}/${BINARY_NAME}"
  mv "${tmp}/${BINARY_NAME}" "${INSTALL_DIR}/${BINARY_NAME}"
  ok "instalado en ${INSTALL_DIR}/${BINARY_NAME}"
  ensure_on_path

  printf '\n'

  # When piped via `curl | bash`, stdin is the pipe (not the terminal).
  # On Linux we reopen /dev/tty so the TUI can read keyboard input. On macOS
  # that freezes the TUI: kqueue (Bun's event loop on Darwin) cannot poll
  # /dev/tty, so keypresses never arrive. There we just tell the user to run
  # the binary, which gets a real terminal stdin and works.
  if [ -t 0 ]; then
    exec "${INSTALL_DIR}/${BINARY_NAME}"
  elif [ "$OS" = "linux" ] && [ -e /dev/tty ]; then
    exec "${INSTALL_DIR}/${BINARY_NAME}" </dev/tty
  else
    ok "Listo. Ejecuta ${BOLD}${GOLD}ein${RESET} para empezar."
  fi
}

main "$@"
