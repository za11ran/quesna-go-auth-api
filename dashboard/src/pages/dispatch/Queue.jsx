import { useCallback, useState } from 'react';
import { api } from '../../api';
import { useAsync, ErrBox, Empty, Pill, Money, statusTone } from '../../ui';
import { useLive } from '../../socket';

export default function DispatchQueue() {
  const { data, loading, error, reload } = useAsync(() => api.get('/api/dispatch/orders'));
  const drivers = useAsync(() => api.get('/api/dispatch/drivers'));
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  useLive('dispatch:needs_assignment', useCallback(() => reload(), [reload]));
  useLive('order:update', useCallback(() => reload(), [reload]));

  const rows = data?.data || [];
  const available = (drivers.data?.data || []).filter((d) => d.status === 'available' && d.is_online);

  async function act(id, kind, body) {
    setBusy(id + kind); setMsg(null);
    try { await api.post(`/api/dispatch/orders/${id}/${kind}`, body); reload(); drivers.reload(); }
    catch (e) { setMsg(e.message); } finally { setBusy(null); }
  }

  return (
    <>
      <h1 className="page-title">طابور التوزيع</h1>
      <p className="page-sub">الطلبات الجاهزة وتحت التوصيل — تحديث لحظي</p>
      <ErrBox error={error} />
      {msg && <div className="err">{msg}</div>}
      {loading ? <div className="empty">تحميل…</div>
        : rows.length === 0 ? <Empty>الطابور فاضي</Empty>
        : <div className="grid k2">
          {rows.map((o) => (
            <div key={o.id} className="card card-pad">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <strong>{o.id}</strong>
                <Pill tone={statusTone(o.status)}>{o.status}{o.driver_sub_status ? ` · ${o.driver_sub_status}` : ''}</Pill>
              </div>
              <p className="page-sub" style={{ margin: '6px 0' }}>
                {o.vendors.map((v) => v.vendor_name).join('، ')} → {o.customer?.name}<br />
                {o.address_text} · <Money v={o.total} />
              </p>
              {o.vendors.filter((v) => v.order_mode === 'manual').map((v) => (
                <p key={v.vendor_id} className="err" style={{ margin: '0 0 6px' }}>
                  📞 اتصل بـ {v.vendor_name}{v.vendor_phone ? ` — ${v.vendor_phone}` : ''} لتأكيد الطلب
                </p>
              ))}
              {o.driver
                ? <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span>الدليفري: <strong>{o.driver.name}</strong> ({o.driver.phone})</span>
                    <div className="row">
                      <ReassignBtn id={o.id} drivers={available} onPick={(d) => act(o.id, 'reassign', { driver_id: d })} busy={busy} />
                      <button className="btn sm" disabled={busy === o.id + 'unassign'} onClick={() => act(o.id, 'unassign')}>سحب</button>
                    </div>
                  </div>
                : <div className="row">
                    <button className="btn sm primary" disabled={busy === o.id + 'auto-assign'} onClick={() => act(o.id, 'auto-assign')}>تعيين للي عليه الدور</button>
                    <ReassignBtn id={o.id} label="تعيين يدوي" drivers={available} onPick={(d) => act(o.id, 'assign', { driver_id: d })} busy={busy} />
                  </div>}
            </div>
          ))}
        </div>}
    </>
  );
}

function ReassignBtn({ label = 'إعادة تعيين', drivers, onPick }) {
  return (
    <select className="btn sm" defaultValue="" onChange={(e) => { if (e.target.value) { onPick(e.target.value); e.target.value = ''; } }}>
      <option value="">{label}…</option>
      {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
    </select>
  );
}
