function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export async function registerPushSubscription({ erpAuthorizedFetch }) {
  if (typeof window === 'undefined') return { ok: false, reason: 'no_window' };
  if (!('serviceWorker' in navigator)) return { ok: false, reason: 'no_sw' };
  if (!('PushManager' in window)) return { ok: false, reason: 'no_push' };

  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return { ok: false, reason: 'permission_denied' };

  const pkRes = await fetch('/api/erp/push/public-key', { cache: 'no-store' });
  const pkData = await pkRes.json().catch(() => ({}));
  const publicKey = pkData?.publicKey;
  if (!publicKey) return { ok: false, reason: 'missing_vapid_public_key' };

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  const endpoint = sub?.endpoint;
  await erpAuthorizedFetch('/api/erp/push/subscribe', {
    method: 'POST',
    body: JSON.stringify({ subscription: sub.toJSON() }),
  });

  return { ok: true, endpoint: endpoint || null };
}

export async function unregisterPushSubscription({ erpAuthorizedFetch }) {
  if (typeof window === 'undefined') return { ok: false, reason: 'no_window' };
  if (!('serviceWorker' in navigator)) return { ok: false, reason: 'no_sw' };
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return { ok: true, reason: 'no_subscription' };
  const endpoint = sub.endpoint;
  try {
    await erpAuthorizedFetch('/api/erp/push/unsubscribe', {
      method: 'POST',
      body: JSON.stringify({ endpoint }),
    });
  } catch {
    // still attempt local unsubscribe
  }
  await sub.unsubscribe();
  return { ok: true };
}

