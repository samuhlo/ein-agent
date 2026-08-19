#!/usr/bin/env bash
# =============================================================================
# Ein installer bootstrap
# Detects platform, downloads the matching prebuilt binary from GitHub
# Releases and installs it to ~/.local/bin/ein-install (or /usr/local/bin if
# writable). Tells you to run `ein-install` afterwards.
#
#   curl -fsSL https://raw.githubusercontent.com/samuhlo/ein-agent/main/installer/install.sh | bash
# =============================================================================
set -euo pipefail

REPO="${EIN_INSTALLER_REPO:-samuhlo/ein-agent}"
# `ein` es la app de terminal; el instalador vive bajo su propio nombre.
BINARY_NAME="ein-install"

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
  # Detected only to tell the Windows user what's happening.
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

  local base url tmp checksum_url cleanup_command
  base="https://github.com/${REPO}/releases/latest/download"
  url="${base}/${ASSET}"
  checksum_url="${base}/checksums.txt"
  tmp="$(mktemp -d)"
  printf -v cleanup_command 'rm -rf -- %q' "$tmp"
  trap "$cleanup_command" EXIT

  step "Descargando binario"
  if ! curl -fsSL -o "${tmp}/${BINARY_NAME}" "$url"; then
    fatal "no se pudo descargar ${url} (¿existe una release con ese asset?)"
  fi

  # Mandatory checksum verification: validate the complete manifest before hashing.
  if ! curl -fsSL -o "${tmp}/checksums.txt" "$checksum_url" 2>/dev/null; then
    fatal "no se pudo descargar ${checksum_url}"
  fi

  step "Verificando checksum"
  local expected actual manifest_line asset_name manifest_pattern
  local asset_count=0
  manifest_pattern='^[0-9a-f]{64}  [^[:space:]]+$'
  [ -s "${tmp}/checksums.txt" ] || fatal "checksums.txt esta vacio"
  while IFS= read -r manifest_line || [ -n "$manifest_line" ]; do
    [ -z "$manifest_line" ] && continue
    [[ "$manifest_line" =~ $manifest_pattern ]] || fatal "checksums.txt tiene formato invalido"
    asset_name="${manifest_line#*  }"
    if [ "$asset_name" = "$ASSET" ]; then
      asset_count=$((asset_count + 1))
      expected="${manifest_line%%  *}"
    fi
  done < "${tmp}/checksums.txt"
  [ "$asset_count" -eq 1 ] || fatal "checksums.txt no contiene exactamente una entrada para ${ASSET}"

  local checksum_output checksum_tool
  if command -v sha256sum >/dev/null 2>&1; then
    checksum_tool="sha256sum"
  elif command -v shasum >/dev/null 2>&1; then
    checksum_tool="shasum"
  else
    fatal "no hay una utilidad SHA-256 disponible"
  fi

  if [ "$checksum_tool" = "sha256sum" ]; then
    if ! checksum_output="$(sha256sum "${tmp}/${BINARY_NAME}" 2>/dev/null)"; then
      fatal "sha256sum fallo"
    fi
  elif ! checksum_output="$(shasum -a 256 "${tmp}/${BINARY_NAME}" 2>/dev/null)"; then
    fatal "shasum fallo"
  fi
  case "$checksum_output" in
    *$'\n'*|*$'\r'*) fatal "salida de checksum invalida" ;;
  esac
  if [[ ! "$checksum_output" =~ ^([0-9a-f]{64})[[:space:]][[:space:]].+$ ]]; then
    fatal "salida de checksum invalida"
  fi
  actual="${BASH_REMATCH[1]}"
  [ "$expected" = "$actual" ] || fatal "checksum no coincide"
  ok "checksum verificado"

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
    ok "Listo. Ejecuta ${BOLD}${GOLD}ein-install${RESET} para empezar."
  fi
}

main "$@"
