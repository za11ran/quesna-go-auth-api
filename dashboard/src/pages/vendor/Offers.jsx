import { useState } from 'react';
import { api } from '../../api';
import { useAsync, ErrBox, Empty, Pill, Modal, Field } from '../../ui';

export default function VendorOffers() {
  const { data, loading, error, reload } = useAsync(() => api.get('/api/vendor/offers'));
  const [edit, setEdit] = useState(null); // offer or {} for new
  const rows = data?.data || [];

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">العروض</h1>
          <p className="page-sub">أي تغيير في العروض يمر بمراجعة الإدارة</p>
        </div>
        <button className="btn primary" onClick={() => setEdit({})}>+ عرض</button>
      </div>
      <ErrBox error={error} />
      <div className="card" style={{ overflow: 'auto' }}>
        <table>
          <thead><tr><th>العنوان</th><th>النطاق</th><th>الخصم</th><th>مفعّل؟</th><th></th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={5} className="empty">تحميل…</td></tr>
              : rows.length === 0 ? <tr><td colSpan={5}><Empty /></td></tr>
              : rows.map((o) => (
                <tr key={o.id}>
                  <td>{o.title_ar}</td>
                  <td>{o.scope}{o.target_id ? ` · ${o.target_id}` : ''}</td>
                  <td>{o.discount_type === 'percent' ? `${o.discount_value}%` : `${o.discount_value} ج.م`}</td>
                  <td>{o.is_active ? <Pill tone="ok">نعم</Pill> : <Pill>لا</Pill>}</td>
                  <td className="row">
                    <button className="btn sm" onClick={() => setEdit(o)}>تعديل</button>
                    <button className="btn sm danger" onClick={async () => {
                      if (!confirm('طلب حذف العرض؟')) return;
                      await api.del(`/api/vendor/offers/${o.id}`); reload();
                    }}>حذف</button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {edit && <OfferModal o={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); reload(); }} />}
    </>
  );
}

function OfferModal({ o, onClose, onDone }) {
  const isNew = !o.id;
  const [f, setF] = useState({
    title_ar: o.title_ar || '', title_en: o.title_en || '',
    scope: o.scope || 'store', target_id: o.target_id || '',
    discount_type: o.discount_type || 'percent', discount_value: o.discount_value ?? 10,
    is_active: o.is_active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  async function submit() {
    setBusy(true); setError(null);
    try {
      const body = { ...f, discount_value: Number(f.discount_value), target_id: f.scope === 'store' ? null : f.target_id };
      if (isNew) await api.post('/api/vendor/offers', body);
      else await api.put(`/api/vendor/offers/${o.id}`, body);
      onDone();
    } catch (e) { setError(e); } finally { setBusy(false); }
  }

  return (
    <Modal title={isNew ? 'عرض جديد' : `تعديل: ${o.title_ar}`} onClose={onClose}
      footer={<button className="btn primary" disabled={busy || !f.title_ar} onClick={submit}>إرسال للمراجعة</button>}>
      <ErrBox error={error} />
      <div className="grid k2">
        <Field label="العنوان (عربي)"><input value={f.title_ar} onChange={set('title_ar')} /></Field>
        <Field label="العنوان (إنجليزي)"><input value={f.title_en} onChange={set('title_en')} /></Field>
      </div>
      <div className="grid k2">
        <Field label="النطاق">
          <select value={f.scope} onChange={set('scope')}>
            <option value="store">المتجر كله</option>
            <option value="category">قسم</option>
            <option value="product">منتج</option>
          </select>
        </Field>
        {f.scope !== 'store' && <Field label={f.scope === 'category' ? 'اسم القسم' : 'معرّف المنتج'}><input value={f.target_id} onChange={set('target_id')} /></Field>}
      </div>
      <div className="grid k2">
        <Field label="نوع الخصم">
          <select value={f.discount_type} onChange={set('discount_type')}>
            <option value="percent">نسبة %</option>
            <option value="amount">مبلغ ثابت</option>
          </select>
        </Field>
        <Field label="القيمة"><input type="number" value={f.discount_value} onChange={set('discount_value')} /></Field>
      </div>
      <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={f.is_active} onChange={set('is_active')} /> مفعّل</label>
    </Modal>
  );
}
