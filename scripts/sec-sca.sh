#!/usr/bin/env bash
# SCA：npm + Cargo。pnpm audit 必须走 npmjs（国内镜像通常没有 audit 端点）。
# Cargo：CI 必须有 osv-scanner；本机没有时只跑 pnpm audit 并警告。
set -euo pipefail

cargo_lock="clients/liangzui-ai-app/src-tauri/Cargo.lock"
npm_registry="https://registry.npmjs.org"

if [[ ! -f pnpm-lock.yaml ]]; then
  echo "找不到 pnpm-lock.yaml" >&2
  exit 1
fi
if [[ ! -f "${cargo_lock}" ]]; then
  echo "找不到 ${cargo_lock}" >&2
  exit 1
fi

pnpm audit --audit-level=high --registry "${npm_registry}"

if [[ "${CI:-}" == "true" ]] && ! command -v osv-scanner >/dev/null 2>&1; then
  echo "CI 必须安装 osv-scanner，不能跳过 Cargo 扫描" >&2
  exit 1
fi

if command -v osv-scanner >/dev/null 2>&1; then
  osv-scanner --lockfile=pnpm-lock.yaml --lockfile="${cargo_lock}" --config=osv-scanner.toml
elif command -v cargo-audit >/dev/null 2>&1; then
  cargo audit --file "${cargo_lock}"
else
  echo "⚠ 未安装 osv-scanner / cargo-audit，本机只跑 pnpm audit。"
  echo "  Cargo.lock 已确认存在。CI 的 OSV-Scanner job 会扫 npm + Cargo。"
  echo "  本机安装：brew install osv-scanner"
fi
