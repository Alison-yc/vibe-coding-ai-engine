const WORKSPACE_PACKAGES = ['app-core', 'contracts', 'eslint-config', 'platform', 'tsconfig', 'ui'];

const PARENT_PREFIXES = [
  '..',
  '../..',
  '../../..',
  '../../../..',
  '../../../../..',
  '../../../../../..',
];

export const CROSS_PACKAGE_IMPORT_MESSAGE =
  '跨包引用必须用包名（@ai-engine/xxx），不能用相对路径穿透。';

export const createCrossPackageImportGroups = () => {
  const group = [];

  for (const prefix of PARENT_PREFIXES) {
    group.push(`${prefix}/packages/**`);
    for (const pkg of WORKSPACE_PACKAGES) {
      group.push(`${prefix}/${pkg}`);
      group.push(`${prefix}/${pkg}/**`);
    }
  }

  return [
    {
      group,
      message: CROSS_PACKAGE_IMPORT_MESSAGE,
    },
  ];
};

export const createRestrictedImportRule = (extraPatterns = []) => [
  'error',
  {
    patterns: [...createCrossPackageImportGroups(), ...extraPatterns],
  },
];
