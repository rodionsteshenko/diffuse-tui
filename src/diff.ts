import * as Diff from 'diff';

export interface DiffLine {
  content: string;
  type: 'equal' | 'remove' | 'add' | 'empty';
}

export interface DiffSection {
  leftStart: number;
  rightStart: number;
  leftLines: DiffLine[];
  rightLines: DiffLine[];
}

export function computeDiffSections(left: string, right: string): DiffSection[] {
  const leftLines = left.split('\n');
  const rightLines = right.split('\n');

  const changes = Diff.diffArrays(leftLines, rightLines);

  const sections: DiffSection[] = [];
  let leftIndex = 0;
  let rightIndex = 0;

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
      // Removed followed by added - merge with vertical alignment
      const nextChange = changes[i + 1];
      const nextLines = Array.isArray(nextChange.value) ? nextChange.value : [nextChange.value];

      const maxLen = Math.max(lines.length, nextLines.length);

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

      i++; // Skip next change (already processed)
    } else if (change.added) {
      for (const line of lines) {
        section.leftLines.push({ content: '', type: 'empty' });
        section.rightLines.push({ content: line, type: 'add' });
        rightIndex++;
      }
    } else if (change.removed) {
      for (const line of lines) {
        section.leftLines.push({ content: line, type: 'remove' });
        section.rightLines.push({ content: '', type: 'empty' });
        leftIndex++;
      }
    } else {
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

export function getColorForType(type: DiffLine['type']): string {
  switch (type) {
    case 'add': return 'green';
    case 'remove': return 'red';
    case 'equal': return 'white';
    case 'empty': return 'gray';
    default: return 'white';
  }
}

export function getPrefixForType(type: DiffLine['type']): string {
  switch (type) {
    case 'add': return '+ ';
    case 'remove': return '- ';
    case 'equal': return '  ';
    case 'empty': return '  ';
    default: return '  ';
  }
}
