importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyBYAV2LTgrNQnE3-5w-1_P780O9xP45b9A",
  authDomain: "cancionero-parroquial-269d0.firebaseapp.com",
  databaseURL: "https://cancionero-parroquial-269d0-default-rtdb.firebaseio.com",
  projectId: "cancionero-parroquial-269d0",
  storageBucket: "cancionero-parroquial-269d0.appspot.com",
  messagingSenderId: "485257131926",
  appId: "1:485257131926:web:8a506bfb8e5c8e70"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('🔔 [SW Web Push] Mensaje recibido en segundo plano:', payload);
  const notificationTitle = payload.notification ? payload.notification.title : (payload.data ? payload.data.title : 'Aviso Parroquial');
  const notificationOptions = {
    body: payload.notification ? payload.notification.body : (payload.data ? payload.data.body : ''),
    icon: 'favicon.png',
    data: payload.data
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', (event) => {
  console.log('🚀 [SW Web Push] Notificación cliqueada:', event.notification);
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('/cancionero-link/app/');
    })
  );
});
