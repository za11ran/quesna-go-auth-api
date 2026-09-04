import { api } from '../../api';
import { useAsync, ErrBox, Empty, Pill, statusTone } from '../../ui';

export default function DispatchDrivers() {
  const list = useAsync(() => api.get('/api/dispatch/drivers'));
  const queue = useAsync(() => api.get('/api/dispatch/queue'));

  return (
    <>
      <h1 className="page-title">الدليفري</h1>
      <p className="page-sub">الحالة والموقع وترتيب الدور</p>
      <ErrBox error={list.error || queue.error} />

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <strong>ترتيب الدور الحالي</strong>
        <div className="row" style={{ marginTop: 8 }}>
          {(queue.data?.data || []).length === 0
            ? <span className="page-sub">مفيش دليفري متاح دلوقتي</span>
            : (queue.data.data).map((d) => <Pill key={d.id} tone="blue">{d.position}. {d.name}</Pill>)}
        </div>
      </div>

      <div className="card" style={{ overflow: 'auto' }}>
        <table>
          <thead><tr><th>الاسم</th><th>الموبايل</th><th>المركبة</th><th>الحالة</th><th>أونلاين؟</th><th>المنطقة</th><th>توصيلات</th><th>آخر تعيين</th></tr></thead>
          <tbody>
            {list.loading ? <tr><td colSpan={8} className="empty">تحميل…</td></tr>
              : (list.data?.data || []).length === 0 ? <tr><td colSpan={8}><Empty /></td></tr>
              : list.data.data.map((d) => (
                <tr key={d.id}>
                  <td>{d.name}</td>
                  <td>{d.phone}</td>
                  <td>{d.vehicle_type}</td>
                  <td><Pill tone={statusTone(d.status)}>{d.status}</Pill></td>
                  <td>{d.is_online ? '✓' : '✕'}</td>
                  <td>{d.zone || '—'}</td>
                  <td>{d.deliveries_count}</td>
                  <td>{d.last_assigned_at ? new Date(d.last_assigned_at).toLocaleString('ar-EG') : '—'}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
