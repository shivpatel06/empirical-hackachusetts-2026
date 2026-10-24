import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { THEMES, type ThemeId } from '../state/appearance';

export interface SiteMenuItem {
  id: string;
  label: string;
  current: boolean;
  detail?: string;
}

export interface SiteMenuProps {
  open: boolean;
  /** The toggle that opened the menu; it stays operable (morphs to a close X) and receives focus back. */
  toggleRef: RefObject<HTMLButtonElement | null>;
  items: SiteMenuItem[];
  trials: SiteMenuItem[];
  footer: string;
  onNavigate(id: string): void;
  onSelectTrial(id: string): void;
  /** Current palette and setter; choosing keeps the menu open and focus on the swatch. */
  theme: ThemeId;
  onTheme(id: ThemeId): void;
  /** Close; `restoreFocus` is false when navigation moves focus elsewhere. */
  onClose(restoreFocus: boolean): void;
}

const FOCUSABLE = 'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

/**
 * Floating menu panel revealed by a circle that grows from the toggle
 * (clip-path, ease-expo). Links stagger in. Modal while open: Escape closes,
 * Tab is trapped between the toggle and the menu, page scroll is locked.
 * Closed: inert and aria-hidden, so nothing inside is reachable.
 */
export function SiteMenu({ open, toggleRef, items, trials, footer, onNavigate, onSelectTrial, theme, onTheme, onClose }: SiteMenuProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const firstRef = useRef<HTMLButtonElement>(null);

  // Anchor the reveal circle at the toggle's centre.
  useLayoutEffect(() => {
    if (!open) return;
    const t = toggleRef.current?.getBoundingClientRect();
    const p = panelRef.current;
    if (!t || !p) return;
    const pr = p.getBoundingClientRect();
    p.style.setProperty('--ox', `${t.left + t.width / 2 - pr.left}px`);
    p.style.setProperty('--oy', `${t.top + t.height / 2 - pr.top}px`);
  }, [open, toggleRef]);

  useEffect(() => {
    if (open) {
      const root = document.documentElement;
      const prev = root.style.overflow;
      root.style.overflow = 'hidden';
      firstRef.current?.focus({ preventScroll: true });
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose(true);
          return;
        }
        if (e.key !== 'Tab') return;
        const nodes = [toggleRef.current, ...Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].filter(
          (n): n is HTMLElement => !!n,
        );
        if (nodes.length === 0) return;
        const i = nodes.indexOf(document.activeElement as HTMLElement);
        const next = e.shiftKey ? (i <= 0 ? nodes.length - 1 : i - 1) : i === nodes.length - 1 || i === -1 ? 0 : i + 1;
        e.preventDefault();
        nodes[next]?.focus();
      };
      document.addEventListener('keydown', onKey);
      return () => {
        document.removeEventListener('keydown', onKey);
        root.style.overflow = prev;
      };
    }
    return undefined;
  }, [open, onClose, toggleRef]);

  return (
    <>
      <div className="menu-scrim" data-open={open} aria-hidden="true" onClick={() => onClose(true)} />
      <div
        ref={panelRef}
        id="site-menu"
        className="menu-panel"
        data-open={open}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        aria-hidden={!open}
        inert={!open}
      >
        {/* Close inside the dialog's accessible subtree for screen-reader virtual navigation.
            Visually hidden until focused; the visible toggle above morphs into the X. */}
        <button type="button" className="menu-close" onClick={() => onClose(true)}>
          Close menu
        </button>
        <nav aria-label="Menu">
          <ol className="menu-links">
            {items.map((it, i) => (
              <li key={it.id} style={{ ['--i' as string]: i }}>
                <button
                  ref={i === 0 ? firstRef : undefined}
                  type="button"
                  className="menu-link"
                  aria-current={it.current ? 'page' : undefined}
                  onClick={() => onNavigate(it.id)}
                >
                  <span className="menu-index" aria-hidden="true">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="menu-label">{it.label}</span>
                  {it.detail ? <span className="sr-only">, {it.detail}</span> : null}
                </button>
              </li>
            ))}
          </ol>
        </nav>
        <div className="menu-trials" style={{ ['--i' as string]: items.length }}>
          <h2 className="menu-section">Trials</h2>
          <ul>
            {trials.map((t) => (
              <li key={t.id}>
                <button type="button" className="menu-trial" aria-current={t.current ? 'true' : undefined} onClick={() => onSelectTrial(t.id)}>
                  {t.label}
                  {t.detail ? <span className="menu-trial-detail">{t.detail}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="menu-appearance" style={{ ['--i' as string]: items.length + 1 }}>
          <h2 className="menu-section" id="menu-appearance-h">
            Appearance
          </h2>
          <div className="swatches" role="group" aria-labelledby="menu-appearance-h">
            {THEMES.map((t) => (
              <button key={t.id} type="button" className={`swatch swatch--${t.id}`} aria-pressed={theme === t.id} onClick={() => onTheme(t.id)}>
                <span className="swatch-chip" aria-hidden="true" />
                <span className="swatch-label">{t.label}</span>
              </button>
            ))}
          </div>
        </div>
        <p className="menu-foot" style={{ ['--i' as string]: items.length + 2 }}>
          {footer}
        </p>
      </div>
    </>
  );
}
