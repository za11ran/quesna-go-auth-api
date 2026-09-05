import { useEffect, useState } from 'react';
import { api } from '../../api';
import { useAsync, ErrBox, Field } from '../../ui';

// بيانات التواصل اللي بتظهر في صفحات «اتصل بنا» و«عن التطبيق» في التطبيق.
export default function ContactInfo() {
  const { data, loading, error, reload } = useAsync(() => api.get('/api/admin/settings/contact'));
  const [f, setF] = useState({ phone: '', whatsapp: '', email: '', address: '' });
  const [busy, setBusy] = useState(false);
  const [saveErr, setSaveErr] = useState(null);
  const [savedAt, setSavedAt] = useState(0);

  useEffect(() => {
    if (data) setF({
      phone: data.phone || '', whatsapp: data.whatsapp || '',
      email: data.email || '', address: data.address || '',
    });
  }, [data]);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit() {
    setBusy(true); setSaveErr(null);
    try {
      await api.post('/api/admin/settings/contact', f);
      setSavedAt(Date.now());
      reload();
    } catch (e) { setSaveErr(e); } finally { setBusy(false); }
  }

  return (
    <>
      <h1 className="page-title">بيانات التواصل</h1>
      <p className="page-sub">بتظهر للعميل في «اتصل بنا» و«عن التطبيق» — سيب أي خانة فاضية عشان تختفي.</p>

      <ErrBox error={error || saveErr} />

      <div className="card card-pad" style={{ maxWidth: 480 }}>
        {loading ? <div className="empty">تحميل…</div> : (
          <>
            <Field label="رقم التليفون">
              <input value={f.phone} onChange={set('phone')} placeholder="+20 100 000 0000" dir="ltr" />
            </Field>
            <Field label="واتساب">
              <input value={f.whatsapp} onChange={set('whatsapp')} placeholder="+20 100 000 0000" dir="ltr" />
            </Field>
            <Field label="البريد الإلكتروني">
              <input value={f.email} onChange={set('email')} placeholder="support@quesnago.com" dir="ltr" />
            </Field>
            <Field label="العنوان / الموقع">
              <input value={f.address} onChange={set('address')} placeholder="قويسنا، المنوفية" />
            </Field>
            <div className="row" style={{ marginTop: 4 }}>
              <button className="btn primary" disabled={busy} onClick={submit}>حفظ</button>
              {savedAt > 0 && <span className="page-sub" style={{ color: 'var(--ok)' }}>تم الحفظ ✓</span>}
            </div>
          </>
        )}
      </div>
    </>
  );
}
