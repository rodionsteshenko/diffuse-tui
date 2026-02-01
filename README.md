# Diffuse TUI

A terminal-based diff viewer with keyboard navigation.

## Installation

```bash
npm install
npm run build
```

## Usage

```bash
# Compare the included test files (recommended for testing features)
./diffuse test-original.js test-modified.js

# Or using npm
npm start test-original.js test-modified.js

# Compare any two files
./diffuse file1.txt file2.txt

# View a unified diff
./diffuse -d changes.diff

# Demo mode (no arguments)
npm start
```

## Test Files

The repository includes `test-original.js` and `test-modified.js` which demonstrate:
- **Character-level diffs**: Single-word and multi-word changes
- **Long lines**: Lines exceeding 100 characters (tests horizontal scrolling)
- **Multiple unchanged sections**: Large blocks of identical code (tests folding)
- **Various change types**: Additions, removals, and modifications
- **Realistic code**: A complete JavaScript class with documentation

## Keyboard Shortcuts

- **↑ / ↓** - Navigate line by line
- **n / p** - Jump to next/previous diff section (also works: Cmd/Ctrl + arrows)
- **u / d** - Page up / page down (also works: Shift + arrows)
- **q** or **Ctrl+C** - Quit

## Features

- Two-column side-by-side diff view
- Color-coded changes (green for additions, red for removals)
- File names displayed at the top
- Current line highlighting
- Section and page navigation
- Status bar with position information
