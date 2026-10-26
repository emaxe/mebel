// Синхронизация локальных проектов и справочника с сервером. Без DOM: хранилище, api и БД проектов передаются снаружи.
// localStorage остаётся источником правды для интерфейса; что изменилось, определяется по хешу содержимого, а не по флагам,
// поэтому правки, переименование и удаление подхватываются без вмешательства в остальной код.
import { newId, uniqueName } from './projects.js';
import { CATALOG_KEY } from './catalog.js';

export const SYNC_KEY = 'mebel-sync';
const VIEW_KEYS = ['open', 'hideDoors', 'showHoles']; // параметры вида правкой не считаются (как в отмене/повторе)
const OFFLINE = Symbol('offline'), UNAUTH = Symbol('unauth');

/** JSON с отсортированными ключами: порядок ключей (после jsonb и normalize он другой) на хеш не влияет. */
const canon = v => Array.isArray(v) ? `[${v.map(canon)}]` : v && typeof v === 'object'
  ? `{${Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => JSON.stringify(k) + ':' + canon(v[k]))}}` : JSON.stringify(v);

function cyrb53(s) {
  let a = 0xdeadbeef, b = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = Math.imul(a ^ c, 2654435761); b = Math.imul(b ^ c, 1597334677); }
  a = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909);
  b = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909);
  return (4294967296 * (2097151 & b) + (a >>> 0)).toString(36);
}
export const projectHash = p => { const P = { ...p.P }; for (const k of VIEW_KEYS) delete P[k]; return cyrb53(canon([p.name, P])); };
const dataHash = d => cyrb53(canon(d));
const clone = o => JSON.parse(JSON.stringify(o));
const ddmm = () => { const d = new Date(); return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0'); };

/**
 * ctx: { api, storage, getDb() → {id: {name, updated, P}}, persist(), skip(id) → true для временной заготовки,
 *        thumbs?: { get(id) → Blob|null, drop(id) }, wipe() — стереть локальные проекты, onEvent(e) }
 */
export function createSync(ctx) {
  const { api, storage, getDb, persist } = ctx;
  const emit = e => { try { ctx.onEvent && ctx.onEvent(e); } catch { /* слушатель не должен ломать синхронизацию */ } };
  const blank = () => ({ owner: null, user: null, cursor: 0, meta: {}, thumbs: {}, rejected: {}, catalog: null });
  let state = (() => { try { return { ...blank(), ...JSON.parse(storage.getItem(SYNC_KEY) || 'null') }; } catch { return blank(); } })();
  const save = () => { try { storage.setItem(SYNC_KEY, JSON.stringify(state)); } catch { /* нет места: состояние восстановится при следующей синхронизации */ } };
  let status = state.user ? 'idle' : 'off', running = false, again = false, timer = null;
  const setStatus = s => { if (s !== status) { status = s; emit({ type: 'status', status }); } };

  async function call(method, path, opts) {
    const r = await api.request(method, path, opts);
    if (r.offline) throw OFFLINE;
    if (r.status === 401) throw UNAUTH;
    if (r.status >= 500) throw new Error(`Сервер ответил ${r.status}`);
    return r;
  }

  // ── применение серверных изменений к локальной базе
  const changes = () => ({ replaced: new Set(), removed: new Set(), added: new Set(), conflicts: [] });
  const isDirty = id => { const p = getDb()[id], m = state.meta[id]; return !!p && !ctx.skip?.(id) && (!m || m.hash !== projectHash(p)); };

  function applyRemote(id, remote, ch) {
    const db = getDb(), local = db[id], remoteHash = projectHash(remote);
    if (local && projectHash(local) === remoteHash) { state.meta[id] = { version: remote.version, hash: remoteHash }; return; }
    if (local && isDirty(id)) { // правки на этом устройстве и на сервере: сервер основной, локальная версия остаётся копией
      const copyId = newId(), name = uniqueName(db, `${local.name} (конфликт ${ddmm()})`);
      db[copyId] = { name, updated: Date.now(), P: local.P };
      ch.conflicts.push({ name: local.name, copy: name });
      ch.added.add(copyId);
    }
    db[id] = { name: remote.name, updated: remote.updated || Date.now(), P: remote.P };
    state.meta[id] = { version: remote.version, hash: remoteHash };
    delete state.rejected[id];
    if (local) { ch.replaced.add(id); ctx.thumbs?.drop(id); } else ch.added.add(id);
  }

  function applyRemoteDelete(id, ch) {
    const db = getDb(), local = db[id], dirty = isDirty(id); // до удаления meta: без неё любой проект выглядит изменённым
    delete state.meta[id]; delete state.thumbs[id];
    if (!local) return;
    if (dirty) { // на сервере удалён, а здесь правился: не теряем, заводим как новый проект
      const copyId = newId();
      db[copyId] = { name: local.name, updated: Date.now(), P: local.P };
      ch.added.add(copyId);
      ch.conflicts.push({ name: local.name, copy: local.name, restored: true });
    }
    delete db[id]; ch.removed.add(id); ctx.thumbs?.drop(id);
  }

  async function pull(ch) {
    const r = await call('GET', `/projects?since=${Math.max(0, state.cursor - 2000)}`); // запас 2 с: у транзакций порядок фиксации и now() может расходиться
    let max = state.cursor;
    for (const rp of r.data.projects) {
      max = Math.max(max, rp.updated);
      if (rp.deleted) { applyRemoteDelete(rp.id, ch); continue; }
      const m = state.meta[rp.id];
      // уже синхронизировано; либо удалён здесь и ждёт отправки DELETE — воскрешать его из окна перекрытия нельзя
      if (m && (!getDb()[rp.id] || m.version >= rp.version)) continue;
      const full = await call('GET', `/projects/${encodeURIComponent(rp.id)}`);
      if (full.ok) applyRemote(rp.id, full.data, ch);
    }
    state.cursor = max;
  }

  async function push(ch) {
    for (const [id, p] of Object.entries(getDb())) {
      if (ctx.skip?.(id)) continue;
      const m = state.meta[id], h = projectHash(p);
      if ((m && m.hash === h) || state.rejected[id] === h) continue;
      const res = await call('PUT', `/projects/${encodeURIComponent(id)}`, { body: { name: p.name, P: p.P, baseVersion: m ? m.version : 0 } });
      if (res.ok) { state.meta[id] = { version: res.data.version, hash: h }; state.thumbs[id] = true; continue; }
      if (res.status === 409) {
        if (res.data.server) applyRemote(id, res.data.server, ch);
        else if (res.data.deleted) applyRemoteDelete(id, ch);
      } else if (res.status === 400 || res.status === 422) { // сервер не принимает: не повторяем, пока проект не изменится
        state.rejected[id] = h; emit({ type: 'rejected', id, message: res.message });
      }
    }
  }

  async function pushDeleted() {
    for (const id of Object.keys(state.meta)) {
      if (getDb()[id]) continue;
      const r = await call('DELETE', `/projects/${encodeURIComponent(id)}`);
      if (r.ok || r.status === 404) { delete state.meta[id]; delete state.thumbs[id]; delete state.rejected[id]; }
    }
  }

  async function pushThumbs() {
    if (!ctx.thumbs) return;
    for (const id of Object.keys(state.thumbs)) {
      if (!getDb()[id]) { delete state.thumbs[id]; continue; }
      if (!state.meta[id]) continue; // проект ещё не на сервере
      const blob = await ctx.thumbs.get(id);
      if (!blob) { delete state.thumbs[id]; continue; }
      const r = await call('PUT', `/projects/${encodeURIComponent(id)}/thumb`, { raw: blob, type: 'image/jpeg' });
      if (r.ok || r.status === 404 || r.status === 400 || r.status === 413) delete state.thumbs[id];
    }
  }

  // ── справочник: цены — личные данные пользователя; при расхождении правка с этого устройства важнее, но первый контакт — за сервером
  async function syncCatalog() {
    let raw = storage.getItem(CATALOG_KEY), local = null;
    try { local = raw ? JSON.parse(raw) : null; } catch { local = null; }
    const lh = local ? dataHash(local) : null, m = state.catalog;
    const r = await call('GET', '/catalog');
    if (!r.ok) return;
    const { data, version } = r.data;
    const adopt = () => {
      if (raw) try { storage.setItem(CATALOG_KEY + '-backup', raw); } catch { /* ничего */ }
      storage.setItem(CATALOG_KEY, JSON.stringify(data));
      state.catalog = { version, hash: dataHash(data) };
      emit({ type: 'catalog' });
    };
    const upload = async base => {
      const res = await call('PUT', '/catalog', { body: { data: local, baseVersion: base } });
      if (res.ok) state.catalog = { version: res.data.version, hash: lh };
      else if (res.status === 409 && res.data.server) { // успели записать с другого устройства: повторяем поверх свежей версии
        const again = await call('PUT', '/catalog', { body: { data: local, baseVersion: res.data.server.version } });
        if (again.ok) state.catalog = { version: again.data.version, hash: lh };
      }
    };
    if (version === 0) { if (local) await upload(0); return; }
    if (m && m.version === version) { if (local && lh !== m.hash) await upload(version); return; }
    if (!local) return adopt();
    if (lh === dataHash(data)) { state.catalog = { version, hash: lh }; return; }
    if (m && lh !== m.hash) return upload(version); // правили здесь и там
    adopt();
  }

  async function run() {
    if (!state.user) return;
    if (running) { again = true; return; }
    running = true; setStatus('syncing');
    const ch = changes();
    try {
      await pull(ch); await push(ch); await pushDeleted(); await pushThumbs(); await syncCatalog();
      setStatus('idle');
    } catch (e) {
      if (e === OFFLINE) setStatus('offline');
      else if (e === UNAUTH) { setStatus('off'); emit({ type: 'unauthorized' }); }
      else { setStatus('error'); emit({ type: 'error', error: e }); }
    } finally {
      running = false; save();
      if (ch.replaced.size || ch.removed.size || ch.added.size) { persist(); emit({ type: 'projects', ...ch }); }
      if (ch.conflicts.length) emit({ type: 'conflicts', conflicts: ch.conflicts });
      if (again) { again = false; touch(); }
    }
  }

  function touch(ms = 2000) {
    if (!state.user) return;
    clearTimeout(timer); timer = setTimeout(run, ms);
  }

  return {
    run, touch,
    get status() { return status; },
    get user() { return state.user; },
    isDirty,
    /** Помечает миниатюру к отправке (после её записи в IndexedDB). */
    markThumb(id) { if (state.user) { state.thumbs[id] = true; save(); touch(); } },
    /** Вход выполнен. Если на устройстве лежат проекты другого аккаунта, вернёт {foreign: true} — нужно решение пользователя (resolveForeign). */
    setUser(user) {
      const hasLocal = Object.keys(getDb()).some(id => !ctx.skip?.(id));
      if (state.owner && state.owner !== user.id && hasLocal) { state.user = null; save(); return { foreign: true }; }
      if (state.owner !== user.id) state = { ...blank(), owner: user.id };
      state.user = user; save(); setStatus('idle');
      return { foreign: false };
    },
    /** 'merge' — проекты с устройства добавляются в новый аккаунт, 'wipe' — стираются. */
    resolveForeign(user, mode) {
      if (mode === 'wipe') ctx.wipe();
      state = { ...blank(), owner: user.id, user }; save(); setStatus('idle');
    },
    /** Выход: keep — проекты остаются на устройстве как гостевые, иначе стираются. */
    signOut(keep) {
      clearTimeout(timer);
      if (!keep) ctx.wipe();
      state = blank(); save(); setStatus('off');
    },
    /** Сессия кончилась, но данные принадлежат пользователю: остаёмся гостем, привязка к аккаунту сохраняется. */
    expire() { state.user = null; save(); setStatus('off'); },
  };
}
