import { useState } from 'react';
import { api } from '../../api';
import { ErrBox, Field } from '../../ui';

const DAYS = [
  ['sat', 'السبت'], ['sun', 'الأحد'], ['mon', 'الإثنين'], ['tue', 'الثلاثاء'],
  ['wed', 'الأربعاء'], ['thu', 'الخميس'], ['fri', 'الجمعة'],
];

function toArabicTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ap = h < 12 ? 'ص' : 'م';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ap}`;
}

function buildText(wh) {
  if (wh.always_open) return 'مفتوح 24 ساعة';
  const open = DAYS.filter(([k]) => !wh.days[k]?.closed);
  if (open.length === 0) return 'مغلق';
  const sample = wh.days[open[0][0]];
  const same = open.every(([k]) => wh.days[k].open === sample.open && wh.days[k].close === sample.close);
  if (same && open.length === 7) return `يوميًا ${toArabicTime(sample.open)} - ${toArabicTime(sample.close)}`;
  return open.map(([, ar]) => ar).join('، ') + ` ${toArabicTime(sample.open)} - ${toArabicTime(sample.close)}`;
}

export default function WorkingHours({ initial, onSaved }) {
  const [wh, setWh] = useState(() => {
    const base = initial && typeof initial === 'object' ? initial : {};
    const days = {};
    for (const [k] of DAYS) days[k] = base.days?.[k] || base[k] || { open: '10:00', close: '23:59', closed: false };
    return { always_open: !!base.always_open, days };
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);

  const setDay = (k, patch) => setWh((s) => ({ ...s, days: { ...s.days, [k]: { ...s.days[k], ...patch } } }));

  async function save() {
    setBusy(true); setMsg(null); setError(null);
    try {
      const text = buildText(wh);
      await api.put('/api/vendor/profile/working-hours', {
        working_hours: wh,
        working_hours_text_ar: text,
        working_hours_text_en: wh.always_open ? 'Open 24 hours' : text,
      });
      setMsg('اتحفظت مواعيد العمل ✅');
      onSaved && onSaved();
    } catch (e) { setError(e); } finally { setBusy(false); }
  }

  return (
    <div className="card card-pad">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
        <strong>مواعيد العمل</strong>
        <label className="row" style={{ gap: 6 }}>
          <input type="checkbox" checked={wh.always_open} onChange={(e) => setWh({ ...wh, always_open: e.target.checked })} />
          مفتوح 24 ساعة
        </label>
      </div>
      <ErrBox error={error} />
      {msg && <div className="page-sub">{msg}</div>}

      {!wh.always_open && (
        <div className="grid" style={{ gap: 8 }}>
          {DAYS.map(([k, ar]) => {
            const d = wh.days[k];
            return (
              <div key={k} className="row" style={{ gap: 10 }}>
                <span style={{ width: 64, fontWeight: 700 }}>{ar}</span>
                <label className="row" style={{ gap: 4 }}>
                  <input type="checkbox" checked={!d.closed} onChange={(e) => setDay(k, { closed: !e.target.checked })} />
                  مفتوح
                </label>
                <span>من</span>
                <input type="time" value={d.open} disabled={d.closed} onChange={(e) => setDay(k, { open: e.target.value })} />
                <span>إلى</span>
                <input type="time" value={d.close} disabled={d.closed} onChange={(e) => setDay(k, { close: e.target.value })} />
              </div>
            );
          })}
        </div>
      )}

      <p className="page-sub" style={{ marginTop: 10 }}>سيظهر للعميل: <strong>{buildText(wh)}</strong></p>
      <button className="btn primary" disabled={busy} onClick={save}>حفظ المواعيد</button>
    </div>
  );
}
