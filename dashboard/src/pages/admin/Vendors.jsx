import { useState } from 'react';
import { api, apiBase } from '../../api';
import { useAsync, ErrBox, Empty, Pill, Modal, Field, statusTone, label, VENDOR_TYPES } from '../../ui';

export default function Vendors() {
  const { data, loading, error, reload } = useAsync(() => api.get('/api/admin/vendors'));
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const rows = data?.data || [];

  async function act(id, kind) {
    setBusyId(id);
    try { await api.post(`/api/admin/vendors/${id}/${kind}`); reload(); }
    finally { setBusyId(null); }
  }

  async function setOrderMode(id, mode) {
    setBusyId(id);
    try { await api.put(`/api/admin/vendors/${id}/order-mode`, { order_mode: mode }); reload(); }
    finally { setBusyId(null); }
  }

  async function setFullPermissions(id, enabled) {
    setBusyId(id);
    try { await api.put(`/api/admin/vendors/${id}/full-permissions`, { full_permissions: enabled }); reload(); }
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
          <thead><tr><th>المعرّف</th><th>الاسم</th><th>النوع</th><th>الحالة</th><th>مفتوح؟</th><th>استلام الطلبات</th><th>الصلاحيات</th><th></th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={8} className="empty">تحميل…</td></tr>
              : rows.length === 0 ? <tr><td colSpan={8}><Empty /></td></tr>
              : rows.map((v) => (
                <tr key={v.id}>
                  <td>{v.id}</td>
                  <td>{v.name_ar}</td>
                  <td>{label(v.type)}</td>
                  <td><Pill tone={statusTone(v.status)}>{label(v.status)}</Pill></td>
                  <td>{v.is_open ? '✓' : '✕'}</td>
                  <td>
                    <select
                      className="btn sm"
                      value={v.order_mode || 'app'}
                      disabled={busyId === v.id}
                      onChange={(e) => setOrderMode(v.id, e.target.value)}
                    >
                      <option value="app">من تطبيق التاجر</option>
                      <option value="manual">يدوي (تليفون)</option>
                    </select>
                  </td>
                  <td>
                    <select
                      className="btn sm"
                      value={v.full_permissions ? 'full' : 'limited'}
                      disabled={busyId === v.id}
                      onChange={(e) => setFullPermissions(v.id, e.target.value === 'full')}
                    >
                      <option value="limited">محدودة (تحتاج موافقة)</option>
                      <option value="full">كاملة (فورية)</option>
                    </select>
                  </td>
                  <td className="row">
                    {v.status !== 'approved' && (
                      <button className="btn sm ok" disabled={busyId === v.id} onClick={() => act(v.id, 'approve')}>موافقة</button>
                    )}
                    {v.status !== 'suspended' && (
                      <button className="btn sm danger" disabled={busyId === v.id} onClick={() => act(v.id, 'suspend')}>تعليق</button>
                    )}
                    <button className="btn sm" disabled={busyId === v.id} onClick={() => setEditing(v)}>تعديل</button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {creating && (
        <CreateVendor
          onClose={() => setCreating(false)}
          onDone={(newVendor) => { setCreating(false); reload(); if (newVendor) setEditing(newVendor); }}
        />
      )}
      {editing && <EditVendor vendor={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); reload(); }} />}
    </>
  );
}

