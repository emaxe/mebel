if ('serviceWorker' in navigator) {
  addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(e => console.warn('SW не зарегистрирован:', e));
  });
}
