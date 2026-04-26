'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import { useErpSession } from '../../../../components/erp/useErpSession';
import { isValidErpProjectId } from '../../../../lib/erp-project-id';

const ErpProjectWorkspace = dynamic(
  () => import('../../../../components/erp/ErpProjectWorkspace'),
  {
    ssr: false,
    loading: () => (
      <div className="flex justify-center py-24">
        <div className="h-11 w-11 animate-spin rounded-full border-2 border-[#103D4D] border-t-transparent" />
      </div>
    ),
  },
);

function ProjectWorkspaceGate() {
  const params = useParams();
  const projectId = typeof params?.projectId === 'string' ? params.projectId : null;
  const { session } = useErpSession();

  if (!projectId) {
    return null;
  }

  if (!isValidErpProjectId(projectId)) {
    return (
      <div className="py-16 text-center">
        <p className="text-slate-600">This project link is not valid.</p>
        <a href="/erp/projects" className="mt-4 inline-block text-sm font-semibold text-[#103D4D] underline">
          Back to projects
        </a>
      </div>
    );
  }

  return <ErpProjectWorkspace projectId={projectId} userId={session?.user?.id} />;
}

export default function ErpProjectPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-24">
          <div className="h-11 w-11 animate-spin rounded-full border-2 border-[#103D4D] border-t-transparent" />
        </div>
      }
    >
      <ProjectWorkspaceGate />
    </Suspense>
  );
}
