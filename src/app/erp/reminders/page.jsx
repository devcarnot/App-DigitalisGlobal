import dynamic from 'next/dynamic';

const ErpRemindersHub = dynamic(() => import('../../../components/erp/ErpRemindersHub'), {
  ssr: false,
  loading: () => (
    <div className="w-full space-y-4">
      <div className="h-28 animate-pulse rounded-2xl bg-slate-200/60 dark:bg-slate-800/50" />
      <div className="h-10 animate-pulse rounded-2xl bg-slate-200/60 dark:bg-slate-800/50" />
      <div className="h-20 animate-pulse rounded-2xl bg-slate-200/60 dark:bg-slate-800/50" />
    </div>
  ),
});

export default function ErpRemindersPage() {
  return (
    <div className="mx-auto w-full max-w-none space-y-4 px-0 sm:px-1">
      <ErpRemindersHub />
    </div>
  );
}
