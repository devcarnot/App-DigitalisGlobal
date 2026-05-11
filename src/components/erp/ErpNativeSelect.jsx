'use client';

import React, {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

/**
 * Drop-in replacement for a native <select>.
 *
 * The OS-rendered dropdown popup ignores almost every CSS hook we have for
 * dark mode (Chromium on Windows / Edge paints the popup chrome white even
 * with both element-level and document-level `color-scheme: dark`), which
 * is why "All project types" was opening as a giant white sheet on top of
 * a dark page. Rather than fight per-platform popup quirks, we render the
 * dropdown ourselves with a portal-anchored listbox that we have full
 * control over.
 *
 * Public API matches the historic native `<select>` wrapper:
 *   - `value` / `defaultValue` / `onChange({ target: { value } })`
 *   - `disabled`, `id`, `aria-label`, `aria-invalid`, `name`
 *   - children: `<option>` and `<optgroup>` (anything else is ignored)
 *   - `className` / `wrapperClassName` / `zoneClassName` / `zoneSize`
 *
 * For ARIA we follow the listbox pattern: a button trigger with
 * `aria-haspopup="listbox"` + `aria-expanded`, a portal `role="listbox"`,
 * each row `role="option"` + `aria-selected`, and `aria-activedescendant`
 * on the listbox so screen readers track keyboard navigation.
 */

const ZONE = {
  md: { rail: 'w-10', pr: 'pr-10', railRound: 'rounded-r-[11px]', icon: 'h-4 w-4', stroke: 2.25 },
  sm: { rail: 'w-8', pr: 'pr-8', railRound: 'rounded-r-lg', icon: 'h-3.5 w-3.5', stroke: 2.1 },
  xs: { rail: 'w-6', pr: 'pr-6', railRound: 'rounded-r-[5px]', icon: 'h-3 w-3', stroke: 2 },
};

/** Filter/toolbar selects (e.g. Projects grid) — padding matches `zoneSize="md"`. */
export const ERP_FILTER_SELECT_CLASS =
  `w-full cursor-pointer rounded-xl border border-slate-200 bg-white pl-3.5 ${ZONE.md.pr} py-2 text-sm font-medium ` +
  `text-slate-800 shadow-sm transition hover:border-slate-300/90 focus:border-[#103D4D]/40 focus:outline-none ` +
  `focus:ring-2 focus:ring-cyan-400/25 ` +
  `dark:border-teal-800/50 dark:bg-[#101a22] dark:text-slate-200 dark:shadow-black/35 dark:hover:border-teal-700/50 ` +
  `dark:focus:border-teal-600/55 dark:focus:ring-teal-500/20`;

/**
 * Walk a children tree of `<option>` / `<optgroup>` and flatten into rows.
 * Drills through React fragments (`<>…</>`) and arrays so consumers can
 * conditionally render groups of options (very common pattern in the app).
 */
function extractItems(children, accumulator = null) {
  const out = accumulator || [];
  React.Children.forEach(children, (child) => {
    if (child == null || typeof child === 'boolean') return;
    if (Array.isArray(child)) {
      extractItems(child, out);
      return;
    }
    if (!React.isValidElement(child)) return;
    if (child.type === React.Fragment) {
      extractItems(child.props.children, out);
      return;
    }
    if (child.type === 'option') {
      out.push({
        kind: 'option',
        value: child.props.value === undefined ? '' : String(child.props.value),
        label: textFromChildren(child.props.children, child.props.value),
        disabled: Boolean(child.props.disabled),
      });
      return;
    }
    if (child.type === 'optgroup') {
      out.push({ kind: 'group', label: String(child.props.label || '') });
      // optgroup children may themselves be wrapped in fragments / arrays.
      const inner = [];
      extractItems(child.props.children, inner);
      for (const item of inner) {
        if (item.kind === 'option') {
          out.push({ ...item, inGroup: true });
        }
      }
    }
  });
  return out;
}

function textFromChildren(children, fallback) {
  if (children == null) return String(fallback ?? '');
  if (typeof children === 'string' || typeof children === 'number') return String(children);
  if (Array.isArray(children)) {
    return children
      .map((c) => (typeof c === 'string' || typeof c === 'number' ? String(c) : ''))
      .join('');
  }
  return String(fallback ?? '');
}

/**
 * Position the popover relative to the trigger; flip to above when there's
 * not enough room below. Uses `position: fixed` so it survives scroll
 * containers / overflow:hidden ancestors without getting clipped.
 */
function computePosition(triggerRect, popoverHeight, viewportPadding = 8) {
  if (!triggerRect) return { left: 0, top: 0, width: 0 };
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const spaceBelow = vh - triggerRect.bottom;
  const spaceAbove = triggerRect.top;
  const placeAbove = spaceBelow < Math.min(popoverHeight, 240) && spaceAbove > spaceBelow;

  const width = Math.max(triggerRect.width, 200);
  const left = Math.max(viewportPadding, Math.min(triggerRect.left, vw - width - viewportPadding));
  const top = placeAbove
    ? Math.max(viewportPadding, triggerRect.top - popoverHeight - 4)
    : Math.min(vh - viewportPadding - popoverHeight, triggerRect.bottom + 4);
  return { left, top, width, placeAbove };
}

export default function ErpNativeSelect({
  className = '',
  wrapperClassName = '',
  zoneClassName = '',
  zoneSize = 'md',
  value,
  defaultValue,
  onChange,
  onBlur,
  onFocus,
  disabled,
  children,
  id: idProp,
  name,
  required,
  'aria-label': ariaLabelProp,
  'aria-invalid': ariaInvalidProp,
  ...rest
}) {
  const generatedId = useId();
  const selectId = idProp || generatedId;
  const listboxId = `${selectId}-listbox`;
  const z = ZONE[zoneSize] || ZONE.md;

  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(() =>
    defaultValue === undefined ? '' : String(defaultValue),
  );
  const currentValue = isControlled ? String(value ?? '') : internalValue;

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 0, placeAbove: false });

  const triggerRef = useRef(null);
  const popoverRef = useRef(null);

  const items = useMemo(() => extractItems(children), [children]);
  const optionsOnly = useMemo(() => items.filter((i) => i.kind === 'option'), [items]);
  const selectedOption = optionsOnly.find((o) => o.value === currentValue) || null;
  const selectedLabel = selectedOption?.label ?? '';

  const reposition = useCallback(() => {
    const trigger = triggerRef.current;
    const popover = popoverRef.current;
    if (!trigger) return;
    const triggerRect = trigger.getBoundingClientRect();
    const popoverHeight = popover ? popover.offsetHeight : Math.min(280, optionsOnly.length * 36 + 16);
    setPosition(computePosition(triggerRect, popoverHeight));
  }, [optionsOnly.length]);

  // Lock initial position before paint so the popover doesn't flash at 0,0.
  useLayoutEffect(() => {
    if (!open) return;
    reposition();
    const idx = optionsOnly.findIndex((o) => o.value === currentValue);
    setActiveIndex(idx >= 0 ? idx : optionsOnly.findIndex((o) => !o.disabled));
  }, [open, currentValue, optionsOnly, reposition]);

  // Reposition + close on viewport changes.
  useEffect(() => {
    if (!open) return undefined;
    const onResize = () => reposition();
    const onScroll = (e) => {
      // Don't close while scrolling inside the popover itself.
      if (popoverRef.current && popoverRef.current.contains(e.target)) return;
      setOpen(false);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, reposition]);

  // Outside click + Esc.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      const t = e.target;
      if (triggerRef.current?.contains(t)) return;
      if (popoverRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Scroll the active row into view as the user navigates.
  useEffect(() => {
    if (!open) return;
    const popover = popoverRef.current;
    if (!popover) return;
    const node = popover.querySelector(`[data-erp-opt-idx="${activeIndex}"]`);
    if (node) {
      const top = node.offsetTop;
      const bottom = top + node.offsetHeight;
      if (top < popover.scrollTop) popover.scrollTop = top;
      else if (bottom > popover.scrollTop + popover.clientHeight) {
        popover.scrollTop = bottom - popover.clientHeight;
      }
    }
  }, [activeIndex, open]);

  const commitValue = useCallback(
    (val) => {
      const stringVal = String(val ?? '');
      if (!isControlled) setInternalValue(stringVal);
      onChange?.({ target: { value: stringVal, name }, currentTarget: { value: stringVal, name } });
      setOpen(false);
      // Return focus to the trigger so subsequent Tab moves to next form field.
      requestAnimationFrame(() => triggerRef.current?.focus());
    },
    [isControlled, onChange, name],
  );

  const findNextEnabled = useCallback(
    (from, dir) => {
      if (optionsOnly.length === 0) return -1;
      let n = from;
      for (let i = 0; i < optionsOnly.length; i += 1) {
        n = (n + dir + optionsOnly.length) % optionsOnly.length;
        if (!optionsOnly[n]?.disabled) return n;
      }
      return from;
    },
    [optionsOnly],
  );

  const handleTriggerKeyDown = (e) => {
    if (disabled) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(true);
    } else if (e.key.length === 1 && /\S/.test(e.key)) {
      // Type-ahead jump on closed control: pick first option starting with the typed letter.
      const ch = e.key.toLowerCase();
      const match = optionsOnly.find(
        (o) => !o.disabled && o.label.trim().toLowerCase().startsWith(ch),
      );
      if (match) commitValue(match.value);
    }
  };

  const handleListKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => findNextEnabled(i, +1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => findNextEnabled(i, -1));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const opt = optionsOnly[activeIndex];
      if (opt && !opt.disabled) commitValue(opt.value);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActiveIndex(findNextEnabled(-1, +1));
    } else if (e.key === 'End') {
      e.preventDefault();
      setActiveIndex(findNextEnabled(0, -1));
    } else if (e.key === 'Tab') {
      // Allow tabbing away while keeping current selection.
      setOpen(false);
    }
  };

  return (
    <div className={`relative isolate min-w-0 ${wrapperClassName}`.trim()}>
      <button
        ref={triggerRef}
        type="button"
        id={selectId}
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        onKeyDown={handleTriggerKeyDown}
        onBlur={onBlur}
        onFocus={onFocus}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={ariaLabelProp}
        aria-invalid={ariaInvalidProp}
        data-erp-select-trigger=""
        className={`min-w-0 text-left ${className}`.trim()}
        {...rest}
      >
        <span className={`block truncate ${selectedLabel ? '' : 'opacity-60'}`}>
          {selectedLabel || 'Select…'}
        </span>
      </button>
      <span
        className={
          `pointer-events-none absolute inset-y-px right-px z-[1] flex ${z.rail} items-center justify-center ` +
          `border-l border-slate-200/75 bg-gradient-to-b from-slate-50/98 to-slate-100/90 text-[#103D4D] ` +
          `dark:border-teal-900/55 dark:bg-gradient-to-b dark:from-[#141f2c] dark:to-[#0a1218] dark:text-teal-300 ` +
          `${z.railRound} ${zoneClassName}`
        }
        aria-hidden
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={z.stroke}
          className={`${z.icon} shrink-0 opacity-90 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
        </svg>
      </span>

      {/* Hidden native input keeps form data semantics intact when consumers
          pass a `name` prop (uncontrolled form submit still works). */}
      {name ? <input type="hidden" name={name} value={currentValue} required={required} /> : null}

      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={popoverRef}
              id={listboxId}
              role="listbox"
              tabIndex={-1}
              aria-activedescendant={
                optionsOnly[activeIndex] ? `${selectId}-opt-${activeIndex}` : undefined
              }
              onKeyDown={handleListKeyDown}
              style={{
                position: 'fixed',
                left: position.left,
                top: position.top,
                minWidth: position.width,
                maxHeight: 'min(320px, 60vh)',
              }}
              className="z-[600] overflow-y-auto rounded-xl border border-slate-200/90 bg-white py-1 shadow-2xl ring-1 ring-slate-900/[0.06] outline-none dark:border-teal-900/55 dark:bg-[#0f1a23] dark:shadow-black/60 dark:ring-white/[0.04] [scrollbar-width:thin]"
            >
              {items.length === 0 ? (
                <p className="px-3 py-2 text-[12px] font-medium text-slate-500 dark:text-slate-400">
                  No options
                </p>
              ) : null}
              {items.map((item, idx) => {
                if (item.kind === 'group') {
                  return (
                    <p
                      key={`g-${idx}-${item.label}`}
                      className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400"
                    >
                      {item.label}
                    </p>
                  );
                }
                const optIdx = optionsOnly.findIndex(
                  (o) => o.value === item.value && o.label === item.label,
                );
                const isActive = optIdx === activeIndex;
                const isSelected = item.value === currentValue;
                return (
                  <button
                    key={`o-${idx}-${item.value}`}
                    id={`${selectId}-opt-${optIdx}`}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={item.disabled}
                    data-erp-opt-idx={optIdx}
                    disabled={item.disabled}
                    onClick={() => !item.disabled && commitValue(item.value)}
                    onMouseEnter={() => !item.disabled && setActiveIndex(optIdx)}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
                      item.inGroup ? 'pl-5' : ''
                    } ${
                      isActive
                        ? 'bg-cyan-50 text-[#103D4D] dark:bg-teal-900/40 dark:text-teal-100'
                        : 'text-slate-700 dark:text-slate-200'
                    } ${isSelected ? 'font-semibold' : ''}`}
                  >
                    <span className="truncate">{item.label}</span>
                    {isSelected ? (
                      <svg
                        className="h-4 w-4 shrink-0 text-cyan-700 dark:text-teal-300"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2.4}
                        aria-hidden
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 12l4 4 10-10" />
                      </svg>
                    ) : null}
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
