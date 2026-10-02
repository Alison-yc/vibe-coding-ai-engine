export type FileCoverage = {
  path: string;
  linesPct: number;
};

export type RankedFile = FileCoverage & {
  threshold: number;
  weight: number;
  deficit: number;
};

export type CoverageSummary = {
  files: FileCoverage[];
};

type SummaryFile = {
  lines?: { pct?: number };
};

export const parseCoverageSummary = (
  raw: Record<string, unknown>,
  repoRoot: string,
): CoverageSummary => {
  const files: FileCoverage[] = [];
  for (const [key, value] of Object.entries(raw)) {
    if (key === 'total' || typeof value !== 'object' || value === null) continue;
    const linesPct = (value as SummaryFile).lines?.pct;
    if (typeof linesPct !== 'number') continue;
    const normalized = key.startsWith(repoRoot)
      ? key
          .slice(repoRoot.length)
          .replace(/^[/\\]/, '')
          .split('\\')
          .join('/')
      : key.split('\\').join('/');
    files.push({ path: normalized, linesPct });
  }
  return { files };
};

export const thresholdFor = (filePath: string): number => {
  if (filePath.includes('packages/contracts/')) return 95;
  if (filePath.includes('/workflow/')) return 90;
  if (filePath.includes('/agent/')) return 90;
  if (filePath.includes('/knowledge/')) return 85;
  if (filePath.includes('servers/')) return 80;
  if (filePath.includes('packages/app-core/')) return 70;
  if (filePath.includes('clients/') || filePath.includes('frontend/')) return 50;
  return 75;
};

export const importanceWeight = (filePath: string): number => {
  if (filePath.includes('/workflow/') || filePath.includes('/agent/')) return 3;
  if (filePath.includes('/knowledge/') || filePath.includes('/chat/') || filePath.includes('/llm/'))
    return 2;
  if (filePath.includes('packages/app-core/')) return 1.2;
  return 1;
};

const SKIP = /(\.spec|\.test)\.[cm]?[jt]sx?$|\/index\.ts$|\.d\.ts$|\/drizzle\/|generated/i;

export const rankLowCoverageFiles = (summary: CoverageSummary): RankedFile[] =>
  summary.files
    .filter((file) => !SKIP.test(file.path))
    .map((file) => {
      const threshold = thresholdFor(file.path);
      const weight = importanceWeight(file.path);
      return {
        ...file,
        threshold,
        weight,
        deficit: (threshold - file.linesPct) * weight,
      };
    })
    .filter((file) => file.deficit > 0)
    .sort((left, right) => right.deficit - left.deficit);
