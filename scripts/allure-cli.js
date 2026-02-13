#!/usr/bin/env node
/**
 * Wrapper around allure-commandline that handles paths with spaces correctly.
 * The upstream allure-commandline package has a bug where it uses shell: true
 * without quoting the binary path, breaking on directories with spaces.
 */
const path = require('path');
const { spawn } = require('child_process');

const allureBin = path.join(
  __dirname,
  '..',
  'node_modules',
  'allure-commandline',
  'dist',
  'bin',
  'allure'
);

const child = spawn(`"${allureBin}"`, process.argv.slice(2), {
  env: process.env,
  stdio: 'inherit',
  shell: true,
});

child.on('close', (code) => {
  process.exit(code || 0);
});
