import {
  WorkflowValidationResponseSchema,
  type WorkflowGraph,
  type WorkflowValidationIssue,
  type WorkflowValidationResponse,
} from '@ai-engine/contracts';
import type { NodeRegistry } from '../nodes/registry';

const issue = (code: string, message: string, nodeIds: string[] = []): WorkflowValidationIssue => ({
  code,
  message,
  nodeIds,
});

const findCycle = (graph: WorkflowGraph): string[] | null => {
  const adjacency = new Map<string, string[]>();
  for (const node of graph.nodes) adjacency.set(node.id, []);
  for (const edge of graph.edges) adjacency.get(edge.source)?.push(edge.target);

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const path: string[] = [];

  const visit = (nodeId: string): string[] | null => {
    if (visiting.has(nodeId)) {
      const start = path.indexOf(nodeId);
      return [...path.slice(start), nodeId];
    }
    if (visited.has(nodeId)) return null;
    visiting.add(nodeId);
    path.push(nodeId);
    for (const target of adjacency.get(nodeId) ?? []) {
      const cycle = visit(target);
      if (cycle) return cycle;
    }
    path.pop();
    visiting.delete(nodeId);
    visited.add(nodeId);
    return null;
  };

  for (const node of graph.nodes) {
    const cycle = visit(node.id);
    if (cycle) return cycle;
  }
  return null;
};

const hasPath = (graph: WorkflowGraph, source: string, target: string): boolean => {
  const visited = new Set<string>();
  const queue = [source];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);
    for (const edge of graph.edges) {
      if (edge.source !== current) continue;
      if (edge.target === target) return true;
      queue.push(edge.target);
    }
  }
  return false;
};

export const topologicalOrder = (graph: WorkflowGraph): string[] => {
  const indegree = new Map(graph.nodes.map((node) => [node.id, 0]));
  const adjacency = new Map(graph.nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of graph.edges) {
    if (!indegree.has(edge.source) || !indegree.has(edge.target)) continue;
    adjacency.get(edge.source)?.push(edge.target);
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
  }
  const queue = [...indegree.entries()]
    .filter(([, degree]) => degree === 0)
    .map(([nodeId]) => nodeId);
  const ordered: string[] = [];
  while (queue.length > 0) {
    const nodeId = queue.shift();
    if (!nodeId) break;
    ordered.push(nodeId);
    for (const target of adjacency.get(nodeId) ?? []) {
      const next = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, next);
      if (next === 0) queue.push(target);
    }
  }
  return ordered;
};

