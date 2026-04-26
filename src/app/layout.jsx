import './globals.css';
import { Inter } from 'next/font/google';
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

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <PwaRegister />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
