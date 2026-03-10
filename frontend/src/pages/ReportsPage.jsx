import { useState, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
  PieChart, Pie, Legend,
} from 'recharts'
import {
  getRevenueReport, getOutstandingReport, getMRRReport, getCustomerBalances,
  getTaxSummary, getPaymentMethods, getTopCustomers, getInvoiceFunnel,
  downloadRevenuePdf, downloadOutstandingPdf, downloadTaxSummaryPdf,
} from '../utils/api'
import { fmt } from '../utils/helpers'
import { BarChart2, TrendingUp, AlertCircle, Users, Download, CreditCard, FileText, Receipt } from 'lucide-react'
import toast from 'react-hot-toast'

const MONTH = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const COLORS = ['#2563eb','#7c3aed','#16a34a','#d97706','#dc2626','#0891b2']

const METHOD_LABEL = {
  bank: 'Bank Transfer', stripe: 'Stripe', cash: 'Cash',
  check: 'Check', credit_card: 'Credit Card', other: 'Other',
}

const STATUS_ORDER = ['draft','sent','partially_paid','overdue','paid','cancelled']
const STATUS_COLOR = {
  draft: '#94a3b8', sent: '#2563eb', partially_paid: '#d97706',
  overdue: '#dc2626', paid: '#16a34a', cancelled: '#6b7280',
}

function SectionCard({ title, action, children }) {
  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">{title}</span>
        {action}
      </div>
      <div className="card-body">{children}</div>
    </div>
  )
}

function PdfButton({ loading, onClick, label = 'Export PDF' }) {
  return (
    <button className="btn btn-secondary btn-sm" disabled={loading} onClick={onClick}>
      <Download size={13} /> {loading ? 'Generating…' : label}
    </button>
  )
}

