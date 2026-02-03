import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import * as Diff from 'diff';
import { writeFileSync } from 'fs';

interface AppProps {
  leftContent: string;
  rightContent: string;
  leftFile: string;
  rightFile: string;
  onSave?: (content: string) => void;
}

interface DiffSection {
  leftStart: number;
  rightStart: number;
  leftLines: Array<{ content: string; type: 'equal' | 'remove' | 'add' | 'empty' }>;
  rightLines: Array<{ content: string; type: 'equal' | 'remove' | 'add' | 'empty' }>;
}

export const App: React.FC<AppProps> = ({ leftContent, rightContent, leftFile, rightFile, onSave }) => {
  const { exit } = useApp();
  const [currentLine, setCurrentLine] = useState(0);
  const [currentSection, setCurrentSection] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [diffSections, setDiffSections] = useState<DiffSection[]>([]);
  const [totalLines, setTotalLines] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const [foldingEnabled, setFoldingEnabled] = useState(true);
  const [horizontalOffset, setHorizontalOffset] = useState(0);
  const contextLines = 3; // Number of context lines to show above/below changes

  // Editing state
  const [editedRightContent, setEditedRightContent] = useState(rightContent);
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // Check if file has been edited
  const isEdited = editedRightContent !== rightContent;

  const terminalHeight = process.stdout.rows || 24;
  const terminalWidth = process.stdout.columns || 80;
  // Header with border: 3 lines (top border + content + bottom border)
  // Footer with border: 3 lines (top border + content + bottom border)
  const viewHeight = terminalHeight - 6;

  // Calculate available width per column (accounting for line numbers, prefix, divider)
  // Layout: [lineNum(4)][prefix(2)][content] │ [lineNum(4)][prefix(2)][content]
  // Divider takes 3 chars: " │ "
  const columnWidth = Math.floor((terminalWidth - 3) / 2); // Each side gets half minus divider
  const contentWidth = Math.max(10, columnWidth - 6); // Subtract line number (4) and prefix (2), min 10 chars

  // Helper to compute display line count for a section (accounts for folding)
  const getSectionDisplayLines = (section: DiffSection) => {
    const maxLines = Math.max(section.leftLines.length, section.rightLines.length);
    const hasChanges = section.leftLines.some(l => l.type !== 'equal') ||
                      section.rightLines.some(l => l.type !== 'equal');
    const shouldFold = foldingEnabled && !hasChanges && maxLines > (contextLines * 2 + 1);
    return shouldFold ? (contextLines * 2 + 1) : maxLines;
  };

  useEffect(() => {
    const sections = computeDiffSections(leftContent, editedRightContent);
    setDiffSections(sections);
  }, [leftContent, editedRightContent]);

  // Calculate total display lines accounting for folding
  useEffect(() => {
    const total = diffSections.reduce((sum, section) => sum + getSectionDisplayLines(section), 0);
    setTotalLines(total);
  }, [diffSections, foldingEnabled]);

  // Clamp currentLine if it exceeds totalLines (e.g., when folding is toggled)
  useEffect(() => {
    if (currentLine >= totalLines && totalLines > 0) {
      setCurrentLine(totalLines - 1);
    }
  }, [totalLines]);

  // Clear save message after a delay
  useEffect(() => {
    if (saveMessage) {
      const timer = setTimeout(() => setSaveMessage(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [saveMessage]);

  // Get current line info (section index and line within section)
  const getCurrentLineInfo = useCallback(() => {
    let lineCount = 0;
    for (let i = 0; i < diffSections.length; i++) {
      const sectionLines = getSectionDisplayLines(diffSections[i]);
      if (currentLine < lineCount + sectionLines) {
        return { sectionIndex: i, lineInSection: currentLine - lineCount };
      }
      lineCount += sectionLines;
    }
    return null;
  }, [currentLine, diffSections, foldingEnabled]);

  // Copy diff from left to right for current section
  const copyLeftToRight = useCallback(() => {
    const info = getCurrentLineInfo();
    if (!info) return;

    const section = diffSections[info.sectionIndex];
    if (!section) return;

    // Only copy if this section has changes
    const hasChanges = section.leftLines.some(l => l.type !== 'equal') ||
                      section.rightLines.some(l => l.type !== 'equal');
    if (!hasChanges) return;

    // Save current state for undo
    setUndoStack(prev => [...prev, editedRightContent]);

    // Convert editedRightContent to lines array
    const rightLines = editedRightContent.split('\n');

    // Find the actual line numbers for this section
    // We need to map display lines back to actual right file lines
    let actualRightLineStart = 0;
    let count = 0;
    for (let i = 0; i < info.sectionIndex; i++) {
      for (const line of diffSections[i].rightLines) {
        if (line.type !== 'empty') {
          actualRightLineStart++;
        }
      }
    }

    // Count non-empty right lines in this section
    const rightLinesToRemove = section.rightLines.filter(l => l.type !== 'empty').length;

    // Get the content from left side (non-empty lines only)
    const leftLinesToAdd = section.leftLines
      .filter(l => l.type !== 'empty')
      .map(l => l.content);

    // Replace the right side lines with left side lines
    rightLines.splice(actualRightLineStart, rightLinesToRemove, ...leftLinesToAdd);

    setEditedRightContent(rightLines.join('\n'));
    setSaveMessage('Copied diff from left to right');
  }, [getCurrentLineInfo, diffSections, editedRightContent]);

  // Copy diff from right to left (undo a copy - restore original right content for section)
  const copyRightToLeft = useCallback(() => {
    const info = getCurrentLineInfo();
    if (!info) return;

    const section = diffSections[info.sectionIndex];
    if (!section) return;

    // Save current state for undo
    setUndoStack(prev => [...prev, editedRightContent]);

    // Get original right content for this section
    const originalRightLines = rightContent.split('\n');
    const currentRightLines = editedRightContent.split('\n');

    // Find the actual line numbers for this section in original
    let originalRightLineStart = 0;
    const originalSections = computeDiffSections(leftContent, rightContent);
    for (let i = 0; i < Math.min(info.sectionIndex, originalSections.length); i++) {
      for (const line of originalSections[i].rightLines) {
        if (line.type !== 'empty') {
          originalRightLineStart++;
        }
      }
    }

    // Get original right lines for this section
    const origSection = originalSections[info.sectionIndex];
    if (!origSection) return;

    const originalLinesToRestore = origSection.rightLines
      .filter(l => l.type !== 'empty')
      .map(l => l.content);

    // Find current position in edited content
    let currentRightLineStart = 0;
    for (let i = 0; i < info.sectionIndex; i++) {
      for (const line of diffSections[i].rightLines) {
        if (line.type !== 'empty') {
          currentRightLineStart++;
        }
      }
    }

    const currentLinesToRemove = section.rightLines.filter(l => l.type !== 'empty').length;

    // Replace current lines with original lines
    currentRightLines.splice(currentRightLineStart, currentLinesToRemove, ...originalLinesToRestore);

    setEditedRightContent(currentRightLines.join('\n'));
    setSaveMessage('Restored original right content');
  }, [getCurrentLineInfo, diffSections, editedRightContent, rightContent, leftContent]);

  // Save edited content to file
  const saveFile = useCallback(() => {
    try {
      if (onSave) {
        onSave(editedRightContent);
      } else {
        writeFileSync(rightFile, editedRightContent);
      }
      setSaveMessage(`Saved to ${rightFile}`);
    } catch (error) {
      setSaveMessage(`Error saving: ${error}`);
    }
  }, [editedRightContent, rightFile, onSave]);

  // Undo last edit
  const undoLastEdit = useCallback(() => {
    if (undoStack.length === 0) {
      setSaveMessage('Nothing to undo');
      return;
    }
    const previousState = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, -1));
    setEditedRightContent(previousState);
    setSaveMessage('Undone');
  }, [undoStack]);

  // Handle quit with confirmation
  const handleQuit = useCallback(() => {
    if (isEdited) {
      setShowQuitConfirm(true);
    } else {
      exit();
    }
  }, [isEdited, exit]);

  useEffect(() => {
    // Auto-scroll to keep current line visible
    if (currentLine < scrollOffset) {
      setScrollOffset(currentLine);
    } else if (currentLine >= scrollOffset + viewHeight) {
      setScrollOffset(currentLine - viewHeight + 1);
    }
  }, [currentLine, viewHeight]);

  useInput((input: string, key: any) => {
    // Handle quit confirmation modal
    if (showQuitConfirm) {
      if (input === 'y' || input === 'Y') {
        saveFile();
        exit();
      } else if (input === 'n' || input === 'N') {
        exit();
      } else if (key.escape || input === 'c' || input === 'C') {
        setShowQuitConfirm(false);
      }
      return;
    }

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

    // Save file (Ctrl+S)
    if (key.ctrl && input === 's') {
      saveFile();
      return;
    }

    // Undo (Ctrl+Z)
    if (key.ctrl && input === 'z') {
      undoLastEdit();
      return;
    }

    // Copy left to right: ] or >
    if (input === ']' || input === '>') {
      copyLeftToRight();
      return;
    }

    // Undo last edit: [ or < (same as Ctrl+Z)
    if (input === '[' || input === '<') {
      undoLastEdit();
      return;
    }

    // Toggle folding
    if (input === 'f' || input === 'F') {
      setFoldingEnabled(!foldingEnabled);
      return;
    }

    // Horizontal scrolling
    if (key.leftArrow && !key.shift && !key.meta && !key.ctrl) {
      setHorizontalOffset(Math.max(0, horizontalOffset - 5));
      return;
    }
    if (key.rightArrow && !key.shift && !key.meta && !key.ctrl) {
      setHorizontalOffset(horizontalOffset + 5);
      return;
    }

    if (input === 'q' || (key.ctrl && input === 'c')) {
      handleQuit();
      return;
    }

    // Section navigation with n/p keys or Cmd/Ctrl+arrows
    const jumpToPrevSection = () => {
      // Find the first section with changes before current line
      let targetSection = -1;
      let targetLineOffset = 0;
      let lineCount = 0;

      for (let i = 0; i < diffSections.length; i++) {
        const sectionLines = getSectionDisplayLines(diffSections[i]);
        const hasChanges = diffSections[i].leftLines.some(l => l.type !== 'equal') ||
                          diffSections[i].rightLines.some(l => l.type !== 'equal');

        if (lineCount < currentLine && hasChanges) {
          targetSection = i;
          targetLineOffset = lineCount;
        }
        lineCount += sectionLines;
      }

      if (targetSection >= 0) {
        setCurrentLine(targetLineOffset);
      }
    };

    const jumpToNextSection = () => {
      // Find the first section with changes after current line
      let lineCount = 0;

      for (let i = 0; i < diffSections.length; i++) {
        const sectionLines = getSectionDisplayLines(diffSections[i]);

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
      const sectionLines = getSectionDisplayLines(diffSections[i]);
      if (currentLine < lineCount + sectionLines) {
        setCurrentSection(i);
        break;
      }
      lineCount += sectionLines;
    }
  }, [currentLine, diffSections, foldingEnabled]);



  const renderLines = () => {
    const lines: JSX.Element[] = [];
    let globalLineIndex = 0;
    let leftLineNum = 1;
    let rightLineNum = 1;
    let viewportFull = false;

    for (const section of diffSections) {
      if (viewportFull) break;

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
          viewportFull = true;
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

        // Simple consistent divider
        const divider = ' │ ';

        // Get content for each side, applying horizontal scroll and truncation
        const applyScrollAndTruncate = (text: string, maxWidth: number) => {
          let result = text;
          if (horizontalOffset > 0) {
            result = result.substring(horizontalOffset);
          }
          // Truncate to prevent line wrapping
          if (result.length > maxWidth) {
            result = result.substring(0, maxWidth - 1) + '…';
          }
          return result;
        };
        // For 'empty' type (padding), show ⋯. For added/removed empty lines, show nothing (they still have line numbers)
        const getDisplayContent = (line: { content: string; type: string }) => {
          if (line.type === 'empty') return '⋯';
          return line.content;
        };
        const leftContent = applyScrollAndTruncate(getDisplayContent(leftLine), contentWidth);
        const rightContent = applyScrollAndTruncate(getDisplayContent(rightLine), contentWidth);

        // Build complete line strings, padded to fixed width
        const padToWidth = (str: string, width: number) => {
          if (str.length >= width) return str.substring(0, width);
          return str + ' '.repeat(width - str.length);
        };
        const leftLine_str = padToWidth(`${leftNum}${leftPrefix}${leftContent}`, columnWidth);
        const rightLine_str = padToWidth(`${rightNum}${rightPrefix}${rightContent}`, columnWidth);

        lines.push(
          <Box key={globalLineIndex} flexDirection="row" width={terminalWidth}>
            {/* Left side */}
            <Text
              color={isCurrentLine ? 'yellow' : getColorForType(leftLine.type)}
              bold={isCurrentLine}
              dimColor={leftLine.type === 'empty'}
              wrap="truncate"
            >
              {leftLine_str}
            </Text>

            {/* Divider */}
            <Text color="cyan">{divider}</Text>

            {/* Right side */}
            <Text
              color={isCurrentLine ? 'yellow' : getColorForType(rightLine.type)}
              bold={isCurrentLine}
              dimColor={rightLine.type === 'empty'}
              wrap="truncate"
            >
              {rightLine_str}
            </Text>
          </Box>
        );

        // Increment line numbers
        const leftWasIncr = leftLine.type !== 'empty';
        const rightWasIncr = rightLine.type !== 'empty';
        if (leftWasIncr) leftLineNum++;
        if (rightWasIncr) rightLineNum++;
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
          <Text color={foldingEnabled ? 'green' : 'gray'}> Fold:{foldingEnabled ? 'ON' : 'OFF'}</Text>
          {isEdited && <Text color="yellow" bold> [MODIFIED]</Text>}
          {saveMessage && <Text color="cyan"> | {saveMessage}</Text>}
          {horizontalOffset > 0 && <Text color="yellow"> | Scroll→{horizontalOffset}</Text>} |
          <Text color="gray"> ]:copy | ^S:save | ?:help</Text>
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
            <Text><Text color="yellow">View:</Text></Text>
            <Text>  ← / →         Horizontal scroll</Text>
            <Text>  f             Toggle folding of unchanged sections</Text>
            <Text> </Text>
            <Text><Text color="yellow">Editing:</Text></Text>
            <Text>  ] or &gt;        Copy diff from left to right</Text>
            <Text>  [ or &lt;        Undo last edit (same as Ctrl+Z)</Text>
            <Text>  Ctrl + S      Save changes to right file</Text>
            <Text>  Ctrl + Z      Undo last edit</Text>
            <Text> </Text>
            <Text><Text color="yellow">Actions:</Text></Text>
            <Text>  ?             Toggle this help screen</Text>
            <Text>  q / Ctrl+C    Quit</Text>
            <Text> </Text>
            <Text dimColor>Press ? or ESC to close</Text>
          </Box>
        </Box>
      )}

      {/* Quit Confirmation Modal */}
      {showQuitConfirm && (
        <Box
          position="absolute"
          width="100%"
          height="100%"
          justifyContent="center"
          alignItems="center"
        >
          <Box
            borderStyle="double"
            borderColor="yellow"
            paddingX={2}
            paddingY={1}
            flexDirection="column"
          >
            <Text bold color="yellow">Unsaved Changes</Text>
            <Text> </Text>
            <Text>You have unsaved changes to {rightFile}.</Text>
            <Text>Save before quitting?</Text>
            <Text> </Text>
            <Text>  <Text color="green" bold>Y</Text> - Save and quit</Text>
            <Text>  <Text color="red" bold>N</Text> - Quit without saving</Text>
            <Text>  <Text color="gray" bold>C</Text> / ESC - Cancel</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
};

function computeDiffSections(left: string, right: string): DiffSection[] {
  const leftLines = left.split('\n');
  const rightLines = right.split('\n');

  // Use diffArrays for cleaner line-by-line comparison
  const changes = Diff.diffArrays(leftLines, rightLines);

  const sections: DiffSection[] = [];
  let leftIndex = 0;
  let rightIndex = 0;

  // Process changes and merge adjacent removed/added sections for vertical alignment
  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];
    const lines = Array.isArray(change.value) ? change.value : [change.value];

    const section: DiffSection = {
      leftStart: leftIndex,
      rightStart: rightIndex,
      leftLines: [],
      rightLines: [],
    };

    if (change.removed && i + 1 < changes.length && changes[i + 1].added) {
      // Removed section followed by added section - merge them with vertical alignment
      const nextChange = changes[i + 1];
      const nextLines = Array.isArray(nextChange.value) ? nextChange.value : [nextChange.value];

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
