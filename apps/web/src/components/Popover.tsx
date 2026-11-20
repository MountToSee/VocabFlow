import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  x: number;
  y: number;
  onClose: () => void;
  children: ReactNode;
  label: string;
  width?: number;
}

/** Floating card anchored near the pointer; closes on Escape or outside click. */
export function Popover({ x, y, onClose, children, label, width = 340 }: Props) {
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

  const left = Math.max(12, Math.min(x - width / 2, window.innerWidth - width - 12));
  const top = Math.min(y + 18, window.innerHeight - 260);

  return (
    <div
      ref={ref}
      className="popover"
      role="dialog"
      aria-label={label}
      style={{ left, top, width }}
    >
      {children}
    </div>
  );
}
