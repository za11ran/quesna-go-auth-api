import { api } from '../../api';
import { useAsync, ErrBox, Empty, Pill, Money, statusTone, Table, label } from '../../ui';

export default function Analytics() {
  const { data, loading, error } = useAsync(() => api.get('/api/admin/analytics'));
  const drivers = data?.drivers || [];
  const vendors = data?.vendors || [];
  const dispatchers = data?.dispatchers || [];

  return (
    <>
      <h1 className="page-title">الإحصائيات</h1>
      <p className="page-sub">أداء الدليفري والتجّار والمشرفين</p>
      <ErrBox error={error} />

      <h2 className="section-title">الدليفري (الأكثر نشاطًا أولًا)</h2>
      <Table head={['#', 'الاسم', 'الموبايل', 'الحالة', 'المنطقة', 'توصيلات مكتملة', 'التقييم']}>
        {loading ? (
          <tr><td colSpan={7} className="empty">تحميل…</td></tr>
        ) : drivers.length === 0 ? (
          <tr><td colSpan={7}><Empty /></td></tr>
        ) : (
          drivers.map((d, i) => (
            <tr key={d.id}>
              <td>{i + 1}</td>
              <td>{d.name}</td>
              <td>{d.phone || '—'}</td>
              <td>
                <div className="row">
                  <Pill tone={statusTone(d.status)}>{label(d.status)}</Pill>
                  {d.is_online && <Pill tone="ok">أونلاين</Pill>}
                </div>
              </td>
              <td>{d.zone || '—'}</td>
              <td><strong>{d.deliveries_count}</strong></td>
              <td>{Number(d.rating || 0).toFixed(1)}</td>
            </tr>
          ))
        )}
      </Table>

      <h2 className="section-title">التجّار (حسب عدد الطلبات)</h2>
      <Table head={['المتجر', 'النوع', 'إجمالي الطلبات', 'طلبات مكتملة', 'إيراد الطلبات المكتملة']}>
        {loading ? (
          <tr><td colSpan={5} className="empty">تحميل…</td></tr>
        ) : vendors.length === 0 ? (
          <tr><td colSpan={5}><Empty /></td></tr>
        ) : (
          vendors.map((v) => (
            <tr key={v.id}>
              <td>{v.name_ar}</td>
              <td>{label(v.type)}</td>
              <td>{v.orders_count}</td>
              <td>{v.orders_delivered}</td>
              <td><Money v={v.revenue_delivered} /></td>
            </tr>
          ))
        )}
      </Table>

      <h2 className="section-title">المشرفين (حسب عدد الطلبات اللي وزّعوها)</h2>
      <Table head={['الاسم', 'الموبايل', 'طلبات وزّعها', 'وصلت للعميل']}>
        {loading ? (
          <tr><td colSpan={4} className="empty">تحميل…</td></tr>
        ) : dispatchers.length === 0 ? (
          <tr><td colSpan={4}><Empty /></td></tr>
        ) : (
          dispatchers.map((s) => (
            <tr key={s.id}>
              <td>{s.name}</td>
              <td>{s.phone || '—'}</td>
              <td>{s.orders_assigned}</td>
              <td>{s.orders_delivered}</td>
            </tr>
          ))
        )}
      </Table>
    </>
  );
}
