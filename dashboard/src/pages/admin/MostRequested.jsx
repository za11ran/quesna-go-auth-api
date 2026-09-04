import { useMemo, useState } from 'react';
import { api, apiBase } from '../../api';
import { useAsync, ErrBox, Empty } from '../../ui';

// اختيار المنتجات "الأكثر طلبًا" اللي بتظهر للعميل في الصفحة الرئيسية
export default function MostRequested() {
  const { data, loading, error, reload } = useAsync(() => api.get('/api/admin/products'));
  const rows = data?.data || [];

  const [picked, setPicked] = useState(null); // Set<string> — بيتهيّأ من السيرفر أول تحميل
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [saveErr, setSaveErr] = useState(null);
  const [savedAt, setSavedAt] = useState(0);

  // هيّئ التحديد من is_most_requested لما البيانات توصل
  const initial = useMemo(
    () => new Set(rows.filter((p) => p.is_most_requested).map((p) => String(p.id))),
    [data] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const sel = picked ?? initial;

  const filtered = rows.filter((p) => {
    if (!q.trim()) return true;
    const s = q.trim().toLowerCase();
    return (
      (p.name_ar || '').toLowerCase().includes(s) ||
      (p.name_en || '').toLowerCase().includes(s) ||
      (p.vendor_name_ar || '').toLowerCase().includes(s)
    );
  });

  const toggle = (id) => {
    const next = new Set(sel);
    const k = String(id);
    next.has(k) ? next.delete(k) : next.add(k);
    setPicked(next);
  };

  const dirty = picked && (
    picked.size !== initial.size || [...picked].some((k) => !initial.has(k))
  );

  async function save() {
    setBusy(true); setSaveErr(null);
    try {
      await api.post('/api/admin/products/most-requested', { product_ids: [...sel] });
      setPicked(null);
      setSavedAt(Date.now());
      reload();
    } catch (e) { setSaveErr(e); } finally { setBusy(false); }
  }

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">الأكثر طلبًا</h1>
          <p className="page-sub">المنتجات المختارة دي بتظهر في قسم «الأكثر طلبًا» بالتطبيق</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <span className="page-sub">{sel.size} مختار</span>
          <button className="btn primary" disabled={busy || !dirty} onClick={save}>
            {busy ? 'جاري الحفظ…' : 'حفظ'}
          </button>
        </div>
      </div>

      <ErrBox error={error || saveErr} />
      {savedAt > 0 && !dirty && <div className="card" style={{ color: 'var(--ok, #16a34a)' }}>تم الحفظ ✓</div>}

      <div className="card" style={{ marginBottom: 12 }}>
        <input
          placeholder="ابحث باسم المنتج أو المتجر…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ width: '100%' }}
        />
      </div>

      <div className="card" style={{ overflow: 'auto' }}>
        <table>
          <thead>
            <tr><th></th><th>المنتج</th><th>المتجر</th><th>السعر</th><th>متاح؟</th></tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="empty">تحميل…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5}><Empty /></td></tr>
            ) : (
              filtered.map((p) => (
                <tr key={p.id} style={{ opacity: p.is_available ? 1 : 0.55 }}>
                  <td>
                    <input
                      type="checkbox"
                      checked={sel.has(String(p.id))}
                      onChange={() => toggle(p.id)}
                    />
                  </td>
                  <td className="row" style={{ gap: 8 }}>
                    {p.image && (
                      <img src={apiBase + p.image} width={32} height={32}
                        style={{ borderRadius: 6, objectFit: 'cover' }} alt="" />
                    )}
                    <span>{p.name_ar}</span>
                  </td>
                  <td>{p.vendor_name_ar}</td>
                  <td>{Number(p.price).toLocaleString('ar-EG')} ج.م</td>
                  <td>{p.is_available ? '✓' : '✕'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
