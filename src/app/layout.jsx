import './globals.css';
import Script from 'next/script';
import AppShell from './AppShell';
import PwaRegister from '../components/PwaRegister';

export const metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'),
  ),
  title: {
    default: 'Digitalis ERP',
    template: '%s | Digitalis ERP',
  },
  description: 'Digitalis team workspace: projects, tasks, and messages.',
  robots: { index: false, follow: false },
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/icons/pwa-192.png',
    apple: '/icons/pwa-192.png',
  },
};

export const viewport = {
  themeColor: '#103D4D',
  width: 'device-width',
  initialScale: 1,
  minimumScale: 0.5,
  maximumScale: 5,
  userScalable: true,
  interactiveWidget: 'resizes-content',
};

const erpColorSchemeInit = `(function(){try{var k='erp_color_scheme',s=localStorage.getItem(k),d=document.documentElement,p=location.pathname,b=document.body;if(p==='/'||p===''){d.classList.remove('dark');return;}var auth=p==='/erp/login'||p==='/erp/reset-password'||p==='/erp/accept-invite'||p.indexOf('/erp/auth/')===0;if(auth&&b){b.style.backgroundColor='#f8fafc';d.classList.remove('dark');return;}if(s==='dark')d.classList.add('dark');else d.classList.remove('dark');}catch(e){}})();`;

/**
 * Suppresses the "A listener indicated an asynchronous response by returning true,
 * but the message channel closed before a response was received" unhandled-rejection
 * spam that browser extensions (password managers, translators, ad blockers,
 * Grammarly, screenshot helpers, etc.) inject into every Chromium page.
 *
 * Mounted as a `beforeInteractive` script so the listener is installed BEFORE the
 * extension content scripts fail their async-response promises: otherwise React's
 * own useEffect-based guard registers too late on a hard-refresh of pages like
 * /erp/admin/attendance or /erp/my-tasks and the noise still hits the console.
 *
 * We match the exact extension-noise fragments and never silence anything else, so
 * real errors remain visible.
 */
const erpExtensionNoiseInit = `(function(){try{var FRAG=['message channel closed before a response was received','A listener indicated an asynchronous response by returning true'];function match(m){if(!m)return false;m=String(m);for(var i=0;i<FRAG.length;i++){if(m.indexOf(FRAG[i])!==-1)return true;}return false;}function shouldHush(reason){if(!reason)return false;if(typeof reason==='string')return match(reason);if(typeof reason.message==='string')return match(reason.message);return false;}function hushArgs(args){for(var i=0;i<args.length;i++){if(match(args[i]))return true;if(args[i]&&typeof args[i].message==='string'&&match(args[i].message))return true;}return false;}window.addEventListener('unhandledrejection',function(e){if(shouldHush(e&&e.reason)){e.preventDefault();if(e.stopImmediatePropagation)e.stopImmediatePropagation();}},true);window.addEventListener('error',function(e){var r=(e&&e.error)||(e&&e.message);if(shouldHush(r)){e.preventDefault();if(e.stopImmediatePropagation)e.stopImmediatePropagation();}},true);['error','warn'].forEach(function(level){var orig=console[level];if(typeof orig!=='function')return;console[level]=function(){if(hushArgs(arguments))return;return orig.apply(console,arguments);};});}catch(_){}})();`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Script id="erp-extension-noise-init" strategy="beforeInteractive">
          {erpExtensionNoiseInit}
        </Script>
        <Script id="erp-color-scheme-init" strategy="beforeInteractive">
          {erpColorSchemeInit}
        </Script>
        <PwaRegister />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
