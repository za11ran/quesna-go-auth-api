import { useState } from 'react';
import { api, setSession } from './api';
import { Field, ErrBox } from './ui';

export default function Login({ onLogin }) {
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const isEmail = id.includes('@');
      const body = { password, [isEmail ? 'email' : 'phone']: id.trim() };
      // /admin/auth/login يقبل كل أدوار اللوحة
      const r = await api.post('/api/admin/auth/login', body);
      setSession(r.token, r.role);
      onLogin(r.role);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="card card-pad login-card" onSubmit={submit}>
        <div className="brand" style={{ padding: '4px 0 14px', justifyContent: 'center' }}>Quesna Go</div>
        <h2 className="page-title" style={{ textAlign: 'center', marginBottom: 18 }}>دخول لوحة التحكم</h2>
        <ErrBox error={error} />
        <Field label="الإيميل أو رقم الموبايل">
          <input value={id} onChange={(e) => setId(e.target.value)} placeholder="admin@quesnago.com" autoFocus />
        </Field>
        <Field label="كلمة السر">
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <button className="btn primary" style={{ width: '100%' }} disabled={busy || !id || !password}>
          {busy ? '...' : 'دخول'}
        </button>
      </form>
    </div>
  );
}
