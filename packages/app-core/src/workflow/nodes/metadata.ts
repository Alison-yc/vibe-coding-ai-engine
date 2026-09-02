import type { NodeType } from '@ai-engine/contracts';
import type { TFunction } from 'i18next';
import type { OutputVariable } from './types';
import { startDefaultConfig, startOutputVars, validateStartConfig } from './start/default';
import { endDefaultConfig, endOutputVars, validateEndConfig } from './end/default';
import {
  variableAssignerDefaultConfig,
  variableAssignerOutputVars,
  validateVariableAssignerConfig,
} from './variable-assigner/default';
import {
  ifElseDefaultConfig,
  ifElseOutputVars,
  ifElseSourceHandles,
  validateIfElseConfig,
} from './if-else/default';
import { llmDefaultConfig, llmOutputVars, validateLlmConfig } from './llm/default';
import {
  knowledgeRetrievalDefaultConfig,
  knowledgeRetrievalOutputVars,
  validateKnowledgeRetrievalConfig,
} from './knowledge-retrieval/default';
import {
  httpRequestDefaultConfig,
  httpRequestOutputVars,
  validateHttpRequestConfig,
} from './http-request/default';
import { codeDefaultConfig, codeOutputVars, validateCodeConfig } from './code/default';

export type NodeMetadata = {
  acceptsInput: boolean;
  providesOutput: boolean;
  singleton?: boolean;
  defaultConfig: Record<string, unknown>;
  getOutputVars: (config: Record<string, unknown>) => OutputVariable[];
  getSourceHandles?: (config: Record<string, unknown>) => string[];
  checkValid: (config: Record<string, unknown>) => string[];
};

export const NodeMetadataMap: Record<NodeType, NodeMetadata> = {
  start: {
    acceptsInput: false,
    providesOutput: true,
    singleton: true,
    defaultConfig: startDefaultConfig,
    getOutputVars: startOutputVars,
    checkValid: validateStartConfig,
  },
  end: {
    acceptsInput: true,
    providesOutput: false,
    singleton: true,
    defaultConfig: endDefaultConfig,
    getOutputVars: endOutputVars,
    checkValid: validateEndConfig,
  },
  'variable-assigner': {
    acceptsInput: true,
    providesOutput: true,
    defaultConfig: variableAssignerDefaultConfig,
    getOutputVars: variableAssignerOutputVars,
    checkValid: validateVariableAssignerConfig,
  },
  'if-else': {
    acceptsInput: true,
    providesOutput: true,
    defaultConfig: ifElseDefaultConfig,
    getOutputVars: ifElseOutputVars,
    getSourceHandles: ifElseSourceHandles,
    checkValid: validateIfElseConfig,
  },
  llm: {
    acceptsInput: true,
    providesOutput: true,
    defaultConfig: llmDefaultConfig,
    getOutputVars: llmOutputVars,
    checkValid: validateLlmConfig,
  },
  'knowledge-retrieval': {
    acceptsInput: true,
    providesOutput: true,
    defaultConfig: knowledgeRetrievalDefaultConfig,
    getOutputVars: knowledgeRetrievalOutputVars,
    checkValid: validateKnowledgeRetrievalConfig,
  },
  'http-request': {
    acceptsInput: true,
    providesOutput: true,
    defaultConfig: httpRequestDefaultConfig,
    getOutputVars: httpRequestOutputVars,
    checkValid: validateHttpRequestConfig,
  },
  code: {
    acceptsInput: true,
    providesOutput: true,
    defaultConfig: codeDefaultConfig,
    getOutputVars: codeOutputVars,
    checkValid: validateCodeConfig,
  },
};

export type NodeCategory = 'flow' | 'data' | 'ai' | 'tools';

const presentationKeys: Record<NodeType, { key: string; category: NodeCategory }> = {
  start: { key: 'start', category: 'flow' },
  end: { key: 'end', category: 'flow' },
  'variable-assigner': { key: 'variableAssigner', category: 'data' },
  'if-else': { key: 'ifElse', category: 'flow' },
  llm: { key: 'llm', category: 'ai' },
  'knowledge-retrieval': { key: 'knowledgeRetrieval', category: 'ai' },
  'http-request': { key: 'httpRequest', category: 'tools' },
  code: { key: 'code', category: 'tools' },
};

export const getNodePresentation = (t: TFunction<'workflow'>, type: NodeType) => {
  const presentation = presentationKeys[type];
  return {
    title: t(`nodes.${presentation.key}.title`),
    description: t(`nodes.${presentation.key}.description`),
    category: presentation.category,
  };
};
