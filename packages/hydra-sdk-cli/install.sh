#!/bin/sh
# Hydra CLI installer
# Usage: curl --proto '=https' --tlsv1.2 -LsSf https://raw.githubusercontent.com/no-witness-labs/hydra-sdk/main/packages/hydra-sdk-cli/install.sh | sh
set -eu

REPO="no-witness-labs/hydra-sdk"
BIN_NAME="hydra"
INSTALL_DIR="${HYDRA_INSTALL_DIR:-$HOME/.hydra/bin}"

main() {
  need_cmd uname
  need_cmd chmod
  need_cmd mkdir

  local _arch
  _arch="$(get_architecture)" || return 1

  local _version
  _version="$(get_latest_version)" || return 1

  local _artifact
  _artifact="$(get_artifact_name "$_arch")" || return 1

  local _url="https://github.com/${REPO}/releases/download/%40no-witness-labs%2Fhydra-sdk-cli%40${_version}/${_artifact}"

  say "Installing hydra ${_version} (${_arch})"

  ensure mkdir -p "$INSTALL_DIR"

  local _dest="${INSTALL_DIR}/${BIN_NAME}"
  if [ "$_arch" = "windows-x64" ]; then
    _dest="${_dest}.exe"
  fi

  say "Downloading ${_url}"
  download "$_url" "$_dest"
  ensure chmod +x "$_dest"

  say "Installed hydra to ${_dest}"

  add_to_path
  say ""
  say "Run 'hydra --help' to get started"
}

get_architecture() {
  local _os _arch

  _os="$(uname -s)"
  _arch="$(uname -m)"

  case "$_os" in
    Darwin)  _os="darwin" ;;
    Linux)   _os="linux" ;;
    MINGW* | MSYS* | CYGWIN* | Windows_NT) _os="windows" ;;
    *)
      err "unsupported OS: $_os"
      return 1
      ;;
  esac

  case "$_arch" in
    x86_64 | amd64)  _arch="x64" ;;
    aarch64 | arm64)  _arch="arm64" ;;
    *)
      err "unsupported architecture: $_arch"
      return 1
      ;;
  esac

  # Detect Rosetta on macOS — prefer native arm64 binary
  if [ "$_os" = "darwin" ] && [ "$_arch" = "x64" ]; then
    if sysctl -n hw.optional.arm64 2>/dev/null | grep -q "1"; then
      _arch="arm64"
      say "Detected Rosetta, using native arm64 binary"
    fi
  fi

  echo "${_os}-${_arch}"
}

get_artifact_name() {
  local _arch="$1"
  case "$_arch" in
    darwin-arm64)  echo "hydra-darwin-arm64" ;;
    darwin-x64)    echo "hydra-darwin-x64" ;;
    linux-arm64)   echo "hydra-linux-arm64" ;;
    linux-x64)     echo "hydra-linux-x64" ;;
    windows-x64)   echo "hydra-windows-x64.exe" ;;
    *)
      err "no prebuilt binary for: $_arch"
      return 1
      ;;
  esac
}

get_latest_version() {
  local _url="https://api.github.com/repos/${REPO}/releases"
  local _response

  if check_cmd curl; then
    _response="$(curl -sL "$_url")" || {
      err "failed to fetch releases"
      return 1
    }
  elif check_cmd wget; then
    _response="$(wget -qO- "$_url")" || {
      err "failed to fetch releases"
      return 1
    }
  else
    err "need curl or wget"
    return 1
  fi

  # Find the latest hydra-sdk-cli release tag
  echo "$_response" | grep -o '"tag_name": *"@no-witness-labs/hydra-sdk-cli@[^"]*"' | head -1 | grep -o '[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*'
}

download() {
  local _url="$1"
  local _dest="$2"

  if check_cmd curl; then
    curl -fsSL "$_url" -o "$_dest" || {
      err "failed to download $_url"
      return 1
    }
  elif check_cmd wget; then
    wget -qO "$_dest" "$_url" || {
      err "failed to download $_url"
      return 1
    }
  else
    err "need curl or wget"
    return 1
  fi
}

add_to_path() {
  if echo ":$PATH:" | grep -q ":${INSTALL_DIR}:"; then
    return
  fi

  local _env_script="${INSTALL_DIR}/env"
  cat > "$_env_script" << 'ENVEOF'
#!/bin/sh
case ":${PATH}:" in
  *:"$HOME/.hydra/bin":*) ;;
  *) export PATH="$HOME/.hydra/bin:$PATH" ;;
esac
ENVEOF

  local _sourced=false
  for _rc in "$HOME/.zshrc" "$HOME/.bashrc" "$HOME/.bash_profile" "$HOME/.profile"; do
    if [ -f "$_rc" ]; then
      if ! grep -q '\.hydra/bin/env' "$_rc" 2>/dev/null; then
        echo "" >> "$_rc"
        echo '. "$HOME/.hydra/bin/env"' >> "$_rc"
        say "Added hydra to PATH in ${_rc}"
      fi
      _sourced=true
      break
    fi
  done

  if [ "$_sourced" = false ]; then
    say "Add ${INSTALL_DIR} to your PATH manually"
  fi
}

say() {
  echo "hydra-installer: $1"
}

err() {
  say "ERROR: $1" >&2
}

need_cmd() {
  if ! check_cmd "$1"; then
    err "need '$1' (not found)"
    exit 1
  fi
}

check_cmd() {
  command -v "$1" > /dev/null 2>&1
}

ensure() {
  if ! "$@"; then
    err "command failed: $*"
    exit 1
  fi
}

main "$@"
