import { useCallback, useEffect, useState } from 'react';

export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const run = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    Promise.resolve()
      .then(fn)
      .then((data) => setState({ loading: false, data, error: null }))
      .catch((error) => setState({ loading: false, data: null, error }));
  }, deps); // eslint-disable-line
  useEffect(() => { run(); }, [run]);
  return { ...state, reload: run };
}

export const Money = ({ v }) => <span>{Number(v || 0).toLocaleString('ar-EG')} ج.م</span>;

// نفس تنسيق رقم الطلب المعروض للعميل في التطبيق (Go<الرقم>) — بدل الـ id
// الخام (ord_11/qo_11) اللي مفيش داعي المشرف/الدليفري يشوفوه بالشكل ده.
export const shortOrderId = (id) => `Go${String(id ?? '').replace(/^(ord_|qo_)/, '')}`;

export function Empty({ children = 'لا توجد بيانات' }) {
  return <div className="empty">{children}</div>;
}

export function ErrBox({ error }) {
  if (!error) return null;
  return <div className="err">{error.message || String(error)}</div>;
}

export function Pill({ tone = '', children }) {
  return <span className={`pill ${tone}`}>{children}</span>;
}

const STATUS_TONE = {
  pending: 'warn', approved: 'ok', rejected: 'danger', cancelled: '',
  active: 'ok', suspended: 'danger', delivered: 'ok', on_the_way: 'blue',
  ready_for_pickup: 'blue', assigned: 'blue', preparing: 'warn', accepted: 'ok',
  available: 'ok', busy: 'warn', offline: '', price_review: 'warn',
};
export const statusTone = (s) => STATUS_TONE[s] || '';

// ترجمة القيم الخام (status/type/by_role...) اللي جايّة من الـ API بالإنجليزي
// لعرض عربي في كل صفحات اللوحة — واحدة مركزية بدل ما تتكرر في كل صفحة.
const LABELS = {
  // حالة الطلب
  pending: 'قيد المراجعة', accepted: 'مقبول', preparing: 'قيد التحضير',
  price_review: 'محتاج موافقة العميل على السعر',
  ready_for_pickup: 'جاهز للاستلام', assigned: 'معيّن', picked_up: 'تم الاستلام',
  on_the_way: 'في الطريق', arrived: 'وصل العميل', delivered: 'تم التسليم',
  rejected: 'مرفوض', cancelled: 'ملغي',
  // حالة التاجر
  approved: 'موافَق عليه', suspended: 'معلّق',
  // حالة الدليفري
  available: 'متاح', busy: 'مشغول', offline: 'غير متصل',
  // الدفع
  cash: 'كاش', card: 'بطاقة', wallet: 'محفظة', paid: 'مدفوع', failed: 'فشل',
  // المركبة
  motorcycle: 'موتوسيكل', car: 'عربية', bicycle: 'دراجة', tuk_tuk: 'توك توك',
  // مين عمل التغيير (سجل الحالة)
  customer: 'العميل', system: 'النظام', vendor: 'التاجر', dispatcher: 'المشرف',
  driver: 'الدليفري', admin: 'الأدمن',
  'dispatcher(reassign)': 'المشرف (إعادة تعيين)', 'dispatcher(unassign)': 'المشرف (إلغاء تعيين)',
  'driver(reject)': 'الدليفري (رفض)', 'system(offer_timeout)': 'النظام (انتهت المهلة)',
  // sub_status التوصيل
  heading_to_vendor: 'في الطريق للمتجر', at_vendor: 'وصل المتجر',
  // نوع المتجر
  restaurant: 'مطعم', supermarket: 'سوبر ماركت', pharmacy: 'صيدلية', bakery: 'مخبز',
  cafe: 'كافيه', vegetables: 'خضار وفاكهة', clothing: 'ملابس', stationery: 'مكتبة', other: 'أخرى',
  // نوع قسم الهوم
  vendors: 'تجّار', products: 'منتجات',
};
export const label = (s) => LABELS[s] ?? s;

// نفس القايمة كأزواج [قيمة, تسمية] لبناء dropdowns (إنشاء/تعديل متجر).
export const VENDOR_TYPES = [
  'restaurant', 'supermarket', 'pharmacy', 'bakery', 'cafe', 'vegetables', 'clothing', 'stationery', 'other',
].map((t) => [t, LABELS[t]]);

export function Modal({ title, onClose, children, footer }) {
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="card modal">
        <div className="card-pad row" style={{ justifyContent: 'space-between', borderBottom: '1px solid var(--line)' }}>
          <strong>{title}</strong>
          <button className="btn sm" onClick={onClose}>إغلاق</button>
        </div>
        <div className="card-pad">{children}</div>
        {footer && <div className="card-pad row" style={{ justifyContent: 'flex-end', borderTop: '1px solid var(--line)' }}>{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <div className="field">
      {label && <label>{label}</label>}
      {children}
    </div>
  );
}

// فاتورة الطلب — قايمة الأصناف + الإجمالي، مطوية افتراضيًا عشان كارت
// الطلب في طابور التوزيع/صفحة الدليفري يفضل مختصر لحد ما حد يحتاج التفاصيل.
export function OrderInvoice({ order }) {
  const [open, setOpen] = useState(false);
  const items = order.items || [];
  if (!items.length) return null;

  return (
    <div>
      <span className="invoice-toggle" onClick={() => setOpen((o) => !o)}>
        {open ? '▲ إخفاء الفاتورة' : `▼ عرض الفاتورة (${items.length} صنف)`}
      </span>
      {open && (
        <div className="invoice">
          {items.map((it, i) => (
            <div className="invoice-row" key={i}>
              <div>
                <div className="name">
                  {it.name}
                  {it.option_name && <span className="option"> · {it.option_name}</span>}
                </div>
                {it.note && <div className="invoice-note">📝 {it.note}</div>}
                <div className="qty">× {it.quantity} — <Money v={it.unit_price} /></div>
              </div>
              <div><Money v={it.line_total} /></div>
            </div>
          ))}
          <div className="invoice-totals">
            <div className="t-row"><span>المجموع الفرعي</span><Money v={order.subtotal} /></div>
            {Number(order.delivery_total) > 0 && (
              <div className="t-row"><span>مصاريف التوصيل</span><Money v={order.delivery_total} /></div>
            )}
            {Number(order.discount_total) > 0 && (
              <div className="t-row">
                <span>الخصم{order.coupon_code ? ` (${order.coupon_code})` : ''}</span>
                <span>-<Money v={order.discount_total} /></span>
              </div>
            )}
            <div className="t-row grand"><span>الإجمالي</span><Money v={order.total} /></div>
          </div>
        </div>
      )}
    </div>
  );
}

export function Table({ head, children }) {
  return (
    <div className="card" style={{ overflow: 'auto' }}>
      <table>
        <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
