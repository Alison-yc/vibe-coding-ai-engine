import type { NodeType } from '@ai-engine/contracts';
import type { ComponentType } from 'react';
import type { NodeDefinition, NodeBodyProps, NodePanelProps } from './types';
import { NodeMetadataMap } from './metadata';
import { StartNodeBody } from './start/node';
import { StartNodePanel } from './start/panel';
import { EndNodeBody } from './end/node';
import { EndNodePanel } from './end/panel';
import { VariableAssignerNodeBody } from './variable-assigner/node';
import { VariableAssignerNodePanel } from './variable-assigner/panel';
import { IfElseNodeBody } from './if-else/node';
import { IfElseNodePanel } from './if-else/panel';
import { LlmNodeBody } from './llm/node';
import { LlmNodePanel } from './llm/panel';
import { KnowledgeRetrievalNodeBody } from './knowledge-retrieval/node';
import { KnowledgeRetrievalNodePanel } from './knowledge-retrieval/panel';
import { HttpRequestNodeBody } from './http-request/node';
import { HttpRequestNodePanel } from './http-request/panel';
import { CodeNodeBody } from './code/node';
import { CodeNodePanel } from './code/panel';

export const NodeComponentMap: Record<NodeType, ComponentType<NodeBodyProps>> = {
  start: StartNodeBody,
  end: EndNodeBody,
  'variable-assigner': VariableAssignerNodeBody,
  'if-else': IfElseNodeBody,
  llm: LlmNodeBody,
  'knowledge-retrieval': KnowledgeRetrievalNodeBody,
  'http-request': HttpRequestNodeBody,
  code: CodeNodeBody,
};

export const PanelComponentMap: Record<NodeType, ComponentType<NodePanelProps>> = {
  start: StartNodePanel,
  end: EndNodePanel,
  'variable-assigner': VariableAssignerNodePanel,
  'if-else': IfElseNodePanel,
  llm: LlmNodePanel,
  'knowledge-retrieval': KnowledgeRetrievalNodePanel,
  'http-request': HttpRequestNodePanel,
  code: CodeNodePanel,
};

const definition = (type: NodeType): NodeDefinition => ({
  type,
  ...NodeMetadataMap[type],
  Body: NodeComponentMap[type],
  Panel: PanelComponentMap[type],
});

export const NodeDefinitions: Record<NodeType, NodeDefinition> = {
  start: definition('start'),
  end: definition('end'),
  'variable-assigner': definition('variable-assigner'),
  'if-else': definition('if-else'),
  llm: definition('llm'),
  'knowledge-retrieval': definition('knowledge-retrieval'),
  'http-request': definition('http-request'),
  code: definition('code'),
};
