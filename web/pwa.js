if ('serviceWorker' in navigator) {
  // Обновление кеша: новый service worker перехватывает страницу, пока она показывает старые файлы (cache-first), поэтому после смены
  // версии страницу один раз перезагружаем. Первая установка (контроллера ещё не было), открытый диалог и ввод текста не прерываются.
  const had = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    const a = document.activeElement, busy = document.querySelector('dialog[open]') || (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
    if (!had || reloaded || busy) return;
    reloaded = true; location.reload();
  });
  addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(e => console.warn('SW не зарегистрирован:', e));
  });
}
