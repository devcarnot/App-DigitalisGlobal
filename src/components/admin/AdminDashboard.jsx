'use client';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import { DEPARTMENTS } from '../../data/careersDepartments';
import { getMarketingSiteOrigin } from '../../lib/public-site-url';
import AdminErpPanel from './AdminErpPanel';
import AdminBlogManager from './AdminBlogManager';
import ErpNativeSelect from '../erp/ErpNativeSelect';
import ErpConfirmDialog from '../erp/ErpConfirmDialog';

// Careers postings are managed here but live on the public marketing site.
const MARKETING_ORIGIN = getMarketingSiteOrigin();

const PAGE_SIZE = 7;

const formatDate = (iso) => {
  try {
    return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return iso;
  }
};

const labelFor = (key) => {
  const labels = {
    name: 'Name',
    email: 'Email',
    phone: 'Phone',
    subject: 'Subject',
    message: 'Message',
    project_name: 'Project',
  };
  return labels[key] || key.replace(/_/g, ' ');
};

const IcoMail = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className={props.className} aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
  </svg>
);
const IcoPhone = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className={props.className} aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
  </svg>
);
const IcoFolder = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className={props.className} aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
  </svg>
);
const IcoChat = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className={props.className} aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V8.118c0-1.621-1.152-3.026-2.76-3.235A48.234 48.234 0 0012 4.5c-2.392 0-4.744.175-7.043.513C3.373 5.207 2.25 6.612 2.25 8.118v8.272z" />
  </svg>
);
const IcoClock = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className={props.className} aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const dashboardPageBg =
  'min-h-screen bg-gradient-to-br from-sky-100/50 via-slate-50 to-cyan-100/25';

/** Wider than max-w-6xl; tighter horizontal padding so logo / sign-out sit closer to viewport edges. */
const adminShellInner = 'max-w-[min(100%,92rem)] mx-auto px-3 sm:px-4 lg:px-6';

const sectionCardFrame =
  'rounded-2xl border border-[#589CD5]/20 bg-white/90 shadow-[0_8px_32px_-14px_rgba(88,156,213,0.22)] ring-1 ring-[#52C4C9]/10 backdrop-blur-sm';

const jobInputClass =
  'w-full px-3 py-2.5 rounded-xl border border-slate-200/90 bg-slate-50/50 text-slate-900 shadow-inner shadow-slate-900/[0.02] transition-colors focus:border-sky-400/80 focus:bg-white focus:outline-none focus:ring-4 focus:ring-sky-500/12';
