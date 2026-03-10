import { useState, useEffect, useCallback, useRef } from 'react'
import { getPayments, createPayment, getInvoices } from '../utils/api'
import { fmt, getError, today } from '../utils/helpers'
import { Plus, Search, CreditCard, X, ChevronLeft, ChevronRight, ArrowUpRight, Calendar, Hash, User, FileText, Tag, StickyNote } from 'lucide-react'
import toast from 'react-hot-toast'

const PAGE_SIZE = 20

const METHODS = [
  { value: 'bank',        label: 'Bank Transfer' },
  { value: 'stripe',      label: 'Stripe'        },
  { value: 'cash',        label: 'Cash'          },
  { value: 'check',       label: 'Check'         },
  { value: 'credit_card', label: 'Credit Card'   },
  { value: 'other',       label: 'Other'         },
]

const EMPTY = {
  invoice: '', amount: '', payment_date: today(),
  payment_method: 'bank', transaction_reference: '', notes: '',
}

const METHOD_LABEL = Object.fromEntries(METHODS.map(m => [m.value, m.label]))

function StatusBadge({ status }) {
  return <span className={`badge badge-${status}`}>{status}</span>
}

function MethodBadge({ method }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: '0.75rem', fontWeight: 500,
      background: 'var(--surface-2)', color: 'var(--ink-2)',
      borderRadius: '100px', padding: '2px 10px',
      textTransform: 'capitalize',
    }}>
      {METHOD_LABEL[method] || method?.replace('_', ' ') || '—'}
    </span>
  )
}

function DetailRow({ icon: Icon, label, children }) {
  if (!children) return null
  return (
    <div style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ width: 28, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
        <Icon size={14} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>
          {label}
        </div>
        <div style={{ fontSize: '0.875rem', color: 'var(--ink)' }}>{children}</div>
      </div>
    </div>
  )
}

