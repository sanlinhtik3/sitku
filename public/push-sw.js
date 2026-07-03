// Push notification service worker - handles push events and notification clicks
// Premium BeeBot Push with rich media, custom vibration, and sound readiness

self.addEventListener('push', function(event) {
  let data = {
    title: 'BeeBot 🐝',
    body: 'You have a new notification!',
    icon: '/pwa-192x192.png',
    badge: '/favicon.ico',
    vibrate: [200, 100, 200, 100, 200], // BeeBot Buzz-Buzz-Buzz
  };

  try {
    if (event.data) {
      const payload = event.data.json();
      data = {
        title: payload.title || data.title,
        body: payload.body || data.body,
        icon: payload.icon || data.icon,
        badge: payload.badge || data.badge,
        tag: payload.tag || 'beebot-notification',
        data: {
          url: payload.url || '/',
          sound: payload.sound || 'default',
        },
        vibrate: payload.vibrate || data.vibrate,
        actions: payload.actions || [
          { action: 'view', title: '👀 View', icon: '/pwa-192x192.png' },
          { action: 'snooze', title: '⏰ Snooze', icon: '/pwa-192x192.png' },
        ],
        // Rich media: large banner image (Android Chrome, Windows)
        image: payload.image || undefined,
        // Silent mode: suppress sound/vibration
        silent: payload.silent === true,
        // Require interaction: keep visible until tapped
        requireInteraction: payload.requireInteraction === true,
      };
    }
  } catch (e) {
    // If JSON parsing fails, try text
    if (event.data) {
      data.body = event.data.text();
    }
  }

  const notificationOptions = {
    body: data.body,
    icon: data.icon,
    badge: data.badge,
    tag: data.tag,
    data: data.data,
    vibrate: data.silent ? [] : data.vibrate,
    actions: data.actions,
    silent: data.silent,
    requireInteraction: data.requireInteraction || false,
  };

  // Add image if provided (large banner)
  if (data.image) {
    notificationOptions.image = data.image;
  }

  event.waitUntil(
    self.registration.showNotification(data.title, notificationOptions)
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  const action = event.action; // "view", "snooze", or "" (body tap)
  const url = event.notification.data?.url || '/';

  // Handle "Snooze" action — re-show notification after 5 minutes
  if (action === 'snooze') {
    event.waitUntil(
      new Promise(function(resolve) {
        setTimeout(function() {
          self.registration.showNotification(event.notification.title, {
            body: '⏰ Snoozed reminder: ' + event.notification.body,
            icon: event.notification.icon,
            badge: event.notification.badge,
            tag: (event.notification.tag || 'beebot') + '-snoozed',
            data: event.notification.data,
            vibrate: [200, 100, 200, 100, 200],
          }).then(resolve);
        }, 5 * 60 * 1000); // 5 minutes
      })
    );
    return;
  }

  // Handle "View" action or body tap — navigate to URL
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      // Focus existing window if available
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      // Otherwise open new window
      return clients.openWindow(url);
    })
  );
});
