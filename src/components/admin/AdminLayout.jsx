import React from 'react';
import { Outlet } from 'react-router-dom';

/**
 * Minimal layout for /admin. No main site Navbar or Footer.
 * Admin is not linked from the website; access only via direct URL.
 */
const AdminLayout = () => {
  return <Outlet />;
};

export default AdminLayout;
