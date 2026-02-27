#!/usr/bin/env bash
set -euo pipefail

if command -v applesimutils >/dev/null 2>&1; then
  exit 0
fi

echo "Missing required tool: applesimutils"
echo ""
echo "Install on macOS with Homebrew:"
echo "  brew tap wix/brew"
echo "  brew install applesimutils"
echo ""
echo "If already installed but not found, ensure Homebrew bin is on PATH:"
echo "  export PATH=\"/opt/homebrew/bin:$PATH\""
echo "Then open a new terminal and retry."
exit 1
