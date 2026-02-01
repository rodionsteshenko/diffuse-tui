# Diffuse TUI

A terminal-based diff viewer with keyboard navigation.

## Installation

```bash
npm install
npm run build
```

## Usage

```bash
# Compare two files
./diffuse test-original.txt test-modified.txt

# Or using npm
npm start test-original.txt test-modified.txt

# View a unified diff
./diffuse -d changes.diff

# Demo mode (no arguments)
npm start
```

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
