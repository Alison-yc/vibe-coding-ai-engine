import type { CanvasEdge, CanvasNode } from './types';
import { NodeMetadataMap } from './nodes/metadata';

export const collectUpstreamNodeIds = (nodeId: string, edges: CanvasEdge[]): Set<string> => {
  const upstream = new Set<string>();
  const queue = edges.filter((edge) => edge.target === nodeId).map((edge) => edge.source);
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || upstream.has(current) || current === nodeId) continue;
    upstream.add(current);
    for (const edge of edges) {
      if (edge.target === current) queue.push(edge.source);
    }
  }
  return upstream;
};

export const wouldCreateCycle = (source: string, target: string, edges: CanvasEdge[]): boolean =>
  collectUpstreamNodeIds(source, edges).has(target);

export const canConnectNodes = (
  connection: {
    source: string | null;
    target: string | null;
    sourceHandle?: string | null;
  },
  nodes: CanvasNode[],
  edges: CanvasEdge[],
): boolean => {
  if (!connection.source || !connection.target || connection.source === connection.target) {
    return false;
  }
  const source = nodes.find((node) => node.id === connection.source);
  const target = nodes.find((node) => node.id === connection.target);
  if (
    !source ||
    !target ||
    !NodeMetadataMap[source.data.type].providesOutput ||
    !NodeMetadataMap[target.data.type].acceptsInput
  ) {
    return false;
  }
  if (
    edges.some(
      (edge) =>
        edge.source === connection.source &&
        edge.target === connection.target &&
        edge.sourceHandle === connection.sourceHandle,
    )
  ) {
    return false;
  }
  return !wouldCreateCycle(connection.source, connection.target, edges);
};

export const syncSourceHandleEdges = (
  nodeId: string,
  previousHandles: string[],
  nextHandles: string[],
  edges: CanvasEdge[],
): CanvasEdge[] => {
  const previousSet = new Set(previousHandles);
  const nextSet = new Set(nextHandles);
  const removed = previousHandles.filter((handle) => !nextSet.has(handle));
  const added = nextHandles.filter((handle) => !previousSet.has(handle));
  const renameMap =
    previousHandles.length === nextHandles.length && removed.length === added.length
      ? new Map(removed.map((handle, index) => [handle, added[index]] as const))
      : new Map<string, string>();

  return edges.flatMap((edge) => {
    if (edge.source !== nodeId || !edge.sourceHandle || !previousSet.has(edge.sourceHandle)) {
      return [edge];
    }
    if (nextSet.has(edge.sourceHandle)) return [edge];
    const sourceHandle = renameMap.get(edge.sourceHandle);
    return sourceHandle ? [{ ...edge, sourceHandle }] : [];
  });
};
