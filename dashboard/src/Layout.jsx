import { NavLink, useNavigate } from 'react-router-dom';
import { clearSession } from './api';

const NAV = {
  admin: [
    ['/admin', 'نظرة عامة', true],
    ['/admin/analytics', 'الإحصائيات'],
    ['/admin/change-requests', 'طلبات التغيير'],
    ['/admin/vendors', 'التجّار'],
    ['/admin/categories', 'الأقسام'],
    ['/admin/banners', 'البانرات'],
    ['/admin/coupons', 'أكواد الخصم'],
    ['/admin/most-requested', 'الأكثر طلبًا'],
    ['/admin/delivery-pricing', 'أسعار التوصيل'],
    ['/admin/drivers', 'الدليفري'],
    ['/admin/dispatchers', 'المشرفين'],
    ['/admin/orders', 'الطلبات'],
  ],
  dispatcher: [
    ['/dispatch', 'الطابور', true],
    ['/dispatch/drivers', 'الدليفري'],
  ],
  vendor_owner: [
    ['/vendor', 'الطلبات', true],
    ['/vendor/products', 'المنتجات'],
    ['/vendor/menu-sections', 'الأقسام'],
    ['/vendor/offers', 'العروض'],
    ['/vendor/profile', 'بيانات المتجر'],
    ['/vendor/change-requests', 'طلبات التغيير'],
  ],
  vendor_staff: [
    ['/vendor', 'الطلبات', true],
    ['/vendor/products', 'المنتجات'],
    ['/vendor/menu-sections', 'الأقسام'],
  ],
  driver: [['/driver', 'طلباتي', true]],
};

export default function Layout({ role, children }) {
  const nav = useNavigate();
  const items = NAV[role] || [];
  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">Quesna Go</div>
        {items.map(([to, label, end]) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `navlink ${isActive ? 'active' : ''}`}>
            {label}
          </NavLink>
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
