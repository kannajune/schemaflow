#!/usr/bin/env sh
# SchemaFlow installer — downloads the right standalone binary for your OS/arch.
# Usage:  curl -fsSL https://raw.githubusercontent.com/kannajune/schemaflow/main/scripts/install.sh | sh
set -e

REPO="kannajune/schemaflow"
os="$(uname -s)"
arch="$(uname -m)"

case "$os" in
  Darwin)
    case "$arch" in
      arm64) asset="schemaflow-macos-arm64" ;;
      *)     asset="schemaflow-macos-x64" ;;
    esac ;;
  Linux)
    case "$arch" in
      aarch64|arm64) asset="schemaflow-linux-arm64" ;;
      *)             asset="schemaflow-linux-x64" ;;
    esac ;;
  *)
    echo "Unsupported OS: $os"
    echo "On Windows download schemaflow-windows-x64.exe from the Releases page,"
    echo "or if you have Node: npx schemaflow-cli ./your-project"
    exit 1 ;;
esac

url="https://github.com/$REPO/releases/latest/download/$asset"
bindir="${BIN_DIR:-/usr/local/bin}"
dest="$bindir/schemaflow"

echo "Downloading $asset ..."
if [ ! -w "$bindir" ]; then
  echo "Note: $bindir needs sudo; you may be prompted."
  curl -fsSL "$url" -o "/tmp/schemaflow" && sudo install -m 0755 "/tmp/schemaflow" "$dest"
else
  curl -fsSL "$url" -o "$dest" && chmod +x "$dest"
fi

echo "Installed: $dest"
echo "Run:  schemaflow ./your-project"
