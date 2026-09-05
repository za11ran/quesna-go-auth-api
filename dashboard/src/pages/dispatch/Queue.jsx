import { useCallback, useState } from 'react';
import { api, apiBase } from '../../api';
import { useAsync, ErrBox, Empty, Pill, Money, statusTone, label as trLabel, OrderInvoice, shortOrderId } from '../../ui';
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

  async function act(id, kind, body, isQuick) {
    setBusy(id + kind); setMsg(null);
    try {
      const base = isQuick ? '/api/dispatch/quick-orders' : '/api/dispatch/orders';
      await api.post(`${base}/${id}/${kind}`, body);
      reload(); drivers.reload();
    }
    catch (e) { setMsg(e.message); } finally { setBusy(null); }
  }

  function acceptQuick(o) {
    const input = prompt(`سعر الطلب ده بعد المراجعة (جنيه)؟\n\n${o.notes}`, o.total || '');
    if (input === null) return;
    const price = Number(input);
    if (!price || price <= 0) return;
    act(o.id, 'accept', { price }, true);
  }

  function rejectQuick(o) {
    const reason = prompt('سبب الرفض (اختياري) — هيوصل للعميل:', '');
    if (reason === null) return;
    act(o.id, 'cancel', { reason }, true);
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
                <strong>{shortOrderId(o)}</strong>
                <Pill tone={statusTone(o.status)}>{trLabel(o.status)}{o.driver_sub_status ? ` · ${trLabel(o.driver_sub_status)}` : ''}</Pill>
              </div>
              <p className="page-sub" style={{ margin: '6px 0' }}>
                {o.vendors.map((v) => v.vendor_name).join('، ')} → {o.customer?.name}<br />
                {o.address_text} · <Money v={o.total} />
              </p>
              {!o.is_quick && o.notes && (
                <p className="err" style={{ margin: '0 0 6px' }}>📝 ملحوظة العميل: {o.notes}</p>
              )}
              {o.vendors.filter((v) => v.order_mode === 'manual').map((v) => (
                <p key={v.vendor_id} className="err" style={{ margin: '0 0 6px' }}>
                  📞 اتصل بـ {v.vendor_name}{v.vendor_phone ? ` — ${v.vendor_phone}` : ''} لتأكيد الطلب
                </p>
              ))}
              {o.is_quick && (
                <p className="page-sub" style={{ margin: '0 0 6px' }}>
                  📞 اتصل بالعميل ({o.customer?.phone || '—'}) لتأكيد التفاصيل والسعر
                </p>
              )}
              {o.is_quick && o.images?.length > 0 && (
                <div className="row" style={{ gap: 6, margin: '0 0 6px' }}>
                  {o.images.map((img, i) => (
                    <a key={i} href={apiBase + img} target="_blank" rel="noreferrer">
                      <img src={apiBase + img} alt="" width={48} height={48}
                        style={{ borderRadius: 8, objectFit: 'cover', border: '1px solid var(--line)' }} />
                    </a>
                  ))}
                </div>
              )}
              {o.is_quick && o.vehicle_type && (
                <p className="page-sub" style={{ margin: '0 0 6px' }}>
                  🛺 حجز دريفري — المركبة: <strong>{trLabel(o.vehicle_type)}</strong>
                </p>
              )}

              <div style={{ margin: '0 0 8px' }}>
                <OrderInvoice order={o} />
              </div>

              {o.is_quick && o.status === 'pending' && (
                <div className="row">
                  <button className="btn sm primary" disabled={busy === o.id + 'accept'} onClick={() => acceptQuick(o)}>
                    مراجعة وتسعير
                  </button>
                  <button className="btn sm danger" disabled={busy === o.id + 'cancel'} onClick={() => rejectQuick(o)}>
                    رفض
                  </button>
                </div>
              )}
              {o.is_quick && o.status === 'price_review' && (
                <p className="page-sub" style={{ margin: 0 }}>
                  بانتظار موافقة العميل على السعر ({o.total} ج.م)…
                </p>
              )}
              {o.is_quick && !['pending', 'price_review'].includes(o.status) && (
                o.driver
                  ? <div className="row" style={{ justifyContent: 'space-between' }}>
                      <span>الدليفري: <strong>{o.driver.name}</strong> ({o.driver.phone})</span>
                      <div className="row">
                        <ReassignBtn id={o.id} drivers={available} onPick={(d) => act(o.id, 'assign', { driver_id: d }, true)} busy={busy} />
                        <button className="btn sm" disabled={busy === o.id + 'unassign'} onClick={() => act(o.id, 'unassign', null, true)}>سحب</button>
                      </div>
                    </div>
                  : <ReassignBtn id={o.id} label="تعيين دليفري" drivers={available} onPick={(d) => act(o.id, 'assign', { driver_id: d }, true)} busy={busy} />
              )}

              {!o.is_quick && (o.driver
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
                  </div>)}
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
