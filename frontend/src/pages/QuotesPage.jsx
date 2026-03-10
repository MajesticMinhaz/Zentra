import { useState, useEffect, useCallback } from 'react'
import {
  getQuotes, createQuote, updateQuote, deleteQuote,
  getCustomers, getItems, sendQuote, acceptQuote, rejectQuote,
  convertQuoteToInvoice, getQuotePdf, downloadPdfUrl,
  getOrganizations,
} from '../utils/api'
import { fmt, getError, today } from '../utils/helpers'
import { Plus, Search, FileText, Trash2, Edit2, X, Send, Check, XCircle, ArrowRight, Download, Eye } from 'lucide-react'
import toast from 'react-hot-toast'

const genRef = () => 'PO-' + (parseInt(crypto.randomUUID().replace(/-/g, '').slice(0, 10), 16) % 100000000).toString().padStart(8, '0')

const EMPTY = {
  customer: '', title: '', reference: '', currency: 'USD',
  issue_date: today(), expiry_date: '',
  discount_type: 'none', discount_value: 0,
  notes: '', terms: '',
  line_items: [{ item: '', description: '', quantity: 1, unit_price: 0, tax_rate: 0 }],
}

function StatusBadge({ status }) {
  const colors = {
    draft: 'badge-draft', sent: 'badge-sent', accepted: 'badge-paid',
    rejected: 'badge-cancelled', expired: 'badge-overdue',
  }
  return <span className={`badge ${colors[status] || 'badge-draft'}`}>{status}</span>
}

