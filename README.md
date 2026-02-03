# Diffuse TUI

A terminal-based side-by-side diff viewer with keyboard navigation.

## Installation

```bash
npm install
npm run build
```

## Usage

```bash
# Compare two files
./diffuse file1.txt file2.txt

# Or using npm
npm start file1.txt file2.txt

# Demo mode (no arguments)
npm start
```

## Keyboard Shortcuts

### Navigation
- **↑ / ↓** - Navigate line by line
- **n / p** - Jump to next/previous changed section
- **u / d** - Page up / page down
- **Shift + ↑/↓** - Page up / page down (alternative)
- **Cmd/Ctrl + ↑/↓** - Jump sections (alternative)

### View
- **← / →** - Horizontal scroll (for long lines)
- **f** - Toggle folding of unchanged sections

### Other
- **?** - Toggle help screen
- **q** or **Ctrl+C** - Quit

## Features

- Side-by-side diff view with line numbers
- Color-coded changes (green for additions, red for removals)
- Current line highlighting
- Folding of large unchanged sections
- Horizontal scrolling for long lines
- In-app help screen
