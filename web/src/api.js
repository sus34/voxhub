/**
 * JSON calls to our own server. The session is an httpOnly cookie, so there
 * is no token to carry around — the browser sends it.
 */
export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  });
  if (res.status === 204) return null;

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* empty or not JSON */
  }
  if (!res.ok) {
    const err = new Error((data && data.error) || `Сервер ответил ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

/** /invite/ABCD… → "ABCD…", anything else → null. */
export function inviteCodeFromPath(pathname = location.pathname) {
  const m = pathname.match(/^\/invite\/([A-Za-z0-9]{4,32})\/?$/);
  return m ? m[1].toUpperCase() : null;
}
