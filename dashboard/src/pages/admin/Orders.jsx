import { useState } from 'react';
import { api } from '../../api';
import { useAsync, ErrBox, Empty, Pill, Money, statusTone, Modal, label } from '../../ui';

const STATUSES = ['', 'pending', 'accepted', 'preparing', 'ready_for_pickup', 'assigned', 'picked_up', 'on_the_way', 'delivered', 'rejected', 'cancelled'];

export default function AdminOrders() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState(null);
  const { data, loading, error } = useAsync(
    () => api.get(`/api/admin/orders?page=${page}${status ? `&status=${status}` : ''}`), [status, page]
  );
  const rows = data?.data || [];
  const meta = data?.meta;

  return (
    <>
      <h1 className="page-title">الطلبات</h1>
      <p className="page-sub">كل طلبات المنصة</p>
      <div className="row" style={{ marginBottom: 12 }}>
        <select className="btn sm" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          {STATUSES.map((s) => <option key={s} value={s}>{s ? label(s) : 'كل الحالات'}</option>)}
        </select>
        {meta && <span className="page-sub">إجمالي: {meta.total}</span>}
      </div>
      <ErrBox error={error} />
      <div className="card" style={{ overflow: 'auto' }}>
        <table>
          <thead><tr><th>#</th><th>الحالة</th><th>الإجمالي</th><th>الدفع</th><th>الدليفري</th><th>التاريخ</th><th></th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={7} className="empty">تحميل…</td></tr>
              : rows.length === 0 ? <tr><td colSpan={7}><Empty /></td></tr>
              : rows.map((o) => (
                <tr key={o.id}>
                  <td>{o.id}</td>
                  <td><Pill tone={statusTone(o.status)}>{label(o.status)}</Pill></td>
                  <td><Money v={o.total} /></td>
                  <td>{label(o.payment_method)} / {label(o.payment_status)}</td>
                  <td>{o.driver_id || '—'}</td>
                  <td>{new Date(o.placed_at).toLocaleString('ar-EG')}</td>
                  <td><button className="btn sm" onClick={() => setOpenId(o.id)}>سجل الحالة</button></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {meta && meta.last_page > 1 && (
        <div className="row" style={{ marginTop: 12, justifyContent: 'center' }}>
          <button className="btn sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>السابق</button>
          <span>{page} / {meta.last_page}</span>
          <button className="btn sm" disabled={page >= meta.last_page} onClick={() => setPage(page + 1)}>التالي</button>
        </div>
      )}
      {openId && <OrderHistory orderId={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}

function OrderHistory({ orderId, onClose }) {
  const { data, loading, error } = useAsync(() => api.get(`/api/admin/orders/${orderId}`), [orderId]);
  const history = data?.status_history || [];
  return (
    <Modal title={`سجل حالة الطلب ${orderId}`} onClose={onClose}>
      <ErrBox error={error} />
      {data && (
        <p className="page-sub" style={{ marginBottom: 12 }}>
          الحالة الحالية: <Pill tone={statusTone(data.status)}>{label(data.status)}</Pill>
          {' · '}الدليفري: {data.driver?.name || '—'}
        </p>
      )}
      <table>
        <thead><tr><th>الحالة</th><th>بواسطة</th><th>الوقت</th></tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={3} className="empty">تحميل…</td></tr>
            : history.length === 0 ? <tr><td colSpan={3}><Empty /></td></tr>
            : history.map((h, i) => (
              <tr key={i}>
                <td><Pill tone={statusTone(h.status)}>{label(h.status)}</Pill></td>
                <td>{label(h.by)}</td>
                <td>{new Date(h.at).toLocaleString('ar-EG')}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </Modal>
  );
}
