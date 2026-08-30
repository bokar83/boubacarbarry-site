#!/bin/sh
# Installs this repo's versioned hooks/* scripts into .git/hooks/, since git
# never reads hooks straight out of a tracked directory. Run once per clone
# (or after hooks/pre-commit changes).
set -e
repo_root=$(git rev-parse --show-toplevel)
cp "$repo_root/hooks/pre-commit" "$repo_root/.git/hooks/pre-commit"
chmod +x "$repo_root/.git/hooks/pre-commit"
echo "Installed hooks/pre-commit -> .git/hooks/pre-commit"
