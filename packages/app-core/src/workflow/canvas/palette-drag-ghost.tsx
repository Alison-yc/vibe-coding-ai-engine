import { createPortal } from 'react-dom';
import { cn } from '@ai-engine/ui';
import type { PaletteGhost } from './use-palette-pointer-placement';

export const PaletteDragGhost = ({ ghost }: { ghost: PaletteGhost | null }) => {
  if (!ghost || typeof document === 'undefined') return null;
  return createPortal(
    <div
      className="pointer-events-none fixed z-[9999] -translate-x-1/2 -translate-y-1/2"
      style={{ left: ghost.x, top: ghost.y }}
      aria-hidden
    >
      <div
        className={cn(
          'bg-card text-card-foreground border-primary max-w-[220px] rounded-lg border-2 px-3 py-2 text-sm opacity-90 shadow-lg',
        )}
      >
        {ghost.label || ghost.type}
      </div>
    </div>,
    document.body,
  );
};
