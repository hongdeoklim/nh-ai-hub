/* Firebase Cloud Messaging background handler.
 * Served at /firebase-messaging-sw.js (public/ is copied to the site root).
 * Config values below are the public web app config (same as src/lib/firebase.ts) —
 * not secrets. The VAPID key and the server-side service account are NOT here.
 */
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js')

firebase.initializeApp({
  projectId: 'nh-ai-hub-90829',
  appId: '1:200477728686:web:0dcbfabf6f7cfb607cf23f',
  storageBucket: 'nh-ai-hub-90829.firebasestorage.app',
  apiKey: 'AIzaSyALahAl8_UmqOEJQ7PpzvP1v53YOLKDZbA',
  authDomain: 'nh-ai-hub-90829.firebaseapp.com',
  messagingSenderId: '200477728686',
})

const messaging = firebase.messaging()

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || payload.data?.title || 'NH-AX-HUB'
  const options = {
    body: payload.notification?.body || payload.data?.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: payload.data?.url || '/' },
  }
  self.registration.showNotification(title, options)
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) return client.focus()
      }
      return self.clients.openWindow(url)
    }),
  )
})
