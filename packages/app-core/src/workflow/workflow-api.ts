import {
  CreateWorkflowRequestSchema,
  NodeRunResultSchema,
  RunNodeRequestSchema,
  RunWorkflowRequestSchema,
  StopWorkflowResponseSchema,
  UpdateWorkflowRequestSchema,
  WorkflowListResponseSchema,
  WorkflowRunDetailResponseSchema,
  WorkflowRunEventSchema,
  WorkflowRunListResponseSchema,
  WorkflowSchema,
  WorkflowValidationResponseSchema,
  type CreateWorkflowRequest,
  type RunNodeRequest,
  type RunWorkflowRequest,
  type UpdateWorkflowRequest,
  type Workflow,
  type WorkflowGraph,
  type WorkflowNodeRun,
  type WorkflowRun,
  type WorkflowRunEvent,
  type WorkflowValidationResponse,
} from '@ai-engine/contracts';
import type { Platform } from '@ai-engine/platform';

const requestJson = async (
  platform: Platform,
  path: string,
  init?: RequestInit,
): Promise<unknown> => {
  const response = await fetch(`${platform.getApiBaseUrl().replace(/\/$/, '')}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const data: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof data === 'object' &&
      data !== null &&
      'message' in data &&
      typeof data.message === 'string'
        ? data.message
        : `请求失败: ${response.status}`;
    throw new Error(message);
  }
  return data;
};

const responseErrorMessage = (data: unknown, fallback: string): string =>
  typeof data === 'object' && data !== null && 'message' in data && typeof data.message === 'string'
    ? data.message
    : fallback;

export const listWorkflows = async (platform: Platform): Promise<Workflow[]> =>
  WorkflowListResponseSchema.parse(await requestJson(platform, '/workflows')).workflows;

export const createWorkflow = async (
  platform: Platform,
  input: CreateWorkflowRequest,
): Promise<Workflow> =>
  WorkflowSchema.parse(
    await requestJson(platform, '/workflows', {
      method: 'POST',
      body: JSON.stringify(CreateWorkflowRequestSchema.parse(input)),
    }),
  );

export const getWorkflow = async (platform: Platform, id: string): Promise<Workflow> =>
  WorkflowSchema.parse(await requestJson(platform, `/workflows/${id}`));

export const updateWorkflow = async (
  platform: Platform,
  id: string,
  input: UpdateWorkflowRequest,
): Promise<Workflow> =>
  WorkflowSchema.parse(
    await requestJson(platform, `/workflows/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(UpdateWorkflowRequestSchema.parse(input)),
    }),
  );

export const deleteWorkflow = async (platform: Platform, id: string): Promise<void> => {
  await requestJson(platform, `/workflows/${id}`, { method: 'DELETE' });
};

export const validateWorkflow = async (
  platform: Platform,
  id: string,
  graph: WorkflowGraph,
): Promise<WorkflowValidationResponse> =>
  WorkflowValidationResponseSchema.parse(
    await requestJson(platform, `/workflows/${id}/validate`, {
      method: 'POST',
      body: JSON.stringify(graph),
    }),
  );

export const listWorkflowRuns = async (
  platform: Platform,
  workflowId: string,
): Promise<WorkflowRun[]> =>
  WorkflowRunListResponseSchema.parse(await requestJson(platform, `/workflows/${workflowId}/runs`))
    .runs;

export const getWorkflowRun = async (
  platform: Platform,
  runId: string,
): Promise<{ run: WorkflowRun; nodeRuns: WorkflowNodeRun[] }> =>
  WorkflowRunDetailResponseSchema.parse(await requestJson(platform, `/workflows/runs/${runId}`));

export const stopWorkflowRun = async (platform: Platform, runId: string): Promise<boolean> =>
  StopWorkflowResponseSchema.parse(
    await requestJson(platform, `/workflows/runs/${runId}/stop`, { method: 'POST' }),
  ).accepted;

export const runWorkflowNode = async (
  platform: Platform,
  workflowId: string,
  nodeId: string,
  input: RunNodeRequest,
) =>
  NodeRunResultSchema.parse(
    await requestJson(platform, `/workflows/${workflowId}/nodes/${nodeId}/run`, {
      method: 'POST',
      body: JSON.stringify(RunNodeRequestSchema.parse(input)),
    }),
  );

const parseSseBlock = (block: string): WorkflowRunEvent | null => {
  let event = '';
  const data: string[] = [];
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    if (line.startsWith('data:')) data.push(line.slice(5).trim());
  }
  if (!event || data.length === 0) return null;
  try {
    const parsed = WorkflowRunEventSchema.safeParse({
      event,
      data: JSON.parse(data.join('\n')) as unknown,
    });
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

export const streamWorkflow = async (
  platform: Platform,
  workflowId: string,
  input: RunWorkflowRequest,
  signal: AbortSignal,
  onEvent: (event: WorkflowRunEvent) => void,
): Promise<void> => {
  const response = await fetch(
    `${platform.getApiBaseUrl().replace(/\/$/, '')}/workflows/${workflowId}/run`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(RunWorkflowRequestSchema.parse(input)),
      signal,
    },
  );
  if (!response.ok) {
    const data: unknown = await response.json().catch(() => ({}));
    throw new Error(responseErrorMessage(data, `运行工作流失败: ${response.status}`));
  }
  if (!response.body) throw new Error('工作流响应没有 body');
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  let finished = false;
  const emitBlock = (block: string) => {
    const event = parseSseBlock(block);
    if (!event) return;
    if (event.event === 'workflow_finished' || event.event === 'workflow_failed') finished = true;
    onEvent(event);
  };
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += chunk.value;
    const blocks = buffer.split('\n\n');
    buffer = blocks.pop() ?? '';
    for (const block of blocks) emitBlock(block);
  }
  if (buffer.trim()) emitBlock(buffer);
  if (!finished && !signal.aborted) throw new Error('工作流连接意外中断');
};
