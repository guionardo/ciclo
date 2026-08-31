#!/bin/bash
set -e

# Verify that the ciclo command is available
if ! command -v ciclo &> /dev/null; then
  echo "Error: 'ciclo' command not found. Please ensure it is installed and in your PATH."
  echo "You can install it by running 'npm link' in the ciclo/cli directory."
  exit 1
fi

TEMP_DIR=$(mktemp -d)
echo "Creating test repo in $TEMP_DIR"
cd "$TEMP_DIR"

# Initialize a git repo
git init -q
echo "# Test Repo" > README.md
git add . && git commit -m "initial commit" -q

echo "Running ciclo init -y"
ciclo init -y

echo "Checking for expected files and directories..."
# Check .ciclo directory
if [ ! -d ".ciclo" ]; then
  echo "ERROR: .ciclo directory not found"
  exit 1
fi

# Check config.json and state.json
if [ ! -f ".ciclo/config.json" ]; then
  echo "ERROR: .ciclo/config.json not found"
  exit 1
fi

if [ ! -f ".ciclo/state.json" ]; then
  echo "ERROR: .ciclo/state.json not found"
  exit 1
fi

# Check .gitignore for ciclo additions
if ! grep -q "# ciclo framework" .gitignore; then
  echo "ERROR: .gitignore missing ciclo framework section"
  exit 1
fi

# Check AGENTS.md for managed section
if ! grep -q "<!-- ciclo:begin -->" AGENTS.md; then
  echo "ERROR: AGENTS.md missing ciclo managed section"
  exit 1
fi

# Check context directories
for dir in specs rules templates; do
  if [ ! -d "context/$dir" ]; then
    echo "ERROR: context/$dir directory not found"
    exit 1
  fi
done

# Check docs/ciclo/decisoes and CHANGELOG-IA.md
if [ ! -d "docs/ciclo/decisoes" ]; then
  echo "ERROR: docs/ciclo/decisoes directory not found"
  exit 1
fi

if [ ! -f "docs/ciclo/CHANGELOG-IA.md" ]; then
  echo "ERROR: docs/ciclo/CHANGELOG-IA.md not found"
  exit 1
fi

echo "Running ciclo doctor"
ciclo doctor

echo "All checks passed!"

# Clean up
cd /
rm -rf "$TEMP_DIR"