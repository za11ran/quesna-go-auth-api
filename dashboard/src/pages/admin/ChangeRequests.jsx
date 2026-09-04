import { useState } from 'react';
import { api } from '../../api';
import { useAsync, ErrBox, Empty, Pill, Modal, Field } from '../../ui';

const TYPE_AR = { vendor: 'المتجر', product: 'منتج', product_option: 'حجم', offer: 'عرض' };
const ACTION_AR = { create: 'إضافة', update: 'تعديل', delete: 'حذف' };

export default function ChangeRequests() {
  const [status, setStatus] = useState('pending');
  const { data, loading, error, reload } = useAsync(
    () => api.get(`/api/admin/change-requests?status=${status}`), [status]
  );
  const [open, setOpen] = useState(null); // cr id
  const rows = data?.data || [];

  return (
    <>
      <h1 className="page-title">طلبات التغيير</h1>
      <p className="page-sub">مراجعة تعديلات التجّار والموافقة أو الرفض</p>
      <div className="row" style={{ marginBottom: 12 }}>
        {['pending', 'approved', 'rejected', 'cancelled'].map((s) => (
          <button key={s} className={`btn sm ${status === s ? 'primary' : ''}`} onClick={() => setStatus(s)}>
            {{ pending: 'معلّق', approved: 'موافَق', rejected: 'مرفوض', cancelled: 'ملغي' }[s]}
          </button>
        ))}
      </div>
      <ErrBox error={error} />
      <div className="card" style={{ overflow: 'auto' }}>
        <table>
          <thead><tr><th>#</th><th>المتجر</th><th>النوع</th><th>الإجراء</th><th>التاريخ</th><th></th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={6} className="empty">تحميل…</td></tr>
              : rows.length === 0 ? <tr><td colSpan={6}><Empty>لا يوجد</Empty></td></tr>
              : rows.map((cr) => (
                <tr key={cr.id}>
                  <td>{cr.id}</td>
                  <td>{cr.vendor_name || cr.vendor_id}</td>
                  <td>{TYPE_AR[cr.entity_type] || cr.entity_type}</td>
                  <td>{ACTION_AR[cr.action] || cr.action}</td>
                  <td>{new Date(cr.created_at).toLocaleString('ar-EG')}</td>
                  <td><button className="btn sm" onClick={() => setOpen(cr.id)}>مراجعة</button></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {open && <ReviewModal id={open} onClose={() => setOpen(null)} onDone={() => { setOpen(null); reload(); }} />}
    </>
  );
}

function ReviewModal({ id, onClose, onDone }) {
  const { data, loading, error } = useAsync(() => api.get(`/api/admin/change-requests/${id}`), [id]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [actErr, setActErr] = useState(null);

  async function act(kind) {
    setBusy(true); setActErr(null);
    try {
      await api.post(`/api/admin/change-requests/${id}/${kind}`, kind === 'reject' ? { note } : {});
      onDone();
    } catch (e) { setActErr(e); } finally { setBusy(false); }
  }

  const cr = data;
  return (
    <Modal
      title={`طلب تغيير ${id}`}
      onClose={onClose}
      footer={
        cr?.status === 'pending' && (
          <div className="row">
            <button className="btn danger" disabled={busy} onClick={() => act('reject')}>رفض</button>
            <button className="btn ok" disabled={busy} onClick={() => act('approve')}>موافقة</button>
          </div>
        )
      }
    >
      {loading ? 'تحميل…' : (
        <>
          <ErrBox error={error || actErr} />
          <div className="row" style={{ marginBottom: 10 }}>
            <Pill tone="blue">{TYPE_AR[cr.entity_type] || cr.entity_type}</Pill>
            <Pill>{ACTION_AR[cr.action] || cr.action}</Pill>
            <Pill tone={cr.status === 'pending' ? 'warn' : cr.status === 'approved' ? 'ok' : 'danger'}>{cr.status}</Pill>
          </div>
          <table className="diff">
            <thead><tr><th>الحقل</th><th>قبل</th><th>بعد</th></tr></thead>
            <tbody>
              {(cr.diff || []).map((d) => (
                <tr key={d.field}>
                  <td>{d.field}</td>
                  <td className="from">{fmt(d.from)}</td>
                  <td className="to">{fmt(d.to)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {cr.status === 'pending' && (
            <div style={{ marginTop: 12 }}>
              <Field label="سبب الرفض (اختياري)">
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثلاً: الاسم غير مناسب" />
              </Field>
            </div>
          )}
          {cr.review_note && <p className="page-sub">ملاحظة المراجعة: {cr.review_note}</p>}
        </>
      )}
    </Modal>
  );
}

function fmt(v) {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
