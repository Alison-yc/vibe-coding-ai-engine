import {
  TEMPLATE_VARIABLE_PATTERN,
  selectorFromTemplateMatch,
  type ValueSelector,
} from '@ai-engine/contracts';

export const templateSelectors = (template: string): ValueSelector[] =>
  [...template.matchAll(TEMPLATE_VARIABLE_PATTERN)].map((match) =>
    selectorFromTemplateMatch(match[1] ?? ''),
  );
