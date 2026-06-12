import { pushErpAppToast, pushErpValidationToast } from './erp-app-toast';
import { friendlyInvoiceError } from './erp-invoice-brand';

export function notifyInvoiceError(title, body) {
  pushErpValidationToast({
    title: String(title || '').trim() || 'Invoice error',
    body: friendlyInvoiceError(body),
  });
}

export function notifyInvoiceSuccess(title, body = '') {
  pushErpAppToast({
    title: String(title || '').trim() || 'Done',
    body: String(body || '').trim(),
    tone: 'success',
  });
}
