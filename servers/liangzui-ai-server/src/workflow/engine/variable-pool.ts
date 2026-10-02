import {
  TEMPLATE_VARIABLE_PATTERN,
  selectorFromTemplateMatch,
  type ValueSelector,
} from '@ai-engine/contracts';
import type { VariablePoolReader } from './types';

const displayValue = (value: unknown): string => {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return '';
};

const readPath = (value: unknown, path: string[]): unknown => {
  let current = value;
  for (const segment of path) {
    if (typeof current !== 'object' || current === null || !(segment in current)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
};

export class VariablePool implements VariablePoolReader {
  private readonly values = new Map<string, Record<string, unknown>>();

  constructor(
    private readonly systemValues: Record<string, unknown>,
    initialValues: Record<string, Record<string, unknown>> = {},
  ) {
    for (const [nodeId, outputs] of Object.entries(initialValues)) {
      this.values.set(nodeId, structuredClone(outputs));
    }
  }

  get(selector: ValueSelector): unknown {
    const [namespace, ...path] = selector;
    if (!namespace) return undefined;
    const source = namespace === 'sys' ? this.systemValues : this.values.get(namespace);
    return readPath(source, path);
  }

  getSystem(name: string): unknown {
    return readPath(this.systemValues, name.split('.'));
  }

  render(template: string): string {
    return template.replace(TEMPLATE_VARIABLE_PATTERN, (_match, path: string) =>
      displayValue(this.get(selectorFromTemplateMatch(path))),
    );
  }

  set(nodeId: string, outputs: Record<string, unknown>): void {
    this.values.set(nodeId, structuredClone(outputs));
  }

  snapshot(): Record<string, Record<string, unknown>> {
    return Object.fromEntries(
      [...this.values.entries()].map(([nodeId, outputs]) => [nodeId, structuredClone(outputs)]),
    );
  }
}
