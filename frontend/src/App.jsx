import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import DashboardPage from './pages/DashboardPage'
import CustomersPage from './pages/CustomersPage'
import ItemsPage from './pages/ItemsPage'
import InvoicesPage from './pages/InvoicesPage'
import InvoiceFormPage from './pages/InvoiceFormPage'
import QuotesPage from './pages/QuotesPage'
import QuoteFormPage from './pages/QuoteFormPage'
import PaymentsPage from './pages/PaymentsPage'
import SubscriptionsPage from './pages/SubscriptionsPage'
import ReportsPage from './pages/ReportsPage'
import OrganizationsPage from './pages/OrganizationsPage'

function PrivateRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="loading"><div className="spinner" /><span>Loading…</span></div>
  if (!user) return <Navigate to="/login" replace />
  return <Layout>{children}</Layout>
}

function AppRoutes() {
  const { user } = useAuth()
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" /> : <LoginPage />} />
      <Route path="/register" element={user ? <Navigate to="/" /> : <RegisterPage />} />
      <Route path="/" element={<PrivateRoute><DashboardPage /></PrivateRoute>} />
      <Route path="/customers" element={<PrivateRoute><CustomersPage /></PrivateRoute>} />
      <Route path="/items" element={<PrivateRoute><ItemsPage /></PrivateRoute>} />
      <Route path="/invoices" element={<PrivateRoute><InvoicesPage /></PrivateRoute>} />
      <Route path="/invoices/new" element={<PrivateRoute><InvoiceFormPage /></PrivateRoute>} />
      <Route path="/invoices/:id" element={<PrivateRoute><InvoiceFormPage /></PrivateRoute>} />
      <Route path="/quotes" element={<PrivateRoute><QuotesPage /></PrivateRoute>} />
      <Route path="/quotes/new" element={<PrivateRoute><QuoteFormPage /></PrivateRoute>} />
      <Route path="/quotes/:id" element={<PrivateRoute><QuoteFormPage /></PrivateRoute>} />
      <Route path="/payments" element={<PrivateRoute><PaymentsPage /></PrivateRoute>} />
      <Route path="/subscriptions" element={<PrivateRoute><SubscriptionsPage /></PrivateRoute>} />
      <Route path="/reports" element={<PrivateRoute><ReportsPage /></PrivateRoute>} />
      <Route path="/organizations" element={<PrivateRoute><OrganizationsPage /></PrivateRoute>} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        <Toaster position="top-right" toastOptions={{
          style: { fontFamily: 'DM Sans, sans-serif', fontSize: '0.875rem', borderRadius: '8px' },
          success: { iconTheme: { primary: '#059669', secondary: 'white' } },
        }} />
      </AuthProvider>
    </BrowserRouter>
  )
}