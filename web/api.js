// Клиент API сервера. Без DOM: fetch подставляется (в тестах — прямо в Fastify).
// Сетевой сбой не бросает исключение, а возвращает {offline: true}.
export function createApi(fetchFn = (...a) => globalThis.fetch(...a), base = 'api') {
  async function request(method, path, { body, raw, type } = {}) {
    const init = { method, credentials: 'same-origin', headers: {} };
    if (raw !== undefined) { init.body = raw; init.headers['content-type'] = type || 'application/octet-stream'; }
    else if (body !== undefined) { init.body = JSON.stringify(body); init.headers['content-type'] = 'application/json'; }
    let res;
    try { res = await fetchFn(`${base}${path}`, init); } catch { return { ok: false, offline: true, status: 0, data: null }; }
    const ct = res.headers.get('content-type') || '';
    let data = null;
    try { data = ct.includes('json') ? await res.json() : ct.startsWith('image/') ? await res.blob() : null; } catch { /* тело не разобрать */ }
    return { ok: res.ok, status: res.status, data, message: data && data.message };
  }
  return {
    request,
    get: (p, o) => request('GET', p, o),
    post: (p, body) => request('POST', p, { body }),
    put: (p, body) => request('PUT', p, { body }),
    del: p => request('DELETE', p),
  };
}
