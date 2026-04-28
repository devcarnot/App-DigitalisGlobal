'use client';

import Link from 'next/link';

function ChevronRight({ className = '' }) {
  return (
    <svg
      className={`h-3.5 w-3.5 shrink-0 text-slate-300 ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

/**
 * Accessible breadcrumb trail.
 * @param {{
 *   items: { label: string, href?: string | null }[],
 *   className?: string,
 *   linkClassName?: string,
 *   currentClassName?: string,
 *   chevronClassName?: string,
 * }} props
 */
export default function Breadcrumbs({
  items,
  className = '',
  linkClassName = 'font-medium text-[#103D4D]/90 hover:text-[#103D4D] transition-colors',
  currentClassName = 'font-semibold text-slate-800',
  chevronClassName = '',
}) {
  if (!items?.length) return null;

  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-slate-600 dark:text-slate-400">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`} className="flex min-w-0 items-center gap-1.5">
              {i > 0 ? <ChevronRight className={chevronClassName} /> : null}
              {item.href && !isLast ? (
                <Link href={item.href} className={`min-w-0 truncate ${linkClassName}`}>
                  {item.label}
                </Link>
              ) : (
                <span
                  className={`min-w-0 truncate ${isLast ? currentClassName : 'text-slate-600'}`}
                  aria-current={isLast ? 'page' : undefined}
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