function CreateVendor({ onClose, onDone }) {
  const [f, setF] = useState({
    name_ar: '', name_en: '', type: 'restaurant', phone: '',
    opens_at: '10:00', closes_at: '02:00',
    owner_name: '', owner_email: '', owner_password: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit() {
    setBusy(true); setError(null);
    try {
      const created = await api.post('/api/admin/vendors', f);
      onDone({ id: created.vendor_id, name_ar: f.name_ar, name_en: f.name_en, phone: f.phone });
    } catch (e) { setError(e); } finally { setBusy(false); }
  }

  return (
    <Modal title="متجر جديد" onClose={onClose}
      footer={<button className="btn primary" disabled={busy || !f.name_ar || !f.owner_email || !f.owner_password} onClick={submit}>إنشاء</button>}>
      <ErrBox error={error} />
      <Field label="اسم المتجر (عربي)"><input value={f.name_ar} onChange={set('name_ar')} /></Field>
      <Field label="اسم المتجر (إنجليزي)"><input value={f.name_en} onChange={set('name_en')} /></Field>
      <Field label="النوع">
        <select value={f.type} onChange={set('type')}>
          {VENDOR_TYPES.map(([t, l]) => <option key={t} value={t}>{l}</option>)}
        </select>
      </Field>
      <Field label="تليفون"><input value={f.phone} onChange={set('phone')} /></Field>
      <div className="grid k2">
        <Field label="مواعيد العمل — من"><input type="time" value={f.opens_at} onChange={set('opens_at')} /></Field>
        <Field label="إلى"><input type="time" value={f.closes_at} onChange={set('closes_at')} /></Field>
      </div>
      <p className="page-sub" style={{ margin: '-4px 0 10px' }}>
        نفس المواعيد لكل أيام الأسبوع مبدئيًا — التاجر يقدر يعدّلها بعد كده من لوحته براحته.
      </p>
      <hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '8px 0 14px' }} />
      <Field label="اسم صاحب المتجر"><input value={f.owner_name} onChange={set('owner_name')} /></Field>
      <Field label="إيميل الدخول"><input value={f.owner_email} onChange={set('owner_email')} /></Field>
      <Field label="كلمة سر الدخول"><input value={f.owner_password} onChange={set('owner_password')} /></Field>
      <p className="page-sub" style={{ marginTop: 10 }}>هتقدر تضيف صورة المتجر مباشرة بعد الإنشاء.</p>
    </Modal>
  );
}

