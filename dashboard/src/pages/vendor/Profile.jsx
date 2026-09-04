import { useState } from 'react';
import { api, apiBase } from '../../api';
import { useAsync, ErrBox, Field, Pill } from '../../ui';
import WorkingHours from './WorkingHours';

export default function VendorProfile() {
  const { data, loading, error, reload } = useAsync(() => api.get('/api/vendor/profile'));
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const v = data;
  if (!loading && v && f === null) {
    setF({
      phone: v.phone || '', description_ar: v.description_ar || '',
      avg_prep_time_minutes: v.avg_prep_time_minutes, address_ar: v.address_ar || '',
    });
  }
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function save() {
    setBusy(true); setMsg(null);
    try {
      const r = await api.put('/api/vendor/profile', f);
      setMsg(r.change_request_id ? 'اتبعت لمراجعة الإدارة ✅' : 'اتحفظ ✅');
      reload();
    } catch (e) { setMsg(e.message); } finally { setBusy(false); }
  }
  async function toggleOpen() {
    await api.put('/api/vendor/profile/status', { is_open: !v.is_open });
    reload();
  }

  if (loading || !f) return <div className="empty">تحميل…</div>;

  return (
    <>
      <h1 className="page-title">بيانات المتجر</h1>
      <p className="page-sub">الوصف يمر بمراجعة الإدارة. اسم المتجر وصورته بيغيّرهم الأدمن بس.</p>
      <ErrBox error={error} />
      {msg && <div className={msg.includes('✅') ? 'card card-pad' : 'err'}>{msg}</div>}

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div className="row">
            {v.logo && <img src={apiBase + v.logo} width={48} height={48} style={{ borderRadius: 12, objectFit: 'cover' }} alt="" />}
            <strong>{v.name_ar}</strong>
            <Pill tone={v.is_open ? 'ok' : 'danger'}>{v.is_open ? 'مفتوح' : 'مغلق'}</Pill>
            {v.has_pending_change && <Pill tone="warn">تعديل قيد المراجعة</Pill>}
          </div>
          <button className="btn" onClick={toggleOpen}>{v.is_open ? 'اقفل المتجر' : 'افتح المتجر'}</button>
        </div>
      </div>

      <div className="card card-pad">
        <Field label="الوصف"><textarea rows={2} value={f.description_ar} onChange={set('description_ar')} /></Field>
        <div className="grid k2">
          <Field label="تليفون"><input value={f.phone} onChange={set('phone')} /></Field>
          <Field label="متوسط وقت التحضير (دقيقة)"><input type="number" value={f.avg_prep_time_minutes} onChange={set('avg_prep_time_minutes')} /></Field>
        </div>
        <Field label="العنوان"><input value={f.address_ar} onChange={set('address_ar')} /></Field>
        <button className="btn primary" disabled={busy} onClick={save}>حفظ</button>
      </div>

      <div style={{ marginTop: 16 }}>
        <WorkingHours initial={v.working_hours} onSaved={reload} />
      </div>
    </>
  );
}
