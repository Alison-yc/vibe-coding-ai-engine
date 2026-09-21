const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

const assertSemver = (version: string): string => {
  if (!SEMVER_PATTERN.test(version)) {
    throw new Error(`应用版本必须是有效 SemVer：${version}`);
  }
  return version;
};

const utcTimestamp = (date: Date): string =>
  [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
    String(date.getUTCHours()).padStart(2, '0'),
    String(date.getUTCMinutes()).padStart(2, '0'),
    String(date.getUTCSeconds()).padStart(2, '0'),
  ].join('');

export const resolveTauriBuildVersion = (
  baseVersion: string,
  environment: Record<string, string | undefined>,
  now = new Date(),
): string => {
  const explicit = environment.AI_ENGINE_APP_VERSION?.trim();
  if (explicit) return assertSemver(explicit);

  const tag =
    environment.GITHUB_REF_TYPE === 'tag' ? environment.GITHUB_REF_NAME?.trim() : undefined;
  if (tag?.startsWith('v')) return assertSemver(tag.slice(1));

  const [major, minor] = assertSemver(baseVersion).split('.');
  return `${major}.${minor}.${utcTimestamp(now)}`;
};
