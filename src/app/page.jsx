import DigitalisErpLanding from '../components/DigitalisErpLanding';

export const metadata = {
  title: 'Workspace',
  description:
    'Sign in to the Digitalis workspace—projects, tasks, and team communication in one place.',
};

export default function Home() {
  return (
    <div className="antialiased">
      <DigitalisErpLanding />
    </div>
  );
}
