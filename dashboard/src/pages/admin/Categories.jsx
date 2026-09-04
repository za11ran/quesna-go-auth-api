import { useState } from 'react';
import { api, apiBase } from '../../api';
import { useAsync, ErrBox, Empty, Modal, Field } from '../../ui';

export default function Categories() {
  const { data, loading, error, reload } = useAsync(() => api.get('/api/admin/categories'));
  const [edit, setEdit] = useState(null);
  const rows = data?.data || [];
  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div><h1 className="page-title">أقسام الهوم</h1><p className="page-sub">اللي بيظهر للعميل في الصفحة الرئيسية</p></div>
        <button className="btn primary" onClick={() => setEdit({})}>+ قسم</button>
      </div>
      <ErrBox error={error} />
      <div className="card" style={{ overflow: 'auto' }}>
        <table>
          <thead><tr><th>#</th><th>الاسم</th><th>النوع</th><th>ترتيب</th><th>مفعّل؟</th><th>صورة</th><th></th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={7} className="empty">تحميل…</td></tr>
              : rows.length === 0 ? <tr><td colSpan={7}><Empty /></td></tr>
              : rows.map((c) => (
                <tr key={c.id}>
                  <td>{c.id}</td><td>{c.name_ar}</td><td>{c.type}/{c.action || '—'}</td>
                  <td>{c.sort_order}</td><td>{c.is_active ? '✓' : '✕'}</td>
                  <td>
                    {c.image && <img src={apiBase + c.image} width={32} height={32} style={{ borderRadius: 6, objectFit: 'cover' }} alt="" />}
                    <label className="btn sm" style={{ marginInlineStart: 6 }}>رفع<input type="file" hidden accept="image/*" onChange={async (e) => {
                      if (!e.target.files[0]) return;
                      const fd = new FormData(); fd.append('image', e.target.files[0]);
                      await api.upload(`/api/admin/categories/${c.id}/image`, fd); reload();
                    }} /></label>
                  </td>
                  <td className="row">
                    <button className="btn sm" onClick={() => setEdit(c)}>تعديل</button>
                    <button className="btn sm danger" onClick={async () => { if (confirm('حذف؟')) { await api.del(`/api/admin/categories/${c.id}`); reload(); } }}>حذف</button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {edit && <CatModal c={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); reload(); }} />}
    </>
  );
}

function CatModal({ c, onClose, onDone }) {
  const isNew = !c.id;
  const [f, setF] = useState({ name_ar: c.name_ar || '', name_en: c.name_en || '', type: c.type || 'vendors', action: c.action || '', sort_order: c.sort_order ?? 0, is_active: c.is_active ?? true });
  const [busy, setBusy] = useState(false); const [error, setError] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  async function submit() {
    setBusy(true); setError(null);
    try {
      const body = { ...f, sort_order: Number(f.sort_order) };
      if (isNew) await api.post('/api/admin/categories', body);
      else await api.put(`/api/admin/categories/${c.id}`, body);
      onDone();
    } catch (e) { setError(e); } finally { setBusy(false); }
  }
  return (
    <Modal title={isNew ? 'قسم جديد' : `تعديل: ${c.name_ar}`} onClose={onClose}
      footer={<button className="btn primary" disabled={busy || !f.name_ar} onClick={submit}>حفظ</button>}>
      <ErrBox error={error} />
      <div className="grid k2">
        <Field label="الاسم (عربي)"><input value={f.name_ar} onChange={set('name_ar')} /></Field>
        <Field label="الاسم (إنجليزي)"><input value={f.name_en} onChange={set('name_en')} /></Field>
      </div>
      <div className="grid k3">
        <Field label="النوع"><select value={f.type} onChange={set('type')}><option value="vendors">تجّار</option><option value="products">منتجات</option></select></Field>
        <Field label="action"><input value={f.action} onChange={set('action')} placeholder="restaurants" /></Field>
        <Field label="الترتيب"><input type="number" value={f.sort_order} onChange={set('sort_order')} /></Field>
      </div>
      <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={f.is_active} onChange={set('is_active')} /> مفعّل</label>
    </Modal>
  );
}
