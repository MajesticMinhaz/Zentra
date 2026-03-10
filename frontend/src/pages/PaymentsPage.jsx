import { useState, useEffect, useCallback } from 'react'
import { getPayments, createPayment, getInvoices, getCustomers } from '../utils/api'
import { fmt, getError, today } from '../utils/helpers'
import { Plus, Search, CreditCard, X } from 'lucide-react'
import toast from 'react-hot-toast'

const EMPTY = { invoice: '', amount: '', payment_date: today(), payment_method: 'bank', transaction_reference: '', notes: '' }
const METHODS = [
  { value: 'bank', label: 'Bank Transfer' },
  { value: 'stripe', label: 'Stripe' },
  { value: 'cash', label: 'Cash' },
  { value: 'check', label: 'Check' },
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'other', label: 'Other' },
]

export default function PaymentsPage() {
  const [payments, setPayments] = useState([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [invoices, setInvoices] = useState([])
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await getPayments({ page_size: 50, ordering: '-payment_date' })
      setPayments(data.results || [])
      setCount(data.count || 0)
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const save = async (e) => {
    e.preventDefault(); setSaving(true)
    try {
      await createPayment({ ...form, amount: parseFloat(form.amount) })
      toast.success('Payment recorded')
      setModal(false); setForm(EMPTY); load()
    } catch (err) { toast.error(getError(err)) }
    setSaving(false)
  }

  const [invoicesLoading, setInvoicesLoading] = useState(false)

  const loadInvoices = useCallback(async () => {
    setInvoicesLoading(true)
    try {
      const [r1, r2, r3] = await Promise.all([
        getInvoices({ status: 'sent', page_size: 200 }),
        getInvoices({ status: 'partially_paid', page_size: 200 }),
        getInvoices({ status: 'overdue', page_size: 200 }),
      ])
      setInvoices([
        ...(r1.data.results || []),
        ...(r2.data.results || []),
        ...(r3.data.results || []),
      ])
    } catch {}
    setInvoicesLoading(false)
  }, [])

  const openModal = () => {
    setForm(EMPTY)
    loadInvoices()
    setModal(true)
  }

  const f = (field) => ({ value: form[field] ?? '', onChange: e => setForm(p => ({ ...p, [field]: e.target.value })) })

  const selectedInv = invoices.find(i => i.id === form.invoice)

  return (
    <>
      <div className="page-header">
        <div><h2 className="page-title">Payments</h2><p className="page-subtitle">{count} payments recorded</p></div>
        <button className="btn btn-primary" onClick={openModal}><Plus size={15} /> Record Payment</button>
      </div>

      <div className="page-body">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Invoice</th><th>Customer</th><th>Method</th><th>Reference</th><th>Amount</th><th>Status</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={7}><div className="loading"><div className="spinner" /></div></td></tr>
              : payments.length === 0 ? <tr><td colSpan={7}><div className="empty-state"><CreditCard /><h3>No payments yet</h3><p>Record payments against sent invoices</p></div></td></tr>
              : payments.map(p => (
                <tr key={p.id}>
                  <td className="td-muted">{fmt.date(p.payment_date)}</td>
                  <td><span className="td-mono">{p.invoice_number}</span></td>
                  <td style={{fontWeight:500}}>{p.customer_name}</td>
                  <td className="td-muted" style={{textTransform:'capitalize'}}>{p.payment_method?.replace('_',' ')}</td>
                  <td className="td-muted">{p.transaction_reference || '—'}</td>
                  <td style={{fontWeight:600}}>{fmt.currency(p.amount, p.currency)}</td>
                  <td><span className={`badge badge-${p.status}`}>{p.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title">Record Payment</h3>
              <button className="btn-close" onClick={() => setModal(false)}><X size={18} /></button>
            </div>
            <form onSubmit={save}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Invoice *</label>
                  <select className="form-control" required value={form.invoice} onChange={e => {
                    const inv = invoices.find(i => i.id === e.target.value)
                    setForm(p => ({ ...p, invoice: e.target.value, amount: inv ? inv.balance_due : p.amount }))
                  }}>
                    <option value="">{ invoicesLoading ? 'Loading…' : 'Select invoice…' }</option>
                    {invoices.map(i => (
                      <option key={i.id} value={i.id}>{i.number} — {i.customer_name} ({fmt.currency(i.balance_due, i.currency)} due)</option>
                    ))}
                  </select>
                </div>
                {selectedInv && (
                  <div style={{ background: 'var(--surface-2)', borderRadius: 'var(--radius)', padding: '10px 14px', marginBottom: 16, fontSize: '0.82rem', color: 'var(--muted)' }}>
                    Balance due: <strong style={{color:'var(--ink)'}}>{fmt.currency(selectedInv.balance_due, selectedInv.currency)}</strong>
                  </div>
                )}
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Amount *</label>
                    <input className="form-control" type="number" min="0.01" step="0.01" required max={selectedInv ? selectedInv.balance_due : undefined} {...f('amount')} />
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
                <div className="form-group" style={{marginBottom:0}}>
                  <label className="form-label">Notes</label>
                  <textarea className="form-control" {...f('notes')} rows={2} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Record Payment'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}