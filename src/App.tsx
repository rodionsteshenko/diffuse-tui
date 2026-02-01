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
  const [showHelp, setShowHelp] = useState(false);
  const [foldingEnabled, setFoldingEnabled] = useState(true);
  const contextLines = 3; // Number of context lines to show above/below changes

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
    // Toggle help screen
    if (input === '?') {
      setShowHelp(!showHelp);
      return;
    }

    // Ignore other inputs when help is shown
    if (showHelp) {
      if (key.escape) {
        setShowHelp(false);
      }
      return;
    }

    // Toggle folding
    if (input === 'f' || input === 'F') {
      setFoldingEnabled(!foldingEnabled);
      return;
    }

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

  // Disabled for now - causing rendering issues
  // Will re-implement with better approach later
  const renderInlineDiff = (leftContent: string, rightContent: string, type: 'remove' | 'add', isCurrent: boolean) => {
    const content = type === 'remove' ? leftContent : rightContent;
    return (
      <Text
        color={getColorForType(type)}
        bold={isCurrent}
      >
        {content}
      </Text>
    );
  };

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

      // Determine if this section should be folded
      const shouldFold = foldingEnabled && !hasChanges && maxLines > (contextLines * 2 + 1);
      const foldedLinesCount = shouldFold ? maxLines - (contextLines * 2) : 0;

      for (let i = 0; i < maxLines; i++) {
        // Handle folding: skip middle lines if this section is folded
        if (shouldFold) {
          if (i === contextLines) {
            // Insert fold placeholder
            if (globalLineIndex >= scrollOffset && globalLineIndex < scrollOffset + viewHeight) {
              lines.push(
                <Box key={`fold-${globalLineIndex}`} flexDirection="row">
                  <Box flexGrow={1} justifyContent="center">
                    <Text dimColor>
                      ⋯ {foldedLinesCount} unchanged lines (press F to unfold) ⋯
                    </Text>
                  </Box>
                </Box>
              );
            }
            globalLineIndex++;
            // Skip to last contextLines
            i = maxLines - contextLines - 1;
            // Update line numbers for skipped lines
            const skippedLines = foldedLinesCount;
            leftLineNum += skippedLines;
            rightLineNum += skippedLines;
            continue;
          }
        }

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

        // Check if we should show inline diff (both sides have content and are changes)
        const showInlineDiff = leftLine.type === 'remove' && rightLine.type === 'add' &&
                               leftLine.content && rightLine.content;

        lines.push(
          <Box key={globalLineIndex} flexDirection="row">
            {/* Left side with line number */}
            <Box flexGrow={1} flexShrink={1} flexBasis={0}>
              <Text color={isCurrentLine ? 'yellow' : 'gray'} bold={isCurrentLine}>
                {leftNum}{leftPrefix}
              </Text>
              {showInlineDiff ? (
                renderInlineDiff(leftLine.content, rightLine.content, 'remove', isCurrentLine)
              ) : (
                <Text
                  color={getColorForType(leftLine.type)}
                  bold={isCurrentLine}
                  dimColor={leftLine.type === 'empty'}
                >
                  {leftLine.content || (leftLine.type === 'empty' ? '⋯' : ' ')}
                </Text>
              )}
            </Box>

            {/* Divider with connection markers */}
            <Text color="cyan">{divider}</Text>

            {/* Right side with line number */}
            <Box flexGrow={1} flexShrink={1} flexBasis={0}>
              <Text color={isCurrentLine ? 'yellow' : 'gray'} bold={isCurrentLine}>
                {rightNum}{rightPrefix}
              </Text>
              {showInlineDiff ? (
                renderInlineDiff(leftLine.content, rightLine.content, 'add', isCurrentLine)
              ) : (
                <Text
                  color={getColorForType(rightLine.type)}
                  bold={isCurrentLine}
                  dimColor={rightLine.type === 'empty'}
                >
                  {rightLine.content || (rightLine.type === 'empty' ? '⋯' : ' ')}
                </Text>
              )}
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
          <Text color={foldingEnabled ? 'green' : 'gray'}> Fold:{foldingEnabled ? 'ON' : 'OFF'}</Text> |
          <Text color="gray"> ↑↓:line | n/p:section | u/d:page | f:fold | ?:help | q:quit</Text>
        </Text>
      </Box>

      {/* Help Modal Overlay */}
      {showHelp && (
        <Box
          position="absolute"
          width="100%"
          height="100%"
          justifyContent="center"
          alignItems="center"
        >
          <Box
            borderStyle="double"
            borderColor="cyan"
            paddingX={2}
            paddingY={1}
            flexDirection="column"
          >
            <Text bold color="cyan">Keyboard Shortcuts</Text>
            <Text> </Text>
            <Text><Text color="yellow">Navigation:</Text></Text>
            <Text>  ↑ / ↓         Navigate line by line</Text>
            <Text>  n / p         Jump to next/previous changed section</Text>
            <Text>  u / d         Page up / page down</Text>
            <Text>  Shift + ↑↓    Page up / page down (alternative)</Text>
            <Text>  Cmd/Ctrl + ↑↓ Jump sections (alternative)</Text>
            <Text> </Text>
            <Text><Text color="yellow">Actions:</Text></Text>
            <Text>  f             Toggle folding of unchanged sections</Text>
            <Text>  ?             Toggle this help screen</Text>
            <Text>  q / Ctrl+C    Quit</Text>
            <Text> </Text>
            <Text dimColor>Press ? or ESC to close</Text>
          </Box>
        </Box>
      )}
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
