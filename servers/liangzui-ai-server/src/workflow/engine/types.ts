import type {
  NodeRunResult,
  NodeType,
  ValueSelector,
  WorkflowGraph,
  WorkflowRunEvent,
} from '@ai-engine/contracts';
import type { z } from 'zod';

export interface VariablePoolReader {
  get(selector: ValueSelector): unknown;
  getSystem(name: string): unknown;
  render(template: string): string;
  snapshot(): Record<string, Record<string, unknown>>;
}

export type NodeRunContext = {
  readonly runId: string;
  readonly nodeId: string;
  readonly signal: AbortSignal;
  emit: (text: string) => void;
};

export interface NodeRunner<TConfig = unknown> {
  readonly type: NodeType;
  readonly role?: 'entry' | 'terminal';
  readonly configSchema: z.ZodType<TConfig>;
  getValueSelectors?(config: TConfig): ValueSelector[];
  getBranchHandles?(config: TConfig): string[];
  run(config: TConfig, pool: VariablePoolReader, context: NodeRunContext): Promise<NodeRunResult>;
}

export type WorkflowExecutionObserver = {
  onNodeStarted?: (nodeId: string, inputs: Record<string, unknown>) => Promise<void> | void;
  onNodeFinished?: (
    nodeId: string,
    outputs: Record<string, unknown>,
    elapsedMs: number,
  ) => Promise<void> | void;
  onNodeFailed?: (nodeId: string, error: Error, elapsedMs: number) => Promise<void> | void;
};

export type WorkflowExecutionInput = {
  runId: string;
  graph: WorkflowGraph;
  inputs: Record<string, unknown>;
  signal: AbortSignal;
  emit: (event: WorkflowRunEvent) => void;
  observer?: WorkflowExecutionObserver;
};

export type WorkflowExecutionResult = {
  outputs: Record<string, unknown>;
  totalElapsedMs: number;
  status: 'completed' | 'stopped';
};
