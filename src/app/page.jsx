import DigitalisErpLanding from '../components/DigitalisErpLanding';
import { buildWorkspaceLandingPageMetadata } from '../lib/public-site-seo';

export const metadata = buildWorkspaceLandingPageMetadata();

export default function Home() {
  return (
    <div className="antialiased">
      <DigitalisErpLanding />
    </div>
  );
}
