import { api } from '../../api';
import { useAsync, ErrBox, Money } from '../../ui';

export default function Overview() {
  const { data, loading, error } = useAsync(() => api.get('/api/admin/reports'));
  const cards = [
    ['طلبات اليوم', data?.orders_today],
    ['إجمالي الطلبات', data?.orders_total],
    ['إيراد الطلبات المسلّمة', data ? <Money v={data.revenue_delivered} /> : null],
    ['دليفري أونلاين', data?.drivers_online],
    ['طلبات تغيير معلّقة', data?.pending_change_requests],
    ['التجّار', data?.vendors],
    ['العملاء', data?.customers],
  ];
  return (
    <>
      <h1 className="page-title">نظرة عامة</h1>
      <p className="page-sub">ملخّص المنصة</p>
      <ErrBox error={error} />
      <div className="grid k4">
        {cards.map(([l, n]) => (
          <div key={l} className="card stat">
            <div className="n">{loading ? '…' : (n ?? 0)}</div>
            <div className="l">{l}</div>
          </div>
        ))}
      </div>
    </>
  );
}
