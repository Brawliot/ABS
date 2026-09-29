/* Service worker mínimo — caché de shell en pasadas posteriores. */
self.addEventListener("install", (event) => {
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener("fetch", () => {
  /* red primero; sin offline cache en esta pasada */
});
