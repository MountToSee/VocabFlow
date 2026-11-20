import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  x: number;
  y: number;
  onClose: () => void;
  children: ReactNode;
  label: string;
  /** Vertical distance between the anchor point and the card. */
  gap?: number;
  className?: string;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
}

const WIDTH = 340;

/** Floating card anchored near the pointer; closes on Escape or outside click. */
export function Popover({
  x,
  y,
  onClose,
  children,
  label,
  gap = 18,
  className,
  onPointerEnter,
  onPointerLeave,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
    };
  }, [onClose]);

  const left = Math.max(12, Math.min(x - WIDTH / 2, window.innerWidth - WIDTH - 12));
  const top = Math.min(y + gap, window.innerHeight - 260);

  return (
    <div
      ref={ref}
      className={`popover ${className ?? ''}`}
      role="dialog"
      aria-label={label}
      style={{ left, top, width: WIDTH }}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      {children}
    </div>
  );
}
