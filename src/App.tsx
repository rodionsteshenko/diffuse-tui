import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import * as Diff from 'diff';
import chalk from 'chalk';

interface AppProps {
  leftContent: string;
  rightContent: string;
  leftFile: string;
  rightFile: string;
}

interface DiffSection {
  leftStart: number;
  rightStart: number;
  leftLines: Array<{ content: string; type: 'equal' | 'remove' | 'add' | 'empty' }>;
  rightLines: Array<{ content: string; type: 'equal' | 'remove' | 'add' | 'empty' }>;
}

export const App: React.FC<AppProps> = ({ leftContent, rightContent, leftFile, rightFile }) => {
  const { exit } = useApp();
  const [currentLine, setCurrentLine] = useState(0);
  const [currentSection, setCurrentSection] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [diffSections, setDiffSections] = useState<DiffSection[]>([]);
  const [totalLines, setTotalLines] = useState(0);

  const terminalHeight = process.stdout.rows || 24;
  const viewHeight = terminalHeight - 3; // Account for header and footer

  useEffect(() => {
    const sections = computeDiffSections(leftContent, rightContent);
    setDiffSections(sections);

    // Calculate total lines
    const total = sections.reduce((sum, section) => sum + Math.max(section.leftLines.length, section.rightLines.length), 0);
    setTotalLines(total);
  }, [leftContent, rightContent]);

  useEffect(() => {
    // Auto-scroll to keep current line visible
    if (currentLine < scrollOffset) {
      setScrollOffset(currentLine);
    } else if (currentLine >= scrollOffset + viewHeight) {
      setScrollOffset(currentLine - viewHeight + 1);
    }
  }, [currentLine, viewHeight]);

  useInput((input: string, key: any) => {
    if (input === 'q' || (key.ctrl && input === 'c')) {
      exit();
      return;
    }

    // Section navigation with n/p keys or Cmd/Ctrl+arrows
    const jumpToPrevSection = () => {
      // Find the first section with changes before current line
      let targetSection = -1;
      let lineCount = 0;

      for (let i = 0; i < diffSections.length; i++) {
        const sectionLines = Math.max(diffSections[i].leftLines.length, diffSections[i].rightLines.length);
        const hasChanges = diffSections[i].leftLines.some(l => l.type !== 'equal') ||
                          diffSections[i].rightLines.some(l => l.type !== 'equal');

        if (lineCount < currentLine && hasChanges) {
          targetSection = i;
        }
        lineCount += sectionLines;
      }

      if (targetSection >= 0) {
        const lineOffset = diffSections.slice(0, targetSection).reduce(
          (sum, s) => sum + Math.max(s.leftLines.length, s.rightLines.length),
          0
        );
        setCurrentLine(lineOffset);
      }
    };

    const jumpToNextSection = () => {
      // Find the first section with changes after current line
      let lineCount = 0;

      for (let i = 0; i < diffSections.length; i++) {
        const sectionLines = Math.max(diffSections[i].leftLines.length, diffSections[i].rightLines.length);

        if (lineCount > currentLine) {
          const hasChanges = diffSections[i].leftLines.some(l => l.type !== 'equal') ||
                            diffSections[i].rightLines.some(l => l.type !== 'equal');
          if (hasChanges) {
            setCurrentLine(lineCount);
            return;
          }
        }
        lineCount += sectionLines;
      }
    };

    // Line by line navigation
    if (key.upArrow && !key.shift && !key.meta && !key.ctrl) {
      setCurrentLine(Math.max(0, currentLine - 1));
    } else if (key.downArrow && !key.shift && !key.meta && !key.ctrl) {
      setCurrentLine(Math.min(totalLines - 1, currentLine + 1));
    }
    // Section navigation
    else if (input === 'n' || input === 'N' || ((key.meta || key.ctrl) && key.downArrow)) {
      jumpToNextSection();
    } else if (input === 'p' || input === 'P' || ((key.meta || key.ctrl) && key.upArrow)) {
      jumpToPrevSection();
    }
    // Page navigation
    else if (key.shift && key.upArrow) {
      setCurrentLine(Math.max(0, currentLine - viewHeight));
    } else if (key.shift && key.downArrow) {
      setCurrentLine(Math.min(totalLines - 1, currentLine + viewHeight));
    } else if (input === 'u' || input === 'U') {
      // Page up (vim-style)
      setCurrentLine(Math.max(0, currentLine - viewHeight));
    } else if (input === 'd' || input === 'D') {
      // Page down (vim-style)
      setCurrentLine(Math.min(totalLines - 1, currentLine + viewHeight));
    }
  });

  // Find which section the current line belongs to
  useEffect(() => {
    let lineCount = 0;
    for (let i = 0; i < diffSections.length; i++) {
      const sectionLines = Math.max(diffSections[i].leftLines.length, diffSections[i].rightLines.length);
      if (currentLine < lineCount + sectionLines) {
        setCurrentSection(i);
        break;
      }
      lineCount += sectionLines;
    }
  }, [currentLine, diffSections]);

  const renderLines = () => {
    const lines: JSX.Element[] = [];
    let globalLineIndex = 0;
    let leftLineNum = 1;
    let rightLineNum = 1;

    for (const section of diffSections) {
      const maxLines = Math.max(section.leftLines.length, section.rightLines.length);

      // Check if this section has any changes
      const hasChanges = section.leftLines.some(l => l.type !== 'equal') ||
                        section.rightLines.some(l => l.type !== 'equal');

      for (let i = 0; i < maxLines; i++) {
        if (globalLineIndex < scrollOffset) {
          const leftLine = section.leftLines[i];
          const rightLine = section.rightLines[i];
          if (leftLine && leftLine.type !== 'empty') leftLineNum++;
          if (rightLine && rightLine.type !== 'empty') rightLineNum++;
          globalLineIndex++;
          continue;
        }
        if (globalLineIndex >= scrollOffset + viewHeight) {
          break;
        }

        const leftLine = section.leftLines[i] || { content: '', type: 'empty' as const };
        const rightLine = section.rightLines[i] || { content: '', type: 'empty' as const };
        const isCurrentLine = globalLineIndex === currentLine;

        const leftPrefix = getPrefixForType(leftLine.type);
        const rightPrefix = getPrefixForType(rightLine.type);

        // Calculate line numbers
        const leftNum = leftLine.type !== 'empty' ? leftLineNum.toString().padStart(4) : '    ';
        const rightNum = rightLine.type !== 'empty' ? rightLineNum.toString().padStart(4) : '    ';

        // Determine the divider character based on position in change section
        let divider = ' │ ';
        if (hasChanges) {
          if (i === 0 && i === maxLines - 1) {
            // Single line change - just a horizontal line
            divider = '──┼──';
          } else if (i === 0) {
            // First line of multi-line change
            divider = '╭─┼─╮';
          } else if (i === maxLines - 1) {
            // Last line of multi-line change
            divider = '╰─┼─╯';
          } else {
            // Middle line of multi-line change
            divider = '│ │ │';
          }
        }

        lines.push(
          <Box key={globalLineIndex} flexDirection="row">
            {/* Left side with line number */}
            <Box flexGrow={1} flexShrink={1} flexBasis={0}>
              <Text color={isCurrentLine ? 'yellow' : 'gray'} bold={isCurrentLine}>
                {leftNum}{leftPrefix}
              </Text>
              <Text
                color={getColorForType(leftLine.type)}
                bold={isCurrentLine}
                dimColor={leftLine.type === 'empty'}
              >
                {leftLine.content || (leftLine.type === 'empty' ? '⋯' : ' ')}
              </Text>
            </Box>

            {/* Divider with connection markers */}
            <Text color="cyan">{divider}</Text>

            {/* Right side with line number */}
            <Box flexGrow={1} flexShrink={1} flexBasis={0}>
              <Text color={isCurrentLine ? 'yellow' : 'gray'} bold={isCurrentLine}>
                {rightNum}{rightPrefix}
              </Text>
              <Text
                color={getColorForType(rightLine.type)}
                bold={isCurrentLine}
                dimColor={rightLine.type === 'empty'}
              >
                {rightLine.content || (rightLine.type === 'empty' ? '⋯' : ' ')}
              </Text>
            </Box>
          </Box>
        );

        // Increment line numbers
        if (leftLine.type !== 'empty') leftLineNum++;
        if (rightLine.type !== 'empty') rightLineNum++;
        globalLineIndex++;
      }
    }

    return lines;
  };

  return (
    <Box flexDirection="column" height={terminalHeight}>
      {/* Header */}
      <Box borderStyle="single" paddingX={1} flexDirection="row">
        <Box flexGrow={1} flexShrink={1} flexBasis={0}>
          <Text bold color="cyan">{leftFile}</Text>
        </Box>
        <Text color="gray">│</Text>
        <Box flexGrow={1} flexShrink={1} flexBasis={0}>
          <Text bold color="cyan">{rightFile}</Text>
        </Box>
      </Box>

      {/* Content */}
      <Box flexDirection="column" flexGrow={1}>
        {renderLines()}
      </Box>

      {/* Footer */}
      <Box borderStyle="single" paddingX={1}>
        <Text>
          Line {currentLine + 1}/{totalLines} | Section {currentSection + 1}/{diffSections.length} |
          <Text color="gray"> ↑↓:line | n/p:section | u/d:page | q:quit</Text>
        </Text>
      </Box>
    </Box>
  );
};

