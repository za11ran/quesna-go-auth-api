import { NavLink, useNavigate } from 'react-router-dom';
import { clearSession } from './api';

// كل مجموعة: { section: عنوان القسم أو null, items: [ [مسار, اسم, end?] ] }
const NAV = {
  admin: [
    { section: null, items: [['/admin', 'نظرة عامة', true]] },
    { section: 'العمليات', items: [
      ['/admin/orders', 'الطلبات'],
      ['/admin/analytics', 'الإحصائيات'],
      ['/admin/change-requests', 'طلبات التغيير'],
    ] },
    { section: 'الحسابات', items: [
      ['/admin/vendors', 'التجّار'],
      ['/admin/drivers', 'الدليفري'],
      ['/admin/dispatchers', 'المشرفين'],
    ] },
    { section: 'المحتوى', items: [
      ['/admin/categories', 'الأقسام'],
      ['/admin/banners', 'البانرات'],
      ['/admin/most-requested', 'الأكثر طلبًا'],
    ] },
    { section: 'الإعدادات', items: [
      ['/admin/coupons', 'أكواد الخصم'],
      ['/admin/delivery-pricing', 'أسعار التوصيل'],
      ['/admin/contact', 'بيانات التواصل'],
    ] },
  ],
  dispatcher: [
    { section: null, items: [
      ['/dispatch', 'الطابور', true],
      ['/dispatch/drivers', 'الدليفري'],
    ] },
  ],
  vendor_owner: [
    { section: null, items: [
      ['/vendor', 'الطلبات', true],
      ['/vendor/products', 'المنتجات'],
      ['/vendor/menu-sections', 'الأقسام'],
      ['/vendor/offers', 'العروض'],
      ['/vendor/profile', 'بيانات المتجر'],
      ['/vendor/change-requests', 'طلبات التغيير'],
    ] },
  ],
  vendor_staff: [
    { section: null, items: [
      ['/vendor', 'الطلبات', true],
      ['/vendor/products', 'المنتجات'],
      ['/vendor/menu-sections', 'الأقسام'],
    ] },
  ],
  driver: [{ section: null, items: [['/driver', 'طلباتي', true]] }],
};

export default function Layout({ role, children }) {
  const nav = useNavigate();
  const groups = NAV[role] || [];
  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">Quesna Go</div>
        {groups.map((g, gi) => (
          <div key={gi} className="nav-group">
            {g.section && <div className="nav-section-title">{g.section}</div>}
            {g.items.map(([to, label, end]) => (
              <NavLink key={to} to={to} end={end} className={({ isActive }) => `navlink ${isActive ? 'active' : ''}`}>
                {label}
              </NavLink>
            ))}
          </div>
        ))}
        <div className="spacer" />
        <div className="navlink" style={{ color: 'var(--muted)' }}>{{
          admin: 'أدمن', dispatcher: 'مشرف', vendor_owner: 'صاحب متجر',
          vendor_staff: 'موظف متجر', driver: 'دليفري',
        }[role] || role}</div>
        <button className="btn" onClick={() => { clearSession(); nav('/'); location.reload(); }}>خروج</button>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
