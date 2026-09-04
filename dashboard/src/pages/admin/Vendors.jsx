import { useState } from 'react';
import { api } from '../../api';
import { useAsync, ErrBox, Empty, Pill, Modal, Field, statusTone } from '../../ui';

export default function Vendors() {
  const { data, loading, error, reload } = useAsync(() => api.get('/api/admin/vendors'));
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const rows = data?.data || [];

  async function act(id, kind) {
    setBusyId(id);
    try { await api.post(`/api/admin/vendors/${id}/${kind}`); reload(); }
    finally { setBusyId(null); }
  }

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">التجّار</h1>
          <p className="page-sub">الموافقة والتعليق وإنشاء متاجر جديدة</p>
        </div>
        <button className="btn primary" onClick={() => setCreating(true)}>+ متجر جديد</button>
      </div>
      <ErrBox error={error} />
      <div className="card" style={{ overflow: 'auto' }}>
        <table>
          <thead><tr><th>المعرّف</th><th>الاسم</th><th>النوع</th><th>الحالة</th><th>مفتوح؟</th><th>رسوم/حد أدنى</th><th></th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={7} className="empty">تحميل…</td></tr>
              : rows.length === 0 ? <tr><td colSpan={7}><Empty /></td></tr>
              : rows.map((v) => (
                <tr key={v.id}>
                  <td>{v.id}</td>
                  <td>{v.name_ar}</td>
                  <td>{v.type}</td>
                  <td><Pill tone={statusTone(v.status)}>{v.status}</Pill></td>
                  <td>{v.is_open ? '✓' : '✕'}</td>
                  <td>{Number(v.delivery_fee)} / {Number(v.min_order)}</td>
                  <td className="row">
                    {v.status !== 'approved' && (
                      <button className="btn sm ok" disabled={busyId === v.id} onClick={() => act(v.id, 'approve')}>موافقة</button>
                    )}
                    {v.status !== 'suspended' && (
                      <button className="btn sm danger" disabled={busyId === v.id} onClick={() => act(v.id, 'suspend')}>تعليق</button>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {creating && <CreateVendor onClose={() => setCreating(false)} onDone={() => { setCreating(false); reload(); }} />}
    </>
  );
}

function CreateVendor({ onClose, onDone }) {
  const [f, setF] = useState({ name_ar: '', name_en: '', type: 'restaurant', phone: '', delivery_fee: 15, min_order: 50, owner_name: '', owner_email: '', owner_password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit() {
    setBusy(true); setError(null);
    try { await api.post('/api/admin/vendors', f); onDone(); }
    catch (e) { setError(e); } finally { setBusy(false); }
  }

  return (
    <Modal title="متجر جديد" onClose={onClose}
      footer={<button className="btn primary" disabled={busy || !f.name_ar || !f.owner_email || !f.owner_password} onClick={submit}>إنشاء</button>}>
      <ErrBox error={error} />
      <Field label="اسم المتجر (عربي)"><input value={f.name_ar} onChange={set('name_ar')} /></Field>
      <Field label="اسم المتجر (إنجليزي)"><input value={f.name_en} onChange={set('name_en')} /></Field>
      <Field label="النوع">
        <select value={f.type} onChange={set('type')}>
          {['restaurant', 'supermarket', 'pharmacy', 'bakery', 'cafe', 'other'].map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </Field>
      <Field label="تليفون"><input value={f.phone} onChange={set('phone')} /></Field>
      <div className="grid k2">
        <Field label="رسوم التوصيل"><input type="number" value={f.delivery_fee} onChange={set('delivery_fee')} /></Field>
        <Field label="الحد الأدنى"><input type="number" value={f.min_order} onChange={set('min_order')} /></Field>
      </div>
      <hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '8px 0 14px' }} />
      <Field label="اسم صاحب المتجر"><input value={f.owner_name} onChange={set('owner_name')} /></Field>
      <Field label="إيميل الدخول"><input value={f.owner_email} onChange={set('owner_email')} /></Field>
      <Field label="كلمة سر الدخول"><input value={f.owner_password} onChange={set('owner_password')} /></Field>
    </Modal>
  );
}
