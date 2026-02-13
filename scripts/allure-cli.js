#!/usr/bin/env node
/**
 * @file allure-cli.js
 * @description Wrapper around allure-commandline that handles paths with spaces.
 *
 * Problem: The upstream `allure-commandline` npm package spawns the Allure
 * binary using `shell: true` without quoting the path. When the project
 * lives in a directory containing spaces (e.g., "/Users/me/My Projects/..."),
 * the shell splits the path and the command fails.
 *
 * Solution: This wrapper resolves the absolute path to the Allure binary,
 * wraps it in quotes, and spawns it with `shell: true` so it works on
 * any file-system path.
 *
 * Usage (in package.json scripts):
 *   "report:allure:generate": "node scripts/allure-cli.js generate Reports/allure-results --clean -o Reports/allure-report"
 */
const path = require('path');
const { spawn } = require('child_process');

// Resolve the absolute path to the allure binary inside node_modules
const allureBin = path.join(
  __dirname,
  '..',
  'node_modules',
  'allure-commandline',
  'dist',
  'bin',
  'allure'
);

// Spawn with quoted path to handle directories with spaces
const child = spawn(`"${allureBin}"`, process.argv.slice(2), {
  env: process.env,
  stdio: 'inherit',  // Forward stdout/stderr to the parent process
  shell: true,        // Required for the quoted path to work
});

// Exit with the same code as the Allure process
child.on('close', (code) => {
  process.exit(code || 0);
});
