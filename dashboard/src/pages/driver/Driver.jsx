import { useCallback, useState } from 'react';
import { api } from '../../api';
import { useAsync, ErrBox, Empty, Pill, Money, statusTone, label } from '../../ui';
import { useLive } from '../../socket';

const SUB_NEXT = {
  heading_to_vendor: ['at_vendor', 'وصلت المتجر'],
  at_vendor: ['picked_up', 'استلمت الطلب'],
  picked_up: ['on_the_way', 'في الطريق للعميل'],
  on_the_way: ['arrived', 'وصلت العميل'],
  arrived: ['delivered', 'تم التسليم'],
};

export default function Driver() {
  const me = useAsync(() => api.get('/api/driver/me'));
  const { data, loading, error, reload } = useAsync(() => api.get('/api/driver/orders'));
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  useLive('driver:assignment', useCallback(() => { reload(); me.reload(); }, [reload])); // eslint-disable-line

  const rows = (data?.data || []);
  const active = rows.filter((o) => !['delivered', 'cancelled', 'rejected'].includes(o.status));
  const done = rows.filter((o) => ['delivered', 'cancelled', 'rejected'].includes(o.status));
  const d = me.data;

  async function toggleOnline() {
    setBusy('toggleOnline'); setMsg(null);
    try {
      await api.put('/api/driver/status', { status: d.status === 'offline' ? 'available' : 'offline' });
      me.reload();
    } catch (e) { setMsg(e.message); } finally { setBusy(null); }
  }
  async function act(id, path, body) {
    setBusy(id + path); setMsg(null);
    try {
      if (path === 'status') await api.patch(`/api/driver/orders/${id}/status`, body);
      else await api.post(`/api/driver/orders/${id}/${path}`, body);
      reload(); me.reload();
    } catch (e) { setMsg(e.message); } finally { setBusy(null); }
  }

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">طلباتي</h1>
          <p className="page-sub">{d ? `${d.name} · توصيلات: ${d.deliveries_count}` : '…'}</p>
        </div>
        {d && (
          <button
            className={`btn ${d.status === 'offline' ? 'primary' : ''}`}
            disabled={busy === 'toggleOnline'}
            onClick={toggleOnline}
          >
            {d.status === 'offline' ? 'بدء شغل' : 'إيقاف شغل'}
          </button>
        )}
      </div>
      <ErrBox error={error || me.error} />
      {msg && <div className="err">{msg}</div>}

      {loading ? <div className="empty">تحميل…</div> : (
        <>
          {active.length === 0 ? <Empty>مفيش توصيلات حالية</Empty> : (
            <div className="grid k2">
              {active.map((o) => {
                const sub = o.driver_sub_status || 'heading_to_vendor';
                const next = SUB_NEXT[sub];
                const pickup = o.pickup || [];
                // status الطلب فاضل 'assigned' لحد ما الدليفري يوصّل (يبقى picked_up) —
                // اللي بيتغيّر لحظة القبول هو delivery_offers.response بس، مش الحالة دي.
                const pendingAcceptance = o.status === 'assigned' && o.driver_offer_response !== 'accepted';
                return (
                  <div key={o.id} className="card card-pad">
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <strong>{o.id}</strong>
                      <Pill tone={statusTone(o.status)}>{label(o.status)} · {label(sub)}</Pill>
                    </div>
                    <p className="page-sub" style={{ margin: '6px 0' }}>
                      <b>الاستلام:</b> {pickup.map((p) => `${p.name} (${p.phone || '—'})`).join('، ')}<br />
                      <b>التسليم:</b> {o.customer?.name} ({o.customer?.phone})<br />
                      {o.address_text} · <Money v={o.total} /> ({label(o.payment_method)})
                    </p>
                    <div className="row">
                      {pendingAcceptance && (
                        <>
                          <button className="btn sm ok" disabled={busy} onClick={() => act(o.id, 'accept')}>قبول التعيين</button>
                          <button className="btn sm danger" disabled={busy} onClick={() => act(o.id, 'reject')}>رفض</button>
                        </>
                      )}
                      {!pendingAcceptance && next && (
                        <button className="btn sm primary" disabled={busy} onClick={() => act(o.id, 'status', { status: next[0] })}>{next[1]}</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {done.length > 0 && (
            <>
              <h3 style={{ marginTop: 24 }}>السجل</h3>
              <div className="card" style={{ overflow: 'auto' }}>
                <table>
                  <thead><tr><th>#</th><th>العميل</th><th>الإجمالي</th><th>الحالة</th></tr></thead>
                  <tbody>{done.map((o) => (
                    <tr key={o.id}><td>{o.id}</td><td>{o.customer?.name}</td><td><Money v={o.total} /></td><td><Pill tone={statusTone(o.status)}>{label(o.status)}</Pill></td></tr>
                  ))}</tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