export default function PaymentsPage() {
  // List state
  const [payments, setPayments]   = useState([])
  const [count, setCount]         = useState(0)
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [filterStatus, setFilterStatus]   = useState('')
  const [filterMethod, setFilterMethod]   = useState('')
  const [page, setPage]           = useState(1)

  // Detail drawer
  const [detail, setDetail]       = useState(null)

  // Record modal
  const [modal, setModal]         = useState(false)
  const [form, setForm]           = useState(EMPTY)
  const [invoices, setInvoices]   = useState([])
  const [invoicesLoading, setInvoicesLoading] = useState(false)
  const [saving, setSaving]       = useState(false)

  const searchTimer = useRef(null)

  // ── Load payments ────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = { page, page_size: PAGE_SIZE, ordering: '-payment_date' }
      if (search)       params.search         = search
      if (filterStatus) params.status         = filterStatus
      if (filterMethod) params.payment_method = filterMethod
      const { data } = await getPayments(params)
      setPayments(data.results || [])
      setCount(data.count || 0)
    } catch (err) { toast.error(getError(err)) }
    setLoading(false)
  }, [search, filterStatus, filterMethod, page])

  useEffect(() => { load() }, [load])

  const handleSearch = (val) => {
    setSearch(val)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setPage(1), 300)
  }

  const handleFilter = (setter) => (e) => { setter(e.target.value); setPage(1) }

  // ── Record modal ─────────────────────────────────────────────────────────
  const loadInvoices = useCallback(async () => {
    setInvoicesLoading(true)
    try {
      const [r1, r2, r3] = await Promise.all([
        getInvoices({ status: 'sent',           page_size: 200 }),
        getInvoices({ status: 'partially_paid', page_size: 200 }),
        getInvoices({ status: 'overdue',        page_size: 200 }),
      ])
      setInvoices([
        ...(r1.data.results || []),
        ...(r2.data.results || []),
        ...(r3.data.results || []),
      ])
    } catch {}
    setInvoicesLoading(false)
  }, [])

  const openModal = () => { setForm(EMPTY); loadInvoices(); setModal(true) }
  const closeModal = () => setModal(false)

  const save = async (e) => {
    e.preventDefault(); setSaving(true)
    try {
      await createPayment({ ...form, amount: parseFloat(form.amount) })
      toast.success('Payment recorded')
      closeModal(); load()
    } catch (err) { toast.error(getError(err)) }
    setSaving(false)
  }

  const f = (field) => ({
    value: form[field] ?? '',
    onChange: e => setForm(p => ({ ...p, [field]: e.target.value })),
  })

  const selectedInv = invoices.find(i => i.id === form.invoice)

  const totalPages = Math.ceil(count / PAGE_SIZE)

  return (
    <>
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Payments</h2>
          <p className="page-subtitle">{count} payment{count !== 1 ? 's' : ''} recorded</p>
        </div>
        <button className="btn btn-primary" onClick={openModal}>
          <Plus size={15} /> Record Payment
        </button>
      </div>

      <div className="page-body">

        {/* ── Toolbar ───────────────────────────────────────────────────── */}
        <div className="toolbar">
          <div className="search-wrap">
            <Search />
            <input
              className="search-input"
              placeholder="Search by invoice, customer, reference…"
              value={search}
              onChange={e => handleSearch(e.target.value)}
            />
          </div>

          <select className="form-control" style={{ width: 'auto' }}
            value={filterStatus} onChange={handleFilter(setFilterStatus)}>
            <option value="">All Statuses</option>
            <option value="completed">Completed</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
            <option value="refunded">Refunded</option>
          </select>

          <select className="form-control" style={{ width: 'auto' }}
            value={filterMethod} onChange={handleFilter(setFilterMethod)}>
            <option value="">All Methods</option>
            {METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>

        {/* ── Table ─────────────────────────────────────────────────────── */}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Invoice</th>
                <th>Customer</th>
                <th>Method</th>
                <th>Reference</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7}><div className="loading"><div className="spinner" /></div></td></tr>
              ) : payments.length === 0 ? (
                <tr><td colSpan={7}>
                  <div className="empty-state">
                    <CreditCard />
                    <h3>No payments found</h3>
                    <p>{search || filterStatus || filterMethod ? 'Try adjusting your filters' : 'Record payments against sent invoices'}</p>
                  </div>
                </td></tr>
              ) : payments.map(p => (
                <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => setDetail(p)}>
                  <td className="td-muted">{fmt.date(p.payment_date)}</td>
                  <td><span className="td-mono">{p.invoice_number}</span></td>
                  <td style={{ fontWeight: 500 }}>{p.customer_name}</td>
                  <td><MethodBadge method={p.payment_method} /></td>
                  <td className="td-muted">{p.transaction_reference || '—'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt.currency(p.amount, p.currency)}</td>
                  <td><StatusBadge status={p.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Pagination ────────────────────────────────────────────────── */}
        {count > PAGE_SIZE && (
          <div className="pagination">
            <span>Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, count)} of {count}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="page-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft size={14} /> Previous
              </button>
              <button className="page-btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Detail Drawer ─────────────────────────────────────────────────── */}
      {detail && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setDetail(null)}>
          <div className="modal" style={{ maxWidth: 480 }}>

            <div className="modal-header">
              <div>
                <h3 className="modal-title">Payment Details</h3>
                <p style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 2 }}>
                  Recorded {fmt.date(detail.created_at)}
                </p>
              </div>
              <button className="btn-close" onClick={() => setDetail(null)}><X size={18} /></button>
            </div>

            <div className="modal-body">

              {/* Amount hero */}
              <div style={{
                background: 'var(--surface-2)', borderRadius: 'var(--radius)',
                padding: '16px 20px', marginBottom: 20,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div>
                  <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                    Amount
                  </div>
                  <div style={{ fontSize: '1.6rem', fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--ink)' }}>
                    {fmt.currency(detail.amount, detail.currency)}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                  <StatusBadge status={detail.status} />
                  <MethodBadge method={detail.payment_method} />
                </div>
              </div>

              {/* Detail rows */}
              <div>
                <DetailRow icon={Hash} label="Invoice">
                  <span className="td-mono">{detail.invoice_number}</span>
                </DetailRow>
                <DetailRow icon={User} label="Customer">
                  {detail.customer_name}
                </DetailRow>
                <DetailRow icon={Calendar} label="Payment Date">
                  {fmt.date(detail.payment_date)}
                </DetailRow>
                <DetailRow icon={Tag} label="Reference / Transaction ID">
                  {detail.transaction_reference || '—'}
                </DetailRow>
                {detail.notes && (
                  <DetailRow icon={StickyNote} label="Notes">
                    <span style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{detail.notes}</span>
                  </DetailRow>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setDetail(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Record Payment Modal ───────────────────────────────────────────── */}
      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title">Record Payment</h3>
              <button className="btn-close" onClick={closeModal}><X size={18} /></button>
            </div>
            <form onSubmit={save}>
              <div className="modal-body">

                <div className="form-group">
                  <label className="form-label">Invoice <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <select className="form-control" required value={form.invoice} onChange={e => {
                    const inv = invoices.find(i => i.id === e.target.value)
                    setForm(p => ({ ...p, invoice: e.target.value, amount: inv ? inv.balance_due : p.amount }))
                  }}>
                    <option value="">{invoicesLoading ? 'Loading…' : 'Select invoice…'}</option>
                    {invoices.map(i => (
                      <option key={i.id} value={i.id}>
                        {i.number} — {i.customer_name} ({fmt.currency(i.balance_due, i.currency)} due)
                      </option>
                    ))}
                  </select>
                </div>

                {selectedInv && (
                  <div style={{
                    background: 'var(--surface-2)', borderRadius: 'var(--radius)',
                    padding: '10px 14px', marginBottom: 16,
                    fontSize: '0.82rem', color: 'var(--muted)',
                  }}>
                    Balance due: <strong style={{ color: 'var(--ink)' }}>{fmt.currency(selectedInv.balance_due, selectedInv.currency)}</strong>
                  </div>
                )}

                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Amount <span style={{ color: 'var(--danger)' }}>*</span></label>
                    <input className="form-control" type="number" min="0.01" step="0.01" required
                      max={selectedInv ? selectedInv.balance_due : undefined} {...f('amount')} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Payment Date</label>
                    <input className="form-control" type="date" {...f('payment_date')} />
                  </div>
                </div>

                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Payment Method</label>
                    <select className="form-control" {...f('payment_method')}>
                      {METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Reference / Transaction ID</label>
                    <input className="form-control" {...f('transaction_reference')} placeholder="Optional" />
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Notes</label>
                  <textarea className="form-control" {...f('notes')} rows={2} />
                </div>

              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : 'Record Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}