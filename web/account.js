// Интерфейс аккаунта: вход, регистрация, сброс пароля, выход, ссылка для просмотра, история версий.
// Работает с общим <dialog id="dlg"> и шапкой приложения; логика синхронизации — в sync.js.
const STATUS = { idle: '☁ Синхронизировано', syncing: '☁ Синхронизация…', offline: '☁ Нет сети', error: '☁ Ошибка синхронизации' };
const two = n => String(n).padStart(2, '0');
const fmt = t => { const d = new Date(t); return `${two(d.getDate())}.${two(d.getMonth() + 1)}.${d.getFullYear()} ${two(d.getHours())}:${two(d.getMinutes())}`; };

/**
 * ctx: { el, dlg, api, sync, toast, toggleMenu(menu, e), localCount() → число проектов на устройстве,
 *        flush() — записать текущий проект, addProject(name, P), refreshCards() }
 */
export function initAccount(ctx) {
  const { el, dlg, api, sync, toast } = ctx;
  const btn = document.getElementById('bacct'), menu = document.getElementById('am'), st = document.getElementById('syncst');
  let user = sync.user, available = true;

  const errText = r => r.offline ? 'Нет связи с сервером' : r.status === 429 ? 'Слишком много попыток, подождите минуту' : r.message || 'Не получилось, попробуйте ещё раз';
  const clearHash = () => history.replaceState(null, '', location.pathname + location.search);

  // ── диалоги: общая оболочка над <dialog id="dlg">
  function show(title, body, buttons) {
    dlg.innerHTML = ''; dlg.classList.remove('wide'); dlg.onclose = null; dlg.oncancel = null;
    const foot = el('div', 'dfoot'), bs = buttons.map(b => {
      const x = el('button', b.cls || '', b.label);
      x.onclick = async () => { x.disabled = true; try { await b.run(x); } finally { x.disabled = false; } };
      return x;
    });
    foot.append(...bs);
    dlg.append(el('h3', '', title), body, foot);
    if (!dlg.open) dlg.showModal();
    return bs;
  }
  const close = () => { if (dlg.open) dlg.close(); };
  const field = (label, type, extra = {}) => {
    const w = el('label', 'fld'), i = Object.assign(el('input', 'dtext'), { type, ...extra });
    w.append(el('span', '', label), i); return [w, i];
  };
  const submitOnEnter = (inputs, fn) => inputs.forEach(i => (i.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); fn(); } }));

  function openAuth(mode = 'login') {
    const reg = mode === 'register', body = el('div', 'dbody');
    const [fe, email] = field('Почта', 'email', { autocomplete: 'email', maxLength: 200 });
    const [fp, pass] = field('Пароль', 'password', { autocomplete: reg ? 'new-password' : 'current-password', maxLength: 200 });
    const err = el('p', 'ferr'), links = el('p', 'hint');
    const sw = el('a', 'lnk', reg ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Зарегистрироваться'); sw.href = '#'; sw.onclick = e => { e.preventDefault(); openAuth(reg ? 'login' : 'register'); };
    links.append(sw);
    if (!reg) { links.append(' · '); const fg = el('a', 'lnk', 'Забыли пароль?'); fg.href = '#'; fg.onclick = e => { e.preventDefault(); openForgot(email.value); }; links.append(fg); }
    body.append(Object.assign(el('p', 'hint'), { textContent: reg ? 'Пароль не короче 8 символов. Проекты с этого устройства попадут в аккаунт.' : 'Проекты и справочник появятся на всех ваших устройствах.' }), fe, fp, err, links);
    const go = async () => {
      err.textContent = '';
      const r = await api.post(reg ? '/auth/register' : '/auth/login', { email: email.value.trim(), password: pass.value });
      if (!r.ok) { err.textContent = errText(r); return; }
      close(); await signedIn(r.data.user);
      if (reg) toast('Аккаунт создан. Мы отправили письмо для подтверждения почты.');
    };
    show(reg ? 'Регистрация' : 'Вход', body, [{ label: reg ? 'Создать аккаунт' : 'Войти', cls: 'pri', run: go }, { label: 'Отмена', run: close }]);
    submitOnEnter([email, pass], go); email.focus();
  }

  function openForgot(value = '') {
    const body = el('div', 'dbody'), [fe, email] = field('Почта', 'email', { autocomplete: 'email', value });
    const msg = el('p', 'hint');
    body.append(Object.assign(el('p', 'hint'), { textContent: 'Пришлём ссылку для нового пароля. Она работает, если адрес был подтверждён.' }), fe, msg);
    const go = async () => {
      const r = await api.post('/auth/forgot', { email: email.value.trim() });
      msg.className = r.ok ? 'hint ok' : 'ferr'; msg.textContent = r.ok ? 'Если такой адрес подтверждён, мы отправили письмо со ссылкой.' : errText(r);
    };
    show('Сброс пароля', body, [{ label: 'Отправить письмо', cls: 'pri', run: go }, { label: 'Назад', run: () => openAuth('login') }]);
    submitOnEnter([email], go); email.focus();
  }

  function openReset(token) {
    const body = el('div', 'dbody'), [fp, pass] = field('Новый пароль', 'password', { autocomplete: 'new-password', maxLength: 200 }), err = el('p', 'ferr');
    body.append(fp, err);
    const go = async () => {
      const r = await api.post('/auth/reset', { token, password: pass.value });
      if (!r.ok) { err.textContent = errText(r); return; }
      toast('Пароль изменён. Войдите с новым паролем.'); openAuth('login');
    };
    show('Новый пароль', body, [{ label: 'Сохранить', cls: 'pri', run: go }, { label: 'Отмена', run: close }]);
    submitOnEnter([pass], go); pass.focus();
  }

  // ── вход выполнен: привязываем данные устройства к аккаунту
  async function signedIn(u) {
    user = u;
    const res = sync.setUser(u);
    if (res.foreign) await askForeign(u);
    render();
    sync.run();
  }

  function askForeign(u) {
    return new Promise(res => {
      const body = el('div', 'dbody');
      body.append(el('p', '', `На этом устройстве остались проекты другого аккаунта (${ctx.localCount()}). Что с ними сделать?`));
      const done = mode => { dlg.oncancel = null; close(); if (mode) sync.resolveForeign(u, mode); else { api.post('/auth/logout'); user = null; } res(); };
      show('Проекты другого аккаунта', body, [
        { label: 'Добавить в этот аккаунт', cls: 'pri', run: () => done('merge') },
        { label: 'Удалить с устройства', run: () => done('wipe') },
        { label: 'Выйти', run: () => done(null) },
      ]);
      dlg.oncancel = e => e.preventDefault(); // без выбора не закрывается
    });
  }

  async function openLogout() {
    ctx.flush(); menu.hidden = true;
    await sync.run();
    const n = ctx.localCount(), dirty = ctx.dirtyCount(), body = el('div', 'dbody');
    const out = async keep => { close(); await api.post('/auth/logout'); sync.signOut(keep); user = null; render(); ctx.refreshCards(); toast('Вы вышли из аккаунта'); };
    if (!n) { body.append(el('p', '', 'Выйти из аккаунта?')); return show('Выход', body, [{ label: 'Выйти', cls: 'pri', run: () => out(true) }, { label: 'Отмена', run: close }]); }
    body.append(el('p', '', `На устройстве ${n} проект(ов). Оставить их здесь или удалить? Копия останется в аккаунте.`));
    if (dirty) body.append(Object.assign(el('p', 'ferr'), { textContent: `Не синхронизировано: ${dirty}. При удалении с устройства эти правки пропадут — сначала дождитесь синхронизации.` }));
    show('Выход', body, [{ label: 'Выйти, оставить проекты', cls: 'pri', run: () => out(true) }, { label: 'Выйти и удалить с устройства', run: () => out(false) }, { label: 'Отмена', run: close }]);
  }

  // ── ссылка для просмотра и история версий работают только с синхронизированным проектом
  async function ready(id) {
    if (!user) { toast('Войдите, чтобы пользоваться этим'); openAuth('login'); return false; }
    ctx.flush(); await sync.run();
    if (sync.isDirty(id)) { toast('Проект ещё не синхронизирован: проверьте соединение'); return false; }
    return true;
  }

  async function openShare(id) {
    if (!(await ready(id))) return;
    const r = await api.post(`/projects/${encodeURIComponent(id)}/share`);
    const body = el('div', 'dbody');
    if (!r.ok) {
      body.append(el('p', '', r.status === 403 ? 'Чтобы делиться проектами, подтвердите почту: откройте ссылку из письма.' : errText(r)));
      const bs = [{ label: 'Закрыть', run: close }];
      if (r.status === 403) bs.unshift({ label: 'Отправить письмо ещё раз', cls: 'pri', run: async () => { await api.post('/auth/resend-verify'); toast('Письмо отправлено'); } });
      return show('Ссылка для просмотра', body, bs);
    }
    const url = new URL('view.html?t=' + r.data.token, location.href).href, input = Object.assign(el('input', 'dtext'), { type: 'text', readOnly: true, value: url });
    input.onfocus = () => input.select();
    body.append(Object.assign(el('p', 'hint'), { textContent: 'Любой, у кого есть ссылка, увидит проект и сможет открыть задание на распил и КП. Редактировать нельзя.' }), input);
    show('Ссылка для просмотра', body, [
      { label: 'Скопировать', cls: 'pri', run: async () => { try { await navigator.clipboard.writeText(url); } catch { input.select(); document.execCommand('copy'); } toast('Ссылка скопирована'); } },
      { label: 'Отозвать ссылку', run: async () => { const d = await api.del(`/projects/${encodeURIComponent(id)}/share`); if (d.ok) { close(); toast('Ссылка отозвана'); ctx.refreshCards(); } else toast(errText(d)); } },
      { label: 'Закрыть', run: close },
    ]);
    input.select();
  }

  async function openVersions(id) {
    if (!(await ready(id))) return;
    const r = await api.get(`/projects/${encodeURIComponent(id)}/versions`);
    if (!r.ok) return toast(errText(r));
    const body = el('div', 'dbody');
    if (!r.data.versions.length) body.append(Object.assign(el('p', 'hint'), { textContent: 'История пока пуста: снимки появляются при правках, не чаще раза в 10 минут.' }));
    else body.append(Object.assign(el('p', 'hint'), { textContent: 'Прежние состояния проекта. «Открыть копией» не трогает текущий проект; «Восстановить» заменяет его (текущее состояние тоже попадёт в историю).' }));
    const list = el('div', 'vlist');
    for (const v of r.data.versions) {
      const row = el('div', 'vrow'), when = el('span', 'vwhen', fmt(v.created)), nm = el('span', 'vname', v.name);
      const copy = el('button', 'mini', 'Открыть копией'), rest = el('button', 'mini', 'Восстановить');
      copy.onclick = async () => {
        const g = await api.get(`/projects/${encodeURIComponent(id)}/versions/${v.id}`);
        if (!g.ok) return toast(errText(g));
        close(); ctx.addProject(`${g.data.name} (версия ${fmt(v.created)})`, g.data.P);
      };
      let armed = 0;
      rest.onclick = async () => {
        if (!armed) { armed = 1; rest.textContent = 'Точно?'; setTimeout(() => { armed = 0; rest.textContent = 'Восстановить'; }, 3000); return; }
        const g = await api.post(`/projects/${encodeURIComponent(id)}/versions/${v.id}/restore`);
        if (!g.ok) return toast(errText(g));
        close(); await sync.run(); toast('Версия восстановлена');
      };
      row.append(when, nm, copy, rest); list.append(row);
    }
    body.append(list);
    show('История версий', body, [{ label: 'Закрыть', run: close }]);
  }

  // ── шапка
  function render() {
    btn.hidden = !available;
    btn.textContent = user ? user.email : 'Войти';
    btn.title = user ? 'Аккаунт' : 'Войти или зарегистрироваться';
    btn.classList.toggle('pri', !user);
    onStatus(sync.status);
  }
  function onStatus(s) {
    st.textContent = user ? STATUS[s] || '' : '';
    st.className = 'syncst ' + (s === 'error' ? 'err' : s === 'offline' ? 'off' : '');
    st.hidden = !user;
  }
  function drawMenu() {
    menu.innerHTML = '';
    menu.append(el('div', 'mhead', user.email));
    const add = (label, fn) => { const b = el('button', '', label); b.onclick = () => { menu.hidden = true; fn(); }; menu.append(b); };
    if (!user.verified) add('Подтвердить почту: отправить письмо', async () => { const r = await api.post('/auth/resend-verify'); toast(r.ok ? 'Письмо отправлено' : errText(r)); });
    add('Синхронизировать сейчас', () => sync.run());
    menu.append(el('div', 'sep'));
    add('Выйти…', openLogout);
  }
  btn.onclick = e => { if (!user) return openAuth('login'); drawMenu(); ctx.toggleMenu(menu, e); };

  // ── запуск: ссылки из писем и проверка сессии
  async function boot() {
    const h = new URLSearchParams(location.hash.slice(1)), vt = h.get('verify'), rt = h.get('reset');
    const me = await api.get('/auth/me');
    if (me.ok) { user = me.data.user; await signedIn(user); }
    else if (me.status === 401) { if (sync.user) sync.expire(); user = null; }
    else if (!me.offline) available = false; // сервера нет (статический хостинг): остаёмся локальным приложением
    render();
    if (vt) { clearHash(); const r = await api.post('/auth/verify', { token: vt }); toast(r.ok ? 'Почта подтверждена' : errText(r)); if (r.ok && user) { user = { ...user, verified: true }; render(); } }
    if (rt) { clearHash(); openReset(rt); }
    if (user) {
      setInterval(() => document.visibilityState === 'visible' && sync.run(), 60000);
      addEventListener('online', () => sync.run());
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && sync.run());
    }
  }

  return {
    boot, onStatus,
    /** Сессия истекла посреди работы. */
    expired() { user = null; sync.expire(); render(); toast('Сессия истекла: войдите снова, проекты на устройстве сохранены'); },
    openAuth, openShare, openVersions,
    get user() { return user; },
  };
}
