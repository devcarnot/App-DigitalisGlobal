import ErpLayoutClient from '../../components/erp/ErpLayoutClient';

export const metadata = {
  title: 'ERP Workspace',
  robots: { index: false, follow: false },
};

export default function ErpRootLayout({ children }) {
  return <ErpLayoutClient>{children}</ErpLayoutClient>;
}
