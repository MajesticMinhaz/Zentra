import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import {
  getOutstandingReport, getMRRReport, getRevenueReport,
  getInvoices, getCustomers, getPayments, getQuotes,
} from '../utils/api'
import { fmt } from '../utils/helpers'
import {
  TrendingUp, AlertCircle, RefreshCw, Users, Receipt,
  ArrowRight, CreditCard, FileText, Clock, CheckCircle,
} from 'lucide-react'

const MONTH = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const monthName = (m) => MONTH[parseInt(m) - 1] || m

function StatCard({ icon: Icon, iconBg, iconColor, label, value, meta, metaColor }) {
  return (
    <div className="stat-card">
      <div className="stat-icon" style={{ background: iconBg }}>
        <Icon size={18} color={iconColor} />
      </div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value ?? '—'}</div>
      {meta && (
        <div className="stat-meta" style={metaColor ? { color: metaColor } : {}}>
          {meta}
        </div>
      )}
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="stat-card" style={{ opacity: 0.5 }}>
      <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--surface-3)', marginBottom: 12 }} />
      <div style={{ width: 80, height: 10, borderRadius: 4, background: 'var(--surface-3)', marginBottom: 8 }} />
      <div style={{ width: 120, height: 24, borderRadius: 4, background: 'var(--surface-3)', marginBottom: 8 }} />
      <div style={{ width: 100, height: 10, borderRadius: 4, background: 'var(--surface-3)' }} />
    </div>
  )
}

