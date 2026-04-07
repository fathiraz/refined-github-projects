#!/usr/bin/env node

/**
 * Parses the vitest coverage text output and updates the coverage badge in README.md.
 *
 * Usage:
 *   pnpm test:coverage-badge          # runs coverage + updates badge
 *   node scripts/update-coverage-badge.mjs   # updates badge from existing coverage/
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const README = resolve(ROOT, "README.md");

function getCoveragePercentage() {
  // Run vitest with coverage and capture output
  const output = execSync("npx vitest run --coverage --reporter=default", {
    cwd: ROOT,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  });

  // Match the "All files" row: | All files | XX.XX | ...
  const match = output.match(
    /All files\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)/,
  );
  if (!match) {
    console.error("Could not parse coverage from vitest output.");
    process.exit(1);
  }

  return {
    statements: parseFloat(match[1]),
    branches: parseFloat(match[2]),
    functions: parseFloat(match[3]),
    lines: parseFloat(match[4]),
  };
}

function badgeColor(pct) {
  if (pct >= 80) return "brightgreen";
  if (pct >= 50) return "yellow";
  return "red";
}

const coverage = getCoveragePercentage();
const pct = coverage.statements;
const color = badgeColor(pct);
const encoded = `${pct}%25`;
const badgeUrl = `https://img.shields.io/badge/coverage-${encoded}-${color}?style=for-the-badge`;

const readme = readFileSync(README, "utf-8");
const updated = readme.replace(
  /<!-- COVERAGE_BADGE_START -->.*?<!-- COVERAGE_BADGE_END -->/,
  `<!-- COVERAGE_BADGE_START --><img src="${badgeUrl}" alt="Coverage" /><!-- COVERAGE_BADGE_END -->`,
);

const hasMarkers = /<!-- COVERAGE_BADGE_START -->/.test(readme);
if (!hasMarkers) {
  console.error("No coverage badge markers found in README.md — nothing to update.");
  process.exit(1);
}

if (updated === readme) {
  console.log(`Coverage badge already up to date: ${pct}% (${color})`);
  process.exit(0);
}

writeFileSync(README, updated, "utf-8");
console.log(`Updated coverage badge: ${pct}% (${color})`);
