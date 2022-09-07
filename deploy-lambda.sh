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

rm -rf dist dist-lambda.zip
npx tsc --outDir dist src/credential-report-alerts.ts

zip -X --quiet --recurse-paths dist-lambda.zip dist node_modules package.json

pushd terraform
test -d .terraform || terraform init
terraform fmt -check

if [[ -n ${CI-} ]]; then
  terraform apply -auto-approve -no-color
else
  terraform apply
fi