export const validateWorkflowGraph = (
  graph: WorkflowGraph,
  registry: NodeRegistry,
): WorkflowValidationResponse => {
  const errors: WorkflowValidationIssue[] = [];
  const warnings: WorkflowValidationIssue[] = [];
  const nodeIds = new Set<string>();
  const runners = new Map<string, ReturnType<NodeRegistry['get']>>();

  for (const node of graph.nodes) {
    if (node.id === 'sys') {
      errors.push(issue('reserved-node-id', '节点 id 不能使用保留名称 sys', [node.id]));
    }
    if (nodeIds.has(node.id)) {
      errors.push(issue('duplicate-node', `节点 id 重复：${node.id}`, [node.id]));
    }
    nodeIds.add(node.id);
  }

  const edgeIds = new Set<string>();
  for (const edge of graph.edges) {
    if (edgeIds.has(edge.id)) {
      errors.push(issue('duplicate-edge', `边 id 重复：${edge.id}`));
    }
    edgeIds.add(edge.id);
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      errors.push(
        issue('invalid-edge', `边 ${edge.id} 引用了不存在的节点`, [edge.source, edge.target]),
      );
    }
  }

  const cycle = findCycle(graph);
  if (cycle) errors.push(issue('cycle', `工作流存在循环：${cycle.join(' → ')}`, cycle));

  let entryCount = 0;
  let terminalCount = 0;
  for (const node of graph.nodes) {
    let runner;
    try {
      runner = registry.get(node.data.type);
    } catch (error) {
      errors.push(
        issue('unregistered-node', error instanceof Error ? error.message : '节点类型未注册', [
          node.id,
        ]),
      );
      continue;
    }
    runners.set(node.id, runner);
    if (runner.role === 'entry') entryCount += 1;
    if (runner.role === 'terminal') terminalCount += 1;
    const config = runner.configSchema.safeParse(node.data.config);
    if (!config.success) {
      errors.push(issue('invalid-config', `节点 ${node.id} 配置不合法`, [node.id]));
      continue;
    }
    for (const selector of runner.getValueSelectors?.(config.data) ?? []) {
      const source = selector[0];
      if (source !== 'sys' && (!source || !nodeIds.has(source))) {
        errors.push(
          issue(
            'invalid-variable-reference',
            `节点 ${node.id} 引用了不存在的变量来源：${source ?? ''}`,
            [node.id],
          ),
        );
      } else if (source !== 'sys' && !hasPath(graph, source, node.id)) {
        errors.push(
          issue(
            'invalid-variable-order',
            `节点 ${node.id} 引用的变量来源 ${source} 不是其上游节点`,
            [node.id, source],
          ),
        );
      }
    }
    const branches = runner.getBranchHandles?.(config.data) ?? [];
    if (branches.length > 0) {
      const branchSet = new Set(branches);
      if (branchSet.size !== branches.length) {
        errors.push(issue('duplicate-branch', `节点 ${node.id} 包含重复分支名`, [node.id]));
      }
      const outgoingEdges = graph.edges.filter((edge) => edge.source === node.id);
      for (const edge of outgoingEdges) {
        if (!edge.sourceHandle || !branchSet.has(edge.sourceHandle)) {
          errors.push(
            issue('invalid-branch-edge', `节点 ${node.id} 的出边 ${edge.id} 缺少或使用了未知分支`, [
              node.id,
            ]),
          );
        }
      }
      for (const branch of branchSet) {
        if (!outgoingEdges.some((edge) => edge.sourceHandle === branch)) {
          errors.push(
            issue('missing-branch-edge', `节点 ${node.id} 的分支 ${branch} 没有对应出边`, [
              node.id,
            ]),
          );
        }
      }
    }
  }

  if (entryCount !== 1) {
    errors.push(issue('entry-count', `工作流必须有且仅有一个开始节点，当前为 ${entryCount}`));
  }
  if (terminalCount !== 1) {
    errors.push(issue('terminal-count', `工作流必须有且仅有一个结束节点，当前为 ${terminalCount}`));
  }

  const outgoing = new Set(graph.edges.map((edge) => edge.source));
  const entryId = graph.nodes.find((node) => runners.get(node.id)?.role === 'entry')?.id;
  const reachable = new Set<string>();
  if (entryId) {
    const queue = [entryId];
    while (queue.length > 0) {
      const source = queue.shift();
      if (!source || reachable.has(source)) continue;
      reachable.add(source);
      for (const edge of graph.edges) {
        if (edge.source === source && nodeIds.has(edge.target)) queue.push(edge.target);
      }
    }
  }
  for (const node of graph.nodes) {
    const runner = runners.get(node.id);
    if (!runner) continue;
    if (runner.role === 'terminal' && !reachable.has(node.id)) {
      errors.push(
        issue('unreachable-terminal', `结束节点 ${node.id} 无法从开始节点到达`, [node.id]),
      );
    } else if (runner.role !== 'entry' && !reachable.has(node.id)) {
      warnings.push(issue('isolated-node', `节点 ${node.id} 不可从开始节点到达`, [node.id]));
    }
    if (runner.role !== 'terminal' && !outgoing.has(node.id)) {
      warnings.push(issue('dead-end', `节点 ${node.id} 没有出边`, [node.id]));
    }
  }

  return WorkflowValidationResponseSchema.parse({
    valid: errors.length === 0,
    errors,
    warnings,
  });
};
