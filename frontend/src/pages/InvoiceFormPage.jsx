import { useState, useEffect } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { getInvoice, createInvoice, updateInvoice, getCustomers, getItems, sendInvoice, cancelInvoice, deleteInvoice, generateInvoicePdf, getInvoicePdf, downloadPdfUrl, createPayment, getOrganizations, getDefaultOrganization } from '../utils/api'
import { fmt, getError, today } from '../utils/helpers'
import { ArrowLeft, Plus, Trash2, Send, X, CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'

const EMPTY_LINE = { item: '', description: '', quantity: 1, unit_price: 0, tax_rate: 0 }

const genRef = () => 'PO-' + (parseInt(crypto.randomUUID().replace(/-/g, '').slice(0, 10), 16) % 100000000).toString().padStart(8, '0')

const EMPTY_INVOICE = {
  invoice_type: 'sales', customer: '', reference: genRef(), currency: 'USD',
  issue_date: today(), due_date: '',
  discount_type: 'none', discount_value: 0,
  notes: '', terms: '',
  line_items: [{ ...EMPTY_LINE }],
}

export default function InvoiceFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isNew = !id || id === 'new'

  const [form, setForm] = useState(EMPTY_INVOICE)
  const [invoice, setInvoice] = useState(null)
  const [customers, setCustomers] = useState([])
  const [items, setItems] = useState([])
  const [organizations, setOrganizations] = useState([])
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [markingPaid, setMarkingPaid] = useState(false)

  useEffect(() => {
    // Generate a fresh PO reference for every new invoice
    if (isNew) setForm(p => ({ ...p, reference: genRef() }))
    getCustomers({ page_size: 200 }).then(r => setCustomers(r.data.results || []))
    getItems({ page_size: 200 }).then(r => setItems(r.data.results || []))
    getOrganizations({ page_size: 100 }).then(r => {
      const list = Array.isArray(r.data.results) ? r.data.results : (Array.isArray(r.data) ? r.data : [])
      setOrganizations(list)
      // Pre-select default org on new invoices
      if (isNew) {
        const def = list.find(o => o.is_default) || list[0]
        if (def) {
          setForm(p => ({
            ...p,
            organization: def.id,
            notes: p.notes || def.default_invoice_notes || '',
            terms: p.terms || def.default_invoice_terms || '',
          }))
        }
      }
    })
    if (!isNew) {
      getInvoice(id).then(r => {
        setInvoice(r.data)
        setForm({
          ...r.data,
          customer: r.data.customer,
          organization: r.data.organization || '',
          line_items: r.data.line_items?.length ? r.data.line_items : [{ ...EMPTY_LINE }]
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
    return sub + (sub * (parseFloat(l.tax_rate) || 0) / 100)
  }
  const subtotal = form.line_items.reduce((s, l) => s + (parseFloat(l.quantity)||0)*(parseFloat(l.unit_price)||0), 0)
  const taxTotal = form.line_items.reduce((s, l) => {
    const sub = (parseFloat(l.quantity)||0)*(parseFloat(l.unit_price)||0)
    return s + sub * (parseFloat(l.tax_rate)||0)/100
  }, 0)
  const discountAmt = form.discount_type === 'percentage'
    ? subtotal * (parseFloat(form.discount_value)||0) / 100
    : form.discount_type === 'fixed' ? parseFloat(form.discount_value)||0 : 0
  const total = subtotal + taxTotal - discountAmt

  const isCreditNote = form.invoice_type === 'credit_note'
  const isReceipt = form.invoice_type === 'receipt'
  const typeLabel = isCreditNote ? 'Credit Note' : isReceipt ? 'Receipt' : 'Invoice'

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = {
        ...form,
        // Receipts have no due date — payment is immediate on creation
        due_date: isReceipt ? null : (form.due_date || null),
        line_items: form.line_items.map(l => ({
          ...l,
          quantity: parseFloat(l.quantity) || 1,
          unit_price: parseFloat(l.unit_price) || 0,
          tax_rate: parseFloat(l.tax_rate) || 0,
        }))
      }
      if (isNew) {
        const { data } = await createInvoice(payload)
        toast.success(`${typeLabel} created`)
        navigate(`/invoices/${data.id}`)
      } else {
        await updateInvoice(id, payload)
        toast.success('Saved')
        navigate(`/invoices/${id}`)
      }
    } catch (err) { toast.error(getError(err)) }
    setSaving(false)
  }

  const handleSend = async () => {
    if (!confirm(isCreditNote ? 'Issue this credit note to the customer?' : 'Send this invoice?')) return
    try {
      await sendInvoice(id)
      toast.success(isCreditNote ? 'Credit note issued' : 'Invoice sent')
      const { data } = await getInvoice(id)
      setInvoice(data)
    } catch (err) { toast.error(getError(err)) }
  }

  const handleMarkCreditNotePaid = async () => {
    if (!confirm('Mark this credit note as settled? This will add the amount to the customer\'s credit balance.')) return
    setMarkingPaid(true)
    try {
      await createPayment({
        invoice: id,
        amount: parseFloat(invoice.balance_due),
        payment_date: today(),
        payment_method: 'other',
        transaction_reference: 'Credit note settled',
        notes: 'Credit note marked as settled — credit added to customer balance',
      })
      toast.success('Credit note settled — credit balance updated')
      const { data } = await getInvoice(id)
      setInvoice(data)
    } catch (err) { toast.error(getError(err)) }
    setMarkingPaid(false)
  }

  const handleCancel = async () => {
    if (!confirm(`Cancel this ${typeLabel.toLowerCase()}?`)) return
    try {
      await cancelInvoice(id)
      toast.success('Cancelled')
      navigate('/invoices')
    } catch (err) { toast.error(getError(err)) }
  }

  const handleDelete = async () => {
    if (!confirm(`Delete this draft ${typeLabel.toLowerCase()}?`)) return
    try { await deleteInvoice(id); toast.success('Deleted'); navigate('/invoices') }
    catch (err) { toast.error(getError(err)) }
  }

  const handleDownloadPdf = async () => {
    setPdfLoading(true)
    try {
      const { data } = await generateInvoicePdf(id)
      const pdfUrl = data.pdf_url || (await getInvoicePdf(id)).data.pdf_url
      if (pdfUrl) {
        await downloadPdfUrl(pdfUrl, `invoice-${invoice?.number || id}.pdf`)
      } else {
        toast.error('PDF not available — try again')
      }
    } catch (err) { toast.error(getError(err)) }
    setPdfLoading(false)
  }

  if (loading) return <div className="loading"><div className="spinner" /></div>

  const isDraft = invoice?.status === 'draft' || isNew
  const canEdit = isDraft

  return (
    <>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Link to="/invoices" className="btn btn-ghost btn-sm"><ArrowLeft /></Link>
          <div>
            <h2 className="page-title">
              {isNew
                ? `New ${typeLabel}`
                : invoice?.number}
            </h2>
            {invoice && (
              <p className="page-subtitle">
                {invoice.customer_name} · <span className={`badge badge-${invoice.status}`}>{invoice.status.replace('_', ' ')}</span>
              </p>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {/* Draft actions — receipts go straight to PAID on save, no send needed */}
          {!isNew && invoice?.status === 'draft' && !isReceipt && (
            <>
              <button className="btn btn-secondary" onClick={handleDelete} style={{ color: 'var(--danger)' }}>
                <Trash2 size={15} /> Delete
              </button>
              <button className="btn btn-primary" onClick={handleSend}>
                <Send size={15} /> {isCreditNote ? 'Issue Credit Note' : 'Send Invoice'}
              </button>
            </>
          )}
          {!isNew && invoice?.status === 'draft' && isReceipt && (
            <button className="btn btn-secondary" onClick={handleDelete} style={{ color: 'var(--danger)' }}>
              <Trash2 size={15} /> Delete
            </button>
          )}
          {!isNew && invoice?.status === 'sent' && (
            <>
              {isCreditNote && (
                <button className="btn btn-primary" onClick={handleMarkCreditNotePaid} disabled={markingPaid}>
                  <CheckCircle size={15} /> {markingPaid ? 'Processing…' : 'Mark as Settled'}
                </button>
              )}
              {!isReceipt && (
                <button className="btn btn-secondary" onClick={handleCancel}><X size={15} /> Cancel</button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="page-body">
        <form onSubmit={save}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20 }}>
            {/* Main */}
            <div>
              <div className="card" style={{ marginBottom: 20 }}>
                <div className="card-header">
                  <span className="card-title">{isReceipt ? 'Receipt Details' : isCreditNote ? 'Credit Note Details' : 'Invoice Details'}</span>
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
                          // Auto-fill default notes/terms from chosen org
                          const org = organizations.find(o => o.id === orgId)
                          if (org && isNew) {
                            const typeKey = form.invoice_type === 'retainer' ? 'retainer'
                              : form.invoice_type === 'credit_note' ? 'credit_note'
                              : form.invoice_type === 'receipt' ? 'receipt' : 'invoice'
                            setForm(p => ({
                              ...p,
                              organization: orgId,
                              notes: org[`default_${typeKey}_notes`] || '',
                              terms: org[`default_${typeKey}_terms`] || '',
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
                      <select className="form-control" required value={form.customer} onChange={e => setF('customer', e.target.value)} disabled={!canEdit}>
                        <option value="">Select customer…</option>
                        {customers.map(c => <option key={c.id} value={c.id}>{c.display_name}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Invoice Type</label>
                      <select className="form-control" value={form.invoice_type} onChange={e => {
                        const newType = e.target.value
                        const typeKey = newType === 'retainer' ? 'retainer'
                          : newType === 'credit_note' ? 'credit_note'
                          : newType === 'receipt' ? 'receipt' : 'invoice'
                        const org = organizations.find(o => o.id === form.organization)
                        setForm(p => ({
                          ...p,
                          invoice_type: newType,
                          ...(isNew && org ? {
                            notes: org[`default_${typeKey}_notes`] || '',
                            terms: org[`default_${typeKey}_terms`] || '',
                          } : {})
                        }))
                      }} disabled={!canEdit}>
                        <option value="sales">Sales Invoice</option>
                        <option value="retainer">Retainer Invoice</option>
                        <option value="receipt">Sales Receipt</option>
                        <option value="credit_note">Credit Note</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-grid">
                    <div className="form-group">
                      <label className="form-label">{isReceipt ? 'Receipt Date' : 'Issue Date'}</label>
                      <input className="form-control" type="date" value={form.issue_date} onChange={e => setF('issue_date', e.target.value)} disabled={!canEdit} />
                    </div>
                    {/* Due date is irrelevant for receipts (paid immediately) */}
                    {!isReceipt && (
                      <div className="form-group">
                        <label className="form-label">Due Date</label>
                        <input className="form-control" type="date" value={form.due_date || ''} onChange={e => setF('due_date', e.target.value)} disabled={!canEdit} />
                      </div>
                    )}
                  </div>
                  <div className="form-grid">
                    <div className="form-group">
                      <label className="form-label">Reference</label>
                      <input className="form-control" value={form.reference || ''} onChange={e => setF('reference', e.target.value)} placeholder="PO number, etc." disabled={!canEdit} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Currency</label>
                      <select className="form-control" value={form.currency} onChange={e => setF('currency', e.target.value)} disabled={!canEdit}>
                        <option>USD</option><option>EUR</option><option>GBP</option><option>BDT</option><option>AUD</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Line Items */}
              <div className="card" style={{ marginBottom: 20 }}>
                <div className="card-header">
                  <span className="card-title">Line Items</span>
                  {canEdit && <button type="button" className="btn btn-secondary btn-sm" onClick={addLine}><Plus size={13} /> Add Line</button>}
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
                              <select className="form-control" value={l.item || ''} onChange={e => setLine(i, 'item', e.target.value)} disabled={!canEdit}>
                                <option value="">Custom…</option>
                                {items.map(it => <option key={it.id} value={it.id}>{it.name}</option>)}
                              </select>
                            </td>
                            <td>
                              <input className="form-control" value={l.description || ''} onChange={e => setLine(i, 'description', e.target.value)} placeholder="Description" disabled={!canEdit} />
                            </td>
                            <td>
                              <input className="form-control" type="number" min="0.001" step="0.001" value={l.quantity} onChange={e => setLine(i, 'quantity', e.target.value)} disabled={!canEdit} />
                            </td>
                            <td>
                              <input className="form-control" type="number" min="0" step="0.01" value={l.unit_price} onChange={e => setLine(i, 'unit_price', e.target.value)} disabled={!canEdit} />
                            </td>
                            <td>
                              <input className="form-control" type="number" min="0" step="0.01" value={l.tax_rate} onChange={e => setLine(i, 'tax_rate', e.target.value)} disabled={!canEdit} />
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 500, fontSize: '0.85rem' }}>
                              {fmt.currency(lineTotal(l), form.currency)}
                            </td>
                            {canEdit && (
                              <td>
                                <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeLine(i)} style={{ color: 'var(--danger)', padding: '4px' }} disabled={form.line_items.length === 1}>
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

              {/* Notes */}
              <div className="card">
                <div className="card-header"><span className="card-title">Notes & Terms</span></div>
                <div className="card-body">
                  <div className="form-grid">
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">{isCreditNote ? 'Reason / Notes' : 'Notes'}</label>
                      <textarea className="form-control" value={form.notes || ''} onChange={e => setF('notes', e.target.value)} rows={3} disabled={!canEdit} />
                    </div>
                    {!isReceipt && (
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Terms & Conditions</label>
                        <textarea className="form-control" value={form.terms || ''} onChange={e => setF('terms', e.target.value)} rows={3} disabled={!canEdit} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <div>
              {/* Discount — not applicable for receipts or credit notes */}
              {canEdit && !isReceipt && !isCreditNote && (
                <div className="card" style={{ marginBottom: 16 }}>
                  <div className="card-header"><span className="card-title">Discount</span></div>
                  <div className="card-body">
                    <div className="form-group">
                      <label className="form-label">Discount Type</label>
                      <select className="form-control" value={form.discount_type} onChange={e => setF('discount_type', e.target.value)}>
                        <option value="none">No Discount</option>
                        <option value="percentage">Percentage %</option>
                        <option value="fixed">Fixed Amount</option>
                      </select>
                    </div>
                    {form.discount_type !== 'none' && (
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Value</label>
                        <input className="form-control" type="number" min="0" step="0.01"
                          value={form.discount_value || ''} onChange={e => setF('discount_value', e.target.value)} />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Actions */}
              {canEdit && (
                <div className="card" style={{ marginBottom: 16 }}>
                  <div className="card-body">
                    <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginBottom: 10 }} disabled={saving}>
                      {saving ? 'Saving…' : isNew ? `Create ${typeLabel}` : 'Save Changes'}
                    </button>
                    <button type="button" className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => navigate('/invoices')}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Receipt notice */}
              {isNew && isReceipt && (
                <div style={{ fontSize: '0.8rem', color: 'var(--muted)', padding: '0 4px' }}>
                  A sales receipt is recorded as paid immediately upon creation. No further action needed.
                </div>
              )}

              {/* Summary (view mode) */}
              {!isNew && invoice && (
                <div className="card">
                  <div className="card-header"><span className="card-title">Summary</span></div>
                  <div className="card-body" style={{ fontSize: '0.85rem' }}>
                    {[
                      ['Status', <span className={`badge badge-${invoice.status}`}>{invoice.status.replace('_', ' ')}</span>],
                      ['Total', <strong>{fmt.currency(invoice.total, invoice.currency)}</strong>],
                      !isCreditNote && ['Amount Paid', fmt.currency(invoice.amount_paid, invoice.currency)],
                      !isCreditNote && !isReceipt && ['Balance Due', <strong style={{ color: parseFloat(invoice.balance_due) > 0 ? 'var(--danger)' : 'var(--success)' }}>{fmt.currency(invoice.balance_due, invoice.currency)}</strong>],
                      isCreditNote && ['Credit Available', <strong style={{ color: parseFloat(invoice.credit_remaining) > 0 ? 'var(--success)' : 'var(--muted)' }}>{fmt.currency(invoice.credit_remaining || 0, invoice.currency)}</strong>],
                      ['Date', fmt.date(invoice.issue_date)],
                      !isReceipt && ['Due', fmt.date(invoice.due_date)],
                      !isReceipt && !isCreditNote && invoice.sent_at && ['Sent', fmt.datetime(invoice.sent_at)],
                      isReceipt && invoice.paid_at && ['Paid', fmt.datetime(invoice.paid_at)],
                    ].filter(Boolean).map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ color: 'var(--muted)' }}>{k}</span>
                        <span>{v}</span>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ width: '100%', justifyContent: 'center', marginTop: 14 }}
                      onClick={handleDownloadPdf}
                      disabled={pdfLoading}
                    >
                      {pdfLoading ? 'Generating PDF…' : '⬇ Download PDF'}
                    </button>
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