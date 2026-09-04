// عميل الـ API للوحة التحكم
const BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export const apiBase = BASE;
export const getToken = () => localStorage.getItem('qg_token') || '';
export const getRole = () => localStorage.getItem('qg_role') || '';
export function setSession(token, role) {
  localStorage.setItem('qg_token', token);
  localStorage.setItem('qg_role', role);
}
export function clearSession() {
  localStorage.removeItem('qg_token');
  localStorage.removeItem('qg_role');
}

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message || code || 'خطأ');
    this.status = status;
    this.code = code;
  }
}

async function req(method, path, { body, form } = {}) {
  const headers = { LANG: 'ar' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) {
    payload = form; // FormData
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(BASE + path, { method, headers, body: payload });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!res.ok || (data && data.success === false)) {
    throw new ApiError(res.status, data?.error_code, data?.message || data?.error);
  }
  return data;
}

export const api = {
  get: (p) => req('GET', p),
  post: (p, body) => req('POST', p, { body }),
  put: (p, body) => req('PUT', p, { body }),
  patch: (p, body) => req('PATCH', p, { body }),
  del: (p) => req('DELETE', p),
  upload: (p, formData) => req('POST', p, { form: formData }),
};
