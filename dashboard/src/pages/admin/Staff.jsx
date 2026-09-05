import { useState } from 'react';
import { api } from '../../api';
import { useAsync, ErrBox, Empty, Pill, Modal, Field, statusTone } from '../../ui';

// kind: 'drivers' | 'dispatchers'
export default function Staff({ kind }) {
  const isDriver = kind === 'drivers';
  const { data, loading, error, reload } = useAsync(() => api.get(`/api/admin/${kind}`), [kind]);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const rows = data?.data || [];

  async function toggleAppAccess(id, enabled) {
    setBusyId(id);
    try { await api.put(`/api/admin/drivers/${id}`, { app_access_enabled: enabled }); reload(); }
    finally { setBusyId(null); }
  }

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">{isDriver ? 'الدليفري' : 'المشرفين'}</h1>
          <p className="page-sub">إنشاء الحسابات وإدارتها</p>
        </div>
        <button className="btn primary" onClick={() => setCreating(true)}>+ {isDriver ? 'دليفري' : 'مشرف'}</button>
      </div>
      <ErrBox error={error} />
      <div className="card" style={{ overflow: 'auto' }}>
        <table>
          <thead><tr><th>الاسم</th><th>الموبايل</th><th>الإيميل</th>{isDriver && <th>الحالة</th>}{isDriver && <th>توصيلات</th>}<th>مفعّل؟</th>{isDriver && <th>دخول من التطبيق</th>}<th></th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={8} className="empty">تحميل…</td></tr>
              : rows.length === 0 ? <tr><td colSpan={8}><Empty /></td></tr>
              : rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>{r.phone || '—'}</td>
                  <td>{r.email || '—'}</td>
                  {isDriver && <td><Pill tone={statusTone(r.status)}>{r.status}</Pill></td>}
                  {isDriver && <td>{r.deliveries_count}</td>}
                  <td>{(isDriver ? r.account_active : r.is_active) === false ? '✕' : '✓'}</td>
                  {isDriver && (
                    <td>
                      <input
                        type="checkbox"
                        checked={!!r.app_access_enabled}
                        disabled={busyId === r.id}
                        onChange={(e) => toggleAppAccess(r.id, e.target.checked)}
                      />
                    </td>
                  )}
                  <td><button className="btn sm" onClick={() => setEditing(r)}>تعديل</button></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {creating && <CreateStaff isDriver={isDriver} onClose={() => setCreating(false)} onDone={() => { setCreating(false); reload(); }} />}
      {editing && (
        <EditStaff
          staffId={isDriver ? editing.staff_user_id : editing.id}
          row={editing}
          onClose={() => setEditing(null)}
          onDone={() => { setEditing(null); reload(); }}
        />
      )}
    </>
  );
}

function EditStaff({ staffId, row, onClose, onDone }) {
  const [f, setF] = useState({ name: row.name || '', email: row.email || '', phone: row.phone || '', password: '' });
  const [busy, setBusy] = useState(false); const [error, setError] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function submit() {
    setBusy(true); setError(null);
    try {
      const body = { name: f.name, email: f.email || null, phone: f.phone || null };
      if (f.password) body.password = f.password;
      await api.put(`/api/admin/staff/${staffId}`, body);
      onDone();
    } catch (e) { setError(e); } finally { setBusy(false); }
  }
  return (
    <Modal title="تعديل الحساب" onClose={onClose}
      footer={<button className="btn primary" disabled={busy || !f.name} onClick={submit}>حفظ</button>}>
      <ErrBox error={error} />
      <Field label="الاسم"><input value={f.name} onChange={set('name')} /></Field>
      <Field label="الموبايل"><input value={f.phone} onChange={set('phone')} /></Field>
      <Field label="الإيميل"><input value={f.email} onChange={set('email')} /></Field>
      <Field label="كلمة سر جديدة (سيبها فاضية لو مش هتغيّرها)"><input value={f.password} onChange={set('password')} /></Field>
    </Modal>
  );
}

function CreateStaff({ isDriver, onClose, onDone }) {
  const [f, setF] = useState({ name: '', phone: '', email: '', password: '', vehicle_type: 'motorcycle', zone: '' });
  const [busy, setBusy] = useState(false); const [error, setError] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function submit() {
    setBusy(true); setError(null);
    try {
      const body = isDriver
        ? { name: f.name, phone: f.phone, email: f.email || undefined, password: f.password, vehicle_type: f.vehicle_type, zone: f.zone || undefined }
        : { name: f.name, email: f.email || undefined, phone: f.phone || undefined, password: f.password };
      await api.post(`/api/admin/${isDriver ? 'drivers' : 'dispatchers'}`, body);
      onDone();
    } catch (e) { setError(e); } finally { setBusy(false); }
  }
  return (
    <Modal title={isDriver ? 'دليفري جديد' : 'مشرف جديد'} onClose={onClose}
      footer={<button className="btn primary" disabled={busy || !f.name || !f.password || (isDriver ? !f.phone : (!f.email && !f.phone))} onClick={submit}>إنشاء</button>}>
      <ErrBox error={error} />
      <Field label="الاسم"><input value={f.name} onChange={set('name')} /></Field>
      <Field label="الموبايل"><input value={f.phone} onChange={set('phone')} placeholder="+2010..." /></Field>
      <Field label="الإيميل (اختياري)"><input value={f.email} onChange={set('email')} /></Field>
      <Field label="كلمة السر"><input value={f.password} onChange={set('password')} /></Field>
      {isDriver && (
        <div className="grid k2">
          <Field label="المركبة"><select value={f.vehicle_type} onChange={set('vehicle_type')}>{['motorcycle', 'car', 'bicycle'].map((v) => <option key={v}>{v}</option>)}</select></Field>
          <Field label="المنطقة"><input value={f.zone} onChange={set('zone')} /></Field>
        </div>
      )}
    </Modal>
  );
}
