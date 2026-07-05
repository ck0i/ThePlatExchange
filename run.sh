#!/usr/bin/env bash
set -u

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

pause_on_exit() {
  if [ -t 0 ]; then
    printf 'Press Enter to close...'
    read -r _
  fi
}

echo "Starting WF-RivenTrader..."

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 22 or newer is required, but node was not found."
  echo "Install Node.js from https://nodejs.org/ and run this file again."
  pause_on_exit
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required, but it was not found."
  echo "Reinstall Node.js with npm included and run this file again."
  pause_on_exit
  exit 1
fi

node_major="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || printf '0')"
case "$node_major" in
  ''|*[!0-9]*) node_major=0 ;;
esac

if [ "$node_major" -lt 22 ]; then
  echo "Node.js 22 or newer is required. Detected Node.js: $(node --version)"
  echo "Install the current LTS from https://nodejs.org/ and run this file again."
  pause_on_exit
  exit 1
fi

echo "Installing or updating dependencies..."
if ! npm install; then
  echo "Dependency installation failed."
  pause_on_exit
  exit 1
fi

echo "Starting the trader dashboard..."
npm run start -- "$@"
exit_code=$?

if [ "$exit_code" -ne 0 ]; then
  echo "Trader exited with code $exit_code."
fi
pause_on_exit
exit "$exit_code"
