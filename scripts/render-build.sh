#!/usr/bin/env bash
set -euo pipefail

repo_url="${MOBILE_CONTROLLER_REPO:-https://github.com/Yuji5124/mobile-steering-controller.git}"
repo_ref="${MOBILE_CONTROLLER_REF:-main}"
controller_checkout="$(mktemp -d)"
trap 'rm -rf "$controller_checkout"' EXIT

npm --cache /tmp/npm-cache ci --include=dev --no-audit --no-fund
npm run build

git -C "$controller_checkout" init source >/dev/null
git -C "$controller_checkout/source" remote add origin "$repo_url"
git -C "$controller_checkout/source" fetch --depth 1 origin "$repo_ref"
git -C "$controller_checkout/source" checkout --detach FETCH_HEAD
printf 'Building mobile-steering-controller ref %s at %s\n' "$repo_ref" "$(git -C "$controller_checkout/source" rev-parse HEAD)"
npm --cache /tmp/npm-cache --prefix "$controller_checkout/source" ci --include=dev --no-audit --no-fund
VITE_BASE_PATH=/controller/ npm --prefix "$controller_checkout/source" run build

mkdir -p dist/controller
cp -R "$controller_checkout/source/dist/." dist/controller/
