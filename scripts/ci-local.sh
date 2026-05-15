#!/usr/bin/env bash
set -euo pipefail

echo "==> Cleaning build artifacts..."
rm -rf packages/core/dist packages/obsidian/main.js packages/vscode/dist

echo "==> Core: typecheck"
pnpm --filter @mindctx/core typecheck

echo "==> Core: build (generate .d.ts for downstream)"
pnpm --filter @mindctx/core build

echo "==> Obsidian: typecheck"
pnpm --filter @mindctx/obsidian typecheck

echo "==> VSCode: typecheck"
pnpm --filter vscode-mindctx typecheck

echo "==> Core: test"
pnpm --filter @mindctx/core test

echo "==> Full build"
pnpm build

echo "==> VSCode: package (.vsix)"
pnpm --filter vscode-mindctx package

echo "==> All checks passed."
