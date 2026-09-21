import { useCallback, useLayoutEffect, useRef } from 'react';

const NEAR_BOTTOM_PX = 96;

export const isNearBottom = (
  scrollTop: number,
  clientHeight: number,
  scrollHeight: number,
  threshold = NEAR_BOTTOM_PX,
): boolean => scrollHeight - scrollTop - clientHeight <= threshold;

export const useStickToBottom = (watch: unknown) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  const scrollToBottom = useCallback(() => {
    const container = containerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
      return;
    }
    const bottom = bottomRef.current;
    if (bottom && typeof bottom.scrollIntoView === 'function') {
      bottom.scrollIntoView({ block: 'end' });
    }
  }, []);

  const onScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    stickRef.current = isNearBottom(el.scrollTop, el.clientHeight, el.scrollHeight);
  }, []);

  const stickNow = useCallback(() => {
    stickRef.current = true;
    scrollToBottom();
  }, [scrollToBottom]);

  useLayoutEffect(() => {
    if (!stickRef.current) return;
    scrollToBottom();
  }, [watch, scrollToBottom]);

  return { containerRef, bottomRef, onScroll, stickNow };
};
