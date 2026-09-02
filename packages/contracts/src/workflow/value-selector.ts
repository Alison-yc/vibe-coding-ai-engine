import { z } from 'zod';

export const ValueSelectorSchema = z.array(z.string().min(1)).min(2);
export type ValueSelector = z.infer<typeof ValueSelectorSchema>;

export const TEMPLATE_VARIABLE_PATTERN = /\{\{#([A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)+)#\}\}/g;

export const selectorFromTemplateMatch = (path: string): ValueSelector => path.split('.');