function computeDiffSections(left: string, right: string): DiffSection[] {
  const leftLines = left.split('\n');
  const rightLines = right.split('\n');
  const changes = Diff.diffLines(left, right);

  const sections: DiffSection[] = [];
  let leftIndex = 0;
  let rightIndex = 0;

  // Process changes and merge adjacent removed/added sections for vertical alignment
  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];
    const lines = change.value.split('\n');
    if (lines.length > 0 && lines[lines.length - 1] === '') {
      lines.pop();
    }

    const section: DiffSection = {
      leftStart: leftIndex,
      rightStart: rightIndex,
      leftLines: [],
      rightLines: [],
    };

    if (change.removed && i + 1 < changes.length && changes[i + 1].added) {
      // Removed section followed by added section - merge them with vertical alignment
      const nextChange = changes[i + 1];
      const nextLines = nextChange.value.split('\n');
      if (nextLines.length > 0 && nextLines[nextLines.length - 1] === '') {
        nextLines.pop();
      }

      const maxLen = Math.max(lines.length, nextLines.length);

      // Add lines vertically aligned (top-justified)
      for (let j = 0; j < maxLen; j++) {
        if (j < lines.length) {
          section.leftLines.push({ content: lines[j], type: 'remove' });
          leftIndex++;
        } else {
          section.leftLines.push({ content: '', type: 'empty' });
        }

        if (j < nextLines.length) {
          section.rightLines.push({ content: nextLines[j], type: 'add' });
          rightIndex++;
        } else {
          section.rightLines.push({ content: '', type: 'empty' });
        }
      }

      i++; // Skip the next change since we processed it
    } else if (change.added) {
      // Pure addition (not paired with removal)
      for (const line of lines) {
        section.leftLines.push({ content: '', type: 'empty' });
        section.rightLines.push({ content: line, type: 'add' });
        rightIndex++;
      }
    } else if (change.removed) {
      // Pure removal (not paired with addition)
      for (const line of lines) {
        section.leftLines.push({ content: line, type: 'remove' });
        section.rightLines.push({ content: '', type: 'empty' });
        leftIndex++;
      }
    } else {
      // Equal lines
      for (const line of lines) {
        section.leftLines.push({ content: line, type: 'equal' });
        section.rightLines.push({ content: line, type: 'equal' });
        leftIndex++;
        rightIndex++;
      }
    }

    if (section.leftLines.length > 0 || section.rightLines.length > 0) {
      sections.push(section);
    }
  }

  return sections;
}

function getColorForType(type: 'equal' | 'remove' | 'add' | 'empty'): string {
  switch (type) {
    case 'add':
      return 'green';
    case 'remove':
      return 'red';
    case 'equal':
      return 'white';
    case 'empty':
      return 'gray';
    default:
      return 'white';
  }
}

function getPrefixForType(type: 'equal' | 'remove' | 'add' | 'empty'): string {
  switch (type) {
    case 'add':
      return '+ ';
    case 'remove':
      return '- ';
    case 'equal':
      return '  ';
    case 'empty':
      return '  ';
    default:
      return '  ';
  }
}
