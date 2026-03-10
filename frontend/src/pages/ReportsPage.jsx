import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts'
import { getRevenueReport, getOutstandingReport, getMRRReport, getCustomerBalances, getRevenueReportPdfUrl, downloadPdfUrl } from '../utils/api'
import { fmt } from '../utils/helpers'
import { BarChart2, TrendingUp, AlertCircle, Users, Download } from 'lucide-react'
import toast from 'react-hot-toast'

export default function ReportsPage() {
  const [year, setYear] = useState(new Date().getFullYear())
  const [revenue, setRevenue] = useState(null)
  const [outstanding, setOutstanding] = useState(null)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [mrr, setMrr] = useState(null)
  const [balances, setBalances] = useState(null)
  const [tab, setTab] = useState('revenue')

  const MONTH = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

  useEffect(() => {
    getRevenueReport({ year }).then(r => setRevenue(r.data)).catch(() => {})
    getOutstandingReport().then(r => setOutstanding(r.data)).catch(() => {})
    getMRRReport().then(r => setMrr(r.data)).catch(() => {})
    getCustomerBalances().then(r => setBalances(r.data)).catch(() => {})
  }, [year])

  const revenueData = revenue?.data?.map(r => ({
    month: MONTH[parseInt(r.month?.slice(5,7))-1] || r.month,
    revenue: parseFloat(r.total_revenue)||0,
    count: r.payment_count,
  })) || []

  const totalRevenue = revenueData.reduce((s,r) => s+r.revenue, 0)

  return (
    <>
      <div className="page-header">
        <div><h2 className="page-title">Reports</h2><p className="page-subtitle">Financial analytics and insights</p></div>
        <button
          className="btn btn-secondary"
          disabled={pdfLoading}
          onClick={async () => {
            setPdfLoading(true)
            try {
              await downloadPdfUrl(getRevenueReportPdfUrl(year), `revenue-report-${year}.pdf`)
            } catch { toast.error('Could not download PDF') }
            setPdfLoading(false)
          }}
        >
          <Download size={15} /> {pdfLoading ? 'Generating…' : 'Export PDF'}
        </button>
      </div>

      <div className="page-body">
        {/* MRR stats */}
        <div className="stats-grid" style={{ marginBottom: 24 }}>
          <div className="stat-card">
            <div className="stat-icon" style={{background:'var(--success-light)'}}><TrendingUp size={18} color="var(--success)" /></div>
            <div className="stat-label">MRR</div>
            <div className="stat-value">{mrr ? fmt.currency(mrr.mrr) : '—'}</div>
            <div className="stat-meta">ARR: {mrr ? fmt.currency(mrr.arr) : '—'}</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{background:'var(--danger-light)'}}><AlertCircle size={18} color="var(--danger)" /></div>
            <div className="stat-label">Outstanding</div>
            <div className="stat-value">{outstanding ? fmt.currency(outstanding.total_outstanding) : '—'}</div>
            <div className="stat-meta">Overdue: {outstanding ? fmt.currency(outstanding.total_overdue) : '—'}</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{background:'var(--accent-light)'}}><BarChart2 size={18} color="var(--accent)" /></div>
            <div className="stat-label">Revenue {year}</div>
            <div className="stat-value">{fmt.currency(totalRevenue)}</div>
            <div className="stat-meta">{revenueData.reduce((s,r)=>s+r.count,0)} payments</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{background:'var(--purple-light)'}}><Users size={18} color="var(--purple)" /></div>
            <div className="stat-label">Active Subscriptions</div>
            <div className="stat-value">{mrr?.active_subscriptions ?? '—'}</div>
            <div className="stat-meta">Generating MRR</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="tab-bar">
          {['revenue','outstanding','customers'].map(t => (
            <button key={t} className={`tab${tab===t?' active':''}`} onClick={() => setTab(t)} style={{textTransform:'capitalize'}}>
              {t === 'revenue' ? 'Revenue by Month' : t === 'outstanding' ? 'Outstanding' : 'Customer Balances'}
            </button>
          ))}
        </div>

        {tab === 'revenue' && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">Revenue by Month</span>
              <select className="form-control" style={{width:'auto'}} value={year} onChange={e => setYear(e.target.value)}>
                {[2023,2024,2025,2026].map(y => <option key={y}>{y}</option>)}
              </select>
            </div>
            <div className="card-body">
              {revenueData.length === 0 ? (
                <div className="empty-state"><BarChart2 /><h3>No revenue data for {year}</h3></div>
              ) : (
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={revenueData} margin={{left:0,right:16}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                    <XAxis dataKey="month" tick={{fontSize:12}} />
                    <YAxis tick={{fontSize:12}} tickFormatter={v => '$'+(v>=1000?(v/1000).toFixed(0)+'k':v)} />
                    <Tooltip formatter={v => fmt.currency(v)} />
                    <Bar dataKey="revenue" radius={[4,4,0,0]}>
                      {revenueData.map((_, i) => <Cell key={i} fill={i === revenueData.length-1 ? '#2563eb' : '#93c5fd'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        )}

        {tab === 'outstanding' && (
          <div className="card">
            <div className="card-header"><span className="card-title">Outstanding Invoices by Status</span></div>
            <div className="card-body">
              {!outstanding ? <div className="loading"><div className="spinner" /></div> : (
                <table style={{width:'100%'}}>
                  <thead><tr><th style={{textAlign:'left',padding:'8px 0',fontSize:'0.75rem',color:'var(--muted)',fontWeight:600}}>Status</th><th style={{textAlign:'right',padding:'8px 0',fontSize:'0.75rem',color:'var(--muted)',fontWeight:600}}>Count</th><th style={{textAlign:'right',padding:'8px 0',fontSize:'0.75rem',color:'var(--muted)',fontWeight:600}}>Amount</th></tr></thead>
                  <tbody>
                    {outstanding.by_status?.map(s => (
                      <tr key={s.status}>
                        <td style={{padding:'12px 0',borderBottom:'1px solid var(--border)'}}><span className={`badge badge-${s.status}`}>{s.status.replace('_',' ')}</span></td>
                        <td style={{textAlign:'right',padding:'12px 0',borderBottom:'1px solid var(--border)',color:'var(--muted)'}}>{s.count}</td>
                        <td style={{textAlign:'right',padding:'12px 0',borderBottom:'1px solid var(--border)',fontWeight:600}}>{fmt.currency(s.amount)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td style={{padding:'12px 0',fontWeight:600}}>Total Outstanding</td>
                      <td></td>
                      <td style={{textAlign:'right',fontWeight:700,fontSize:'1.05rem',padding:'12px 0'}}>{fmt.currency(outstanding.total_outstanding)}</td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {tab === 'customers' && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">Customer Balances</span>
              <span style={{fontSize:'0.82rem',color:'var(--muted)'}}>Total: {balances ? fmt.currency(balances.total_outstanding) : '—'}</span>
            </div>
            <div className="table-wrap" style={{border:'none',borderRadius:0}}>
              <table>
                <thead><tr><th>Customer</th><th>Email</th><th style={{textAlign:'right'}}>Outstanding</th><th style={{textAlign:'right'}}>Credit</th></tr></thead>
                <tbody>
                  {!balances ? <tr><td colSpan={4}><div className="loading"><div className="spinner" /></div></td></tr>
                  : balances.customers?.length === 0 ? <tr><td colSpan={4}><div className="empty-state"><Users /><h3>All customers are up to date</h3></div></td></tr>
                  : balances.customers?.map(c => (
                    <tr key={c.id}>
                      <td style={{fontWeight:500}}>{c.display_name}</td>
                      <td className="td-muted">{c.email}</td>
                      <td style={{textAlign:'right',fontWeight:600,color:'var(--danger)'}}>{fmt.currency(c.outstanding_balance)}</td>
                      <td style={{textAlign:'right',color:'var(--success)'}}>{fmt.currency(c.credit_balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
