#!/usr/bin/env node
/**
 * Usage:
 *   node scripts/bump-version.mjs obsidian 0.2.0
 *   node scripts/bump-version.mjs vscode 0.2.0
 *
 * Updates version in all relevant files and creates a git tag.
 */

import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { resolve } from 'path';

const [,, target, version] = process.argv;

if (!target || !version) {
  console.error('Usage: node scripts/bump-version.mjs <obsidian|vscode> <version>');
  process.exit(1);
}

if (!['obsidian', 'vscode'].includes(target)) {
  console.error('Target must be "obsidian" or "vscode"');
  process.exit(1);
}

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('Version must be semver (e.g., 0.2.0)');
  process.exit(1);
}

const root = resolve(import.meta.dirname, '..');

function updateJSON(filePath, updater) {
  const content = JSON.parse(readFileSync(filePath, 'utf-8'));
  updater(content);
  writeFileSync(filePath, JSON.stringify(content, null, 2) + '\n');
  console.log(`  Updated: ${filePath}`);
}

if (target === 'obsidian') {
  const pkg = resolve(root, 'packages/obsidian/package.json');
  const manifest = resolve(root, 'packages/obsidian/manifest.json');
  const versions = resolve(root, 'packages/obsidian/versions.json');

  updateJSON(pkg, (j) => { j.version = version; });
  updateJSON(manifest, (j) => { j.version = version; });

  const minApp = JSON.parse(readFileSync(manifest, 'utf-8')).minAppVersion;
  updateJSON(versions, (j) => { j[version] = minApp; });

  const tag = `obsidian-v${version}`;
  console.log(`\nReady to release. Run:`);
  console.log(`  git add -A && git commit -m "release(obsidian): v${version}"`);
  console.log(`  git tag ${tag}`);
  console.log(`  git push origin main ${tag}`);
}

if (target === 'vscode') {
  const pkg = resolve(root, 'packages/vscode/package.json');

  updateJSON(pkg, (j) => { j.version = version; });

  const tag = `vscode-v${version}`;
  console.log(`\nReady to release. Run:`);
  console.log(`  git add -A && git commit -m "release(vscode): v${version}"`);
  console.log(`  git tag ${tag}`);
  console.log(`  git push origin main ${tag}`);
}
