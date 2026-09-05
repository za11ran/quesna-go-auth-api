import { useState } from 'react';
import { api } from '../../api';
import { useAsync, ErrBox, Empty, Pill, Modal, Field } from '../../ui';

function CouponFieldToggle() {
  const { data, loading, error, reload } = useAsync(() => api.get('/api/admin/settings/feature-flags'));
  const [busy, setBusy] = useState(false);
  const visible = data?.coupon_field_visible ?? true;

  async function toggle() {
    setBusy(true);
    try {
      await api.post('/api/admin/settings/feature-flags', { coupon_field_visible: !visible });
      reload();
    } finally { setBusy(false); }
  }

  return (
    <div className="card row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12 }}>
      <div>
        <strong>حقل الكوبون في السلة</strong>
        <p className="page-sub" style={{ margin: '2px 0 0' }}>
          {visible
            ? 'دلوقتي ظاهر — العميل بيقدر يكتب كود الخصم في السلة.'
            : 'دلوقتي مخفي — حقل كود الخصم مش بيظهر للعميل خالص. الأكواد نفسها تفضل شغّالة.'}
        </p>
        <ErrBox error={error} />
      </div>
      <button
        className={`btn ${visible ? 'danger' : 'primary'}`}
        style={{ whiteSpace: 'nowrap' }}
        disabled={loading || busy}
        onClick={toggle}
      >
        {busy ? '…' : visible ? 'إخفاء من السلة' : 'إظهار في السلة'}
      </button>
    </div>
  );
}

// معرّفات المتاجر اللي الكوبون مقصور عليها (vendor_ids الجديدة، وإلا vendor_id القديم).
const couponVendorIds = (c) =>
  (Array.isArray(c.vendor_ids) && c.vendor_ids.length)
    ? c.vendor_ids
    : (c.vendor_id ? [c.vendor_id] : []);

function couponScopeLabel(c, vendors) {
  const ids = couponVendorIds(c);
  if (!ids.length) return <span className="page-sub">كل المتاجر</span>;
  const nameOf = (id) => vendors.find((v) => v.id === id)?.name_ar || id;
  if (ids.length === 1) return nameOf(ids[0]);
  return `${ids.length} متاجر: ${ids.map(nameOf).join('، ')}`;
}

