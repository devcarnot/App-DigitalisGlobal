import './globals.css';
import { Inter } from 'next/font/google';
import Script from 'next/script';
import AppShell from './AppShell';
import PwaRegister from '../components/PwaRegister';

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-inter',
});

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
};

const erpColorSchemeInit = `(function(){try{var k='erp_color_scheme',s=localStorage.getItem(k),d=document.documentElement;if(s==='dark')d.classList.add('dark');else d.classList.remove('dark');}catch(e){}})();`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Script id="erp-color-scheme-init" strategy="beforeInteractive">
          {erpColorSchemeInit}
        </Script>
        <PwaRegister />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