export default function QuotesPage() {
  const [quotes, setQuotes] = useState([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(null) // null | 'create' | quote-obj for edit
  const [form, setForm] = useState(EMPTY)
  const [customers, setCustomers] = useState([])
  const [items, setItems] = useState([])
  const [organizations, setOrganizations] = useState([])
  const [saving, setSaving] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({})
  const [pdfLoading, setPdfLoading] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await getQuotes({ search, page_size: 50, ordering: '-created_at' })
      setQuotes(data.results || [])
      setCount(data.count || 0)
    } catch {}
    setLoading(false)
  }, [search])

  useEffect(() => {
    load()
    getCustomers({ page_size: 200 }).then(r => setCustomers(r.data.results || []))
    getItems({ page_size: 200 }).then(r => setItems(r.data.results || []))
    getOrganizations({ page_size: 100 }).then(r => {
      const list = Array.isArray(r.data.results) ? r.data.results : (Array.isArray(r.data) ? r.data : [])
      setOrganizations(list)
    })
  }, [load])

  const setLine = (i, field, val) => {
    const lines = [...form.line_items]
    lines[i] = { ...lines[i], [field]: val }
    if (field === 'item') {
      const found = items.find(it => it.id === val)
      if (found) {
        lines[i].description = found.description || found.name
        lines[i].unit_price = found.unit_price
        lines[i].tax_rate = found.tax_rate || 0
      }
    }
    setForm(p => ({ ...p, line_items: lines }))
  }

  const subtotal = form.line_items.reduce((s, l) => s + (parseFloat(l.quantity) || 0) * (parseFloat(l.unit_price) || 0), 0)
  const tax = form.line_items.reduce((s, l) => {
    const sub = (parseFloat(l.quantity) || 0) * (parseFloat(l.unit_price) || 0)
    return s + sub * (parseFloat(l.tax_rate) || 0) / 100
  }, 0)
  const disc = form.discount_type === 'percentage' ? subtotal * (parseFloat(form.discount_value) || 0) / 100
    : form.discount_type === 'fixed' ? parseFloat(form.discount_value) || 0 : 0
  const total = subtotal + tax - disc

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    setFieldErrors({})
    try {
      const payload = {
        ...form,
        line_items: form.line_items.map(l => ({
          ...l,
          quantity: parseFloat(l.quantity) || 1,
          unit_price: parseFloat(l.unit_price) || 0,
          tax_rate: parseFloat(l.tax_rate) || 0,
        })),
      }
      if (modal === 'create') {
        await createQuote(payload)
        toast.success('Quote created')
      } else {
        await updateQuote(modal.id, payload)
        toast.success('Quote updated')
      }
      setModal(null)
      load()
    } catch (err) {
      const d = err?.response?.data
      if (d && typeof d === 'object') { setFieldErrors(d); toast.error('Please fix errors') }
      else toast.error(getError(err))
    }
    setSaving(false)
  }

  const del = async (q) => {
    if (!confirm(`Delete ${q.number}? This cannot be undone.`)) return
    try { await deleteQuote(q.id); toast.success('Deleted'); load() }
    catch (err) { toast.error(getError(err)) }
  }

  const handleAction = async (action, q) => {
    try {
      if (action === 'send') { await sendQuote(q.id); toast.success('Quote sent') }
      else if (action === 'accept') { await acceptQuote(q.id); toast.success('Quote accepted') }
      else if (action === 'reject') { await rejectQuote(q.id); toast.success('Quote rejected') }
      else if (action === 'convert') {
        await convertQuoteToInvoice(q.id)
        toast.success('Converted to invoice')
      }
      load()
    } catch (err) { toast.error(getError(err)) }
  }

  const handlePdf = async (q) => {
    setPdfLoading(q.id)
    try {
      const { data } = await getQuotePdf(q.id)
      if (data.pdf_url) {
        await downloadPdfUrl(data.pdf_url, `quote-${q.number || q.id}.pdf`)
      } else toast.error('PDF not available')
    } catch (err) { toast.error(getError(err)) }
    setPdfLoading(null)
  }

  const openEdit = (q) => {
    setForm({
      organization: q.organization || '',
      customer: q.customer,
      title: q.title || '',
      reference: q.reference || '',
      currency: q.currency || 'USD',
      issue_date: q.issue_date || today(),
      expiry_date: q.expiry_date || '',
      discount_type: q.discount_type || 'none',
      discount_value: q.discount_value || 0,
      notes: q.notes || '',
      terms: q.terms || '',
      line_items: q.line_items?.length
        ? q.line_items.map(l => ({ item: l.item || '', description: l.description, quantity: l.quantity, unit_price: l.unit_price, tax_rate: l.tax_rate }))
        : [{ item: '', description: '', quantity: 1, unit_price: 0, tax_rate: 0 }],
    })
    setFieldErrors({})
    setModal(q)
  }

  const openCreate = () => {
    const def = organizations.find(o => o.is_default) || organizations[0]
    setForm({
      ...EMPTY,
      reference: genRef(),
      organization: def?.id || '',
      notes: def?.default_quote_notes || '',
      terms: def?.default_quote_terms || '',
    })
    setFieldErrors({})
    setModal('create')
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h2 className="page-title">Quotes</h2>
          <p className="page-subtitle">{count} quotes</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>
          <Plus size={15} /> New Quote
        </button>
      </div>

      <div className="page-body">
        <div className="toolbar">
          <div className="search-wrap">
            <Search />
            <input className="search-input" placeholder="Search quotes…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
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
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8}><div className="loading"><div className="spinner" /></div></td></tr>
              ) : quotes.length === 0 ? (
                <tr><td colSpan={8}>
                  <div className="empty-state"><FileText /><h3>No quotes yet</h3><p>Create your first quote to get started</p></div>
                </td></tr>
              ) : quotes.map(q => (
                <tr key={q.id}>
                  <td><span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{q.number}</span></td>
                  <td style={{ fontWeight: 500 }}>{q.customer_name}</td>
                  <td className="td-muted">{q.title || '—'}</td>
                  <td className="td-muted">{fmt.date(q.issue_date)}</td>
                  <td className="td-muted" style={{ color: q.is_expired ? 'var(--danger)' : 'inherit' }}>
                    {q.expiry_date ? fmt.date(q.expiry_date) : '—'}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt.currency(q.total, q.currency)}</td>
                  <td><StatusBadge status={q.status} /></td>
                  <td>
                    <div className="action-row">
                      {/* PDF */}
                      <button
                        className="btn btn-ghost btn-sm"
                        title="Download PDF"
                        onClick={() => handlePdf(q)}
                        disabled={pdfLoading === q.id}
                      >
                        {pdfLoading === q.id ? <div className="spinner" style={{ width: 12, height: 12 }} /> : <Download size={13} />}
                      </button>

                      {/* Edit — only draft */}
                      {q.status === 'draft' && (
                        <button className="btn btn-ghost btn-sm" title="Edit" onClick={() => openEdit(q)}>
                          <Edit2 size={13} />
                        </button>
                      )}

                      {/* Status actions */}
                      {q.status === 'draft' && (
                        <button className="btn btn-ghost btn-sm" title="Send" onClick={() => handleAction('send', q)}>
                          <Send size={13} />
                        </button>
                      )}
                      {q.status === 'sent' && (
                        <>
                          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--success)' }} title="Accept" onClick={() => handleAction('accept', q)}>
                            <Check size={13} />
                          </button>
                          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} title="Reject" onClick={() => handleAction('reject', q)}>
                            <XCircle size={13} />
                          </button>
                        </>
                      )}
                      {q.status === 'accepted' && (
                        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--accent)' }} title="Convert to Invoice" onClick={() => handleAction('convert', q)}>
                          <ArrowRight size={13} />
                        </button>
                      )}

                      {/* Delete — only draft */}
                      {q.status === 'draft' && (
                        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} title="Delete" onClick={() => del(q)}>
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit modal */}
      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal modal-lg" style={{ maxWidth: 860 }}>
            <div className="modal-header">
              <h3 className="modal-title">{modal === 'create' ? 'New Quote' : `Edit — ${modal.number}`}</h3>
              <button className="btn-close" onClick={() => setModal(null)}><X size={18} /></button>
            </div>
            <form onSubmit={save}>
              <div className="modal-body" style={{ maxHeight: '75vh', overflowY: 'auto' }}>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Organization</label>
                    <select
                      className="form-control"
                      value={form.organization || ''}
                      onChange={e => {
                        const orgId = e.target.value
                        const org = organizations.find(o => o.id === orgId)
                        setForm(p => ({
                          ...p,
                          organization: orgId,
                          ...(modal === 'create' && org ? {
                            notes: org.default_quote_notes || '',
                            terms: org.default_quote_terms || '',
                          } : {}),
                        }))
                      }}
                    >
                      <option value="">— No organization —</option>
                      {organizations.map(o => (
                        <option key={o.id} value={o.id}>{o.name}{o.is_default ? ' (default)' : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Customer *</label>
                    <select className="form-control" required value={form.customer} onChange={e => setForm(p => ({ ...p, customer: e.target.value }))}>
                      <option value="">Select customer…</option>
                      {customers.map(c => <option key={c.id} value={c.id}>{c.display_name}</option>)}
                    </select>
                    {fieldErrors.customer && <p style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: 4 }}>{[].concat(fieldErrors.customer)[0]}</p>}
                  </div>
                  <div className="form-group">
                    <label className="form-label">Title</label>
                    <input className="form-control" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Project name or description" />
                  </div>
                </div>

                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Reference</label>
                    <input className="form-control" value={form.reference} onChange={e => setForm(p => ({ ...p, reference: e.target.value }))} placeholder="PO number, etc." />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Currency</label>
                    <select className="form-control" value={form.currency} onChange={e => setForm(p => ({ ...p, currency: e.target.value }))}>
                      <option>USD</option><option>EUR</option><option>GBP</option><option>BDT</option><option>CAD</option><option>AUD</option>
                    </select>
                  </div>
                </div>

                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Issue Date</label>
                    <input className="form-control" type="date" value={form.issue_date} onChange={e => setForm(p => ({ ...p, issue_date: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Expiry Date</label>
                    <input className="form-control" type="date" value={form.expiry_date} onChange={e => setForm(p => ({ ...p, expiry_date: e.target.value }))} />
                  </div>
                </div>

                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Discount Type</label>
                    <select className="form-control" value={form.discount_type} onChange={e => setForm(p => ({ ...p, discount_type: e.target.value }))}>
                      <option value="none">No Discount</option>
                      <option value="percentage">Percentage (%)</option>
                      <option value="fixed">Fixed Amount</option>
                    </select>
                  </div>
                  {form.discount_type !== 'none' && (
                    <div className="form-group">
                      <label className="form-label">Discount Value {form.discount_type === 'percentage' ? '(%)' : `(${form.currency})`}</label>
                      <input className="form-control" type="number" min="0" step="0.01" value={form.discount_value} onChange={e => setForm(p => ({ ...p, discount_value: e.target.value }))} />
                    </div>
                  )}
                </div>

                <p style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--muted)', marginBottom: 8, marginTop: 8 }}>LINE ITEMS</p>
                <div className="line-items-table" style={{ marginBottom: 8 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Description</th>
                        <th style={{ width: 70 }}>Qty</th>
                        <th style={{ width: 100 }}>Price</th>
                        <th style={{ width: 70 }}>Tax%</th>
                        <th style={{ width: 90, textAlign: 'right' }}>Total</th>
                        <th style={{ width: 36 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {form.line_items.map((l, i) => (
                        <tr key={i}>
                          <td>
                            <select className="form-control" value={l.item || ''} onChange={e => setLine(i, 'item', e.target.value)}>
                              <option value="">Custom</option>
                              {items.map(it => <option key={it.id} value={it.id}>{it.name}</option>)}
                            </select>
                          </td>
                          <td><input className="form-control" value={l.description || ''} onChange={e => setLine(i, 'description', e.target.value)} /></td>
                          <td><input className="form-control" type="number" min="0.001" step="0.001" value={l.quantity} onChange={e => setLine(i, 'quantity', e.target.value)} /></td>
                          <td><input className="form-control" type="number" min="0" step="0.01" value={l.unit_price} onChange={e => setLine(i, 'unit_price', e.target.value)} /></td>
                          <td><input className="form-control" type="number" min="0" step="0.01" value={l.tax_rate} onChange={e => setLine(i, 'tax_rate', e.target.value)} /></td>
                          <td style={{ textAlign: 'right', fontWeight: 500, fontSize: '0.82rem' }}>
                            {fmt.currency((parseFloat(l.quantity) || 0) * (parseFloat(l.unit_price) || 0), form.currency)}
                          </td>
                          <td>
                            <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)', padding: 4 }}
                              onClick={() => setForm(p => ({ ...p, line_items: p.line_items.filter((_, idx) => idx !== i) }))}
                              disabled={form.line_items.length === 1}>
                              <Trash2 size={12} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button type="button" className="btn btn-secondary btn-sm" style={{ marginBottom: 16 }}
                  onClick={() => setForm(p => ({ ...p, line_items: [...p.line_items, { item: '', description: '', quantity: 1, unit_price: 0, tax_rate: 0 }] }))}>
                  <Plus size={13} /> Add Line
                </button>

                <div className="totals-box" style={{ marginLeft: 'auto', width: 260, marginBottom: 16 }}>
                  <div className="totals-row"><span>Subtotal</span><span>{fmt.currency(subtotal, form.currency)}</span></div>
                  {tax > 0 && <div className="totals-row"><span>Tax</span><span>{fmt.currency(tax, form.currency)}</span></div>}
                  {disc > 0 && <div className="totals-row" style={{ color: 'var(--success)' }}><span>Discount</span><span>-{fmt.currency(disc, form.currency)}</span></div>}
                  <div className="totals-row total"><span>Total</span><span>{fmt.currency(total, form.currency)}</span></div>
                </div>

                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Notes</label>
                    <textarea className="form-control" rows={3} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Terms & Conditions</label>
                    <textarea className="form-control" rows={3} value={form.terms} onChange={e => setForm(p => ({ ...p, terms: e.target.value }))} />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : modal === 'create' ? 'Create Quote' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}