export default function Coupons() {
  const { data, loading, error, reload } = useAsync(() => api.get('/api/admin/coupons'));
  const { data: vendorsData } = useAsync(() => api.get('/api/admin/vendors'));
  const [edit, setEdit] = useState(null); // coupon or {} for new
  const rows = data?.data || [];
  const vendors = vendorsData?.data || [];

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">أكواد الخصم</h1>
          <p className="page-sub">الكود اللي العميل بيكتبه في السلة — بيتحقق منه السيرفر فعليًا</p>
        </div>
        <button className="btn primary" onClick={() => setEdit({})}>+ كود جديد</button>
      </div>
      <CouponFieldToggle />
      <ErrBox error={error} />
      <div className="card" style={{ overflow: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>الكود</th><th>المتجر</th><th>الخصم</th><th>الحد الأدنى للطلب</th>
              <th>الاستخدام</th><th>الفترة</th><th>مفعّل؟</th><th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={8} className="empty">تحميل…</td></tr>
              : rows.length === 0 ? <tr><td colSpan={8}><Empty /></td></tr>
              : rows.map((c) => (
                <tr key={c.id}>
                  <td><code>{c.code}</code></td>
                  <td>{couponScopeLabel(c, vendors)}</td>
                  <td>{c.discount_type === 'percent' ? `${Number(c.discount_value)}%` : `${Number(c.discount_value)} ج.م`}</td>
                  <td>{Number(c.min_order_amount) > 0 ? `${Number(c.min_order_amount)} ج.م` : '—'}</td>
                  <td>{c.used_count}{c.max_uses != null ? ` / ${c.max_uses}` : ''}</td>
                  <td style={{ fontSize: 12 }}>
                    {c.starts_at ? new Date(c.starts_at).toLocaleDateString('ar-EG') : '—'}
                    {' → '}
                    {c.ends_at ? new Date(c.ends_at).toLocaleDateString('ar-EG') : '—'}
                  </td>
                  <td>{c.is_active ? <Pill tone="ok">نعم</Pill> : <Pill>لا</Pill>}</td>
                  <td className="row">
                    <button className="btn sm" onClick={() => setEdit(c)}>تعديل</button>
                    <button className="btn sm danger" onClick={async () => {
                      if (!confirm(`حذف الكود ${c.code}؟`)) return;
                      await api.del(`/api/admin/coupons/${c.id}`); reload();
                    }}>حذف</button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {edit && <CouponModal c={edit} vendors={vendors} onClose={() => setEdit(null)} onDone={() => { setEdit(null); reload(); }} />}
    </>
  );
}

function CouponModal({ c, vendors, onClose, onDone }) {
  const isNew = !c.id;
  const [f, setF] = useState({
    code: c.code || '',
    vendor_ids: couponVendorIds(c),
    discount_type: c.discount_type || 'percent',
    discount_value: c.discount_value ?? 10,
    min_order_amount: c.min_order_amount ?? 0,
    max_uses: c.max_uses ?? '',
    starts_at: c.starts_at ? c.starts_at.slice(0, 10) : '',
    ends_at: c.ends_at ? c.ends_at.slice(0, 10) : '',
    is_active: c.is_active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  async function submit() {
    setBusy(true); setError(null);
    try {
      const body = {
        ...f,
        code: f.code.trim().toUpperCase(),
        vendor_ids: f.vendor_ids,
        discount_value: Number(f.discount_value),
        min_order_amount: Number(f.min_order_amount) || 0,
        max_uses: f.max_uses === '' ? null : Number(f.max_uses),
        starts_at: f.starts_at || null,
        ends_at: f.ends_at || null,
      };
      if (isNew) await api.post('/api/admin/coupons', body);
      else await api.put(`/api/admin/coupons/${c.id}`, body);
      onDone();
    } catch (e) { setError(e); } finally { setBusy(false); }
  }

  return (
    <Modal title={isNew ? 'كود خصم جديد' : `تعديل: ${c.code}`} onClose={onClose}
      footer={<button className="btn primary" disabled={busy || !f.code} onClick={submit}>حفظ</button>}>
      <ErrBox error={error} />
      <Field label="الكود">
        <input value={f.code} onChange={set('code')} placeholder="WELCOME10" style={{ textTransform: 'uppercase' }} />
      </Field>
      <Field label="مقصور على متاجر (اختياري)">
        <div style={{
          maxHeight: 160, overflow: 'auto', border: '1px solid var(--line)',
          borderRadius: 'var(--radius-sm)', padding: '8px 10px',
        }}>
          {vendors.length === 0 && <span className="page-sub">لا توجد متاجر</span>}
          {vendors.map((v) => {
            const on = f.vendor_ids.includes(v.id);
            return (
              <label key={v.id} className="row" style={{ gap: 6, padding: '3px 0' }}>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => setF({
                    ...f,
                    vendor_ids: on
                      ? f.vendor_ids.filter((id) => id !== v.id)
                      : [...f.vendor_ids, v.id],
                  })}
                />
                {v.name_ar}
              </label>
            );
          })}
        </div>
        <p className="page-sub" style={{ margin: '4px 0 0' }}>
          سيب الكل فاضي = خصم على كل الطلب. لو اخترت متجر أو أكتر، الخصم بيتحسب بس على
          أصناف المتاجر دي من السلة، ولازم واحد منها على الأقل يكون في الطلب.
        </p>
      </Field>
      <div className="grid k2">
        <Field label="نوع الخصم">
          <select value={f.discount_type} onChange={set('discount_type')}>
            <option value="percent">نسبة %</option>
            <option value="amount">مبلغ ثابت (ج.م)</option>
          </select>
        </Field>
        <Field label="القيمة"><input type="number" value={f.discount_value} onChange={set('discount_value')} /></Field>
      </div>
      <div className="grid k2">
        <Field label="الحد الأدنى للطلب (اختياري)">
          <input type="number" value={f.min_order_amount} onChange={set('min_order_amount')} />
        </Field>
        <Field label="أقصى عدد استخدام (فاضي = بلا حد)">
          <input type="number" value={f.max_uses} onChange={set('max_uses')} />
        </Field>
      </div>
      <div className="grid k2">
        <Field label="يبدأ من (اختياري)"><input type="date" value={f.starts_at} onChange={set('starts_at')} /></Field>
        <Field label="ينتهي في (اختياري)"><input type="date" value={f.ends_at} onChange={set('ends_at')} /></Field>
      </div>
      <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={f.is_active} onChange={set('is_active')} /> مفعّل</label>
    </Modal>
  );
}
