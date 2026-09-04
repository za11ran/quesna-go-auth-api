import { useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { getRole, getToken } from './api';
import Login from './Login';
import Layout from './Layout';
import Soon from './pages/Soon';
import Overview from './pages/admin/Overview';
import ChangeRequests from './pages/admin/ChangeRequests';
import Vendors from './pages/admin/Vendors';

const HOME = {
  admin: '/admin', dispatcher: '/dispatch',
  vendor_owner: '/vendor', vendor_staff: '/vendor', driver: '/driver',
};

export default function App() {
  const [role, setRole] = useState(getRole());
  const nav = useNavigate();
  const authed = !!getToken() && !!role;

  if (!authed) {
    return <Login onLogin={(r) => { setRole(r); nav(HOME[r] || '/admin', { replace: true }); }} />;
  }

  return (
    <Layout role={role}>
      <Routes>
        <Route path="/" element={<Navigate to={HOME[role] || '/admin'} replace />} />

        {/* admin */}
        <Route path="/admin" element={<Overview />} />
        <Route path="/admin/change-requests" element={<ChangeRequests />} />
        <Route path="/admin/vendors" element={<Vendors />} />
        <Route path="/admin/categories" element={<Soon title="الأقسام" />} />
        <Route path="/admin/banners" element={<Soon title="البانرات" />} />
        <Route path="/admin/drivers" element={<Soon title="الدليفري" />} />
        <Route path="/admin/dispatchers" element={<Soon title="المشرفين" />} />
        <Route path="/admin/orders" element={<Soon title="الطلبات" />} />

        {/* dispatcher */}
        <Route path="/dispatch" element={<Soon title="طابور التوزيع" />} />
        <Route path="/dispatch/drivers" element={<Soon title="الدليفري" />} />

        {/* vendor */}
        <Route path="/vendor" element={<Soon title="طلبات المتجر" />} />
        <Route path="/vendor/products" element={<Soon title="المنتجات" />} />
        <Route path="/vendor/offers" element={<Soon title="العروض" />} />
        <Route path="/vendor/profile" element={<Soon title="بيانات المتجر" />} />
        <Route path="/vendor/change-requests" element={<Soon title="طلبات التغيير" />} />

        {/* driver */}
        <Route path="/driver" element={<Soon title="طلباتي" />} />

        <Route path="*" element={<Navigate to={HOME[role] || '/admin'} replace />} />
      </Routes>
    </Layout>
  );
}
