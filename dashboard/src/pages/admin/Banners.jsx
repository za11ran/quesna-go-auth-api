import { useState } from 'react';
import { api, apiBase } from '../../api';
import { useAsync, ErrBox, Empty, Modal, Field } from '../../ui';

export default function Banners() {
  const { data, loading, error, reload } = useAsync(() => api.get('/api/admin/banners'));
  const [edit, setEdit] = useState(null);
  const rows = data?.data || [];
  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div><h1 className="page-title">البانرات</h1><p className="page-sub">إعلانات الصفحة الرئيسية</p></div>
        <button className="btn primary" onClick={() => setEdit({})}>+ بانر</button>
      </div>
      <ErrBox error={error} />
      <div className="grid k3">
        {loading ? <div className="empty">تحميل…</div>
          : rows.length === 0 ? <Empty />
          : rows.map((b) => (
            <div key={b.id} className="card">
              <img src={apiBase + b.image} style={{ width: '100%', height: 120, objectFit: 'cover', borderTopLeftRadius: 16, borderTopRightRadius: 16 }} alt="" />
              <div className="card-pad">
                <strong>{b.title_ar || 'بدون عنوان'}</strong>
                <p className="page-sub" style={{ margin: '4px 0' }}>{b.target_type || '—'} · {b.is_active ? 'مفعّل' : 'موقوف'}</p>
                <div className="row">
                  <button className="btn sm" onClick={() => setEdit(b)}>تعديل</button>
                  <button className="btn sm danger" onClick={async () => { if (confirm('حذف؟')) { await api.del(`/api/admin/banners/${b.id}`); reload(); } }}>حذف</button>
                </div>
              </div>
            </div>
          ))}
      </div>
      {edit && <BannerModal b={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); reload(); }} />}
    </>
  );
}

function BannerModal({ b, onClose, onDone }) {
  const isNew = !b.id;
  const [f, setF] = useState({ title_ar: b.title_ar || '', title_en: b.title_en || '', image: b.image || '', target_type: b.target_type || '', target_ref: b.target_ref || '', sort_order: b.sort_order ?? 0, is_active: b.is_active ?? true });
  const [busy, setBusy] = useState(false); const [error, setError] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  async function submit() {
    setBusy(true); setError(null);
    try {
      const body = { ...f, sort_order: Number(f.sort_order) };
      if (isNew) await api.post('/api/admin/banners', body);
      else await api.put(`/api/admin/banners/${b.id}`, body);
      onDone();
    } catch (e) { setError(e); } finally { setBusy(false); }
  }
  return (
    <Modal title={isNew ? 'بانر جديد' : 'تعديل بانر'} onClose={onClose}
      footer={<button className="btn primary" disabled={busy || !f.image} onClick={submit}>حفظ</button>}>
      <ErrBox error={error} />
      <Field label="الصورة">
        {f.image && <img src={apiBase + f.image} style={{ width: '100%', borderRadius: 10, marginBottom: 8 }} alt="" />}
        <label className="btn">رفع صورة<input type="file" hidden accept="image/*" onChange={async (e) => {
          if (!e.target.files[0]) return;
          const fd = new FormData(); fd.append('image', e.target.files[0]);
          const r = await api.upload('/api/admin/banners/image', fd);
          setF((s) => ({ ...s, image: r.url }));
        }} /></label>
      </Field>
      <div className="grid k2">
        <Field label="العنوان (عربي)"><input value={f.title_ar} onChange={set('title_ar')} /></Field>
        <Field label="العنوان (إنجليزي)"><input value={f.title_en} onChange={set('title_en')} /></Field>
      </div>
      <div className="grid k3">
        <Field label="نوع الهدف"><select value={f.target_type} onChange={set('target_type')}><option value="">—</option><option value="vendor">متجر</option><option value="category">قسم</option><option value="url">رابط</option></select></Field>
        <Field label="الهدف"><input value={f.target_ref} onChange={set('target_ref')} /></Field>
        <Field label="الترتيب"><input type="number" value={f.sort_order} onChange={set('sort_order')} /></Field>
      </div>
      <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={f.is_active} onChange={set('is_active')} /> مفعّل</label>
    </Modal>
  );
}
