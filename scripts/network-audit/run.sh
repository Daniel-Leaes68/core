#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
if [[ "$(uname -s)" != Linux || "${CI:-}" != true || "${GITHUB_ACTIONS:-}" != true ]]; then
  echo 'Run only on a disposable Linux GitHub Actions runner; not on a personal desktop.' >&2
  exit 1
fi
for tool in strace xvfb-run timeout node; do command -v "$tool" >/dev/null; done
output="$PWD/network-audit-results"
mkdir -p "$output"
scratch="$(mktemp -d)"

# Observer control: fails if strace is unavailable, cannot follow descendants,
# produces an empty trace, or the parser silently misses a known connection.
timeout --kill-after=5s 20s strace -f -qq -s 0 -e trace=network -o "$output/control.log" \
  node scripts/network-audit/control.mjs > "$output/control-output.log" 2>&1
node --input-type=module - "$output" <<'NODE'
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { summarize } from './scripts/network-audit/report.mjs';
const dir = process.argv[2];
const port = Number(fs.readFileSync(`${dir}/control-output.log`, 'utf8').match(/CONTROL_PORT=(\d+)/)?.[1]);
assert.ok(port > 0, 'Control did not start');
assert.ok(summarize(fs.readFileSync(`${dir}/control.log`, 'utf8')).some(d => d.address === '127.0.0.1' && d.port === port), 'Observer missed the child-process control connection');
console.log('Observer control passed');
NODE

# Fresh Electron data and X server on a disposable hosted runner: no existing
# clipboard or wallet data. The caller's HOME is never changed.
mkdir -p "$scratch/config" "$scratch/data" "$scratch/profile"
export XDG_CONFIG_HOME="$scratch/config" XDG_DATA_HOME="$scratch/data"
export BRANTA_AUDIT_PROFILE="$scratch/profile" BRANTA_AUDIT_OUTPUT="$output"
unset APP_DEV ELECTRON_RUN_AS_NODE
set +e
timeout --kill-after=10s 65s xvfb-run -a --server-args='-screen 0 1280x800x24 -nolisten tcp' \
  strace -f -qq -s 0 -e trace=network -o "$output/trace.log" \
  node_modules/.bin/electron scripts/network-audit/electron.cjs headless \
  > "$output/application.log" 2>&1
result=$?
set -e
node scripts/network-audit/report.mjs "$output/trace.log" "$output/destinations"
if [[ "$result" != 0 || ! -f "$output/scenario.json" ]]; then
  cat "$output/application.log" >&2
  echo "Runtime scenario failed (exit $result); see audit artifacts." >&2
  exit 1
fi
cat "$output/destinations.md"
