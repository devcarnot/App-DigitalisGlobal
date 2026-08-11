/* Minimal SW: PWA install + web push. No fetch listener: avoids extra SW-layer errors on failed requests. */
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Web Push: show OS notification + deep-link into ERP.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Digitalis Global', body: 'New notification' };
  }

  const title = data.title || 'Digitalis Global';
  const options = {
    body: data.body || '',
    icon: data.icon || '/icons/pwa-192.png',
    badge: data.badge || '/icons/pwa-192.png',
    data: {
      url: data.url || '/erp',
    },
  };
  if (data.tag) options.tag = data.tag;
  if (data.requireInteraction) options.requireInteraction = true;
  if (Array.isArray(data.actions) && data.actions.length) options.actions = data.actions;
  if (data.renotify) options.renotify = true;

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  // Decline action button: just dismiss; no navigation. (Authenticated decline-back-to-caller
  // happens from the in-app banner where we have the user's bearer token.)
  if (event.action === 'decline') {
    event.notification.close();
    return;
  }

  event.notification.close();
  const data = (event.notification && event.notification.data) || {};
  const targetUrl = data.url || '/erp';

  // Tell any open clients that we want them to broadcast the user's intent to answer; they
  // can deep-link via router.push() (no full reload), preserving in-page state.
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientsArr) => {
        const action = event.action || 'open';
        for (const client of clientsArr) {
          if (client && 'focus' in client) {
            try {
              client.postMessage({ type: 'erp-notification-click', action, url: targetUrl });
            } catch {}
            client.navigate(targetUrl).catch(() => {});
            return client.focus();
          }
        }
        if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
        return null;
      }),
  );
});
