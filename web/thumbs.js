// Миниатюры проектов в IndexedDB (ключ — id проекта). Без DOM. Любая ошибка глушится: без миниатюр карточки просто покажут заглушку.
const DB = 'mebel', STORE = 'thumbs';

let dbp;
const open = () => dbp || (dbp = new Promise((res, rej) => {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(STORE);
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
}));

const tx = async (mode, fn) => {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, mode), out = fn(t.objectStore(STORE));
    t.oncomplete = () => res(out && 'result' in out ? out.result : undefined);
    t.onerror = t.onabort = () => rej(t.error);
  });
};

export const putThumb = (id, blob) => tx('readwrite', s => s.put(blob, id)).catch(() => {});
const getLocal = id => tx('readonly', s => s.get(id)).then(v => v || null).catch(() => null);

// Миниатюры проектов с других устройств лежат на сервере: remote(id) → Blob | null (нет такой) | undefined (не спросить сейчас). Скачанное кладём в локальный кэш.
let remote = null;
const tried = new Set(); // id, которых на сервере нет, повторно не спрашиваем до перезагрузки
export const getLocalThumb = getLocal;
export const setRemote = fn => { remote = fn; tried.clear(); };
export const getThumb = async id => {
  const local = await getLocal(id);
  if (local || !remote || tried.has(id)) return local;
  const blob = await Promise.resolve(remote(id)).catch(() => null);
  if (blob === undefined) return null; // сервер сейчас недоступен или нет входа: спросим позже
  tried.add(id);
  if (blob) putThumb(id, blob);
  return blob || null;
};
export const delThumb = id => { tried.delete(id); return tx('readwrite', s => s.delete(id)).catch(() => {}); };
