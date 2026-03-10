import { useState, useEffect } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import {
  getQuote, createQuote, updateQuote, deleteQuote,
  getCustomers, getItems, getOrganizations,
  sendQuote, acceptQuote, rejectQuote,
  convertQuoteToInvoice, getQuotePdf, downloadPdfUrl,
} from '../utils/api'
import { fmt, getError, today } from '../utils/helpers'
import { ArrowLeft, Plus, Trash2, Send, X, Check, XCircle, ArrowRight, Download } from 'lucide-react'
import toast from 'react-hot-toast'

const EMPTY_LINE = { item: '', description: '', quantity: 1, unit_price: 0, tax_rate: 0 }

const genRef = () =>
  'PO-' + (parseInt(crypto.randomUUID().replace(/-/g, '').slice(0, 10), 16) % 100000000)
    .toString().padStart(8, '0')

const EMPTY_QUOTE = {
  organization: '', customer: '', title: '', reference: genRef(),
  currency: 'USD', issue_date: today(), expiry_date: '',
  discount_type: 'none', discount_value: 0,
  notes: '', terms: '',
  line_items: [{ ...EMPTY_LINE }],
}

export default function QuoteFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isNew = !id || id === 'new'

  const [form, setForm] = useState(EMPTY_QUOTE)
  const [quote, setQuote] = useState(null)
  const [customers, setCustomers] = useState([])
  const [items, setItems] = useState([])
  const [organizations, setOrganizations] = useState([])
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [converting, setConverting] = useState(false)

  useEffect(() => {
    if (isNew) setForm(p => ({ ...p, reference: genRef() }))
    getCustomers({ page_size: 200 }).then(r => setCustomers(r.data.results || []))
    getItems({ page_size: 200 }).then(r => setItems(r.data.results || []))
    getOrganizations({ page_size: 100 }).then(r => {
      const list = Array.isArray(r.data.results) ? r.data.results : (Array.isArray(r.data) ? r.data : [])
      setOrganizations(list)
      if (isNew) {
        const def = list.find(o => o.is_default) || list[0]
        if (def) {
          setForm(p => ({
            ...p,
            organization: def.id,
            notes: p.notes || def.default_quote_notes || '',
            terms: p.terms || def.default_quote_terms || '',
          }))
        }
      }
    })
    if (!isNew) {
      getQuote(id).then(r => {
        setQuote(r.data)
        setForm({
          ...r.data,
          customer: r.data.customer,
          organization: r.data.organization || '',
          line_items: r.data.line_items?.length
            ? r.data.line_items
            : [{ ...EMPTY_LINE }],
        })
        setLoading(false)
      })
    }
  }, [id])

  const setF = (field, val) => setForm(p => ({ ...p, [field]: val }))

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

  const addLine = () => setForm(p => ({ ...p, line_items: [...p.line_items, { ...EMPTY_LINE }] }))
  const removeLine = (i) => setForm(p => ({ ...p, line_items: p.line_items.filter((_, idx) => idx !== i) }))

  const lineTotal = (l) => {
    const sub = (parseFloat(l.quantity) || 0) * (parseFloat(l.unit_price) || 0)
    return sub + sub * (parseFloat(l.tax_rate) || 0) / 100
  }
  const subtotal = form.line_items.reduce((s, l) =>
    s + (parseFloat(l.quantity) || 0) * (parseFloat(l.unit_price) || 0), 0)
  const taxTotal = form.line_items.reduce((s, l) => {
    const sub = (parseFloat(l.quantity) || 0) * (parseFloat(l.unit_price) || 0)
    return s + sub * (parseFloat(l.tax_rate) || 0) / 100
  }, 0)
  const discountAmt = form.discount_type === 'percentage'
    ? subtotal * (parseFloat(form.discount_value) || 0) / 100
    : form.discount_type === 'fixed' ? parseFloat(form.discount_value) || 0 : 0
  const total = subtotal + taxTotal - discountAmt

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = {
        ...form,
        expiry_date: form.expiry_date || null,
        line_items: form.line_items.map(l => ({
          ...l,
          quantity: parseFloat(l.quantity) || 1,
          unit_price: parseFloat(l.unit_price) || 0,
          tax_rate: parseFloat(l.tax_rate) || 0,
        })),
      }
      if (isNew) {
        const { data } = await createQuote(payload)
        toast.success('Quote created')
        navigate(`/quotes/${data.id}`)
      } else {
        await updateQuote(id, payload)
        toast.success('Saved')
        navigate(`/quotes/${id}`)
      }
    } catch (err) { toast.error(getError(err)) }
    setSaving(false)
  }

  const handleSend = async () => {
    if (!confirm('Send this quote to the customer?')) return
    try {
      await sendQuote(id)
      toast.success('Quote sent')
      const { data } = await getQuote(id)
      setQuote(data)
    } catch (err) { toast.error(getError(err)) }
  }

  const handleAccept = async () => {
    if (!confirm('Mark this quote as accepted?')) return
    try {
      await acceptQuote(id)
      toast.success('Quote accepted')
      const { data } = await getQuote(id)
      setQuote(data)
    } catch (err) { toast.error(getError(err)) }
  }

  const handleReject = async () => {
    if (!confirm('Reject this quote?')) return
    try {
      await rejectQuote(id)
      toast.success('Quote rejected')
      const { data } = await getQuote(id)
      setQuote(data)
    } catch (err) { toast.error(getError(err)) }
  }

  const handleConvert = async () => {
    if (!confirm('Convert this accepted quote into an invoice?')) return
    setConverting(true)
    try {
      const { data } = await convertQuoteToInvoice(id)
      toast.success('Converted to invoice!')
      navigate(`/invoices/${data.id}`)
    } catch (err) { toast.error(getError(err)) }
    setConverting(false)
  }

  const handleDelete = async () => {
    if (!confirm('Delete this draft quote? This cannot be undone.')) return
    try { await deleteQuote(id); toast.success('Deleted'); navigate('/quotes') }
    catch (err) { toast.error(getError(err)) }
  }

  const handleDownloadPdf = async () => {
    setPdfLoading(true)
    try {
      const { data } = await getQuotePdf(id)
      if (data.pdf_url) {
        await downloadPdfUrl(data.pdf_url, `quote-${quote?.number || id}.pdf`)
      } else {
        toast.error('PDF not available — try again')
      }
    } catch (err) { toast.error(getError(err)) }
    setPdfLoading(false)
  }

  if (loading) return <div className="loading"><div className="spinner" /></div>

  const isDraft = quote?.status === 'draft' || isNew
  const canEdit = isDraft

  return (
    <>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Link to="/quotes" className="btn btn-ghost btn-sm"><ArrowLeft /></Link>
          <div>
            <h2 className="page-title">
              {isNew ? 'New Quote' : quote?.number}
            </h2>
            {quote && (
              <p className="page-subtitle">
                {quote.customer_name} · <span className={`badge badge-${quote.status}`}>{quote.status}</span>
                {quote.title ? ` · ${quote.title}` : ''}
              </p>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          {/* Draft actions */}
          {!isNew && quote?.status === 'draft' && (
            <>
              <button className="btn btn-secondary" onClick={handleDelete} style={{ color: 'var(--danger)' }}>
                <Trash2 size={15} /> Delete
              </button>
              <button className="btn btn-primary" onClick={handleSend}>
                <Send size={15} /> Send Quote
              </button>
            </>
          )}

          {/* Sent actions */}
          {!isNew && quote?.status === 'sent' && (
            <>
              <button className="btn btn-secondary" style={{ color: 'var(--danger)' }} onClick={handleReject}>
                <XCircle size={15} /> Reject
              </button>
              <button className="btn btn-primary" onClick={handleAccept}>
                <Check size={15} /> Accept
              </button>
            </>
          )}

          {/* Accepted — convert to invoice */}
          {!isNew && quote?.status === 'accepted' && (
            <button className="btn btn-primary" onClick={handleConvert} disabled={converting}>
              <ArrowRight size={15} /> {converting ? 'Converting…' : 'Convert to Invoice'}
            </button>
          )}
        </div>
      </div>

      <div className="page-body">
        <form onSubmit={save}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20 }}>

            {/* ── Main column ── */}
            <div>
              <div className="card" style={{ marginBottom: 20 }}>
                <div className="card-header">
                  <span className="card-title">Quote Details</span>
                </div>
                <div className="card-body">
                  <div className="form-grid">
                    <div className="form-group">
                      <label className="form-label">Organization</label>
                      <select
                        className="form-control"
                        value={form.organization || ''}
                        onChange={e => {
                          const orgId = e.target.value
                          setF('organization', orgId)
                          const org = organizations.find(o => o.id === orgId)
                          if (org && isNew) {
                            setForm(p => ({
                              ...p,
                              organization: orgId,
                              notes: org.default_quote_notes || '',
                              terms: org.default_quote_terms || '',
                            }))
                          }
                        }}
                        disabled={!canEdit}
                      >
                        <option value="">— No organization —</option>
                        {organizations.map(o => (
                          <option key={o.id} value={o.id}>
                            {o.name}{o.is_default ? ' (default)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Customer *</label>
                      <select
                        className="form-control"
                        required
                        value={form.customer}
                        onChange={e => setF('customer', e.target.value)}
                        disabled={!canEdit}
                      >
                        <option value="">Select customer…</option>
                        {customers.map(c => <option key={c.id} value={c.id}>{c.display_name}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Title</label>
                      <input
                        className="form-control"
                        value={form.title || ''}
                        onChange={e => setF('title', e.target.value)}
                        placeholder="Project name or brief description"
                        disabled={!canEdit}
                      />
                    </div>
                  </div>
                  <div className="form-grid">
                    <div className="form-group">
                      <label className="form-label">Issue Date</label>
                      <input className="form-control" type="date" value={form.issue_date}
                        onChange={e => setF('issue_date', e.target.value)} disabled={!canEdit} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Expiry Date</label>
                      <input className="form-control" type="date" value={form.expiry_date || ''}
                        onChange={e => setF('expiry_date', e.target.value)} disabled={!canEdit} />
                    </div>
                  </div>
                  <div className="form-grid">
                    <div className="form-group">
                      <label className="form-label">Reference</label>
                      <input className="form-control" value={form.reference || ''}
                        onChange={e => setF('reference', e.target.value)}
                        placeholder="PO number, etc." disabled={!canEdit} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Currency</label>
                      <select className="form-control" value={form.currency}
                        onChange={e => setF('currency', e.target.value)} disabled={!canEdit}>
                        <option>USD</option><option>EUR</option><option>GBP</option>
                        <option>BDT</option><option>AUD</option><option>CAD</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Line Items */}
              <div className="card" style={{ marginBottom: 20 }}>
                <div className="card-header">
                  <span className="card-title">Line Items</span>
                  {canEdit && (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={addLine}>
                      <Plus size={13} /> Add Line
                    </button>
                  )}
                </div>
                <div className="card-body" style={{ padding: 0 }}>
                  <div className="line-items-table">
                    <table>
                      <thead>
                        <tr>
                          <th style={{ width: '28%' }}>Item</th>
                          <th>Description</th>
                          <th style={{ width: '80px' }}>Qty</th>
                          <th style={{ width: '110px' }}>Unit Price</th>
                          <th style={{ width: '80px' }}>Tax %</th>
                          <th style={{ width: '110px', textAlign: 'right' }}>Total</th>
                          {canEdit && <th style={{ width: '40px' }}></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {form.line_items.map((l, i) => (
                          <tr key={i}>
                            <td>
                              <select className="form-control" value={l.item || ''}
                                onChange={e => setLine(i, 'item', e.target.value)} disabled={!canEdit}>
                                <option value="">Custom…</option>
                                {items.map(it => <option key={it.id} value={it.id}>{it.name}</option>)}
                              </select>
                            </td>
                            <td>
                              <input className="form-control" value={l.description || ''}
                                onChange={e => setLine(i, 'description', e.target.value)}
                                placeholder="Description" disabled={!canEdit} />
                            </td>
                            <td>
                              <input className="form-control" type="number" min="0.001" step="0.001"
                                value={l.quantity} onChange={e => setLine(i, 'quantity', e.target.value)}
                                disabled={!canEdit} />
                            </td>
                            <td>
                              <input className="form-control" type="number" min="0" step="0.01"
                                value={l.unit_price} onChange={e => setLine(i, 'unit_price', e.target.value)}
                                disabled={!canEdit} />
                            </td>
                            <td>
                              <input className="form-control" type="number" min="0" step="0.01"
                                value={l.tax_rate} onChange={e => setLine(i, 'tax_rate', e.target.value)}
                                disabled={!canEdit} />
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 500, fontSize: '0.85rem' }}>
                              {fmt.currency(lineTotal(l), form.currency)}
                            </td>
                            {canEdit && (
                              <td>
                                <button type="button" className="btn btn-ghost btn-sm"
                                  onClick={() => removeLine(i)}
                                  style={{ color: 'var(--danger)', padding: '4px' }}
                                  disabled={form.line_items.length === 1}>
                                  <Trash2 size={13} />
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Totals */}
                  <div style={{ padding: '16px 20px' }}>
                    <div className="totals-box">
                      <div className="totals-row"><span>Subtotal</span><span>{fmt.currency(subtotal, form.currency)}</span></div>
                      {taxTotal > 0 && <div className="totals-row"><span>Tax</span><span>{fmt.currency(taxTotal, form.currency)}</span></div>}
                      {discountAmt > 0 && <div className="totals-row" style={{ color: 'var(--success)' }}><span>Discount</span><span>−{fmt.currency(discountAmt, form.currency)}</span></div>}
                      <div className="totals-row total"><span>Total</span><span>{fmt.currency(total, form.currency)}</span></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Notes & Terms */}
              <div className="card">
                <div className="card-header"><span className="card-title">Notes & Terms</span></div>
                <div className="card-body">
                  <div className="form-grid">
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Notes</label>
                      <textarea className="form-control" value={form.notes || ''}
                        onChange={e => setF('notes', e.target.value)} rows={3} disabled={!canEdit} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Terms & Conditions</label>
                      <textarea className="form-control" value={form.terms || ''}
                        onChange={e => setF('terms', e.target.value)} rows={3} disabled={!canEdit} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Sidebar ── */}
            <div>
              {/* Discount */}
              {canEdit && (
                <div className="card" style={{ marginBottom: 16 }}>
                  <div className="card-header"><span className="card-title">Discount</span></div>
                  <div className="card-body">
                    <div className="form-group">
                      <label className="form-label">Discount Type</label>
                      <select className="form-control" value={form.discount_type}
                        onChange={e => setF('discount_type', e.target.value)}>
                        <option value="none">No Discount</option>
                        <option value="percentage">Percentage %</option>
                        <option value="fixed">Fixed Amount</option>
                      </select>
                    </div>
                    {form.discount_type !== 'none' && (
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Value</label>
                        <input className="form-control" type="number" min="0" step="0.01"
                          value={form.discount_value || ''}
                          onChange={e => setF('discount_value', e.target.value)} />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Save / Cancel */}
              {canEdit && (
                <div className="card" style={{ marginBottom: 16 }}>
                  <div className="card-body">
                    <button type="submit" className="btn btn-primary"
                      style={{ width: '100%', justifyContent: 'center', marginBottom: 10 }}
                      disabled={saving}>
                      {saving ? 'Saving…' : isNew ? 'Create Quote' : 'Save Changes'}
                    </button>
                    <button type="button" className="btn btn-secondary"
                      style={{ width: '100%', justifyContent: 'center' }}
                      onClick={() => navigate('/quotes')}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Summary (view mode) */}
              {!isNew && quote && (
                <div className="card">
                  <div className="card-header"><span className="card-title">Summary</span></div>
                  <div className="card-body" style={{ fontSize: '0.85rem' }}>
                    {[
                      ['Status', <span className={`badge badge-${quote.status}`}>{quote.status}</span>],
                      ['Total', <strong>{fmt.currency(quote.total, quote.currency)}</strong>],
                      ['Issue Date', fmt.date(quote.issue_date)],
                      quote.expiry_date && ['Expiry', <span style={{ color: quote.is_expired ? 'var(--danger)' : 'inherit' }}>{fmt.date(quote.expiry_date)}</span>],
                      quote.sent_at && ['Sent', fmt.date(quote.sent_at)],
                      quote.accepted_at && ['Accepted', <span style={{ color: 'var(--success)', fontWeight: 600 }}>✓ {fmt.date(quote.accepted_at)}</span>],
                      quote.rejected_at && ['Rejected', <span style={{ color: 'var(--danger)' }}>{fmt.date(quote.rejected_at)}</span>],
                    ].filter(Boolean).map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ color: 'var(--muted)' }}>{k}</span>
                        <span>{v}</span>
                      </div>
                    ))}

                    <button type="button" className="btn btn-secondary"
                      style={{ width: '100%', justifyContent: 'center', marginTop: 14 }}
                      onClick={handleDownloadPdf} disabled={pdfLoading}>
                      <Download size={14} /> {pdfLoading ? 'Generating PDF…' : 'Download PDF'}
                    </button>

                    {/* Convert to Invoice — prominent CTA in sidebar too */}
                    {quote.status === 'accepted' && (
                      <button type="button" className="btn btn-primary"
                        style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
                        onClick={handleConvert} disabled={converting}>
                        <ArrowRight size={14} /> {converting ? 'Converting…' : 'Convert to Invoice'}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </form>
      </div>
    </>
  )
}