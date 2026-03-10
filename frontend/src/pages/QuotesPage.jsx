import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { getQuotes } from '../utils/api'
import { fmt, getError } from '../utils/helpers'
import { Plus, Search, FileText } from 'lucide-react'
import toast from 'react-hot-toast'

const STATUSES = ['', 'draft', 'sent', 'accepted', 'rejected', 'expired']

export default function QuotesPage() {
  const [quotes, setQuotes] = useState([])
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
      const { data } = await getQuotes(params)
      setQuotes(data.results || [])
      setCount(data.count || 0)
    } catch (err) { toast.error(getError(err)) }
    setLoading(false)
  }, [search, status, page])

  useEffect(() => { load() }, [load])

  return (
    <>
      <div className="page-header">
        <div>
          <h2 className="page-title">Quotes</h2>
          <p className="page-subtitle">{count} total quotes</p>
        </div>
        <Link to="/quotes/new" className="btn btn-primary"><Plus size={15} /> New Quote</Link>
      </div>

      <div className="page-body">
        <div className="toolbar">
          <div className="search-wrap">
            <Search />
            <input
              className="search-input"
              placeholder="Search by number, customer, title…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
            />
          </div>
          <select
            className="form-control"
            style={{ width: 'auto' }}
            value={status}
            onChange={e => { setStatus(e.target.value); setPage(1) }}
          >
            {STATUSES.map(s => (
              <option key={s} value={s}>{s || 'All Statuses'}</option>
            ))}
          </select>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Quote #</th>
                <th>Customer</th>
                <th>Title</th>
                <th>Issue Date</th>
                <th>Expiry</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7}><div className="loading"><div className="spinner" /></div></td></tr>
              ) : quotes.length === 0 ? (
                <tr><td colSpan={7}>
                  <div className="empty-state">
                    <FileText />
                    <h3>No quotes found</h3>
                    <p>Create your first quote to get started</p>
                  </div>
                </td></tr>
              ) : quotes.map(q => (
                <tr key={q.id} style={{ cursor: 'pointer' }}>
                  <td>
                    <Link
                      to={`/quotes/${q.id}`}
                      style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}
                    >
                      {q.number}
                    </Link>
                  </td>
                  <td style={{ fontWeight: 500 }}>{q.customer_name}</td>
                  <td className="td-muted">{q.title || '—'}</td>
                  <td className="td-muted">{fmt.date(q.issue_date)}</td>
                  <td
                    className="td-muted"
                    style={{ color: q.is_expired ? 'var(--danger)' : 'inherit' }}
                  >
                    {q.expiry_date ? fmt.date(q.expiry_date) : '—'}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>
                    {fmt.currency(q.total, q.currency)}
                  </td>
                  <td>
                    <span className={`badge badge-${
                      q.status === 'accepted' ? 'paid'
                      : q.status === 'rejected' ? 'cancelled'
                      : q.status === 'expired' ? 'overdue'
                      : q.status
                    }`}>
                      {q.status}
                    </span>
                    {q.is_expired && q.status !== 'expired' && (
                      <span className="badge badge-overdue" style={{ marginLeft: 4 }}>expired</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {count > PAGE_SIZE && (
            <div className="pagination">
              <span>
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, count)} of {count}
              </span>
              <div className="pagination-btns">
                <button className="page-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                  Previous
                </button>
                <button className="page-btn" disabled={page * PAGE_SIZE >= count} onClick={() => setPage(p => p + 1)}>
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}