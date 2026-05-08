'use client';

/**
 * Shared layout for workspace auth screens: white page, soft brand wash, card + logo.
 * Use on /erp/login, /erp/reset-password, /erp/accept-invite, and admin sign-in.
 */

const ERP_AUTH_FIELD_BASE =
  'w-full rounded-xl border border-slate-200 bg-white text-[15px] text-slate-900 shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)] outline-none transition placeholder:text-slate-400 focus:border-[#103D4D]/40 focus:ring-2 focus:ring-[#103D4D]/12';

/** Standard text / email inputs */
export const ERP_AUTH_FIELD_CLASS = `${ERP_AUTH_FIELD_BASE} px-4 py-3.5`;

/** Password row (room for trailing toggle icon) */
export const ERP_AUTH_PASSWORD_FIELD_CLASS = `${ERP_AUTH_FIELD_BASE} py-3.5 pl-4 pr-12`;

export const ERP_AUTH_FIELD_MUTED_CLASS =
  'w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-[15px] text-slate-700 outline-none cursor-not-allowed';

export const ERP_AUTH_PRIMARY_BUTTON_CLASS =
  'w-full rounded-xl erp-brand-fill py-3.5 text-[15px] font-bold active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50';

export const ERP_AUTH_LABEL_CLASS =
  'block text-xs font-semibold uppercase tracking-wide text-slate-500';

export const ERP_AUTH_LINK_CLASS =
  'font-semibold text-[#103D4D] transition hover:text-[#0d3442] hover:underline underline-offset-4';

function ErpAuthRadialLayers() {
  return (
    <>
      <div
        className="pointer-events-none fixed inset-0 -z-10 bg-[color:var(--erp-canvas-light)] dark:hidden"
        aria-hidden
      />
      <div className="pointer-events-none fixed inset-0 -z-10 hidden dark:block bg-[color:var(--erp-canvas-dark)]" aria-hidden />
    </>
  );
}

/**
 * @param {{
 *   eyebrow?: string,
 *   title?: string,
 *   description?: string | null,
 *   showLogo?: boolean,
 *   logoClassName?: string,
 *   children: React.ReactNode,
 *   footer?: React.ReactNode,
 *   maxWidthClass?: string,
 * }} props
 */
export default function ErpAuthPageShell({
  eyebrow,
  title,
  description,
  showLogo = true,
  logoClassName,
  children,
  footer,
  maxWidthClass = 'max-w-[420px]',
}) {
  const logoTop = eyebrow ? 'mt-4' : '';
  const titleTop = eyebrow || showLogo ? 'mt-8' : '';

  return (
    <div className="relative min-h-[100dvh] flex items-center justify-center bg-white px-4 py-16 sm:px-6">
      <ErpAuthRadialLayers />

      <div className={`relative w-full ${maxWidthClass}`}>
        <div className="rounded-[1.5rem] border border-slate-200/90 bg-white p-8 shadow-[0_22px_64px_-28px_rgba(15,23,42,0.18)] ring-1 ring-slate-100 sm:p-10">
          <div className="relative">
            {eyebrow ? (
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#103D4D]/80">{eyebrow}</p>
            ) : null}

            {showLogo ? (
              <img
                src="/Digitalis_logo_black.png"
                alt="Digitalis Global"
                className={`h-10 w-auto max-w-[220px] object-contain object-left ${logoTop} ${logoClassName || ''}`.trim()}
              />
            ) : null}

            {title ? (
              <h1 className={`text-2xl font-bold tracking-tight text-slate-900 sm:text-[1.65rem] ${titleTop}`}>{title}</h1>
            ) : null}

            {description ? <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p> : null}

            {children}

            {footer}
          </div>
        </div>
      </div>
    </div>
  );
}
