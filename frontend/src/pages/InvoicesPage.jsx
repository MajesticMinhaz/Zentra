import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { getInvoices } from '../utils/api'
import { fmt, getError } from '../utils/helpers'
import { Plus, Search, Receipt, Filter } from 'lucide-react'
import toast from 'react-hot-toast'

const STATUSES = ['', 'draft', 'sent', 'partially_paid', 'paid', 'overdue', 'cancelled']

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 20

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = { page, page_size: PAGE_SIZE, ordering: '-issue_date' }
      if (search) params.search = search
      if (status) params.status = status
      const { data } = await getInvoices(params)
      let results = data.results || []
      // When filtering overdue, also pull partially_paid invoices that are past due
      // since Celery doesn't overwrite their status
      if (status === 'overdue') {
        const { data: pp } = await getInvoices({ page_size: 200, status: 'partially_paid', ordering: '-issue_date' })
        const today = new Date().toISOString().split('T')[0]
        const overduePartial = (pp.results || []).filter(inv => inv.due_date && inv.due_date < today)
        const ids = new Set(results.map(i => i.id))
        results = [...results, ...overduePartial.filter(i => !ids.has(i.id))]
      }
      setInvoices(results)
      setCount(data.count || 0)
    } catch (err) { toast.error(getError(err)) }
    setLoading(false)
  }, [search, status, page])

  useEffect(() => { load() }, [load])

  return (
    <>
      <div className="page-header">
        <div>
          <h2 className="page-title">Invoices</h2>
          <p className="page-subtitle">{count} total invoices</p>
        </div>
        <Link to="/invoices/new" className="btn btn-primary"><Plus size={15} /> New Invoice</Link>
      </div>

      <div className="page-body">
        <div className="toolbar">
          <div className="search-wrap">
            <Search />
            <input className="search-input" placeholder="Search by number, customer…" value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }} />
          </div>
          <select className="form-control" style={{ width: 'auto' }} value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}>
            {STATUSES.map(s => <option key={s} value={s}>{s || 'All Statuses'}</option>)}
          </select>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Customer</th>
                <th>Type</th>
                <th>Issue Date</th>
                <th>Due Date</th>
                <th>Total</th>
                <th>Balance Due</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8}><div className="loading"><div className="spinner" /></div></td></tr>
              ) : invoices.length === 0 ? (
                <tr><td colSpan={8}>
                  <div className="empty-state">
                    <Receipt />
                    <h3>No invoices found</h3>
                    <p>Create your first invoice to get started</p>
                  </div>
                </td></tr>
              ) : invoices.map(inv => (
                <tr key={inv.id} style={{ cursor: 'pointer' }}>
                  <td>
                    <Link to={`/invoices/${inv.id}`} style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>
                      {inv.number}
                    </Link>
                  </td>
                  <td style={{ fontWeight: 500 }}>{inv.customer_name}</td>
                  <td className="td-muted">{inv.invoice_type}</td>
                  <td className="td-muted">{fmt.date(inv.issue_date)}</td>
                  <td className="td-muted">{fmt.date(inv.due_date)}</td>
                  <td style={{ fontWeight: 600 }}>{fmt.currency(inv.total, inv.currency)}</td>
                  <td style={{ color: parseFloat(inv.balance_due) > 0 ? 'var(--danger)' : 'var(--success)', fontWeight: 500 }}>
                    {fmt.currency(inv.balance_due, inv.currency)}
                  </td>
                  <td>
                    <span className={`badge badge-${inv.status}`}>{inv.status.replace('_', ' ')}</span>
                    {inv.is_overdue && inv.status !== 'overdue' && (
                      <span className="badge badge-overdue" style={{ marginLeft: 4 }}>overdue</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {count > PAGE_SIZE && (
            <div className="pagination">
              <span>Showing {(page-1)*PAGE_SIZE+1}–{Math.min(page*PAGE_SIZE, count)} of {count}</span>
              <div className="pagination-btns">
                <button className="page-btn" disabled={page===1} onClick={() => setPage(p=>p-1)}>Previous</button>
                <button className="page-btn" disabled={page*PAGE_SIZE>=count} onClick={() => setPage(p=>p+1)}>Next</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}