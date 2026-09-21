import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    files: [
      'clients/**/src/**/*.{ts,tsx}',
      'frontend/**/src/**/*.{ts,tsx}',
      'packages/{ui,app-core,platform}/src/**/*.{ts,tsx}',
    ],
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.flat.recommended.rules,
    },
  },
];
