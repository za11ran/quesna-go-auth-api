import { api } from '../../api';
import { useAsync, ErrBox, Empty, Pill } from '../../ui';

const TYPE_AR = { vendor: 'المتجر', product: 'منتج', product_option: 'حجم', offer: 'عرض' };
const ACTION_AR = { create: 'إضافة', update: 'تعديل', delete: 'حذف' };
const ST = { pending: ['warn', 'معلّق'], approved: ['ok', 'موافَق'], rejected: ['danger', 'مرفوض'], cancelled: ['', 'ملغي'] };

export default function VendorChangeRequests() {
  const { data, loading, error, reload } = useAsync(() => api.get('/api/vendor/change-requests'));
  const rows = data?.data || [];
  return (
    <>
      <h1 className="page-title">طلبات التغيير</h1>
      <p className="page-sub">متابعة تعديلاتك المرسلة للإدارة</p>
      <ErrBox error={error} />
      <div className="card" style={{ overflow: 'auto' }}>
        <table>
          <thead><tr><th>#</th><th>النوع</th><th>الإجراء</th><th>الحالة</th><th>ملاحظة</th><th></th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={6} className="empty">تحميل…</td></tr>
              : rows.length === 0 ? <tr><td colSpan={6}><Empty /></td></tr>
              : rows.map((cr) => (
                <tr key={cr.id}>
                  <td>{cr.id}</td>
                  <td>{TYPE_AR[cr.entity_type] || cr.entity_type}</td>
                  <td>{ACTION_AR[cr.action] || cr.action}</td>
                  <td><Pill tone={(ST[cr.status] || [''])[0]}>{(ST[cr.status] || ['', cr.status])[1]}</Pill></td>
                  <td>{cr.review_note || '—'}</td>
                  <td>
                    {cr.status === 'pending' && (
                      <button className="btn sm danger" onClick={async () => {
                        await api.post(`/api/vendor/change-requests/${cr.id}/cancel`); reload();
                      }}>سحب</button>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
