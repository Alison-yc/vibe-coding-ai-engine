import type { NodeType } from '@ai-engine/contracts';
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
  title: string;
  description: string;
  category: '流程' | '数据' | 'AI' | '工具';
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
    title: '开始',
    description: '定义工作流运行入参',
    category: '流程',
    acceptsInput: false,
    providesOutput: true,
    singleton: true,
    defaultConfig: startDefaultConfig,
    getOutputVars: startOutputVars,
    checkValid: validateStartConfig,
  },
  end: {
    title: '结束',
    description: '组装工作流最终输出',
    category: '流程',
    acceptsInput: true,
    providesOutput: false,
    singleton: true,
    defaultConfig: endDefaultConfig,
    getOutputVars: endOutputVars,
    checkValid: validateEndConfig,
  },
  'variable-assigner': {
    title: '变量赋值',
    description: '创建常量或引用变量',
    category: '数据',
    acceptsInput: true,
    providesOutput: true,
    defaultConfig: variableAssignerDefaultConfig,
    getOutputVars: variableAssignerOutputVars,
    checkValid: validateVariableAssignerConfig,
  },
  'if-else': {
    title: '条件分支',
    description: '根据条件选择执行路径',
    category: '流程',
    acceptsInput: true,
    providesOutput: true,
    defaultConfig: ifElseDefaultConfig,
    getOutputVars: ifElseOutputVars,
    getSourceHandles: ifElseSourceHandles,
    checkValid: validateIfElseConfig,
  },
  llm: {
    title: 'LLM',
    description: '调用本地模型生成文本',
    category: 'AI',
    acceptsInput: true,
    providesOutput: true,
    defaultConfig: llmDefaultConfig,
    getOutputVars: llmOutputVars,
    checkValid: validateLlmConfig,
  },
  'knowledge-retrieval': {
    title: '知识检索',
    description: '从知识库检索相关内容',
    category: 'AI',
    acceptsInput: true,
    providesOutput: true,
    defaultConfig: knowledgeRetrievalDefaultConfig,
    getOutputVars: knowledgeRetrievalOutputVars,
    checkValid: validateKnowledgeRetrievalConfig,
  },
  'http-request': {
    title: 'HTTP 请求',
    description: '请求公网 HTTP(S) 接口',
    category: '工具',
    acceptsInput: true,
    providesOutput: true,
    defaultConfig: httpRequestDefaultConfig,
    getOutputVars: httpRequestOutputVars,
    checkValid: validateHttpRequestConfig,
  },
  code: {
    title: '代码',
    description: '在 QuickJS 沙箱中处理数据',
    category: '工具',
    acceptsInput: true,
    providesOutput: true,
    defaultConfig: codeDefaultConfig,
    getOutputVars: codeOutputVars,
    checkValid: validateCodeConfig,
  },
};