export default function ReportsPage() {
  const currentYear = new Date().getFullYear()
  const yearOptions = [currentYear - 2, currentYear - 1, currentYear]

  const [tab, setTab]   = useState('revenue')
  const [year, setYear] = useState(currentYear)

  // Data
  const [revenue, setRevenue]           = useState(null)
  const [outstanding, setOutstanding]   = useState(null)
  const [mrr, setMrr]                   = useState(null)
  const [balances, setBalances]         = useState(null)
  const [taxSummary, setTaxSummary]     = useState(null)
  const [payMethods, setPayMethods]     = useState(null)
  const [topCustomers, setTopCustomers] = useState(null)
  const [funnel, setFunnel]             = useState(null)

  // Tax date range
  const [taxFrom, setTaxFrom] = useState('')
  const [taxTo, setTaxTo]     = useState('')

  // PDF loading states
  const [pdfRevenue,      setPdfRevenue]      = useState(false)
  const [pdfOutstanding,  setPdfOutstanding]  = useState(false)
  const [pdfTax,          setPdfTax]          = useState(false)

  // ── Load data ────────────────────────────────────────────────────────────
  useEffect(() => {
    getRevenueReport({ year }).then(r => setRevenue(r.data)).catch(() => {})
    getPaymentMethods({ year }).then(r => setPayMethods(r.data)).catch(() => {})
    getTopCustomers({ year }).then(r => setTopCustomers(r.data)).catch(() => {})
  }, [year])

  useEffect(() => {
    getOutstandingReport().then(r => setOutstanding(r.data)).catch(() => {})
    getMRRReport().then(r => setMrr(r.data)).catch(() => {})
    getCustomerBalances().then(r => setBalances(r.data)).catch(() => {})
    getInvoiceFunnel().then(r => setFunnel(r.data)).catch(() => {})
  }, [])

  const loadTaxSummary = useCallback(() => {
    getTaxSummary({ date_from: taxFrom || undefined, date_to: taxTo || undefined })
      .then(r => setTaxSummary(r.data)).catch(() => {})
  }, [taxFrom, taxTo])

  useEffect(() => { if (tab === 'tax') loadTaxSummary() }, [tab, loadTaxSummary])

  // ── Derived data ─────────────────────────────────────────────────────────
  const revenueData = revenue?.data?.map(r => ({
    month: MONTH[parseInt(r.month?.slice(5,7))-1] || r.month,
    revenue: parseFloat(r.total_revenue) || 0,
    count: r.payment_count,
  })) || []
  const totalRevenue = revenueData.reduce((s,r) => s + r.revenue, 0)

  const methodData = (payMethods?.data || []).map((d, i) => ({
    name: METHOD_LABEL[d.method] || d.method,
    value: parseFloat(d.total) || 0,
    share: d.share,
    count: d.count,
    fill: COLORS[i % COLORS.length],
  }))

  const funnelData = (funnel?.data || []).map(d => ({
    status: d.status,
    count: d.count,
    amount: parseFloat(d.amount) || 0,
  }))

  // ── PDF helpers ──────────────────────────────────────────────────────────
  const downloadRevenue = async () => {
    setPdfRevenue(true)
    try { await downloadRevenuePdf(year) }
    catch { toast.error('Could not generate PDF') }
    setPdfRevenue(false)
  }
  const downloadOutstanding = async () => {
    setPdfOutstanding(true)
    try { await downloadOutstandingPdf() }
    catch { toast.error('Could not generate PDF') }
    setPdfOutstanding(false)
  }
  const downloadTax = async () => {
    setPdfTax(true)
    try { await downloadTaxSummaryPdf(taxFrom, taxTo) }
    catch { toast.error('Could not generate PDF') }
    setPdfTax(false)
  }

  const TABS = [
    { key: 'revenue',     label: 'Revenue'          },
    { key: 'outstanding', label: 'Outstanding'       },
    { key: 'tax',         label: 'Tax Summary'       },
    { key: 'payments',    label: 'Payment Methods'   },
    { key: 'customers',   label: 'Top Customers'     },
    { key: 'funnel',      label: 'Invoice Funnel'    },
    { key: 'balances',    label: 'Customer Balances' },
  ]

  return (
    <>
      <div className="page-header">
        <div>
          <h2 className="page-title">Reports</h2>
          <p className="page-subtitle">Financial analytics and insights</p>
        </div>
      </div>

      <div className="page-body">

        {/* ── KPI strip ─────────────────────────────────────────────────── */}
        <div className="stats-grid" style={{ marginBottom: 24 }}>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: 'var(--success-light)' }}><TrendingUp size={18} color="var(--success)" /></div>
            <div className="stat-label">MRR</div>
            <div className="stat-value">{mrr ? fmt.currency(mrr.mrr) : '—'}</div>
            <div className="stat-meta">ARR: {mrr ? fmt.currency(mrr.arr) : '—'}</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: 'var(--danger-light)' }}><AlertCircle size={18} color="var(--danger)" /></div>
            <div className="stat-label">Outstanding</div>
            <div className="stat-value">{outstanding ? fmt.currency(outstanding.total_outstanding) : '—'}</div>
            <div className="stat-meta">Overdue: {outstanding ? fmt.currency(outstanding.total_overdue) : '—'}</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: 'var(--accent-light)' }}><BarChart2 size={18} color="var(--accent)" /></div>
            <div className="stat-label">Revenue {year}</div>
            <div className="stat-value">{fmt.currency(totalRevenue)}</div>
            <div className="stat-meta">{revenueData.reduce((s,r) => s + r.count, 0)} payments</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: 'var(--purple-light)' }}><Users size={18} color="var(--purple)" /></div>
            <div className="stat-label">Active Subscriptions</div>
            <div className="stat-value">{mrr?.active_subscriptions ?? '—'}</div>
            <div className="stat-meta">Generating MRR</div>
          </div>
        </div>

        {/* ── Tabs ──────────────────────────────────────────────────────── */}
        <div className="tab-bar" style={{ overflowX: 'auto', flexWrap: 'nowrap' }}>
          {TABS.map(t => (
            <button key={t.key} className={`tab${tab === t.key ? ' active' : ''}`} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Revenue ───────────────────────────────────────────────────── */}
        {tab === 'revenue' && (
          <SectionCard
            title="Revenue by Month"
            action={
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select className="form-control" style={{ width: 'auto' }} value={year} onChange={e => setYear(parseInt(e.target.value))}>
                  {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <PdfButton loading={pdfRevenue} onClick={downloadRevenue} />
              </div>
            }
          >
            {revenueData.length === 0 ? (
              <div className="empty-state"><BarChart2 /><h3>No revenue data for {year}</h3></div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={revenueData} margin={{ left: 0, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} tickFormatter={v => '$'+(v>=1000?(v/1000).toFixed(0)+'k':v)} />
                    <Tooltip formatter={v => fmt.currency(v)} />
                    <Bar dataKey="revenue" radius={[4,4,0,0]}>
                      {revenueData.map((_, i) => <Cell key={i} fill={i === revenueData.length-1 ? '#2563eb' : '#93c5fd'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <table style={{ width: '100%', marginTop: 16 }}>
                  <thead>
                    <tr>
                      {['Month','Revenue','Payments','Share'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', fontSize: '0.72rem', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: h !== 'Month' ? 'right' : 'left', borderBottom: '1px solid var(--border)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {revenueData.map((r, i) => (
                      <tr key={i}>
                        <td style={{ padding: '10px 12px', fontWeight: 500 }}>{r.month}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: 'var(--accent)' }}>{fmt.currency(r.revenue)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--muted)' }}>{r.count}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--muted)' }}>
                          {totalRevenue > 0 ? (r.revenue / totalRevenue * 100).toFixed(1) + '%' : '—'}
                        </td>
                      </tr>
                    ))}
                    <tr style={{ background: 'var(--surface-2)', fontWeight: 700 }}>
                      <td style={{ padding: '10px 12px' }}>Total</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>{fmt.currency(totalRevenue)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>{revenueData.reduce((s,r) => s+r.count, 0)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>100%</td>
                    </tr>
                  </tbody>
                </table>
              </>
            )}
          </SectionCard>
        )}

        {/* ── Outstanding ───────────────────────────────────────────────── */}
        {tab === 'outstanding' && (
          <SectionCard
            title="Outstanding Invoices by Status"
            action={<PdfButton loading={pdfOutstanding} onClick={downloadOutstanding} />}
          >
            {!outstanding ? (
              <div className="loading"><div className="spinner" /></div>
            ) : (
              <table style={{ width: '100%' }}>
                <thead>
                  <tr>
                    {['Status','Count','Amount'].map(h => (
                      <th key={h} style={{ padding: '8px 0', fontSize: '0.75rem', color: 'var(--muted)', fontWeight: 600, textAlign: h !== 'Status' ? 'right' : 'left' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {outstanding.by_status?.map(s => (
                    <tr key={s.status}>
                      <td style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                        <span className={`badge badge-${s.status}`}>{s.status.replace('_',' ')}</span>
                      </td>
                      <td style={{ textAlign: 'right', padding: '12px 0', borderBottom: '1px solid var(--border)', color: 'var(--muted)' }}>{s.count}</td>
                      <td style={{ textAlign: 'right', padding: '12px 0', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>{fmt.currency(s.amount)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ padding: '12px 0', fontWeight: 700 }}>Total Outstanding</td>
                    <td></td>
                    <td style={{ textAlign: 'right', fontWeight: 700, fontSize: '1.05rem', padding: '12px 0' }}>{fmt.currency(outstanding.total_outstanding)}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '4px 0', color: 'var(--danger)', fontWeight: 600 }}>Of which overdue</td>
                    <td></td>
                    <td style={{ textAlign: 'right', color: 'var(--danger)', fontWeight: 600, padding: '4px 0' }}>{fmt.currency(outstanding.total_overdue)}</td>
                  </tr>
                </tbody>
              </table>
            )}
          </SectionCard>
        )}

        {/* ── Tax Summary ───────────────────────────────────────────────── */}
        {tab === 'tax' && (
          <SectionCard
            title="Tax Summary"
            action={<PdfButton loading={pdfTax} onClick={downloadTax} />}
          >
            {/* Date range filters */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">From</label>
                <input className="form-control" type="date" value={taxFrom} onChange={e => setTaxFrom(e.target.value)} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">To</label>
                <input className="form-control" type="date" value={taxTo} onChange={e => setTaxTo(e.target.value)} />
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={loadTaxSummary}>Apply</button>
              </div>
            </div>

            {!taxSummary ? (
              <div className="loading"><div className="spinner" /></div>
            ) : (
              <div>
                <div className="stats-grid" style={{ marginBottom: 20 }}>
                  {[
                    { label: 'Total Revenue',    value: fmt.currency(taxSummary.total_revenue),   color: 'var(--success)' },
                    { label: 'Tax Collected',    value: fmt.currency(taxSummary.total_tax),       color: 'var(--accent)'  },
                    { label: 'Total Discounts',  value: fmt.currency(taxSummary.total_discount),  color: 'var(--warning, #d97706)' },
                    { label: 'Invoice Count',    value: taxSummary.invoice_count,                 color: 'var(--ink)'     },
                  ].map(item => (
                    <div key={item.label} className="stat-card">
                      <div className="stat-label">{item.label}</div>
                      <div className="stat-value" style={{ fontSize: '1.3rem', color: item.color }}>{item.value}</div>
                    </div>
                  ))}
                </div>
                <table style={{ width: '100%' }}>
                  <tbody>
                    {[
                      { label: 'Gross Revenue',            value: fmt.currency(taxSummary.total_revenue),   bold: false },
                      { label: 'Less: Discounts',          value: `− ${fmt.currency(taxSummary.total_discount)}`, color: 'var(--warning, #d97706)', bold: false },
                      { label: 'Tax Collected',            value: fmt.currency(taxSummary.total_tax),       color: 'var(--accent)', bold: false },
                      { label: 'Number of Invoices',       value: taxSummary.invoice_count,                 bold: false },
                    ].map(row => (
                      <tr key={row.label} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '12px 0', color: 'var(--ink-2)' }}>{row.label}</td>
                        <td style={{ padding: '12px 0', textAlign: 'right', fontWeight: row.bold ? 700 : 600, color: row.color || 'var(--ink)' }}>{row.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p style={{ marginTop: 16, fontSize: '0.78rem', color: 'var(--muted)', lineHeight: 1.6 }}>
                  Based on paid and partially paid invoices only. Consult your accountant for filing requirements.
                </p>
              </div>
            )}
          </SectionCard>
        )}

        {/* ── Payment Methods ───────────────────────────────────────────── */}
        {tab === 'payments' && (
          <SectionCard
            title="Revenue by Payment Method"
            action={
              <select className="form-control" style={{ width: 'auto' }} value={year} onChange={e => setYear(parseInt(e.target.value))}>
                {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            }
          >
            {!payMethods ? (
              <div className="loading"><div className="spinner" /></div>
            ) : methodData.length === 0 ? (
              <div className="empty-state"><CreditCard /><h3>No payment data for {year}</h3></div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={methodData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, share }) => `${name} ${share}%`} labelLine={false}>
                      {methodData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                    </Pie>
                    <Tooltip formatter={v => fmt.currency(v)} />
                  </PieChart>
                </ResponsiveContainer>
                <table style={{ alignSelf: 'center' }}>
                  <thead>
                    <tr>
                      {['Method','Payments','Revenue','Share'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', fontSize: '0.72rem', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: h !== 'Method' ? 'right' : 'left', borderBottom: '1px solid var(--border)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {methodData.map((d, i) => (
                      <tr key={i}>
                        <td style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ width: 10, height: 10, borderRadius: '50%', background: d.fill, display: 'inline-block', flexShrink: 0 }} />
                          {d.name}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--muted)' }}>{d.count}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>{fmt.currency(d.value)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--muted)' }}>{d.share}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        )}

        {/* ── Top Customers ─────────────────────────────────────────────── */}
        {tab === 'customers' && (
          <SectionCard
            title="Top Customers by Revenue"
            action={
              <select className="form-control" style={{ width: 'auto' }} value={year} onChange={e => setYear(parseInt(e.target.value))}>
                {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            }
          >
            {!topCustomers ? (
              <div className="loading"><div className="spinner" /></div>
            ) : topCustomers.data?.length === 0 ? (
              <div className="empty-state"><Users /><h3>No revenue data for {year}</h3></div>
            ) : (
              <table style={{ width: '100%' }}>
                <thead>
                  <tr>
                    {['#','Customer','Email','Payments','Revenue'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', fontSize: '0.72rem', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: h === 'Revenue' || h === 'Payments' ? 'right' : 'left', borderBottom: '1px solid var(--border)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {topCustomers.data.map((c, i) => (
                    <tr key={c.customer_id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px', color: 'var(--muted)', fontWeight: 600, width: 40 }}>{i + 1}</td>
                      <td style={{ padding: '12px', fontWeight: 500 }}>{c.customer_name}</td>
                      <td style={{ padding: '12px', color: 'var(--muted)', fontSize: '0.82rem' }}>{c.customer_email || '—'}</td>
                      <td style={{ padding: '12px', textAlign: 'right', color: 'var(--muted)' }}>{c.payment_count}</td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: 'var(--accent)', fontSize: '0.95rem' }}>{fmt.currency(c.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </SectionCard>
        )}

        {/* ── Invoice Funnel ────────────────────────────────────────────── */}
        {tab === 'funnel' && (
          <SectionCard title="Invoice Status Funnel">
            {!funnel ? (
              <div className="loading"><div className="spinner" /></div>
            ) : funnelData.length === 0 ? (
              <div className="empty-state"><FileText /><h3>No invoice data</h3></div>
            ) : (
              <div>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={funnelData} margin={{ left: 0, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                    <XAxis dataKey="status" tick={{ fontSize: 11 }} tickFormatter={s => s.replace('_',' ')} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v, name) => name === 'count' ? v : fmt.currency(v)} labelFormatter={l => l.replace('_', ' ')} />
                    <Bar dataKey="count" radius={[4,4,0,0]}>
                      {funnelData.map((d, i) => <Cell key={i} fill={STATUS_COLOR[d.status] || '#94a3b8'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <table style={{ width: '100%', marginTop: 16 }}>
                  <thead>
                    <tr>
                      {['Status','Count','Amount'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', fontSize: '0.72rem', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: h !== 'Status' ? 'right' : 'left', borderBottom: '1px solid var(--border)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {funnelData.map((d, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 12px' }}>
                          <span className={`badge badge-${d.status}`}>{d.status.replace('_',' ')}</span>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--muted)' }}>{d.count}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>{fmt.currency(d.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        )}

        {/* ── Customer Balances ─────────────────────────────────────────── */}
        {tab === 'balances' && (
          <SectionCard
            title="Customer Balances"
            action={<span style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>Total: {balances ? fmt.currency(balances.total_outstanding) : '—'}</span>}
          >
            <div className="table-wrap" style={{ border: 'none', borderRadius: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Email</th>
                    <th style={{ textAlign: 'right' }}>Outstanding</th>
                    <th style={{ textAlign: 'right' }}>Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {!balances ? (
                    <tr><td colSpan={4}><div className="loading"><div className="spinner" /></div></td></tr>
                  ) : balances.customers?.length === 0 ? (
                    <tr><td colSpan={4}><div className="empty-state"><Users /><h3>All customers are up to date</h3></div></td></tr>
                  ) : balances.customers?.map(c => (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 500 }}>{c.display_name}</td>
                      <td className="td-muted">{c.email}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--danger)' }}>{fmt.currency(c.outstanding_balance)}</td>
                      <td style={{ textAlign: 'right', color: 'var(--success)' }}>{fmt.currency(c.credit_balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        )}

      </div>
    </>
  )
}