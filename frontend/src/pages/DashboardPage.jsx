import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { getOutstandingReport, getMRRReport, getRevenueReport, getInvoices, getCustomers } from '../utils/api'
import { fmt } from '../utils/helpers'
import { TrendingUp, AlertCircle, RefreshCw, Users, Receipt, ArrowRight } from 'lucide-react'

export default function DashboardPage() {
  const [outstanding, setOutstanding] = useState(null)
  const [mrr, setMrr] = useState(null)
  const [revenue, setRevenue] = useState([])
  const [recentInvoices, setRecentInvoices] = useState([])
  const [customerCount, setCustomerCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      getOutstandingReport().catch(() => null),
      getMRRReport().catch(() => null),
      getRevenueReport({ year: new Date().getFullYear() }).catch(() => null),
      getInvoices({ page_size: 5, ordering: '-created_at' }).catch(() => null),
      getCustomers({ page_size: 1 }).catch(() => null),
    ]).then(([out, mrr, rev, inv, cust]) => {
      setOutstanding(out?.data)
      setMrr(mrr?.data)
      if (rev?.data?.data) {
        setRevenue(rev.data.data.map(r => ({
          month: r.month?.slice(5, 7) ? monthName(r.month.slice(5, 7)) : r.month,
          revenue: parseFloat(r.total_revenue) || 0,
        })))
      }
      setRecentInvoices(inv?.data?.results || [])
      setCustomerCount(cust?.data?.count || 0)
      setLoading(false)
    })
  }, [])

  const monthName = (m) => ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(m)-1]

  if (loading) return <div className="loading"><div className="spinner" /><span>Loading dashboard…</span></div>

  return (
    <>
      <div className="page-header">
        <div>
          <h2 className="page-title">Dashboard</h2>
          <p className="page-subtitle">Welcome back — here's what's happening</p>
        </div>
        <Link to="/invoices/new" className="btn btn-primary">
          <Receipt size={15} /> New Invoice
        </Link>
      </div>

      <div className="page-body">
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon" style={{ background: 'var(--danger-light)' }}>
              <AlertCircle size={18} color="var(--danger)" />
            </div>
            <div className="stat-label">Outstanding</div>
            <div className="stat-value">{fmt.currency(outstanding?.total_outstanding)}</div>
            <div className="stat-meta">{fmt.currency(outstanding?.total_overdue)} overdue</div>
          </div>

          <div className="stat-card">
            <div className="stat-icon" style={{ background: 'var(--success-light)' }}>
              <TrendingUp size={18} color="var(--success)" />
            </div>
            <div className="stat-label">MRR</div>
            <div className="stat-value">{fmt.currency(mrr?.mrr)}</div>
            <div className="stat-meta">{fmt.currency(mrr?.arr)} ARR · {mrr?.active_subscriptions} subscriptions</div>
          </div>

          <div className="stat-card">
            <div className="stat-icon" style={{ background: 'var(--accent-light)' }}>
              <Users size={18} color="var(--accent)" />
            </div>
            <div className="stat-label">Total Customers</div>
            <div className="stat-value">{customerCount}</div>
            <div className="stat-meta">All time</div>
          </div>

          <div className="stat-card">
            <div className="stat-icon" style={{ background: 'var(--purple-light)' }}>
              <RefreshCw size={18} color="var(--purple)" />
            </div>
            <div className="stat-label">Active Subs</div>
            <div className="stat-value">{mrr?.active_subscriptions ?? '—'}</div>
            <div className="stat-meta">Recurring customers</div>
          </div>
        </div>

        <div className="dashboard-grid">
          <div className="card">
            <div className="card-header">
              <span className="card-title">Revenue This Year</span>
            </div>
            <div className="card-body" style={{ padding: '16px 8px 16px 0' }}>
              {revenue.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={revenue} margin={{ left: 16, right: 16 }}>
                    <defs>
                      <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => '$' + (v >= 1000 ? (v/1000).toFixed(0)+'k' : v)} />
                    <Tooltip formatter={v => fmt.currency(v)} />
                    <Area type="monotone" dataKey="revenue" stroke="#2563eb" fill="url(#rev)" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="empty-state" style={{ padding: '40px' }}>
                  <TrendingUp />
                  <h3>No revenue data yet</h3>
                  <p>Start creating and sending invoices</p>
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">Recent Invoices</span>
              <Link to="/invoices" style={{ fontSize: '0.8rem', color: 'var(--accent)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3 }}>
                View all <ArrowRight size={13} />
              </Link>
            </div>
            <div style={{ overflow: 'hidden' }}>
              {recentInvoices.length === 0 ? (
                <div className="empty-state" style={{ padding: 32 }}>
                  <Receipt />
                  <h3>No invoices yet</h3>
                </div>
              ) : (
                recentInvoices.map(inv => (
                  <Link key={inv.id} to={`/invoices/${inv.id}`} style={{ textDecoration: 'none' }}>
                    <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--ink)', marginBottom: 2 }}>{inv.customer_name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{inv.number}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>{fmt.currency(inv.total, inv.currency)}</div>
                        <span className={`badge badge-${inv.status}`}>{inv.status}</span>
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
