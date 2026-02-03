# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Diffuse TUI is a terminal-based diff viewer built with Ink (React for CLIs). It displays side-by-side file comparisons with keyboard navigation, similar to GUI diff tools.

## Build & Development Commands

```bash
# Build TypeScript to dist/
npm run build

# Development mode with watch
npm run dev

# Run the diff viewer
./diffuse file1.txt file2.txt
npm start file1.txt file2.txt

# Demo mode (no arguments)
npm start
```

## Architecture

### Two-File Structure

The codebase has two main files:

**`src/cli.ts`** - Entry point and argument parsing
- Uses `commander` for CLI argument parsing
- Reads files from disk or uses demo content
- Renders the Ink React app with `render()`

**`src/App.tsx`** - Main Ink/React component
- All UI logic, state management, and rendering
- Keyboard input handling with `useInput` hook
- Diff computation and visual presentation

### Diff Algorithm & Vertical Alignment

The critical innovation is in `computeDiffSections()`:

1. Uses `diff.diffLines()` to get change chunks
2. **Merges adjacent removed/added sections** for vertical alignment
   - When a "removed" chunk is immediately followed by an "added" chunk, they are combined into one section
   - Lines are aligned vertically (top-justified) so corresponding changes appear on the same row
   - Example: 3 removed lines + 1 added line → 3 rows with the added line at the top, 2 empty rows below

3. Returns `DiffSection[]` where each section has:
   - `leftLines[]` and `rightLines[]` arrays of equal length
   - Line types: `'equal' | 'remove' | 'add' | 'empty'`
   - Empty padding (type `'empty'`) fills shorter sides

### Visual Connection Markers

The divider column shows bracket markers for changed sections:

- **Single-line changes**: `──┼──` (horizontal line)
- **Multi-line changes**:
  - First line: `╭─┼─╮`
  - Middle lines: `│ │ │`
  - Last line: `╰─┼─╯`

This is computed in `renderLines()` based on position within each changed section.

### Line Number Tracking

`renderLines()` maintains separate line counters (`leftLineNum`, `rightLineNum`) that only increment for non-empty lines. This ensures line numbers match the actual file content, not the padded display.

### Keyboard Navigation

Three navigation modes:
- **Line-by-line**: Arrow keys move through all lines
- **Section jumping**: `n`/`p` jump to next/previous *changed* section (skips `'equal'` sections)
- **Page navigation**: `u`/`d` or Shift+arrows scroll by `viewHeight`

### File Editing

The right file can be edited by copying diffs:
- **Option+Right**: Copy current diff section from left to right (applies the left side's version)
- **Option+Left**: Restore original right content for current section
- **Ctrl+S**: Save changes to right file
- **Ctrl+Z**: Undo last edit

State tracking:
- `editedRightContent`: Current (possibly modified) right file content
- `undoStack`: Stack of previous states for undo
- `isEdited`: Derived boolean (editedRightContent !== rightContent)

When quitting with unsaved changes, a confirmation modal appears (Y/N/Cancel).

### TypeScript Configuration

Uses `"moduleResolution": "bundler"` (not `"node"`) for compatibility with Ink 5.x's ESM exports.

## Key Design Patterns

**Ink-specific patterns:**
- Use `flexGrow={1} flexShrink={1} flexBasis={0}` for equal-width columns
- `useInput()` hook receives `(input: string, key: any)` - type `key` as `any` since Ink's types are incomplete
- Current line highlighting uses `bold={true}` and color changes instead of `inverse` or `backgroundColor` (better terminal compatibility)

**State management:**
- `currentLine` is the global line index across all sections
- `currentSection` is auto-calculated from `currentLine` position
- `scrollOffset` auto-adjusts to keep `currentLine` visible within `viewHeight`

## Testing Notes

Automated testing in non-TTY environments will fail with "Raw mode is not supported" error. This is expected - Ink requires a real terminal. Test manually in an actual terminal session.
