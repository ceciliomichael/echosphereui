#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${REPO_ROOT}"

if [[ $# -lt 1 ]]; then
  node ./scripts/release-version.mjs --interactive
  exit 0
fi

TARGET="$1"
shift

if [[ "${TARGET}" == "patch" || "${TARGET}" == "minor" || "${TARGET}" == "major" ]]; then
  node ./scripts/release-version.mjs --bump "${TARGET}" --commit --push "$@"
else
  node ./scripts/release-version.mjs --version "${TARGET}" --commit --push "$@"
fi
