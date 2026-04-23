#!/usr/bin/env node

/**
 * Updates the coverage badge (and optionally the coverage summary block) in README.md.
 *
 * Modes:
 *   1. Local default (no flags):
 *        pnpm test:coverage-badge
 *      Runs `npx vitest run --coverage --reporter=default`, parses the text
 *      "All files" row, and swaps the COVERAGE_BADGE markers.
 *
 *   2. CI-friendly (recommended in workflows):
 *        node scripts/update-coverage-badge.mjs --from-summary [--from-markdown <path>]
 *      Reads `coverage/coverage-summary.json` (written by vitest json-summary
 *      reporter) without re-running the test suite, swaps the COVERAGE_BADGE
 *      markers, and — if `--from-markdown` is given — injects the contents of
 *      the irongut/CodeCoverageSummary markdown file between the
 *      COVERAGE_REPORT markers.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const README = resolve(ROOT, "README.md");
const SUMMARY_JSON = resolve(ROOT, "coverage", "coverage-summary.json");

function parseArgs(argv) {
  const args = { fromSummary: false, fromMarkdown: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--from-summary") args.fromSummary = true;
    else if (a === "--from-markdown") args.fromMarkdown = argv[++i];
  }
  return args;
}

function coverageFromVitestText() {
  const output = execSync("npx vitest run --coverage --reporter=default", {
    cwd: ROOT,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  });

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

function coverageFromJsonSummary() {
  if (!existsSync(SUMMARY_JSON)) {
    console.error(
      `coverage-summary.json not found at ${SUMMARY_JSON}. ` +
        "Run `pnpm test:coverage` first (vitest must include the 'json-summary' reporter).",
    );
    process.exit(1);
  }
  const data = JSON.parse(readFileSync(SUMMARY_JSON, "utf-8"));
  const total = data.total;
  if (!total) {
    console.error("coverage-summary.json is missing a `total` block.");
    process.exit(1);
  }
  return {
    statements: total.statements?.pct ?? 0,
    branches: total.branches?.pct ?? 0,
    functions: total.functions?.pct ?? 0,
    lines: total.lines?.pct ?? 0,
  };
}

function badgeColor(pct) {
  if (pct >= 80) return "brightgreen";
  if (pct >= 50) return "yellow";
  return "red";
}

function buildBadgeBlock(pct) {
  const color = badgeColor(pct);
  const encoded = `${pct}%25`;
  const badgeUrl = `https://img.shields.io/badge/coverage-${encoded}-${color}?style=for-the-badge`;
  return {
    html: `<!-- COVERAGE_BADGE_START --><img src="${badgeUrl}" alt="Coverage" /><!-- COVERAGE_BADGE_END -->`,
    color,
  };
}

function replaceBadge(readme, pct) {
  const hasMarkers = /<!-- COVERAGE_BADGE_START -->/.test(readme);
  if (!hasMarkers) {
    console.error("No coverage badge markers found in README.md.");
    process.exit(1);
  }
  const { html, color } = buildBadgeBlock(pct);
  const updated = readme.replace(
    /<!-- COVERAGE_BADGE_START -->.*?<!-- COVERAGE_BADGE_END -->/s,
    html,
  );
  return { readme: updated, color };
}

function replaceReportBlock(readme, markdownPath) {
  if (!existsSync(markdownPath)) {
    console.error(`Coverage markdown file not found at ${markdownPath}.`);
    process.exit(1);
  }
  if (!/<!-- COVERAGE_REPORT_START -->/.test(readme)) {
    console.warn(
      "No COVERAGE_REPORT markers in README.md — skipping summary block.",
    );
    return readme;
  }
  const markdown = readFileSync(markdownPath, "utf-8").trim();
  const block = [
    "<!-- COVERAGE_REPORT_START -->",
    "",
    markdown,
    "",
    "<!-- COVERAGE_REPORT_END -->",
  ].join("\n");
  return readme.replace(
    /<!-- COVERAGE_REPORT_START -->[\s\S]*?<!-- COVERAGE_REPORT_END -->/,
    block,
  );
}

const args = parseArgs(process.argv.slice(2));

const coverage = args.fromSummary ? coverageFromJsonSummary() : coverageFromVitestText();
const pct = coverage.statements;

const original = readFileSync(README, "utf-8");
let next = original;

const { readme: withBadge, color } = replaceBadge(next, pct);
next = withBadge;

if (args.fromMarkdown) {
  next = replaceReportBlock(next, resolve(ROOT, args.fromMarkdown));
}

if (next === original) {
  console.log(`Coverage badge already up to date: ${pct}% (${color})`);
  process.exit(0);
}

writeFileSync(README, next, "utf-8");
console.log(`Updated coverage badge: ${pct}% (${color})`);
if (args.fromMarkdown) console.log(`Updated coverage summary block from ${args.fromMarkdown}.`);
