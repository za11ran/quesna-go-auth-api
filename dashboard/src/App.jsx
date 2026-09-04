import { useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { getRole, getToken } from './api';
import Login from './Login';
import Layout from './Layout';

import Overview from './pages/admin/Overview';
import ChangeRequests from './pages/admin/ChangeRequests';
import Vendors from './pages/admin/Vendors';
import Categories from './pages/admin/Categories';
import Banners from './pages/admin/Banners';
import MostRequested from './pages/admin/MostRequested';
import Staff from './pages/admin/Staff';
import AdminOrders from './pages/admin/Orders';

import VendorProducts from './pages/vendor/Products';
import VendorOrders from './pages/vendor/Orders';
import VendorOffers from './pages/vendor/Offers';
import VendorProfile from './pages/vendor/Profile';
import VendorChangeRequests from './pages/vendor/VendorChangeRequests';

import DispatchQueue from './pages/dispatch/Queue';
import DispatchDrivers from './pages/dispatch/Drivers';
import Driver from './pages/driver/Driver';

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

        <Route path="/admin" element={<Overview />} />
        <Route path="/admin/change-requests" element={<ChangeRequests />} />
        <Route path="/admin/vendors" element={<Vendors />} />
        <Route path="/admin/categories" element={<Categories />} />
        <Route path="/admin/banners" element={<Banners />} />
        <Route path="/admin/most-requested" element={<MostRequested />} />
        <Route path="/admin/drivers" element={<Staff kind="drivers" />} />
        <Route path="/admin/dispatchers" element={<Staff kind="dispatchers" />} />
        <Route path="/admin/orders" element={<AdminOrders />} />

        <Route path="/dispatch" element={<DispatchQueue />} />
        <Route path="/dispatch/drivers" element={<DispatchDrivers />} />

        <Route path="/vendor" element={<VendorOrders />} />
        <Route path="/vendor/products" element={<VendorProducts />} />
        <Route path="/vendor/offers" element={<VendorOffers />} />
        <Route path="/vendor/profile" element={<VendorProfile />} />
        <Route path="/vendor/change-requests" element={<VendorChangeRequests />} />

        <Route path="/driver" element={<Driver />} />

        <Route path="*" element={<Navigate to={HOME[role] || '/admin'} replace />} />
      </Routes>
    </Layout>
  );
}
