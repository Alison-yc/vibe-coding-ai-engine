import globals from 'globals';
import tseslint from 'typescript-eslint';

const testFiles = [
  '**/*.{test,spec}.{js,ts,tsx}',
  '**/__tests__/**/*.{js,ts,tsx}',
  '**/test/**/*.{ts,tsx}',
];

export default [
  {
    ...tseslint.configs.disableTypeChecked,
    files: testFiles,
    languageOptions: {
      ...tseslint.configs.disableTypeChecked.languageOptions,
      parser: tseslint.parser,
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      ...tseslint.configs.disableTypeChecked.rules,
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-console': 'off',
      'no-restricted-globals': 'off',
      'no-restricted-properties': 'off',
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'MemberExpression[object.name=/^(it|test|describe)$/][property.name=/^(only|skip)$/]',
          message: '不要把 .only / .skip 提交到主干。',
        },
      ],
    },
  },
];
