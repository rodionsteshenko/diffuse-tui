// Dump mode - non-interactive output for testing
// Uses the same diff algorithm as the interactive TUI

import { computeDiffSections, getPrefixForType } from './diff.js';
import type { DiffSection } from './diff.js';

interface DumpOptions {
  width: number;
  foldingEnabled: boolean;
  showDebug: boolean;
  scrollOffset: number;
  viewHeight: number;
}

export function dumpDiff(
  leftContent: string,
  rightContent: string,
  leftFile: string,
  rightFile: string,
  options: DumpOptions
): void {
  const sections = computeDiffSections(leftContent, rightContent);
  const contextLines = 3;

  console.log(`--- ${leftFile}`);
  console.log(`+++ ${rightFile}`);
  console.log('');

  let leftLineNum = 1;
  let rightLineNum = 1;
  let globalLineIndex = 0;

  for (const section of sections) {
    const maxLines = Math.max(section.leftLines.length, section.rightLines.length);
    const hasChanges = section.leftLines.some(l => l.type !== 'equal') ||
                      section.rightLines.some(l => l.type !== 'equal');
    const shouldFold = options.foldingEnabled && !hasChanges && maxLines > (contextLines * 2 + 1);
    const foldedLinesCount = shouldFold ? maxLines - (contextLines * 2) : 0;

    for (let i = 0; i < maxLines; i++) {
      // Handle folding
      if (shouldFold && i === contextLines) {
        console.log(`⋯ ${foldedLinesCount} unchanged lines ⋯`);
        globalLineIndex++;
        const skipped = foldedLinesCount;
        leftLineNum += skipped;
        rightLineNum += skipped;
        i = maxLines - contextLines - 1;
        continue;
      }

      // Handle scroll offset and view height
      if (options.scrollOffset > 0 && globalLineIndex < options.scrollOffset) {
        const leftLine = section.leftLines[i];
        const rightLine = section.rightLines[i];
        if (leftLine && leftLine.type !== 'empty') leftLineNum++;
        if (rightLine && rightLine.type !== 'empty') rightLineNum++;
        globalLineIndex++;
        continue;
      }
      if (options.viewHeight > 0 && globalLineIndex >= options.scrollOffset + options.viewHeight) {
        return;
      }

      const leftLine = section.leftLines[i] || { content: '', type: 'empty' as const };
      const rightLine = section.rightLines[i] || { content: '', type: 'empty' as const };

      const leftPrefix = getPrefixForType(leftLine.type);
      const rightPrefix = getPrefixForType(rightLine.type);
      const leftNum = leftLine.type !== 'empty' ? leftLineNum.toString().padStart(4) : '    ';
      const rightNum = rightLine.type !== 'empty' ? rightLineNum.toString().padStart(4) : '    ';

      const columnWidth = Math.floor((options.width - 3) / 2);
      const contentWidth = Math.max(10, columnWidth - 6);

      const truncate = (s: string, max: number) =>
        s.length > max ? s.substring(0, max - 1) + '…' : s;

      const leftDisplay = leftLine.type === 'empty' ? '⋯' : truncate(leftLine.content, contentWidth);
      const rightDisplay = rightLine.type === 'empty' ? '⋯' : truncate(rightLine.content, contentWidth);

      const pad = (s: string, w: number) => s.length >= w ? s.substring(0, w) : s + ' '.repeat(w - s.length);

      if (options.showDebug) {
        console.log(
          `${pad(`${leftNum}${leftPrefix}${leftDisplay}`, columnWidth)} │ ${pad(`${rightNum}${rightPrefix}${rightDisplay}`, columnWidth)}`
        );
      } else {
        console.log(
          `${pad(`${leftNum}${leftPrefix}${leftDisplay}`, columnWidth)} │ ${pad(`${rightNum}${rightPrefix}${rightDisplay}`, columnWidth)}`
        );
      }

      if (leftLine.type !== 'empty') leftLineNum++;
      if (rightLine.type !== 'empty') rightLineNum++;
      globalLineIndex++;
    }
  }
}
