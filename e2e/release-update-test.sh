#!/usr/bin/env bash
# =============================================================================
# Published-release smoke: install the previous alpha in a disposable Ubuntu
# home, update through the real GitHub API/assets, and prove private state and
# the installed identity survive the transition to the just-published alpha.
# =============================================================================
set -euo pipefail

SOURCE_TAG="${1:?uso: release-update-test.sh <source-tag> <target-tag>}"
TARGET_TAG="${2:?uso: release-update-test.sh <source-tag> <target-tag>}"
REPOSITORY="${EIN_INSTALLER_REPO:-samuhlo/ein-agent}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGE="ein-release-update-ubuntu"

tag_pattern='^installer-v[0-9]+\.[0-9]+\.[0-9]+-alpha\.[0-9]+$'
for tag in "$SOURCE_TAG" "$TARGET_TAG"; do
  [[ "$tag" =~ $tag_pattern ]] || { echo "[assert] tag alpha no canónico: $tag" >&2; exit 1; }
done
[[ "$SOURCE_TAG" != "$TARGET_TAG" ]] || { echo "[assert] source y target deben diferir" >&2; exit 1; }

case "$(uname -m)" in
  arm64|aarch64) PLATFORM="linux-arm64" ;;
  *) PLATFORM="linux-x64" ;;
esac

WORK="$(mktemp -d "${TMPDIR:-/tmp}/ein-release-update.XXXXXX")"
cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT

echo "/// release-update: descargando $SOURCE_TAG"
gh release download "$SOURCE_TAG" \
  --repo "$REPOSITORY" \
  --pattern "ein-installer-$PLATFORM" \
  --dir "$WORK"
SOURCE_BINARY="$WORK/ein-installer-$PLATFORM"
test -f "$SOURCE_BINARY" || { echo "[assert] falta el binario fuente" >&2; exit 1; }
chmod +x "$SOURCE_BINARY"
gh release view "$TARGET_TAG" --repo "$REPOSITORY" >/dev/null

docker build -t "$IMAGE" -f "$HERE/Dockerfile.ubuntu" "$HERE"
docker run --rm -i \
  -v "$SOURCE_BINARY:/usr/local/bin/ein-old:ro" \
  "$IMAGE" -euo pipefail -s -- "$SOURCE_TAG" "$TARGET_TAG" <<'EOF'
source_tag="${1:?falta source tag}"
target_tag="${2:?falta target tag}"
source_version="${source_tag#installer-v}"
target_version="${target_tag#installer-v}"
marker="$HOME/.pi-ein/agent/.ein-install.json"

assert_present() {
  test -e "$1" || { echo "[assert] falta: $1" >&2; exit 1; }
}

seed_preserved_state() {
  mkdir -p "$HOME/.pi-ein/agent/sessions" "$HOME/.pi-ein/agent/skills/user/private" "$HOME/.config/opencode-secrets"
  printf '%s\n' 'PRIVATE-AUTH' >"$HOME/.pi-ein/agent/auth.json"
  printf '%s\n' 'PRIVATE-SESSION' >"$HOME/.pi-ein/agent/sessions/existing.json"
  printf '%s\n' 'PRIVATE-SKILL' >"$HOME/.pi-ein/agent/skills/user/private/SKILL.md"
  printf '%s\n' 'PRIVATE-TOKEN' >"$HOME/.config/opencode-secrets/token"
}

assert_preserved_state() {
  assert_present "$HOME/.pi-ein/agent/auth.json"
  assert_present "$HOME/.pi-ein/agent/sessions/existing.json"
  assert_present "$HOME/.pi-ein/agent/skills/user/private/SKILL.md"
  assert_present "$HOME/.config/opencode-secrets/token"
  grep -Fqx 'PRIVATE-AUTH' "$HOME/.pi-ein/agent/auth.json"
  grep -Fqx 'PRIVATE-SESSION' "$HOME/.pi-ein/agent/sessions/existing.json"
  grep -Fqx 'PRIVATE-SKILL' "$HOME/.pi-ein/agent/skills/user/private/SKILL.md"
  grep -Fqx 'PRIVATE-TOKEN' "$HOME/.config/opencode-secrets/token"
}

/usr/local/bin/ein-old install --yes --runtime pi \
  --no-engram --no-secrets --no-linear --no-hypa --no-codegraph \
  --release-channel alpha --release-tag "$source_tag"

export PATH="$HOME/.local/bin:$HOME/.bun/bin:$PATH"
assert_present "$HOME/.local/bin/ein-install"
ein-install --version | grep -Fq "ein-installer $source_version"
seed_preserved_state
assert_preserved_state

echo "/// release-update: $source_tag -> $target_tag"
ein-install update --yes "$target_tag"
ein-install --version | grep -Fq "ein-installer $target_version"
grep -Fq "\"version\": \"$target_version\"" "$marker"
grep -Fq '"channel": "alpha"' "$marker"
assert_preserved_state
ein-install doctor

echo "E2E_RELEASE_UPDATE_RESULT=OK:$source_tag->$target_tag"
EOF
