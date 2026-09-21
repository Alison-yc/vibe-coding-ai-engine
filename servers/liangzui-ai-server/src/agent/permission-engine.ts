import type {
  AgentMode,
  AgentToolName,
  PermissionEffect,
  PermissionKind,
  PermissionRule,
} from '@ai-engine/contracts';

export const DEFAULT_PERMISSION_RULES: PermissionRule[] = [
  { tool: 'read', resource: '**', effect: 'allow' },
  { tool: 'read', resource: '**/.env', effect: 'ask' },
  { tool: 'read', resource: '**/.env.*', effect: 'ask' },
  { tool: 'read', resource: '**/*.key', effect: 'ask' },
  { tool: 'read', resource: '**/*.pem', effect: 'ask' },
  { tool: 'read', resource: '**/.git/**', effect: 'ask' },
  { tool: 'write', resource: '**', effect: 'ask' },
  { tool: 'edit', resource: '**', effect: 'ask' },
  { tool: 'glob', resource: '**', effect: 'allow' },
  { tool: 'grep', resource: '**', effect: 'allow' },
  { tool: 'grep', resource: '**/.env', effect: 'ask' },
  { tool: 'grep', resource: '**/.env.*', effect: 'ask' },
  { tool: 'grep', resource: '**/*.key', effect: 'ask' },
  { tool: 'grep', resource: '**/*.pem', effect: 'ask' },
  { tool: '*', resource: '**/.env', effect: 'ask' },
  { tool: '*', resource: '**/.env.*', effect: 'ask' },
  { tool: '*', resource: '**/*.key', effect: 'ask' },
  { tool: '*', resource: '**/*.pem', effect: 'ask' },
  { tool: '*', resource: '**/.git/**', effect: 'ask' },
];

const escapeRegex = (value: string): string => value.replace(/[.+^${}()|[\]\\]/g, '\\$&');

export const matchesResource = (pattern: string, resource: string): boolean => {
  let expression = '';
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === '*' && pattern[index + 1] === '*') {
      if (pattern[index + 2] === '/') {
        expression += '(?:.*/)?';
        index += 2;
      } else {
        expression += '.*';
        index += 1;
      }
    } else if (character === '*') {
      expression += '[^/]*';
    } else if (character === '?') {
      expression += '[^/]';
    } else if (character) {
      expression += escapeRegex(character);
    }
  }
  return new RegExp(`^${expression}$`).test(resource);
};

const builtinKind = (tool: AgentToolName): PermissionKind => {
  if (tool === 'write' || tool === 'edit') return 'write';
  if (tool === 'read' || tool === 'glob' || tool === 'grep') return 'read';
  return 'execute';
};

export const evaluatePermission = (
  tool: AgentToolName,
  resource: string,
  mode: AgentMode,
  sessionRules: PermissionRule[] = [],
  kind: PermissionKind = builtinKind(tool),
): PermissionEffect => {
  if (mode === 'read-only' && kind !== 'read') return 'deny';
  let effect: PermissionEffect = kind === 'read' ? 'allow' : 'ask';
  for (const rule of [...DEFAULT_PERMISSION_RULES, ...sessionRules]) {
    if ((rule.tool === '*' || rule.tool === tool) && matchesResource(rule.resource, resource)) {
      effect = rule.effect;
    }
  }
  return effect;
};
