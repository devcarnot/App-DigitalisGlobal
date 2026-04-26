import { Outfit } from 'next/font/google';
import DigitalisErpLanding from '../components/DigitalisErpLanding';

const outfit = Outfit({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
});

export const metadata = {
  title: 'Workspace',
  description:
    'Sign in to the Digitalis workspace—projects, tasks, and team communication in one place.',
};

export default function Home() {
  return (
    <div className={`${outfit.className} antialiased`}>
      <DigitalisErpLanding />
    </div>
  );
}
