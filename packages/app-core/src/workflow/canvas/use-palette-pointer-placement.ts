import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import type { NodeType } from '@ai-engine/contracts';
import type { XYPosition } from '@xyflow/react';
import { clearPendingNodeDrag, setPendingNodeDrag } from './dnd-payload';

const DRAG_THRESHOLD_PX = 4;

export type PaletteGhost = {
  type: NodeType;
  label: string;
  x: number;
  y: number;
};

export const usePalettePointerPlacement = (
  addNodeAt: (type: NodeType, position: XYPosition) => void,
  screenToFlowPosition: (position: XYPosition) => XYPosition,
  canvasRef: RefObject<HTMLDivElement | null>,
) => {
  const captureElRef = useRef<HTMLElement | null>(null);
  const activeType = useRef<NodeType | null>(null);
  const activeLabel = useRef('');
  const pointerId = useRef<number | null>(null);
  const moved = useRef(false);
  const suppressClick = useRef(false);
  const start = useRef({ x: 0, y: 0 });
  const [ghost, setGhost] = useState<PaletteGhost | null>(null);

  const isOverCanvas = useCallback(
    (clientX: number, clientY: number): boolean => {
      const el = canvasRef.current;
      if (!el) return false;
      const hit = document.elementFromPoint(clientX, clientY);
      if (hit && el.contains(hit)) return true;
      const rect = el.getBoundingClientRect();
      return (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
      );
    },
    [canvasRef],
  );

  const releaseCapture = useCallback(() => {
    const el = captureElRef.current;
    const id = pointerId.current;
    if (el && id !== null && el.hasPointerCapture(id)) {
      try {
        el.releasePointerCapture(id);
      } catch {
        /* 已释放时 WebKit 可能抛错 */
      }
    }
    captureElRef.current = null;
  }, []);

  const finish = useCallback(
    (clientX: number, clientY: number) => {
      const type = activeType.current;
      if (type === null) return;

      const didDrag = moved.current;
      if (didDrag && isOverCanvas(clientX, clientY)) {
        addNodeAt(type, screenToFlowPosition({ x: clientX, y: clientY }));
      }
      if (didDrag) suppressClick.current = true;

      releaseCapture();
      activeType.current = null;
      pointerId.current = null;
      moved.current = false;
      clearPendingNodeDrag();
      setGhost(null);
    },
    [addNodeAt, isOverCanvas, releaseCapture, screenToFlowPosition],
  );

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      if (activeType.current === null || pointerId.current !== event.pointerId) return;
      const dx = event.clientX - start.current.x;
      const dy = event.clientY - start.current.y;
      if (!moved.current && dx * dx + dy * dy >= DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
        moved.current = true;
      }
      if (moved.current) {
        const type = activeType.current;
        if (!type) return;
        event.preventDefault();
        setGhost({
          type,
          label: activeLabel.current,
          x: event.clientX,
          y: event.clientY,
        });
      }
    };

    const onPointerUp = (event: PointerEvent) => {
      if (activeType.current === null) return;
      if (pointerId.current !== null && event.pointerId !== pointerId.current) return;
      finish(event.clientX, event.clientY);
    };

    const onPointerCancel = (event: PointerEvent) => {
      if (activeType.current === null) return;
      if (pointerId.current !== null && event.pointerId !== pointerId.current) return;
      finish(event.clientX, event.clientY);
    };

    const onMouseUp = (event: MouseEvent) => {
      if (activeType.current === null || event.button !== 0) return;
      finish(event.clientX, event.clientY);
    };

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    document.addEventListener('pointerup', onPointerUp, true);
    document.addEventListener('pointercancel', onPointerCancel, true);
    document.addEventListener('mouseup', onMouseUp, true);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp, true);
      document.removeEventListener('pointercancel', onPointerCancel, true);
      document.removeEventListener('mouseup', onMouseUp, true);
    };
  }, [finish]);

  const onPalettePointerDown = useCallback(
    (type: NodeType, label: string, event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      activeType.current = type;
      activeLabel.current = label;
      pointerId.current = event.pointerId;
      moved.current = false;
      start.current = { x: event.clientX, y: event.clientY };
      setPendingNodeDrag(type);
      setGhost(null);
      captureElRef.current = event.currentTarget;
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [],
  );

  const consumePointerClick = useCallback((): boolean => {
    if (!suppressClick.current) return false;
    suppressClick.current = false;
    return true;
  }, []);

  return {
    ghost,
    onPalettePointerDown,
    consumePointerClick,
  };
};
