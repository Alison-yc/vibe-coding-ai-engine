import {
  UI_POINTER_TRAIL_CHANGED_EVENT,
  UI_POINTER_TRAIL_STORAGE_KEY,
  parsePointerTrailPreference,
} from '@ai-engine/contracts';
import { usePlatform } from '@ai-engine/platform';
import {
  drawPetalParticles,
  spawnPetalBurst,
  stepPetalParticles,
  type PetalParticle,
} from '@ai-engine/ui';
import { useEffect, useRef, useState } from 'react';

const TRAIL_COLOR_VARS = [
  '--chart-1',
  '--chart-2',
  '--chart-3',
  '--chart-4',
  '--chart-5',
  '--primary',
  '--accent-foreground',
] as const;

const readTrailColors = (): string[] => {
  const colors: string[] = [];
  for (const token of TRAIL_COLOR_VARS) {
    const probe = document.createElement('span');
    probe.style.color = `var(${token})`;
    probe.hidden = true;
    document.body.appendChild(probe);
    const resolved = getComputedStyle(probe).color;
    probe.remove();
    if (resolved && resolved !== 'rgba(0, 0, 0, 0)') colors.push(resolved);
  }
  return colors.length > 0
    ? colors
    : ['rgb(99, 102, 241)', 'rgb(236, 72, 153)', 'rgb(34, 197, 94)'];
};

const trailEnabled = async (kv: {
  get: (key: string) => Promise<string | null>;
}): Promise<boolean> => {
  const raw = await kv.get(UI_POINTER_TRAIL_STORAGE_KEY);
  if (!parsePointerTrailPreference(raw)) return false;
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

export const PointerTrailOverlay = () => {
  const platform = usePlatform();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const sync = async () => {
      const next = await trailEnabled(platform.kv);
      if (!cancelled) setActive(next);
    };
    void sync();
    const onReducedMotion = () => {
      void sync();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === UI_POINTER_TRAIL_STORAGE_KEY) void sync();
    };
    const onPreferenceChange = () => {
      void sync();
    };
    const reducedMq = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMq.addEventListener('change', onReducedMotion);
    window.addEventListener('storage', onStorage);
    window.addEventListener(UI_POINTER_TRAIL_CHANGED_EVENT, onPreferenceChange);
    return () => {
      cancelled = true;
      reducedMq.removeEventListener('change', onReducedMotion);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(UI_POINTER_TRAIL_CHANGED_EVENT, onPreferenceChange);
    };
  }, [platform]);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const colors = readTrailColors();
    const particles: PetalParticle[] = [];
    let frame = 0;
    let lastSpawn = { x: 0, y: 0 };

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const onMove = (event: PointerEvent) => {
      const dx = event.clientX - lastSpawn.x;
      const dy = event.clientY - lastSpawn.y;
      if (dx * dx + dy * dy < 12) return;
      lastSpawn = { x: event.clientX, y: event.clientY };
      spawnPetalBurst(particles, event.clientX, event.clientY, colors, 4);
    };
    window.addEventListener('pointermove', onMove);

    const tick = () => {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      stepPetalParticles(particles);
      drawPetalParticles(ctx, particles);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onMove);
    };
  }, [active]);

  if (!active) return null;

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-[100]"
      aria-hidden
      data-testid="pointer-trail-overlay"
    />
  );
};
