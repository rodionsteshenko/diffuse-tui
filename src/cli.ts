#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { program } from 'commander';
import { App } from './App.js';
import { dumpDiff } from './dump.js';
import { readFileSync } from 'fs';

program
  .name('diffuse')
  .description('Terminal-based diff viewer')
  .argument('[file1]', 'First file to compare')
  .argument('[file2]', 'Second file to compare')
  .option('-d, --diff <file>', 'Unified diff file to view')
  .option('--dump', 'Dump diff output without interactive TUI (for testing)')
  .option('--width <n>', 'Terminal width for dump mode', '160')
  .option('--debug', 'Show debug info in dump mode')
  .option('--fold', 'Enable folding in dump mode')
  .option('--scroll <n>', 'Scroll offset for dump mode (simulates scrolling)')
  .option('--view-height <n>', 'Viewport height for dump mode (simulates terminal)')
  .parse();

const options = program.opts();
const args = program.args;

let leftContent = '';
let rightContent = '';
let leftFile = '';
let rightFile = '';

if (options.diff) {
  // TODO: Parse unified diff format
  const diffContent = readFileSync(options.diff, 'utf-8');
  leftContent = diffContent;
  rightContent = diffContent;
  leftFile = options.diff;
  rightFile = options.diff;
} else if (args.length === 2) {
  leftFile = args[0];
  rightFile = args[1];
  try {
    leftContent = readFileSync(leftFile, 'utf-8');
    rightContent = readFileSync(rightFile, 'utf-8');
  } catch (error) {
    console.error(`Error reading files: ${error}`);
    process.exit(1);
  }
} else {
  // Demo mode with sample diff
  leftFile = 'original.txt';
  rightFile = 'modified.txt';
  leftContent = `function hello() {
  console.log("Hello");
  return true;
}

const x = 1;
const y = 2;

function world() {
  console.log("World");
}`;

  rightContent = `function hello() {
  console.log("Hello, World!");
  return true;
}

const x = 1;
const z = 3;

function world() {
  console.log("World!");
  return false;
}`;
}

if (options.dump) {
  // Dump mode - non-interactive output for testing
  dumpDiff(leftContent, rightContent, leftFile, rightFile, {
    width: parseInt(options.width, 10),
    foldingEnabled: !!options.fold,
    showDebug: !!options.debug,
    scrollOffset: options.scroll ? parseInt(options.scroll, 10) : 0,
    viewHeight: options.viewHeight ? parseInt(options.viewHeight, 10) : 0,
  });
} else {
  render(
    React.createElement(App, {
      leftContent,
      rightContent,
      leftFile,
      rightFile,
    })
  );
}
