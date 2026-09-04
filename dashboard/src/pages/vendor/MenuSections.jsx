import { useState } from 'react';
import { api } from '../../api';
import { useAsync, ErrBox, Empty, Modal, Field } from '../../ui';

// أقسام قائمة المطعم (بيتزا/برجر/مشويات...) — تعديل فوري، بدون مراجعة إدارة
export default function MenuSections() {
  const { data, loading, error, reload } = useAsync(() => api.get('/api/vendor/menu-sections'));
  const [edit, setEdit] = useState(null);
  const rows = data?.data || [];

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">أقسام القائمة</h1>
          <p className="page-sub">قسّم المنتجات في التطبيق (بيتزا، برجر، مشويات...) — تعديل فوري</p>
        </div>
        <button className="btn primary" onClick={() => setEdit({})}>+ قسم</button>
      </div>
      <ErrBox error={error} />
      <div className="card" style={{ overflow: 'auto' }}>
        <table>
          <thead><tr><th>#</th><th>الاسم (عربي)</th><th>الاسم (إنجليزي)</th><th>الترتيب</th><th></th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={5} className="empty">تحميل…</td></tr>
              : rows.length === 0 ? <tr><td colSpan={5}><Empty /></td></tr>
              : rows.map((s) => (
                <tr key={s.id}>
                  <td>{s.id}</td>
                  <td>{s.name_ar}</td>
                  <td>{s.name_en || '—'}</td>
                  <td>{s.sort_order}</td>
                  <td className="row">
                    <button className="btn sm" onClick={() => setEdit(s)}>تعديل</button>
                    <button className="btn sm danger" onClick={async () => {
                      if (!confirm('حذف القسم؟ المنتجات فيه هترجع بدون قسم.')) return;
                      await api.del(`/api/vendor/menu-sections/${s.id}`);
                      reload();
                    }}>حذف</button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {edit && <SectionModal s={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); reload(); }} />}
    </>
  );
}

function SectionModal({ s, onClose, onDone }) {
  const isNew = !s.id;
  const [f, setF] = useState({
    name_ar: s.name_ar || '',
    name_en: s.name_en || '',
    sort_order: s.sort_order ?? 0,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit() {
    setBusy(true); setError(null);
    try {
      const body = { ...f, sort_order: Number(f.sort_order) || 0 };
      if (isNew) await api.post('/api/vendor/menu-sections', body);
      else await api.put(`/api/vendor/menu-sections/${s.id}`, body);
      onDone();
    } catch (e) { setError(e); } finally { setBusy(false); }
  }

  return (
    <Modal title={isNew ? 'قسم جديد' : `تعديل: ${s.name_ar}`} onClose={onClose}
      footer={<button className="btn primary" disabled={busy || !f.name_ar} onClick={submit}>حفظ</button>}>
      <ErrBox error={error} />
      <div className="grid k2">
        <Field label="الاسم (عربي)"><input value={f.name_ar} onChange={set('name_ar')} placeholder="بيتزا" /></Field>
        <Field label="الاسم (إنجليزي)"><input value={f.name_en} onChange={set('name_en')} placeholder="Pizza" /></Field>
      </div>
      <Field label="الترتيب"><input type="number" value={f.sort_order} onChange={set('sort_order')} /></Field>
    </Modal>
  );
}
