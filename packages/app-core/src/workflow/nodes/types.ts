import type { ComponentType } from 'react';
import type { NodeType, ValueSelector } from '@ai-engine/contracts';
import type { CanvasEdge, CanvasNode, WorkflowNodeData } from '../types';

export type OutputVariable = {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'unknown';
};

export type NodeBodyProps = { data: WorkflowNodeData };

export type NodePanelProps = {
  node: CanvasNode;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  onChange: (config: Record<string, unknown>) => void;
};

export type NodeDefinition = {
  type: NodeType;
  acceptsInput: boolean;
  providesOutput: boolean;
  singleton?: boolean;
  defaultConfig: Record<string, unknown>;
  Body: ComponentType<NodeBodyProps>;
  Panel: ComponentType<NodePanelProps>;
  getOutputVars: (config: Record<string, unknown>) => OutputVariable[];
  checkValid: (config: Record<string, unknown>) => string[];
};

export type VariableOption = {
  nodeId: string;
  nodeTitle: string;
  variable: OutputVariable;
  selector: ValueSelector;
};
