import { useCallback, useEffect, useRef, useState } from 'react';

type PendingDraft = {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
};

const pendingDrafts = new Map<string, PendingDraft>();

export const stageConfigDraft = (
  nodeId: string,
  config: Record<string, unknown>,
  onChange: PendingDraft['onChange'],
): void => {
  pendingDrafts.set(nodeId, { config, onChange });
};

export const flushConfigDraft = (nodeId: string): void => {
  const pending = pendingDrafts.get(nodeId);
  if (!pending) return;
  pendingDrafts.delete(nodeId);
  pending.onChange(pending.config);
};

export const flushConfigDrafts = (): void => {
  for (const nodeId of [...pendingDrafts.keys()]) flushConfigDraft(nodeId);
};

export const useConfigDraft = (
  nodeId: string,
  initial: Record<string, unknown>,
  onChange: (config: Record<string, unknown>) => void,
) => {
  const [draft, setDraft] = useState(initial);
  const initialRender = useRef(true);
  const updateDraft = useCallback(
    (config: Record<string, unknown>) => {
      stageConfigDraft(nodeId, config, onChange);
      setDraft(config);
    },
    [nodeId, onChange],
  );
  useEffect(() => {
    if (initialRender.current) {
      initialRender.current = false;
      return;
    }
    const timer = globalThis.setTimeout(() => flushConfigDraft(nodeId), 400);
    return () => globalThis.clearTimeout(timer);
  }, [draft, nodeId]);
  useEffect(() => () => flushConfigDraft(nodeId), [nodeId]);
  return [draft, updateDraft] as const;
};
