'use client';
import { useT } from '@/i18n/provider';

import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
export default function Dialog({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    function key(event: KeyboardEvent) {
      if (event.key === 'Escape') close.current();
      if (event.key === 'Tab') {
        const nodes = [
          ...(ref.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled),a[href],input,textarea,select,[tabindex="0"]',
          ) || []),
        ].filter((n) => n.offsetParent !== null);
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (!first) {
          event.preventDefault();
          return;
        }
        if (
          event.shiftKey &&
          (document.activeElement === first || document.activeElement === ref.current)
        ) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener('keydown', key);
    return () => {
      document.body.style.overflow = oldOverflow;
      document.removeEventListener('keydown', key);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className={`modal ${wide ? 'wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        tabIndex={-1}
      >
        <div className="modal-heading">
          <h2 id="dialog-title">{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label={t("Fermer")}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
