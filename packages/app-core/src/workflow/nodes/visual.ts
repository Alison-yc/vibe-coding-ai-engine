import type { NodeType } from '@ai-engine/contracts';
import type { ComponentType, SVGProps } from 'react';
import { Bot, Braces, Flag, Globe, Play, Shuffle, Variable, Wrench } from '@ai-engine/ui';
import type { NodeCategory } from './metadata';

export const categoryAccentClass: Record<NodeCategory, string> = {
  flow: 'bg-node-cat-flow',
  data: 'bg-node-cat-data',
  ai: 'bg-node-cat-ai',
  tools: 'bg-node-cat-tools',
};

export const categoryBorderClass: Record<NodeCategory, string> = {
  flow: 'border-l-node-cat-flow',
  data: 'border-l-node-cat-data',
  ai: 'border-l-node-cat-ai',
  tools: 'border-l-node-cat-tools',
};

type NodeIcon = ComponentType<SVGProps<SVGSVGElement>>;

export const NodeIconMap: Record<NodeType, NodeIcon> = {
  start: Play,
  end: Flag,
  'variable-assigner': Variable,
  'if-else': Shuffle,
  llm: Bot,
  'knowledge-retrieval': Braces,
  'http-request': Globe,
  code: Wrench,
};
