#!/usr/bin/env bash
# The Oyster Studios CRM — one-step local setup for macOS.
# Installs Node 22 (via Homebrew) if needed, installs dependencies, starts the web app.
# Usage:  bash ~/Pinnacle-CRM/scripts/setup-and-run.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
URL="http://localhost:5173/styleguide"

node_ok() {
  command -v node >/dev/null 2>&1 || return 1
  local v major minor
  v="$(node -v | sed 's/^v//')"; major="${v%%.*}"; minor="$(echo "$v" | cut -d. -f2)"
  # Vite 8 needs Node 20.19+ or 22.12+
  [ "$major" -gt 22 ] || { [ "$major" -eq 22 ] && [ "$minor" -ge 12 ]; }
}

echo "→ Checking Node…"
if node_ok; then
  echo "  Node $(node -v) is ready."
else
  if ! command -v brew >/dev/null 2>&1; then
    for b in /opt/homebrew/bin/brew /usr/local/bin/brew; do [ -x "$b" ] && eval "$("$b" shellenv)"; done
  fi
  if command -v brew >/dev/null 2>&1; then
    echo "  Installing Node 22 with Homebrew (this takes a minute)…"
    brew install node@22
    PREFIX="$(brew --prefix node@22)"
    export PATH="$PREFIX/bin:$PATH"
    # Make it the default for new Terminal windows too.
    LINE="export PATH=\"$PREFIX/bin:\$PATH\""
    grep -qsF "$LINE" "$HOME/.zshrc" || printf '\n# Node 22 (The Oyster Studios CRM)\n%s\n' "$LINE" >> "$HOME/.zshrc"
    echo "  Installed $(node -v)."
  else
    echo "  Homebrew isn't installed, so Node can't be installed automatically."
    echo "  Opening the Node.js download page — install the macOS (.pkg) for v22 LTS, then run this script again."
    open "https://nodejs.org/en/download"
    exit 1
  fi
fi

# Make a `pnpm` command available (in ~/.local/bin, no sudo needed).
if ! command -v pnpm >/dev/null 2>&1; then
  echo "→ Setting up pnpm…"
  mkdir -p "$HOME/.local/bin"
  corepack enable --install-directory "$HOME/.local/bin" pnpm
  export PATH="$HOME/.local/bin:$PATH"
  LINE='export PATH="$HOME/.local/bin:$PATH"'
  grep -qsF "$LINE" "$HOME/.zshrc" || printf '\n# pnpm via corepack (The Oyster Studios CRM)\n%s\n' "$LINE" >> "$HOME/.zshrc"
fi

cd "$ROOT"
echo "→ Installing project dependencies…"
corepack pnpm install

echo "→ Starting The Oyster Studios at $URL  (press Ctrl+C to stop)"
( sleep 4 && open "$URL" ) &
exec corepack pnpm --filter @pinnacle/web dev