const SubmissionCard = ({ row, index = 0 }) => {
  const p = row.payload || {};
  const isContact = row.type === 'contact';
  const name = p.name;
  const email = p.email;
  const phone = p.phone;
  const message = p.message;
  const projectOrSubject = isContact ? p.subject : p.project_name;

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay: Math.min(index * 0.03, 0.32) }}
      className="group relative overflow-hidden rounded-2xl border border-[#589CD5]/20 bg-white/95 shadow-[0_4px_24px_-8px_rgba(88,156,213,0.2)] ring-1 ring-[#52C4C9]/10 transition-all duration-300 hover:-translate-y-0.5 hover:border-[#589CD5]/40 hover:shadow-[0_16px_48px_-14px_rgba(88,156,213,0.28)]"
    >
      <div
        className={`pointer-events-none absolute inset-y-0 left-0 top-1 w-1 rounded-bl-2xl ${
          isContact ? 'bg-gradient-to-b from-sky-400 via-sky-500 to-cyan-500' : 'bg-gradient-to-b from-indigo-400 via-violet-500 to-[#52C4C9]'
        }`}
        aria-hidden
      />

      <div className="relative pl-5 sm:pl-6 pt-1">
        <div className="flex flex-col gap-4 border-b border-sky-100/80 bg-gradient-to-br from-sky-50/50 via-white to-cyan-50/25 px-4 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-5 sm:py-5">
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${
                  isContact ? 'bg-sky-100/90 text-sky-900 ring-1 ring-sky-200/80' : 'bg-indigo-100/90 text-indigo-900 ring-1 ring-indigo-200/80'
                }`}
              >
                {isContact ? (
                  <>
                    <IcoChat className="h-3.5 w-3.5 opacity-90" />
                    Contact
                  </>
                ) : (
                  <>
                    <IcoFolder className="h-3.5 w-3.5 opacity-90" />
                    Project download
                  </>
                )}
              </span>
            </div>
            {name && (
              <h3 className="mt-2 text-lg font-bold tracking-tight text-slate-900 sm:text-xl">{name}</h3>
            )}
            {!name && email && (
              <h3 className="mt-2 truncate text-lg font-semibold text-slate-800">{email}</h3>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2 self-start rounded-xl bg-white/80 px-3 py-2 text-xs text-slate-500 shadow-sm ring-1 ring-slate-200/80 sm:flex-col sm:items-end sm:py-2.5">
            <span className="flex items-center gap-1.5 font-medium tabular-nums text-slate-600">
              <IcoClock className="h-4 w-4 text-sky-500/90" />
              {formatDate(row.created_at)}
            </span>
          </div>
        </div>

        <div className="space-y-4 px-4 py-5 sm:px-5 sm:py-6">
          {(email || phone) && (
            <div className="grid gap-3 sm:grid-cols-2">
              {email && (
                <a
                  href={`mailto:${email}`}
                  className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-slate-50/50 px-4 py-3 transition-all hover:border-sky-300/70 hover:bg-sky-50/60 hover:shadow-sm"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-sky-600 shadow-sm ring-1 ring-slate-200/60">
                    <IcoMail className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Email</span>
                    <span className="block truncate text-sm font-semibold text-sky-700">{email}</span>
                  </span>
                </a>
              )}
              {phone && (
                <a
                  href={`tel:${phone}`}
                  className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-slate-50/50 px-4 py-3 transition-all hover:border-emerald-300/70 hover:bg-emerald-50/50 hover:shadow-sm"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-emerald-600 shadow-sm ring-1 ring-slate-200/60">
                    <IcoPhone className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Phone</span>
                    <span className="block text-sm font-semibold text-slate-800">{phone}</span>
                  </span>
                </a>
              )}
            </div>
          )}

          {projectOrSubject && (
            <div className="flex gap-3 rounded-xl border border-slate-200/70 bg-gradient-to-r from-slate-50/80 to-white px-4 py-3.5 ring-1 ring-slate-100/80">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200/70">
                {isContact ? <IcoChat className="h-5 w-5" /> : <IcoFolder className="h-5 w-5" />}
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{isContact ? 'Subject' : 'Project'}</p>
                <p className="mt-0.5 text-[15px] font-semibold leading-snug text-slate-900">{projectOrSubject}</p>
              </div>
            </div>
          )}

          {message && (
            <div className="relative overflow-hidden rounded-2xl border border-sky-100 bg-gradient-to-b from-sky-50/90 to-white px-4 py-4 sm:px-5 sm:py-5">
              <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-sky-400/10 blur-2xl" aria-hidden />
              <div className="relative flex gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/90 text-sky-600 shadow-sm ring-1 ring-sky-200/60">
                  <IcoChat className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-sky-800/70">Message</p>
                  <p className="mt-1.5 whitespace-pre-wrap text-[15px] leading-relaxed text-slate-700">{String(message)}</p>
                </div>
              </div>
            </div>
          )}

          {/* Fallback: any extra payload keys not covered above (rare) */}
          {(() => {
            const shown = new Set(['name', 'email', 'phone', 'message', isContact ? 'subject' : 'project_name']);
            const extras = Object.keys(p).filter((k) => p[k] != null && p[k] !== '' && !shown.has(k));
            if (extras.length === 0) return null;
            return (
              <dl className="grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2">
                {extras.map((key) => (
                  <div key={key}>
                    <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{labelFor(key)}</dt>
                    <dd className="mt-1 text-sm text-slate-800 whitespace-pre-wrap">{String(p[key])}</dd>
                  </div>
                ))}
              </dl>
            );
          })()}
        </div>
      </div>
    </motion.article>
  );
};

function PaginationControls({ page, totalPages, totalItems, onPageChange, idPrefix }) {
  if (totalItems === 0) return null;
  const start = (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, totalItems);
  const canPrev = page > 1;
  const canNext = page < totalPages;

  const btnBase =
    'inline-flex items-center justify-center min-w-[2.25rem] h-9 px-3 rounded-xl text-sm font-semibold transition-all duration-200 disabled:opacity-40 disabled:pointer-events-none';
  const pageBtn = (n) =>
    `${btnBase} ${
      page === n
        ? 'erp-brand-fill text-white shadow-md shadow-sky-500/20'
        : 'bg-white text-slate-600 border border-slate-200 hover:border-sky-300/60 hover:bg-sky-50/50'
    }`;

  const maxVisible = 5;
  const pageNumbers = useMemo(() => {
    if (totalPages <= maxVisible) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const half = Math.floor(maxVisible / 2);
    let startN = Math.max(1, page - half);
    let endN = Math.min(totalPages, startN + maxVisible - 1);
    if (endN - startN < maxVisible - 1) startN = Math.max(1, endN - maxVisible + 1);
    return Array.from({ length: endN - startN + 1 }, (_, i) => startN + i);
  }, [page, totalPages]);

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-8 mt-1 border-t border-[#589CD5]/15">
      <p className="text-sm text-slate-500 tabular-nums">
        Showing{' '}
        <span className="font-semibold text-slate-700">
          {start}–{end}
        </span>{' '}
        of <span className="font-semibold text-slate-700">{totalItems}</span>
      </p>
      <nav className="flex flex-wrap items-center gap-2" aria-label={`Pagination ${idPrefix}`}>
        <button
          type="button"
          className={`${btnBase} bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 hover:border-slate-300`}
          disabled={!canPrev}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </button>
        <div className="flex items-center gap-1">
          {pageNumbers[0] > 1 && (
            <>
              <button type="button" className={pageBtn(1)} onClick={() => onPageChange(1)}>
                1
              </button>
              {pageNumbers[0] > 2 && <span className="px-1 text-slate-400">…</span>}
            </>
          )}
          {pageNumbers.map((n) => (
            <button key={n} type="button" className={pageBtn(n)} onClick={() => onPageChange(n)}>
              {n}
            </button>
          ))}
          {pageNumbers.length > 0 && pageNumbers[pageNumbers.length - 1] < totalPages && (
            <>
              {pageNumbers[pageNumbers.length - 1] < totalPages - 1 && <span className="px-1 text-slate-400">…</span>}
              <button type="button" className={pageBtn(totalPages)} onClick={() => onPageChange(totalPages)}>
                {totalPages}
              </button>
            </>
          )}
        </div>
        <button
          type="button"
          className={`${btnBase} bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 hover:border-slate-300`}
          disabled={!canNext}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </button>
      </nav>
    </div>
  );
}

const slugFromTitle = (title) =>
  (title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

const VALID_ADMIN_TABS = new Set(['submissions', 'jobs', 'blog', 'erp']);

const AdminDashboard = () => {
  const [submissions, setSubmissions] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [confirmDeleteJob, setConfirmDeleteJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [addJobOpen, setAddJobOpen] = useState(false);
  const [editingJobId, setEditingJobId] = useState(null);
  const [jobForm, setJobForm] = useState({
    title: '',
    slug: '',
    workplace_type: 'Hybrid',
    location: '',
    department: '',
    work_type: 'Full time',
    description: '',
    role_summary: '',
    role: '',
    application_deadline: '',
  });
  const [savingJob, setSavingJob] = useState(false);
  const [submissionPage, setSubmissionPage] = useState(1);
  const [jobsPage, setJobsPage] = useState(1);
  const emptyJobForm = () => ({
    title: '', slug: '', workplace_type: 'Hybrid', location: '', department: '', work_type: 'Full time',
    description: '', role_summary: '', role: '', application_deadline: '',
  });
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const section = useMemo(() => {
    const raw = (searchParams.get('tab') || 'submissions').toLowerCase();
    return VALID_ADMIN_TABS.has(raw) ? raw : 'submissions';
  }, [searchParams]);

  const setSection = useCallback(
    (id) => {
      if (!VALID_ADMIN_TABS.has(id)) return;
      const params = new URLSearchParams(searchParams.toString());
      params.set('tab', id);
      const q = params.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    const fetchSubmissions = async () => {
      const { data, error } = await supabase
        .from('submissions')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) {
        console.error(error);
        setSubmissions([]);
      } else {
        setSubmissions(data || []);
      }
      setLoading(false);
    };
    fetchSubmissions();
  }, []);

  useEffect(() => {
    if (section !== 'jobs' || !supabase) return;
    setJobsLoading(true);
    supabase
      .from('jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error(error);
        setJobs(error ? [] : data || []);
        setJobsLoading(false);
      });
  }, [section]);

  const filtered = useMemo(
    () => (filter === 'all' ? submissions : submissions.filter((s) => s.type === filter)),
    [submissions, filter]
  );

  useEffect(() => {
    setSubmissionPage(1);
  }, [filter]);

  useEffect(() => {
    setSubmissionPage((p) => {
      const tp = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
      return Math.min(p, tp);
    });
  }, [filtered.length]);

  useEffect(() => {
    setJobsPage((p) => {
      const tp = Math.max(1, Math.ceil(jobs.length / PAGE_SIZE));
      return Math.min(p, tp);
    });
  }, [jobs.length]);

  const submissionTotalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const submissionPageSafe = Math.min(submissionPage, submissionTotalPages);
  const paginatedSubmissions = useMemo(() => {
    const start = (submissionPageSafe - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, submissionPageSafe]);

  const jobsTotalPages = Math.max(1, Math.ceil(jobs.length / PAGE_SIZE));
  const jobsPageSafe = Math.min(jobsPage, jobsTotalPages);
  const paginatedJobs = useMemo(() => {
    const start = (jobsPageSafe - 1) * PAGE_SIZE;
    return jobs.slice(start, start + PAGE_SIZE);
  }, [jobs, jobsPageSafe]);

  const handleSignOut = async () => {
    if (supabase) await supabase.auth.signOut();
    // Unique URL busts password-manager autofill tied to /admin/login
    router.replace(`/admin/login?_=${Date.now()}`);
  };

  const handleJobTitleChange = (title) => {
    setJobForm((f) => ({ ...f, title, slug: f.slug || slugFromTitle(title) }));
  };

  const openAddJob = () => {
    setEditingJobId(null);
    setJobForm(emptyJobForm());
    setAddJobOpen(true);
  };

  const openEditJob = (job) => {
    setEditingJobId(job.id);
    setJobForm({
      title: job.title || '',
      slug: job.slug || '',
      workplace_type: job.workplace_type || 'Hybrid',
      location: job.location || '',
      department: job.department || '',
      work_type: job.work_type || 'Full time',
      description: job.description || '',
      role_summary: job.role_summary || '',
      role: job.role || '',
      application_deadline: job.application_deadline ? job.application_deadline.slice(0, 10) : '',
    });
    setAddJobOpen(true);
  };

  const handleSaveJob = async (e) => {
    e.preventDefault();
    if (!supabase || !jobForm.title.trim()) return;
    setSavingJob(true);
    const slug = jobForm.slug.trim() || slugFromTitle(jobForm.title);
    const payload = {
      title: jobForm.title.trim(),
      slug,
      workplace_type: jobForm.workplace_type || null,
      location: jobForm.location.trim() || null,
      department: jobForm.department.trim() || null,
      work_type: jobForm.work_type || null,
      description: jobForm.description.trim() || null,
      role_summary: jobForm.role_summary.trim() || null,
      role: jobForm.role.trim() || null,
      application_deadline: jobForm.application_deadline.trim() || null,
      updated_at: new Date().toISOString(),
    };
    if (editingJobId) {
      const { data: updated, error } = await supabase.from('jobs').update(payload).eq('id', editingJobId).select().single();
      setSavingJob(false);
      if (error) {
        alert(error.message || 'Failed to update job');
        return;
      }
      if (updated) setJobs((prev) => prev.map((j) => (j.id === editingJobId ? updated : j)));
    } else {
      const { data: inserted, error } = await supabase.from('jobs').insert(payload).select().single();
      setSavingJob(false);
      if (error) {
        alert(error.message || 'Failed to add job');
        return;
      }
      if (inserted) setJobs((prev) => [inserted, ...prev]);
    }
    setJobForm(emptyJobForm());
    setEditingJobId(null);
    setAddJobOpen(false);
  };

  const executeDeleteJob = async () => {
    const job = confirmDeleteJob;
    if (!job || !supabase) return;
    const { error } = await supabase.from('jobs').delete().eq('id', job.id);
    if (error) {
      alert(error.message || 'Failed to delete');
      return;
    }
    setConfirmDeleteJob(null);
    setJobs((prev) => prev.filter((j) => j.id !== job.id));
    if (editingJobId === job.id) {
      setAddJobOpen(false);
      setEditingJobId(null);
      setJobForm(emptyJobForm());
    }
  };

  if (!supabase) {
    return (
      <div className="p-6">
        <p className="text-red-600">Supabase is not configured.</p>
      </div>
    );
  }

  return (
    <div className={`${dashboardPageBg} transition-colors duration-300`}>
      <header className="sticky top-0 z-20 border-b border-[#589CD5]/20 bg-white/85 shadow-[0_4px_24px_-12px_rgba(88,156,213,0.15)] backdrop-blur-md">
        <div className={`${adminShellInner} py-3 sm:py-4 flex items-center justify-between`}>
          <img src="/Digitalis_logo_black.png" alt="Digitalis" className="h-9 w-auto" />
          <button
            type="button"
            onClick={handleSignOut}
            className="group inline-flex items-center gap-2 rounded-full border border-slate-200/90 bg-white pl-3.5 pr-4 py-2 text-sm font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition-all duration-200 hover:border-red-200/90 hover:bg-red-50/60 hover:text-slate-800 hover:shadow-[0_4px_14px_-4px_rgba(248,113,113,0.25)] focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/35 focus-visible:ring-offset-2"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-red-50 text-red-600 transition-colors group-hover:bg-red-100 group-hover:text-red-700 group-hover:shadow-inner">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-4 w-4" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
              </svg>
            </span>
            Sign out
          </button>
        </div>
      </header>

      <div className={`${adminShellInner} py-6 sm:py-8`}>
        <div className={`mb-8 overflow-hidden ${sectionCardFrame}`}>
          <div className="px-5 py-5 sm:px-6 sm:py-6">
            <h1 className="text-3xl font-bold tracking-tight erp-brand-text">
              Dashboard
            </h1>
            <p className="text-slate-600 text-sm mt-2 leading-relaxed">
              Submissions, careers, and ERP — same workspace look everywhere.
            </p>
          </div>
        </div>

        <div className="mb-8 rounded-2xl erp-brand-fill p-[1px] shadow-[0_12px_40px_-12px_rgba(37,99,235,0.35)]">
          <nav className="flex gap-1 rounded-[13px] bg-white/95 p-1 backdrop-blur-sm" aria-label="Main sections">
            {[
              { id: 'submissions', label: 'Submissions' },
              { id: 'jobs', label: 'Jobs' },
              { id: 'blog', label: 'Blog' },
              { id: 'erp', label: 'ERP' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSection(tab.id)}
                className={`relative flex-1 min-w-0 rounded-xl px-4 py-3 text-sm font-semibold transition-colors duration-200 ${
                  section === tab.id ? 'text-white' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50/90'
                }`}
              >
                {section === tab.id && (
                  <motion.span
                    layoutId="admin-primary-tab"
                    className="absolute inset-0 rounded-xl erp-brand-fill shadow-md shadow-sky-500/25"
                    transition={{ type: 'spring', stiffness: 400, damping: 34 }}
                  />
                )}
                <span className="relative z-10">{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>

        {section === 'submissions' && (
          <>
            <div className={`mb-8 overflow-hidden ${sectionCardFrame}`}>
              <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#589CD5]">Filter by type</p>
              <div
                className="inline-flex rounded-full bg-gradient-to-r from-sky-100/80 to-cyan-100/50 p-1 gap-0.5 ring-1 ring-[#589CD5]/25 shadow-inner"
                role="group"
                aria-label="Submission type"
              >
                {['all', 'contact', 'download'].map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setFilter(id)}
                    className={`rounded-full px-4 py-2 text-xs font-bold uppercase tracking-wide transition-all duration-200 ${
                      filter === id
                        ? 'erp-brand-fill text-white shadow-md shadow-sky-500/20'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
                    }`}
                  >
                    {id === 'all' ? 'All' : id === 'contact' ? 'Contact' : 'Download'}
                  </button>
                ))}
              </div>
              </div>
            </div>
            {loading ? (
              <div className={`overflow-hidden ${sectionCardFrame}`}>
                <div className="flex flex-col items-center justify-center py-16">
                  <div className="mb-4 h-10 w-10 animate-spin rounded-full border-2 border-[#589CD5] border-t-transparent" />
                  <p className="font-medium text-slate-600">Loading submissions…</p>
                </div>
              </div>
            ) : filtered.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={`overflow-hidden text-center ${sectionCardFrame}`}
              >
                <div className="p-12">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#589CD5]/15 to-[#52C4C9]/20 ring-2 ring-white shadow-inner">
                  <svg className="h-8 w-8 text-[#589CD5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                  </svg>
                </div>
                <p className="font-semibold text-slate-800">No submissions yet</p>
                <p className="mt-1 text-sm text-slate-500">New contact and download form entries will appear here.</p>
                </div>
              </motion.div>
            ) : (
              <>
                <ul className="space-y-5">
                  {paginatedSubmissions.map((row, i) => (
                    <li key={row.id}>
                      <SubmissionCard row={row} index={(submissionPageSafe - 1) * PAGE_SIZE + i} />
                    </li>
                  ))}
                </ul>
                <PaginationControls
                  page={submissionPageSafe}
                  totalPages={submissionTotalPages}
                  totalItems={filtered.length}
                  onPageChange={setSubmissionPage}
                  idPrefix="submissions"
                />
              </>
            )}
          </>
        )}

        {section === 'jobs' && (
          <>
            <div className={`mb-6 overflow-hidden ${sectionCardFrame}`}>
              <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                <div>
                  <p className="text-sm font-semibold text-slate-800">Careers</p>
                  <p className="mt-0.5 text-sm text-slate-600">Listings appear on the public careers page.</p>
                </div>
                <button
                  type="button"
                  onClick={openAddJob}
                  className="shrink-0 rounded-xl erp-brand-fill px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-[#589CD5]/25 transition-all hover:shadow-xl"
                >
                  Add job
                </button>
              </div>
            </div>
            {addJobOpen && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`mb-8 overflow-hidden ${sectionCardFrame}`}
              >
                <div className="border-b border-sky-100/80 bg-gradient-to-br from-sky-50/40 via-white to-violet-50/20 px-6 py-4">
                  <h2 className="text-lg font-bold text-slate-900">{editingJobId ? 'Edit job' : 'Add job opening'}</h2>
                </div>
                <form onSubmit={handleSaveJob} className="space-y-4 p-6">
                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Title *</label>
                    <input type="text" required value={jobForm.title} onChange={(e) => handleJobTitleChange(e.target.value)} className={jobInputClass} placeholder="e.g. Senior React Developer" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Slug (URL)</label>
                    <input type="text" value={jobForm.slug} onChange={(e) => setJobForm((f) => ({ ...f, slug: e.target.value }))} className={jobInputClass} placeholder="senior-react-developer" />
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Workplace type</label>
                      <ErpNativeSelect value={jobForm.workplace_type} onChange={(e) => setJobForm((f) => ({ ...f, workplace_type: e.target.value }))} className={`${jobInputClass} cursor-pointer !pr-10`}>
                        <option value="Hybrid">Hybrid</option>
                        <option value="On-site">On-site</option>
                        <option value="Remote">Remote</option>
                      </ErpNativeSelect>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Work type</label>
                      <ErpNativeSelect value={jobForm.work_type} onChange={(e) => setJobForm((f) => ({ ...f, work_type: e.target.value }))} className={`${jobInputClass} cursor-pointer !pr-10`}>
                        <option value="Full time">Full time</option>
                        <option value="Part time">Part time</option>
                        <option value="Contract">Contract</option>
                        <option value="Internship">Internship</option>
                      </ErpNativeSelect>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Location</label>
                      <input type="text" value={jobForm.location} onChange={(e) => setJobForm((f) => ({ ...f, location: e.target.value }))} className={jobInputClass} placeholder="e.g. Sydney, Australia" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Department</label>
                      <ErpNativeSelect value={jobForm.department} onChange={(e) => setJobForm((f) => ({ ...f, department: e.target.value }))} className={`${jobInputClass} cursor-pointer !pr-10`}>
                        <option value="">Select department</option>
                        {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
                      </ErpNativeSelect>
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Description</label>
                    <textarea rows={4} value={jobForm.description} onChange={(e) => setJobForm((f) => ({ ...f, description: e.target.value }))} className={`${jobInputClass} resize-none`} placeholder="Company/role description..." />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Role summary</label>
                    <textarea rows={2} value={jobForm.role_summary} onChange={(e) => setJobForm((f) => ({ ...f, role_summary: e.target.value }))} className={`${jobInputClass} resize-none`} placeholder="Short summary of the role" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Role (one bullet per line)</label>
                    <textarea rows={6} value={jobForm.role} onChange={(e) => setJobForm((f) => ({ ...f, role: e.target.value }))} className={`${jobInputClass} resize-none font-mono text-sm`} placeholder="• Responsibility one&#10;• Responsibility two" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Application deadline (last date)</label>
                    <input type="date" value={jobForm.application_deadline} onChange={(e) => setJobForm((f) => ({ ...f, application_deadline: e.target.value }))} className={`max-w-xs ${jobInputClass}`} />
                    <p className="mt-1 text-xs text-slate-500">Optional. After this date the job will show as &quot;Deadline has passed&quot; in grayscale.</p>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-2">
                    <button type="submit" disabled={savingJob} className="rounded-xl erp-brand-fill px-5 py-2.5 font-bold text-white shadow-lg shadow-sky-500/20 disabled:opacity-50">
                      {savingJob ? 'Saving…' : editingJobId ? 'Update job' : 'Add job'}
                    </button>
                    <button type="button" onClick={() => { setAddJobOpen(false); setEditingJobId(null); setJobForm(emptyJobForm()); }} className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 font-semibold text-slate-700 hover:bg-slate-50">
                      Cancel
                    </button>
                  </div>
                </form>
              </motion.div>
            )}
            {jobsLoading ? (
              <div className={`overflow-hidden ${sectionCardFrame}`}>
                <div className="flex justify-center py-14">
                  <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#589CD5] border-t-transparent" />
                </div>
              </div>
            ) : jobs.length === 0 ? (
              <div className={`overflow-hidden text-center ${sectionCardFrame}`}>
                <div className="p-12">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-100 to-sky-100 text-violet-700 ring-2 ring-white">
                    <IcoFolder className="h-7 w-7" />
                  </div>
                  <p className="font-semibold text-slate-800">No jobs yet</p>
                  <p className="mt-1 text-sm text-slate-500">Click “Add job” to create a listing.</p>
                </div>
              </div>
            ) : (
              <>
                <ul className="space-y-4">
                  {paginatedJobs.map((j) => {
                    const deadlinePassed = j.application_deadline && new Date(j.application_deadline) < new Date();
                    return (
                      <li
                        key={j.id}
                        className={`group relative overflow-hidden rounded-2xl border border-[#589CD5]/20 bg-white/95 shadow-[0_4px_20px_-8px_rgba(88,156,213,0.18)] ring-1 ring-[#52C4C9]/10 transition-all hover:border-[#589CD5]/40 hover:shadow-[0_12px_36px_-12px_rgba(88,156,213,0.22)] ${deadlinePassed ? 'opacity-75' : ''}`}
                      >
                        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                        <div className="flex min-w-0 items-start gap-3">
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl erp-brand-fill text-white shadow-md shadow-sky-500/20">
                            <IcoFolder className="h-5 w-5 text-white" />
                          </span>
                          <div className="min-w-0">
                            <p className="font-bold text-slate-900">{j.title}</p>
                            <p className="mt-0.5 text-sm text-slate-600">
                              {j.department || '—'}
                              {j.application_deadline
                                ? ` · Deadline: ${new Date(j.application_deadline).toLocaleDateString()}${deadlinePassed ? ' (passed)' : ''}`
                                : ''}
                            </p>
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:gap-3">
                          <a
                            href={`${MARKETING_ORIGIN}/careers/job/${j.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-lg px-3 py-2 text-sm font-bold text-[#589CD5] hover:bg-sky-50"
                          >
                            View
                          </a>
                          <button
                            type="button"
                            onClick={() => openEditJob(j)}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:border-[#589CD5]/40 hover:bg-sky-50/50"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteJob(j)}
                            className="rounded-lg border border-red-100 bg-red-50/50 px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-100/80"
                          >
                            Delete
                          </button>
                        </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <PaginationControls
                  page={jobsPageSafe}
                  totalPages={jobsTotalPages}
                  totalItems={jobs.length}
                  onPageChange={setJobsPage}
                  idPrefix="jobs"
                />
              </>
            )}
          </>
        )}

        {section === 'blog' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <AdminBlogManager sectionCardFrame={sectionCardFrame} />
          </motion.div>
        )}

        {section === 'erp' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="relative"
          >
            <div
              className="absolute inset-0 -z-10 rounded-3xl bg-gradient-to-r from-[#589CD5]/20 via-transparent to-[#52C4C9]/20 blur-2xl"
              aria-hidden
            />
            <AdminErpPanel />
          </motion.div>
        )}

        <ErpConfirmDialog
          open={confirmDeleteJob != null}
          title="Delete job listing?"
          confirmLabel="Delete"
          tone="danger"
          onCancel={() => setConfirmDeleteJob(null)}
          onConfirm={() => void executeDeleteJob()}
        >
          <p>
            Delete <span className="font-semibold">“{confirmDeleteJob?.title}”</span>? This cannot be undone.
          </p>
        </ErpConfirmDialog>
      </div>
    </div>
  );
};

export default AdminDashboard;
