import { useCallback, useState } from 'react';
import { api } from '../../api';
import { useAsync, ErrBox, Empty, Pill, Money, statusTone, label, shortOrderId } from '../../ui';
import { useLive } from '../../socket';

const NEXT = {
  pending: [['accepted', 'قبول', 'ok'], ['rejected', 'رفض', 'danger']],
  accepted: [['preparing', 'بدء التحضير', 'primary'], ['rejected', 'رفض', 'danger']],
  preparing: [['ready_for_pickup', 'جاهز للاستلام', 'primary']],
};

export default function VendorOrders() {
  const [tab, setTab] = useState('active');
  const { data, loading, error, reload } = useAsync(() => api.get('/api/vendor/orders?per_page=50'), [tab]);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  useLive('order:new', useCallback(() => reload(), [reload]));

  const all = data?.data || [];
  const rows = tab === 'active'
    ? all.filter((o) => ['pending', 'accepted', 'preparing', 'ready_for_pickup', 'assigned', 'picked_up', 'on_the_way'].includes(o.status))
    : all.filter((o) => ['delivered', 'rejected', 'cancelled'].includes(o.status));

  async function move(id, status) {
    setBusy(id); setMsg(null);
    try {
      const body = { status };
      if (status === 'rejected') body.reason = prompt('سبب الرفض؟') || '';
      await api.patch(`/api/vendor/orders/${id}/status`, body);
      reload();
    } catch (e) { setMsg(e.message); } finally { setBusy(null); }
  }

  return (
    <>
      <h1 className="page-title">طلبات المتجر</h1>
      <p className="page-sub">تحديث لحظي — الطلب الجديد بيظهر تلقائيًا</p>
      <div className="row" style={{ marginBottom: 12 }}>
        {['active', 'done'].map((t) => (
          <button key={t} className={`btn sm ${tab === t ? 'primary' : ''}`} onClick={() => setTab(t)}>
            {t === 'active' ? 'الحالية' : 'المنتهية'}
          </button>
        ))}
        <button className="btn sm" onClick={reload}>تحديث</button>
      </div>
      <ErrBox error={error} />
      {msg && <div className="err">{msg}</div>}
      {loading ? <div className="empty">تحميل…</div>
        : rows.length === 0 ? <Empty>لا توجد طلبات</Empty>
        : <div className="grid k2">
          {rows.map((o) => (
            <div key={o.id} className="card card-pad">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <strong>{shortOrderId(o.id)}</strong>
                <Pill tone={statusTone(o.status)}>{label(o.status)}</Pill>
              </div>
              <p className="page-sub" style={{ margin: '6px 0' }}>
                {o.customer?.name} · {o.customer?.phone}<br />{o.address_text}
              </p>
              {o.notes && (
                <p className="err" style={{ margin: '0 0 6px' }}>📝 ملحوظة العميل: {o.notes}</p>
              )}
              <ul style={{ margin: '8px 0', paddingInlineStart: 18 }}>
                {o.items.map((it, i) => (
                  <li key={i}>
                    {it.name}{it.option_name ? ` — ${it.option_name}` : ''} × {it.quantity} <Money v={it.line_total} />
                    {it.note && <div className="page-sub" style={{ margin: '2px 0 0' }}>📝 {it.note}</div>}
                  </li>
                ))}
              </ul>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <strong><Money v={o.total} /></strong>
                <div className="row">
                  {(NEXT[o.status] || []).map(([s, label, tone]) => (
                    <button key={s} className={`btn sm ${tone}`} disabled={busy === o.id} onClick={() => move(o.id, s)}>{label}</button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>}
    </>
  );
}
