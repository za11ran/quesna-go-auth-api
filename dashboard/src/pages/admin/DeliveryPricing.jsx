import { useState } from 'react';
import { api } from '../../api';
import { useAsync, ErrBox, Empty, Field } from '../../ui';

export default function DeliveryPricing() {
  const { data, loading, error, reload } = useAsync(() => api.get('/api/admin/villages'));
  const { data: pricing, reload: reloadPricing } = useAsync(() => api.get('/api/admin/settings/delivery-pricing'));
  const rows = data?.data || [];

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">أسعار التوصيل</h1>
          <p className="page-sub">سعر أساسي لكل قرية + رسوم إضافية لكل متجر زيادة عن واحد في نفس الطلب</p>
        </div>
      </div>

      <ExtraVendorFeeCard value={pricing?.extra_vendor_fee} onSaved={reloadPricing} />

      <ErrBox error={error} />
      <div className="card" style={{ overflow: 'auto' }}>
        <table>
          <thead><tr><th>#</th><th>القرية</th><th>المحافظة</th><th style={{ width: 160 }}>السعر الأساسي (ج.م)</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={4} className="empty">تحميل…</td></tr>
              : rows.length === 0 ? <tr><td colSpan={4}><Empty /></td></tr>
              : rows.map((v) => (
                <VillageRow key={v.id} village={v} onSaved={reload} />
              ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ExtraVendorFeeCard({ value, onSaved }) {
  const [fee, setFee] = useState(value ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [savedAt, setSavedAt] = useState(0);

  // تحديث الحقل لما القيمة توصل من الشبكة
  if (value != null && fee === '' && !busy) {
    setFee(value);
  }

  async function submit() {
    setBusy(true); setError(null);
    try {
      await api.post('/api/admin/settings/delivery-pricing', { extra_vendor_fee: Number(fee) });
      setSavedAt(Date.now());
      onSaved();
    } catch (e) { setError(e); } finally { setBusy(false); }
  }

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="row" style={{ alignItems: 'flex-end', gap: 12 }}>
        <Field label="رسوم كل متجر إضافي في نفس الطلب (ج.م)">
          <input type="number" value={fee} onChange={(e) => setFee(e.target.value)} style={{ width: 160 }} />
        </Field>
        <button className="btn primary" disabled={busy || fee === ''} onClick={submit}>حفظ</button>
        {savedAt > 0 && <span className="page-sub" style={{ color: 'var(--ok, #16a34a)' }}>تم الحفظ ✓</span>}
      </div>
      <ErrBox error={error} />
    </div>
  );
}

function VillageRow({ village, onSaved }) {
  const [fee, setFee] = useState(village.delivery_base_fee);
  const [busy, setBusy] = useState(false);
  const dirty = Number(fee) !== Number(village.delivery_base_fee);

  async function save() {
    setBusy(true);
    try {
      await api.put(`/api/admin/villages/${village.id}`, { delivery_base_fee: Number(fee) });
      onSaved();
    } finally { setBusy(false); }
  }

  return (
    <tr>
      <td>{village.id}</td>
      <td>{village.name}</td>
      <td>{village.governorate}</td>
      <td>
        <div className="row" style={{ gap: 6 }}>
          <input
            type="number"
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            disabled={busy}
            style={{ width: 90 }}
          />
          <button className="btn sm" disabled={busy || !dirty} onClick={save}>حفظ</button>
        </div>
      </td>
    </tr>
  );
}