function EditVendor({ vendor, onClose, onDone }) {
  const [f, setF] = useState({
    name_ar: vendor.name_ar || '', name_en: vendor.name_en || '',
    description_ar: vendor.description_ar || '', description_en: vendor.description_en || '',
    phone: vendor.phone || '',
    rating: vendor.rating ?? 0, reviews_count: vendor.reviews_count ?? 0,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [logo, setLogo] = useState(vendor.logo || null);
  const [cover, setCover] = useState(vendor.cover_image || null);
  const [imgBusy, setImgBusy] = useState(null);
  const staffList = useAsync(() => api.get(`/api/admin/vendors/${vendor.id}/staff`));
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit() {
    setBusy(true); setError(null);
    try { await api.put(`/api/admin/vendors/${vendor.id}`, f); onDone(); }
    catch (e) { setError(e); } finally { setBusy(false); }
  }

  async function upImg(field, file) {
    setImgBusy(field);
    try {
      const fd = new FormData();
      fd.append('image', file);
      const r = await api.upload(`/api/admin/vendors/${vendor.id}/${field}`, fd);
      if (field === 'logo') setLogo(r.url); else setCover(r.url);
    } finally { setImgBusy(null); }
  }

  return (
    <Modal title={`تعديل ${vendor.name_ar}`} onClose={onClose}
      footer={<button className="btn primary" disabled={busy} onClick={submit}>حفظ بيانات المتجر</button>}>
      <ErrBox error={error} />

      <p className="page-sub" style={{ margin: '0 0 6px' }}>صورة المتجر — الأدمن بس اللي يقدر يغيّرها</p>
      <div className="row" style={{ gap: 12, marginBottom: 14 }}>
        <div className="row" style={{ gap: 6 }}>
          {logo && <img src={apiBase + logo} width={40} height={40} style={{ borderRadius: 10, objectFit: 'cover' }} alt="" />}
          <label className="btn sm" style={{ opacity: imgBusy === 'logo' ? 0.5 : 1 }}>
            {imgBusy === 'logo' ? '…' : 'لوجو'}
            <input type="file" hidden accept="image/*" onChange={(e) => e.target.files[0] && upImg('logo', e.target.files[0])} />
          </label>
        </div>
        <div className="row" style={{ gap: 6 }}>
          {cover && <img src={apiBase + cover} width={64} height={40} style={{ borderRadius: 10, objectFit: 'cover' }} alt="" />}
          <label className="btn sm" style={{ opacity: imgBusy === 'cover' ? 0.5 : 1 }}>
            {imgBusy === 'cover' ? '…' : 'غلاف'}
            <input type="file" hidden accept="image/*" onChange={(e) => e.target.files[0] && upImg('cover', e.target.files[0])} />
          </label>
        </div>
      </div>

      <Field label="اسم المتجر (عربي)"><input value={f.name_ar} onChange={set('name_ar')} /></Field>
      <Field label="اسم المتجر (إنجليزي)"><input value={f.name_en} onChange={set('name_en')} /></Field>
      <Field label="الوصف (عربي)"><input value={f.description_ar} onChange={set('description_ar')} /></Field>
      <Field label="الوصف (إنجليزي)"><input value={f.description_en} onChange={set('description_en')} /></Field>
      <Field label="تليفون"><input value={f.phone} onChange={set('phone')} /></Field>

      <div className="grid k2">
        <Field label="التقييم (من 0 لـ 5)">
          <input type="number" min="0" max="5" step="0.1" value={f.rating} onChange={set('rating')} />
        </Field>
        <Field label="عدد التقييمات">
          <input type="number" min="0" step="1" value={f.reviews_count} onChange={set('reviews_count')} />
        </Field>
      </div>
      <p className="page-sub" style={{ margin: '-4px 0 10px' }}>
        بيتحدّثوا تلقائي أول ما عميل يقيّم المتجر من التطبيق — عدّلهم هنا بس لو عايز تظبطهم يدويًا.
      </p>

      <hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '14px 0' }} />
      <strong>حسابات الدخول</strong>
      <p className="page-sub" style={{ margin: '4px 0 10px' }}>تعديل الاسم أو كلمة السر لصاحب المتجر أو موظفيه</p>
      <ErrBox error={staffList.error} />
      {staffList.loading ? <div className="empty">تحميل…</div>
        : (staffList.data?.data || []).length === 0 ? <Empty>مفيش حسابات</Empty>
        : (staffList.data?.data || []).map((s) => <StaffAccountRow key={s.id} staff={s} />)}
    </Modal>
  );
}

function StaffAccountRow({ staff }) {
  const [f, setF] = useState({ name: staff.name || '', password: '' });
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState(0);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit() {
    setBusy(true); setError(null);
    try {
      const body = { name: f.name };
      if (f.password) body.password = f.password;
      await api.put(`/api/admin/staff/${staff.id}`, body);
      setF({ ...f, password: '' });
      setSavedAt(Date.now());
    } catch (e) { setError(e); } finally { setBusy(false); }
  }

  return (
    <div className="card card-pad" style={{ marginBottom: 8 }}>
      <p className="page-sub" style={{ margin: '0 0 8px' }}>
        {staff.role === 'vendor_owner' ? 'صاحب المتجر' : 'موظف'} — {staff.email || staff.phone || ''}
      </p>
      <div className="row" style={{ gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Field label="الاسم"><input value={f.name} onChange={set('name')} style={{ width: 160 }} /></Field>
        <Field label="كلمة سر جديدة (اختياري)"><input value={f.password} onChange={set('password')} style={{ width: 160 }} /></Field>
        <button className="btn sm primary" disabled={busy || !f.name} onClick={submit}>حفظ</button>
        {savedAt > 0 && <span className="page-sub" style={{ color: 'var(--ok, #16a34a)' }}>تم ✓</span>}
      </div>
      <ErrBox error={error} />
    </div>
  );
}
