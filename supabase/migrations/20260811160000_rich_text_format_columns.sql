-- Rich text format discriminator: existing rows stay markdown; new editor saves html.

-- Notes
alter table public.erp_notes add column if not exists body_format text not null default 'markdown';
alter table public.erp_notes drop constraint if exists erp_notes_body_format_check;
alter table public.erp_notes add constraint erp_notes_body_format_check check (body_format in ('markdown', 'html'));

-- Projects
alter table public.erp_projects add column if not exists description_format text not null default 'markdown';
alter table public.erp_projects drop constraint if exists erp_projects_description_format_check;
alter table public.erp_projects add constraint erp_projects_description_format_check check (description_format in ('markdown', 'html'));

-- Tasks
alter table public.erp_tasks add column if not exists description_format text not null default 'markdown';
alter table public.erp_tasks drop constraint if exists erp_tasks_description_format_check;
alter table public.erp_tasks add constraint erp_tasks_description_format_check check (description_format in ('markdown', 'html'));

-- Task comments
alter table public.erp_task_comments add column if not exists body_format text not null default 'markdown';
alter table public.erp_task_comments drop constraint if exists erp_task_comments_body_format_check;
alter table public.erp_task_comments add constraint erp_task_comments_body_format_check check (body_format in ('markdown', 'html'));

-- Project chat
alter table public.erp_messages add column if not exists body_format text not null default 'markdown';
alter table public.erp_messages drop constraint if exists erp_messages_body_format_check;
alter table public.erp_messages add constraint erp_messages_body_format_check check (body_format in ('markdown', 'html'));

-- Direct messages
alter table public.erp_direct_messages add column if not exists body_format text not null default 'markdown';
alter table public.erp_direct_messages drop constraint if exists erp_direct_messages_body_format_check;
alter table public.erp_direct_messages add constraint erp_direct_messages_body_format_check check (body_format in ('markdown', 'html'));

-- Group messages
alter table public.erp_group_messages add column if not exists body_format text not null default 'markdown';
alter table public.erp_group_messages drop constraint if exists erp_group_messages_body_format_check;
alter table public.erp_group_messages add constraint erp_group_messages_body_format_check check (body_format in ('markdown', 'html'));

-- Announcements
alter table public.erp_announcements add column if not exists body_format text not null default 'markdown';
alter table public.erp_announcements drop constraint if exists erp_announcements_body_format_check;
alter table public.erp_announcements add constraint erp_announcements_body_format_check check (body_format in ('markdown', 'html'));

-- Meetings (agenda stored in description)
alter table public.erp_meetings add column if not exists description_format text not null default 'markdown';
alter table public.erp_meetings drop constraint if exists erp_meetings_description_format_check;
alter table public.erp_meetings add constraint erp_meetings_description_format_check check (description_format in ('markdown', 'html'));

-- Reminders
alter table public.erp_reminders add column if not exists body_format text not null default 'markdown';
alter table public.erp_reminders drop constraint if exists erp_reminders_body_format_check;
alter table public.erp_reminders add constraint erp_reminders_body_format_check check (body_format in ('markdown', 'html'));

-- Leave requests
alter table public.erp_leave_requests add column if not exists reason_format text not null default 'markdown';
alter table public.erp_leave_requests add column if not exists reviewer_note_format text not null default 'markdown';
alter table public.erp_leave_requests drop constraint if exists erp_leave_requests_reason_format_check;
alter table public.erp_leave_requests add constraint erp_leave_requests_reason_format_check check (reason_format in ('markdown', 'html'));
alter table public.erp_leave_requests drop constraint if exists erp_leave_requests_reviewer_note_format_check;
alter table public.erp_leave_requests add constraint erp_leave_requests_reviewer_note_format_check check (reviewer_note_format in ('markdown', 'html'));

-- Remote work
alter table public.erp_remote_work_requests add column if not exists reason_format text not null default 'markdown';
alter table public.erp_remote_work_requests add column if not exists reviewer_note_format text not null default 'markdown';
alter table public.erp_remote_work_requests drop constraint if exists erp_remote_work_requests_reason_format_check;
alter table public.erp_remote_work_requests add constraint erp_remote_work_requests_reason_format_check check (reason_format in ('markdown', 'html'));
alter table public.erp_remote_work_requests drop constraint if exists erp_remote_work_requests_reviewer_note_format_check;
alter table public.erp_remote_work_requests add constraint erp_remote_work_requests_reviewer_note_format_check check (reviewer_note_format in ('markdown', 'html'));

-- CRM leads
alter table public.erp_crm_leads add column if not exists notes_format text not null default 'markdown';
alter table public.erp_crm_leads drop constraint if exists erp_crm_leads_notes_format_check;
alter table public.erp_crm_leads add constraint erp_crm_leads_notes_format_check check (notes_format in ('markdown', 'html'));

-- Invoices
alter table public.erp_invoices add column if not exists customer_note_format text not null default 'markdown';
alter table public.erp_invoices add column if not exists internal_memo_format text not null default 'markdown';
alter table public.erp_invoices add column if not exists email_message_format text not null default 'markdown';
alter table public.erp_invoices drop constraint if exists erp_invoices_customer_note_format_check;
alter table public.erp_invoices add constraint erp_invoices_customer_note_format_check check (customer_note_format in ('markdown', 'html'));
alter table public.erp_invoices drop constraint if exists erp_invoices_internal_memo_format_check;
alter table public.erp_invoices add constraint erp_invoices_internal_memo_format_check check (internal_memo_format in ('markdown', 'html'));
alter table public.erp_invoices drop constraint if exists erp_invoices_email_message_format_check;
alter table public.erp_invoices add constraint erp_invoices_email_message_format_check check (email_message_format in ('markdown', 'html'));

-- Performance reviews
alter table public.erp_performance_reviews add column if not exists notes_format text not null default 'markdown';
alter table public.erp_performance_reviews drop constraint if exists erp_performance_reviews_notes_format_check;
alter table public.erp_performance_reviews add constraint erp_performance_reviews_notes_format_check check (notes_format in ('markdown', 'html'));

-- Project credentials
alter table public.erp_project_credentials add column if not exists notes_format text not null default 'markdown';
alter table public.erp_project_credentials drop constraint if exists erp_project_credentials_notes_format_check;
alter table public.erp_project_credentials add constraint erp_project_credentials_notes_format_check check (notes_format in ('markdown', 'html'));

-- Blog posts
alter table public.blog_posts add column if not exists content_format text not null default 'markdown';
alter table public.blog_posts drop constraint if exists blog_posts_content_format_check;
alter table public.blog_posts add constraint blog_posts_content_format_check check (content_format in ('markdown', 'html'));
