// Dump mode - non-interactive output for testing
// This is a minimal implementation for build compatibility

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
  const leftLines = leftContent.split('\n');
  const rightLines = rightContent.split('\n');
  const maxLines = Math.max(leftLines.length, rightLines.length);
  
  console.log(`--- ${leftFile}`);
  console.log(`+++ ${rightFile}`);
  console.log('');
  
  for (let i = 0; i < maxLines; i++) {
    const left = leftLines[i] || '';
    const right = rightLines[i] || '';
    
    if (left === right) {
      console.log(`  ${left}`);
    } else {
      if (left) console.log(`- ${left}`);
      if (right) console.log(`+ ${right}`);
    }
  }
}
