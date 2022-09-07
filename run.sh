#!/usr/bin/env bash

set -o errexit
set -o nounset
set -o pipefail
if [[ -n ${TRACE-} ]]; then
  set -o xtrace
fi

cd "$(dirname "$0")"

if [[ -f .env ]]; then
  set -a
  source .env
  set +a
fi

task="${1-}"
if [[ -z $task ]]; then
  echo "Usage:" >&2
  find src -name '*.ts' -depth 1 | sed -E "s,src/(.*)\.ts,  $0 \1," >&2
  exit 1
fi

if [[ -f src/$task.ts ]]; then
  exec yarn run ts-node "src/$task.ts"
else
  echo "Task not found: $task" >&2
  exit 1
fi
