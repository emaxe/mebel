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
export const getThumb = id => tx('readonly', s => s.get(id)).then(v => v || null).catch(() => null);
export const delThumb = id => tx('readwrite', s => s.delete(id)).catch(() => {});
