import { useState } from 'react';
import { api } from '../../api';
import { useAsync, ErrBox, Empty, Pill, Modal, Field, Money } from '../../ui';

export default function VendorOffers() {
  const { data, loading, error, reload } = useAsync(() => api.get('/api/vendor/offers'));
  const { data: sectionsData } = useAsync(() => api.get('/api/vendor/menu-sections'));
  const { data: productsData } = useAsync(() => api.get('/api/vendor/products?per_page=200'));
  const [edit, setEdit] = useState(null); // offer or {} for new
  const rows = data?.data || [];
  const sections = sectionsData?.data || [];
  const products = productsData?.data || [];

  function scopeLabel(o) {
    if (o.scope === 'store') return 'المتجر كله';
    if (o.scope === 'product') {
      const p = products.find((x) => x.id === o.target_id);
      return `منتج · ${p ? p.name_ar : o.target_id}`;
    }
    if (o.scope === 'category') {
      const s = sections.find((x) => String(x.id) === o.target_id);
      return `قسم · ${s ? s.name_ar : o.target_id}`;
    }
    return o.scope;
  }

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
                  <td>{scopeLabel(o)}</td>
                  <td>{o.discount_type === 'percent' ? `${o.discount_value}%` : <Money v={o.discount_value} />}</td>
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
      {edit && (
        <OfferModal
          o={edit} sections={sections} products={products}
          onClose={() => setEdit(null)} onDone={() => { setEdit(null); reload(); }}
        />
      )}
    </>
  );
}

function OfferModal({ o, sections, products, onClose, onDone }) {
  const isNew = !o.id;
  const initialProduct = o.scope === 'product' ? products.find((p) => p.id === o.target_id) : null;
  const initialOldPrice = initialProduct ? initialProduct.price : '';
  const initialNewPrice = initialProduct
    ? (o.discount_type === 'amount' ? Number(initialProduct.price) - Number(o.discount_value) : initialProduct.price)
    : '';

  const [f, setF] = useState({
    title_ar: o.title_ar || '', title_en: o.title_en || '',
    scope: o.scope || 'store', target_id: o.target_id || '',
    discount_type: o.discount_type || 'percent', discount_value: o.discount_value ?? 10,
    is_active: o.is_active ?? true,
  });
  const [productId, setProductId] = useState(o.scope === 'product' ? o.target_id || '' : '');
  const [oldPrice, setOldPrice] = useState(initialOldPrice);
  const [newPrice, setNewPrice] = useState(initialNewPrice);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  function pickProduct(id) {
    setProductId(id);
    const p = products.find((x) => x.id === id);
    setOldPrice(p ? p.price : '');
    setNewPrice(p ? p.price : '');
  }

  const isProductScope = f.scope === 'product';
  const canSubmit = f.title_ar && (
    isProductScope
      ? productId && newPrice !== '' && Number(newPrice) < Number(oldPrice)
      : true
  );

  async function submit() {
    setBusy(true); setError(null);
    try {
      let body;
      if (isProductScope) {
        body = {
          ...f, scope: 'product', target_id: productId,
          discount_type: 'amount', discount_value: Number(oldPrice) - Number(newPrice),
        };
      } else {
        body = { ...f, discount_value: Number(f.discount_value), target_id: f.scope === 'store' ? null : f.target_id };
      }
      if (isNew) await api.post('/api/vendor/offers', body);
      else await api.put(`/api/vendor/offers/${o.id}`, body);
      onDone();
    } catch (e) { setError(e); } finally { setBusy(false); }
  }

  return (
    <Modal title={isNew ? 'عرض جديد' : `تعديل: ${o.title_ar}`} onClose={onClose}
      footer={<button className="btn primary" disabled={busy || !canSubmit} onClick={submit}>إرسال للمراجعة</button>}>
      <ErrBox error={error} />
      <div className="grid k2">
        <Field label="العنوان (عربي)"><input value={f.title_ar} onChange={set('title_ar')} /></Field>
        <Field label="العنوان (إنجليزي)"><input value={f.title_en} onChange={set('title_en')} /></Field>
      </div>

      <Field label="النطاق">
        <select value={f.scope} onChange={set('scope')}>
          <option value="store">المتجر كله</option>
          <option value="category">قسم</option>
          <option value="product">منتج</option>
        </select>
      </Field>

      {f.scope === 'category' && (
        <Field label="القسم">
          <select value={f.target_id} onChange={set('target_id')}>
            <option value="">اختر قسم</option>
            {sections.map((s) => <option key={s.id} value={s.id}>{s.name_ar}</option>)}
          </select>
        </Field>
      )}

      {isProductScope ? (
        <>
          <Field label="المنتج">
            <select value={productId} onChange={(e) => pickProduct(e.target.value)}>
              <option value="">اختر منتج</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name_ar}</option>)}
            </select>
          </Field>
          <div className="grid k2">
            <Field label="السعر قبل العرض"><input type="number" value={oldPrice} disabled /></Field>
            <Field label="سعر العرض"><input type="number" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} /></Field>
          </div>
          {productId && newPrice !== '' && Number(newPrice) >= Number(oldPrice) && (
            <p className="err">سعر العرض لازم يكون أقل من السعر الأصلي</p>
          )}
        </>
      ) : (
        <div className="grid k2">
          <Field label="نوع الخصم">
            <select value={f.discount_type} onChange={set('discount_type')}>
              <option value="percent">نسبة %</option>
            </select>
          </Field>
          <Field label="القيمة (%)"><input type="number" value={f.discount_value} onChange={set('discount_value')} /></Field>
        </div>
      )}

      <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={f.is_active} onChange={set('is_active')} /> مفعّل</label>
    </Modal>
  );
}
