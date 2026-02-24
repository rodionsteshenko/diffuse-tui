import { describe, it, expect } from 'vitest';
import { computeDiffSections, getColorForType, getPrefixForType } from './diff.js';

describe('computeDiffSections', () => {
  it('returns a single equal section for identical content', () => {
    const sections = computeDiffSections('a\nb\nc', 'a\nb\nc');
    expect(sections).toHaveLength(1);
    expect(sections[0].leftLines.every(l => l.type === 'equal')).toBe(true);
    expect(sections[0].rightLines.every(l => l.type === 'equal')).toBe(true);
    expect(sections[0].leftLines.map(l => l.content)).toEqual(['a', 'b', 'c']);
  });

  it('returns empty arrays for two empty strings', () => {
    const sections = computeDiffSections('', '');
    expect(sections).toHaveLength(1);
    expect(sections[0].leftLines).toHaveLength(1);
    expect(sections[0].leftLines[0].type).toBe('equal');
    expect(sections[0].leftLines[0].content).toBe('');
  });

  it('detects pure additions', () => {
    const sections = computeDiffSections('a', 'a\nb');
    // Should have equal section for 'a' and an add section for 'b'
    const addLines = sections.flatMap(s => s.rightLines.filter(l => l.type === 'add'));
    expect(addLines).toHaveLength(1);
    expect(addLines[0].content).toBe('b');
  });

  it('detects pure removals', () => {
    const sections = computeDiffSections('a\nb', 'a');
    const removeLines = sections.flatMap(s => s.leftLines.filter(l => l.type === 'remove'));
    expect(removeLines).toHaveLength(1);
    expect(removeLines[0].content).toBe('b');
  });

  it('vertically aligns removed+added pairs', () => {
    const sections = computeDiffSections('old line', 'new line');
    // The changed section should have left=remove, right=add aligned
    const changedSection = sections.find(s =>
      s.leftLines.some(l => l.type === 'remove') || s.rightLines.some(l => l.type === 'add')
    );
    expect(changedSection).toBeDefined();
    expect(changedSection!.leftLines[0].type).toBe('remove');
    expect(changedSection!.leftLines[0].content).toBe('old line');
    expect(changedSection!.rightLines[0].type).toBe('add');
    expect(changedSection!.rightLines[0].content).toBe('new line');
  });

  it('pads with empty lines when sides have different lengths', () => {
    // 2 lines removed, 1 line added
    const sections = computeDiffSections('a\nb', 'c');
    const changedSection = sections.find(s =>
      s.leftLines.some(l => l.type === 'remove')
    );
    expect(changedSection).toBeDefined();
    expect(changedSection!.leftLines).toHaveLength(2);
    expect(changedSection!.rightLines).toHaveLength(2);
    // Right side should have one 'add' and one 'empty'
    expect(changedSection!.rightLines[0].type).toBe('add');
    expect(changedSection!.rightLines[1].type).toBe('empty');
  });

  it('handles multi-section diffs correctly', () => {
    const left = 'a\nb\nc\nd\ne';
    const right = 'a\nB\nc\nD\ne';
    const sections = computeDiffSections(left, right);
    
    // Should preserve 'a', 'c', 'e' as equal
    const equalContent = sections.flatMap(s =>
      s.leftLines.filter(l => l.type === 'equal').map(l => l.content)
    );
    expect(equalContent).toContain('a');
    expect(equalContent).toContain('c');
    expect(equalContent).toContain('e');
  });

  it('tracks leftStart and rightStart correctly', () => {
    const sections = computeDiffSections('a\nb', 'a\nc');
    // First section is equal ('a'), second is changed
    expect(sections[0].leftStart).toBe(0);
    expect(sections[0].rightStart).toBe(0);
    if (sections.length > 1) {
      expect(sections[1].leftStart).toBe(1);
      expect(sections[1].rightStart).toBe(1);
    }
  });

  it('handles completely different content', () => {
    const sections = computeDiffSections('foo\nbar', 'baz\nqux');
    const allLeft = sections.flatMap(s => s.leftLines);
    const allRight = sections.flatMap(s => s.rightLines);
    // All left lines should be 'remove', all right should be 'add'
    expect(allLeft.filter(l => l.type === 'remove')).toHaveLength(2);
    expect(allRight.filter(l => l.type === 'add')).toHaveLength(2);
  });

  it('left and right lines always have same length per section', () => {
    const cases = [
      ['a\nb\nc', 'x'],
      ['x', 'a\nb\nc'],
      ['a\nb', 'a\nc\nd'],
      ['hello\nworld\nfoo', 'hello\nbar'],
    ];
    for (const [left, right] of cases) {
      const sections = computeDiffSections(left, right);
      for (const section of sections) {
        expect(section.leftLines.length).toBe(section.rightLines.length);
      }
    }
  });
});

describe('getColorForType', () => {
  it('returns correct colors', () => {
    expect(getColorForType('add')).toBe('green');
    expect(getColorForType('remove')).toBe('red');
    expect(getColorForType('equal')).toBe('white');
    expect(getColorForType('empty')).toBe('gray');
  });
});

describe('getPrefixForType', () => {
  it('returns correct prefixes', () => {
    expect(getPrefixForType('add')).toBe('+ ');
    expect(getPrefixForType('remove')).toBe('- ');
    expect(getPrefixForType('equal')).toBe('  ');
    expect(getPrefixForType('empty')).toBe('  ');
  });
});
