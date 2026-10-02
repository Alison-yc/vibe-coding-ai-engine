export const applyAppTheme = (root: {
  classList: { remove: (token: string) => void };
  removeAttribute: (name: string) => void;
}): void => {
  root.removeAttribute('data-theme');
  root.classList.remove('dark');
};

/** @deprecated 固定 light 品牌主题，保留别名供旧调用方迁移 */
export const applyDocumentTheme = (
  root: Parameters<typeof applyAppTheme>[0],
  _palette?: unknown,
  _appearance?: unknown,
): void => {
  applyAppTheme(root);
};
