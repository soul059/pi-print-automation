import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { AdminProvider, useAdmin } from './hooks/useAdmin';
import { I18nProvider } from './i18n/I18nContext';
import Layout from './components/Layout';
import AnnouncementBanner from './components/AnnouncementBanner';
import LoginPage from './pages/LoginPage';
import UploadPage from './pages/UploadPage';
import PaymentPage from './pages/PaymentPage';
import StatusPage from './pages/StatusPage';
import JobsPage from './pages/JobsPage';
import WalletPage from './pages/WalletPage';
import AdminLoginPage from './pages/admin/AdminLoginPage';
import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import AnalyticsPage from './pages/admin/AnalyticsPage';
import AnnouncementsPage from './pages/admin/AnnouncementsPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useAdmin();
  if (!isAdmin) return <Navigate to="/admin/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <AdminProvider>
          <Layout>
          <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
          <AnnouncementBanner />
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <UploadPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/payment/:jobId"
              element={
                <ProtectedRoute>
                  <PaymentPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/status/:jobId"
              element={
                <ProtectedRoute>
                  <StatusPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/jobs"
              element={
                <ProtectedRoute>
                  <JobsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/wallet"
              element={
                <ProtectedRoute>
                  <WalletPage />
                </ProtectedRoute>
              }
            />
            {/* Admin Routes */}
            <Route path="/admin/login" element={<AdminLoginPage />} />
            <Route
              path="/admin"
              element={
                <AdminRoute>
                  <AdminDashboardPage />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/analytics"
              element={
                <AdminRoute>
                  <AnalyticsPage />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/announcements"
              element={
                <AdminRoute>
                  <AnnouncementsPage />
                </AdminRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Layout>
        </AdminProvider>
      </AuthProvider>
    </I18nProvider>
  );
}
