importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyA8Yl0V1SZFD-Hcb9UPAnkpqCm2bsuqLH8",
  authDomain: "daybreak-36be5.firebaseapp.com",
  projectId: "daybreak-36be5",
  storageBucket: "daybreak-36be5.firebasestorage.app",
  messagingSenderId: "77834726790",
  appId: "1:77834726790:web:2ee892f83a87a458651007"
});

// Handles incoming push messages and notification taps automatically.
firebase.messaging();

var CACHE_NAME = "daybreak-v1";
var APP_SHELL = ["/", "/index.html", "/manifest.json", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", function (event) {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) { return cache.addAll(APP_SHELL); })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(names.filter(function (n) { return n !== CACHE_NAME; }).map(function (n) { return caches.delete(n); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE_NAME).then(function (cache) { cache.put(event.request, copy); });
      return res;
    }).catch(function () { return caches.match(event.request); })
  );
});
