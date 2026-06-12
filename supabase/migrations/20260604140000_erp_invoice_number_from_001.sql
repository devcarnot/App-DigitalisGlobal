-- Invoice numbers start at 001; keep sequence aligned with existing rows.
select setval(
  'erp_invoice_number_seq',
  greatest(coalesce((select max(invoice_number) from public.erp_invoices), 0) + 1, 1),
  false
);
