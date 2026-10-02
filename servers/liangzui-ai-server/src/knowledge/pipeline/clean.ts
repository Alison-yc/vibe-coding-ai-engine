export type CleanResult = {
  text: string;
  charCountBefore: number;
  charCountAfter: number;
};

const isControlChar = (char: string): boolean => {
  const code = char.codePointAt(0) ?? 0;
  return (code <= 31 && code !== 9 && code !== 10) || code === 127;
};

const stripRepeatedHeaders = (text: string): string => {
  const lines = text.split('\n');
  const counts = new Map<string, number>();
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 0 && trimmed.length <= 40) {
      counts.set(trimmed, (counts.get(trimmed) ?? 0) + 1);
    }
  }
  const repeated = new Set(
    [...counts.entries()].filter(([, count]) => count >= 3).map(([line]) => line),
  );
  if (repeated.size === 0) return text;
  return lines.filter((line) => !repeated.has(line.trim())).join('\n');
};

export const cleanDocumentText = (input: string): CleanResult => {
  const charCountBefore = input.length;
  const normalized = input.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
  const withoutControls = [...normalized].filter((char) => !isControlChar(char)).join('');
  const collapsed = withoutControls.replace(/\n{3,}/gu, '\n\n');
  const text = stripRepeatedHeaders(collapsed).trim();
  return { text, charCountBefore, charCountAfter: text.length };
};
