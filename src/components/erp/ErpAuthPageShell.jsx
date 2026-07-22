'use client';

/**
 * Shared layout for workspace auth screens: white page, soft brand wash, card + logo.
 * Use on /erp/login, /erp/reset-password, /erp/accept-invite, and admin sign-in.
 */

const ERP_AUTH_FIELD_BASE =
  'w-full rounded-2xl border border-slate-200/90 bg-white text-[15px] text-slate-900 shadow-[inset_0_1px_2px_rgba(15,23,42,0.03)] outline-none transition placeholder:text-slate-400 focus:border-[#103D4D]/45 focus:ring-2 focus:ring-cyan-400/20';

/** Standard text / email inputs */
export const ERP_AUTH_FIELD_CLASS = `${ERP_AUTH_FIELD_BASE} px-4 py-3.5`;

/** Password row (room for trailing toggle icon) */
export const ERP_AUTH_PASSWORD_FIELD_CLASS = `${ERP_AUTH_FIELD_BASE} py-3.5 pl-4 pr-12`;

export const ERP_AUTH_FIELD_MUTED_CLASS =
  'w-full rounded-2xl border border-slate-200/90 bg-slate-50/90 px-4 py-3.5 text-[15px] text-slate-600 outline-none cursor-not-allowed shadow-inner';

export const ERP_AUTH_FIELD_MUTED_ICON_CLASS = `${ERP_AUTH_FIELD_MUTED_CLASS.replace('px-4', '')} pl-11 pr-4`;

export const ERP_AUTH_PRIMARY_BUTTON_CLASS =
  'w-full rounded-2xl erp-brand-fill py-3.5 text-[15px] font-bold shadow-lg shadow-[#103D4D]/20 transition active:scale-[0.99] hover:brightness-105 disabled:pointer-events-none disabled:opacity-50';

export const ERP_AUTH_LABEL_CLASS =
  'block text-[13px] font-semibold text-slate-700';

export const ERP_AUTH_LINK_CLASS =
  'font-semibold text-[#103D4D] transition hover:text-[#0d3442] hover:underline underline-offset-4';

function ErpAuthRadialLayers() {
  return (
    <div
      className="pointer-events-none fixed inset-0 -z-10 bg-[#f8fafc]"
      aria-hidden
    />
  );
}

function InviteHeroPanel({ eyebrow, title, description, meta }) {
  return (
    <div className="relative flex flex-col justify-between overflow-hidden rounded-[1.35rem] bg-gradient-to-br from-[#103D4D] via-[#0c4a5c] to-cyan-900 p-8 text-white shadow-[0_28px_80px_-24px_rgba(16,61,77,0.55)] sm:p-10 lg:min-h-[32rem]">
      <div
        className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-cyan-400/20 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-24 -left-12 h-48 w-48 rounded-full bg-teal-300/15 blur-3xl"
        aria-hidden
      />
      <div className="relative">
        {eyebrow ? (
          <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-cyan-200/90">{eyebrow}</p>
        ) : null}
        <img
          src="/Digitalisglobal%20logo.png"
          alt=""
          className="mt-6 h-12 w-12 object-contain"
          width={48}
          height={48}
        />
        <h1 className="mt-6 text-2xl font-bold tracking-tight sm:text-3xl">{title || 'Join the workspace'}</h1>
        {description ? <p className="mt-3 max-w-sm text-sm leading-relaxed text-cyan-50/90">{description}</p> : null}
        {meta ? <div className="mt-5 flex flex-wrap gap-2">{meta}</div> : null}
      </div>
      <ul className="relative mt-10 space-y-3 text-sm text-cyan-50/85">
        {[
          'Track projects, tasks, and deadlines in one place',
          'Chat with your team and share files securely',
          'Get updates when work is assigned to you',
        ].map((line) => (
          <li key={line} className="flex items-start gap-2.5">
            <span
              className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/15 text-[11px] text-cyan-100"
              aria-hidden
            >
              ✓
            </span>
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </div>
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
 *   variant?: 'default' | 'invite',
 *   inviteMeta?: React.ReactNode,
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
  variant = 'default',
  inviteMeta,
}) {
  const logoTop = eyebrow ? 'mt-4' : '';
  const titleTop = eyebrow || showLogo ? 'mt-8' : '';

  if (variant === 'invite') {
    return (
      <div className="relative flex min-h-[100dvh] items-center justify-center px-4 py-10 sm:px-6 sm:py-14">
        <ErpAuthRadialLayers />
        <div className="relative w-full max-w-5xl">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-stretch">
            <div className="hidden lg:block">
              <InviteHeroPanel
                eyebrow={eyebrow}
                title={title}
                description={description}
                meta={inviteMeta}
              />
            </div>
            <div className="flex flex-col justify-center">
              <div className="overflow-hidden rounded-[1.35rem] border border-slate-200/80 bg-white/95 shadow-[0_24px_70px_-28px_rgba(15,23,42,0.2)] ring-1 ring-white/80 backdrop-blur-sm sm:p-1">
                <div className="lg:hidden border-b border-slate-100 bg-gradient-to-r from-[#103D4D] to-cyan-800 px-6 py-6 text-white">
                  {eyebrow ? (
                    <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-200/90">{eyebrow}</p>
                  ) : null}
                  <img
                    src="/Digitalisglobal%20logo.png"
                    alt=""
                    className="mt-3 h-9 w-9 object-contain"
                    width={36}
                    height={36}
                  />
                  {title ? <h1 className="mt-3 text-xl font-bold tracking-tight">{title}</h1> : null}
                  {description ? <p className="mt-1.5 text-sm text-cyan-50/90">{description}</p> : null}
                  {inviteMeta ? <div className="mt-3 flex flex-wrap gap-2">{inviteMeta}</div> : null}
                </div>
                <div className="p-6 sm:p-8 lg:p-9">
                  <p className="hidden text-[10px] font-bold uppercase tracking-[0.2em] text-[#103D4D]/70 lg:block">
                    Your details
                  </p>
                  <p className="mt-1 hidden text-sm text-slate-500 lg:block">
                    Complete the form below to activate your account.
                  </p>
                  <div className="mt-6 lg:mt-5">{children}</div>
                  {footer}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center bg-[#f8fafc] px-4 py-16 sm:px-6">
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

/** Icon + input row for modern auth forms */
export function ErpAuthInputGroup({ id, label, icon, children, hint }) {
  return (
    <div>
      <label htmlFor={id} className={ERP_AUTH_LABEL_CLASS}>
        {label}
      </label>
      <div className="relative mt-2">
        {icon ? (
          <span
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
            aria-hidden
          >
            {icon}
          </span>
        ) : null}
        {children}
      </div>
      {hint ? <p className="mt-1.5 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export const ERP_AUTH_FIELD_WITH_ICON_CLASS = `${ERP_AUTH_FIELD_BASE} py-3.5 pl-11 pr-4`;

export const ERP_AUTH_PASSWORD_WITH_ICON_CLASS = `${ERP_AUTH_FIELD_BASE} py-3.5 pl-11 pr-12`;