export default function DashboardPage() {
  const [outstanding, setOutstanding]         = useState(null)
  const [mrr, setMrr]                         = useState(null)
  const [revenue, setRevenue]                 = useState([])
  const [recentInvoices, setRecentInvoices]   = useState([])
  const [recentPayments, setRecentPayments]   = useState([])
  const [overdueInvoices, setOverdueInvoices] = useState([])
  const [customerCount, setCustomerCount]     = useState(null)
  const [pendingQuotes, setPendingQuotes]     = useState(null)
  const [thisMonthRevenue, setThisMonthRevenue] = useState(null)
  const [revenueYear, setRevenueYear]         = useState(new Date().getFullYear())
  const [loading, setLoading]                 = useState(true)

  const currentYear = new Date().getFullYear()
  const yearOptions = [currentYear - 1, currentYear]

  const loadRevenue = useCallback(async (year) => {
    try {
      const r = await getRevenueReport({ year })
      if (r?.data?.data) {
        setRevenue(r.data.data.map(row => ({
          month: monthName(row.month?.slice(5, 7)),
          revenue: parseFloat(row.total_revenue) || 0,
        })))
      }
    } catch {}
  }, [])

  useEffect(() => { loadRevenue(revenueYear) }, [revenueYear, loadRevenue])

  useEffect(() => {
    const now = new Date()
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

    Promise.all([
      getOutstandingReport().catch(() => null),
      getMRRReport().catch(() => null),
      getInvoices({ page_size: 5, ordering: '-created_at' }).catch(() => null),
      getInvoices({ status: 'overdue', page_size: 5, ordering: '-balance_due' }).catch(() => null),
      getPayments({ page_size: 5, ordering: '-payment_date' }).catch(() => null),
      getPayments({ page_size: 200, status: 'completed' }).catch(() => null),
      getCustomers({ page_size: 1 }).catch(() => null),
      getQuotes({ status: 'sent', page_size: 1 }).catch(() => null),
    ]).then(([out, mrrData, inv, overdue, payments, allPayments, cust, quotes]) => {
      setOutstanding(out?.data)
      setMrr(mrrData?.data)
      setRecentInvoices(inv?.data?.results || [])
      setOverdueInvoices(overdue?.data?.results || [])
      setRecentPayments(payments?.data?.results || [])
      setCustomerCount(cust?.data?.count ?? null)
      setPendingQuotes(quotes?.data?.count ?? null)

      // Sum this month's completed payments
      const allP = allPayments?.data?.results || []
      const monthTotal = allP
        .filter(p => p.payment_date >= monthStart)
        .reduce((sum, p) => sum + parseFloat(p.amount || 0), 0)
      setThisMonthRevenue(monthTotal)

      setLoading(false)
    })
  }, [])

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

        {/* ── KPI stat cards ─────────────────────────────────────────────── */}
        <div className="stats-grid">
          {loading ? (
            [1,2,3,4,5,6].map(i => <SkeletonCard key={i} />)
          ) : (
            <>
              <StatCard
                icon={AlertCircle} iconBg="var(--danger-light)" iconColor="var(--danger)"
                label="Outstanding"
                value={fmt.currency(outstanding?.total_outstanding)}
                meta={`${fmt.currency(outstanding?.total_overdue)} overdue`}
                metaColor={parseFloat(outstanding?.total_overdue) > 0 ? 'var(--danger)' : undefined}
              />
              <StatCard
                icon={CreditCard} iconBg="var(--success-light)" iconColor="var(--success)"
                label="Collected This Month"
                value={fmt.currency(thisMonthRevenue)}
                meta="Completed payments"
              />
              <StatCard
                icon={TrendingUp} iconBg="var(--accent-light)" iconColor="var(--accent)"
                label="MRR"
                value={fmt.currency(mrr?.mrr)}
                meta={`${fmt.currency(mrr?.arr)} ARR`}
              />
              <StatCard
                icon={RefreshCw} iconBg="var(--purple-light)" iconColor="var(--purple)"
                label="Active Subscriptions"
                value={mrr?.active_subscriptions ?? '—'}
                meta="Generating MRR"
              />
              <StatCard
                icon={Users} iconBg="var(--surface-3)" iconColor="var(--muted)"
                label="Total Customers"
                value={customerCount}
                meta="All time"
              />
              <StatCard
                icon={FileText} iconBg="var(--warning-light, #fffbeb)" iconColor="var(--warning, #d97706)"
                label="Pending Quotes"
                value={pendingQuotes}
                meta="Awaiting response"
              />
            </>
          )}
        </div>

        {/* ── Main grid ──────────────────────────────────────────────────── */}
        <div className="dashboard-grid">

          {/* Revenue chart */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Revenue</span>
              <select
                className="form-control"
                style={{ width: 'auto', fontSize: '0.8rem', padding: '4px 8px' }}
                value={revenueYear}
                onChange={e => setRevenueYear(parseInt(e.target.value))}
              >
                {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div className="card-body" style={{ padding: '16px 8px 16px 0' }}>
              {revenue.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={revenue} margin={{ left: 16, right: 16 }}>
                    <defs>
                      <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#2563eb" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0}    />
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
                <div className="empty-state" style={{ padding: 40 }}>
                  <TrendingUp />
                  <h3>No revenue data for {revenueYear}</h3>
                  <p>Completed payments will appear here</p>
                </div>
              )}
            </div>
          </div>

          {/* Recent invoices */}
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
                  <Receipt /><h3>No invoices yet</h3>
                </div>
              ) : recentInvoices.map(inv => (
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
              ))}
            </div>
          </div>

          {/* Overdue invoices */}
          <div className="card">
            <div className="card-header">
              <span className="card-title" style={{ color: 'var(--danger)' }}>
                <AlertCircle size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                Overdue Invoices
              </span>
              <Link to="/invoices?status=overdue" style={{ fontSize: '0.8rem', color: 'var(--danger)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3 }}>
                View all <ArrowRight size={13} />
              </Link>
            </div>
            <div style={{ overflow: 'hidden' }}>
              {overdueInvoices.length === 0 ? (
                <div className="empty-state" style={{ padding: 32 }}>
                  <CheckCircle style={{ color: 'var(--success)' }} />
                  <h3 style={{ color: 'var(--success)' }}>All caught up!</h3>
                  <p>No overdue invoices</p>
                </div>
              ) : overdueInvoices.map(inv => (
                <Link key={inv.id} to={`/invoices/${inv.id}`} style={{ textDecoration: 'none' }}>
                  <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--ink)', marginBottom: 2 }}>{inv.customer_name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                        {inv.number}
                        {inv.due_date && (
                          <span style={{ marginLeft: 8, color: 'var(--danger)' }}>
                            <Clock size={10} style={{ verticalAlign: 'middle', marginRight: 3 }} />
                            Due {inv.due_date}
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--danger)' }}>{fmt.currency(inv.balance_due, inv.currency)}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>balance due</div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Recent payments */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Recent Payments</span>
              <Link to="/payments" style={{ fontSize: '0.8rem', color: 'var(--accent)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3 }}>
                View all <ArrowRight size={13} />
              </Link>
            </div>
            <div style={{ overflow: 'hidden' }}>
              {recentPayments.length === 0 ? (
                <div className="empty-state" style={{ padding: 32 }}>
                  <CreditCard /><h3>No payments yet</h3>
                </div>
              ) : recentPayments.map(p => (
                <div key={p.id} style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--ink)', marginBottom: 2 }}>{p.customer_name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                      {p.invoice_number} · {p.payment_method?.replace('_', ' ')}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--success)' }}>{fmt.currency(p.amount, p.currency)}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{p.payment_date}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </>
  )
}