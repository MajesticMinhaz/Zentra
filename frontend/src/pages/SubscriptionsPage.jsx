import { useState, useEffect, useCallback } from 'react'
import { getSubscriptions, createSubscription, updateSubscription, deleteSubscription, getCustomers, getItems } from '../utils/api'
import { fmt, getError, today } from '../utils/helpers'
import { Plus, RefreshCw, X, Trash2, Edit2 } from 'lucide-react'
import toast from 'react-hot-toast'

const EMPTY = {
  customer: '', name: '', billing_cycle: 'monthly', status: 'active',
  amount: '', currency: 'USD', start_date: today(), next_billing_date: today(),
  auto_invoice: true, notes: '',
}

export default function SubscriptionsPage() {
  const [subs, setSubs] = useState([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [customers, setCustomers] = useState([])
  const [items, setItems] = useState([])
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await getSubscriptions({ page_size: 50 })
      setSubs(data.results || [])
      setCount(data.count || 0)
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    getCustomers({ page_size: 200 }).then(r => setCustomers(r.data.results || []))
    getItems({ page_size: 200 }).then(r => setItems(r.data.results || []))
  }, [load])

  const save = async (e) => {
    e.preventDefault(); setSaving(true)
    try {
      const { item: _item, ...rest } = form
      const payload = { ...rest, amount: parseFloat(form.amount)||0 }
      if (modal === 'create') { await createSubscription(payload); toast.success('Subscription created') }
      else { await updateSubscription(modal.id, payload); toast.success('Updated') }
      setModal(null); load()
    } catch (err) { toast.error(getError(err)) }
    setSaving(false)
  }

  const del = async (s) => {
    if (!confirm(`Delete subscription "${s.name}"?`)) return
    try { await deleteSubscription(s.id); toast.success('Deleted'); load() }
    catch (err) { toast.error(getError(err)) }
  }

  const f = (field) => ({ value: form[field] ?? '', onChange: e => setForm(p => ({ ...p, [field]: e.target.value })) })

  const cycleLabel = (c) => ({ monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly' }[c] || c)

  return (
    <>
      <div className="page-header">
        <div><h2 className="page-title">Subscriptions</h2><p className="page-subtitle">{count} subscriptions</p></div>
        <button className="btn btn-primary" onClick={() => { setForm(EMPTY); setModal('create') }}><Plus size={15} /> New Subscription</button>
      </div>

      <div className="page-body">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Customer</th><th>Billing Cycle</th><th>Amount</th><th>Next Billing</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={7}><div className="loading"><div className="spinner" /></div></td></tr>
              : subs.length === 0 ? <tr><td colSpan={7}><div className="empty-state"><RefreshCw /><h3>No subscriptions yet</h3></div></td></tr>
              : subs.map(s => (
                <tr key={s.id}>
                  <td style={{fontWeight:500}}>{s.name}</td>
                  <td className="td-muted">{s.customer_name || s.customer}</td>
                  <td className="td-muted">{cycleLabel(s.billing_cycle)}</td>
                  <td style={{fontWeight:600}}>{fmt.currency(s.amount, s.currency)}</td>
                  <td className="td-muted">{fmt.date(s.next_billing_date)}</td>
                  <td><span className={`badge badge-${s.status}`}>{s.status}</span></td>
                  <td>
                    <div className="action-row">
                      <button className="btn btn-ghost btn-sm" onClick={() => { setForm({...s, item: ''}); setModal(s) }}><Edit2 /></button>
                      <button className="btn btn-ghost btn-sm" style={{color:'var(--danger)'}} onClick={() => del(s)}><Trash2 /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title">{modal === 'create' ? 'New Subscription' : 'Edit Subscription'}</h3>
              <button className="btn-close" onClick={() => setModal(null)}><X size={18} /></button>
            </div>
            <form onSubmit={save}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Service / Item</label>
                  <select className="form-control" value={form.item || ''} onChange={e => {
                    const item = items.find(i => i.id === e.target.value)
                    setForm(p => ({
                      ...p,
                      item: e.target.value,
                      name: item ? item.name : p.name,
                      amount: item ? item.unit_price : p.amount,
                    }))
                  }}>
                    <option value="">— Select a service (optional) —</option>
                    {items.map(i => <option key={i.id} value={i.id}>{i.name} — {fmt.currency(i.unit_price, 'USD')}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Name *</label>
                  <input className="form-control" required {...f('name')} placeholder="e.g. Monthly Retainer" />
                </div>
                <div className="form-group">
                  <label className="form-label">Customer *</label>
                  <select className="form-control" required value={form.customer} onChange={e => setForm(p=>({...p,customer:e.target.value}))}>
                    <option value="">Select customer…</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.display_name}</option>)}
                  </select>
                </div>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Amount *</label>
                    <input className="form-control" type="number" min="0" step="0.01" required {...f('amount')} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Currency</label>
                    <select className="form-control" {...f('currency')}>
                      <option>USD</option><option>EUR</option><option>GBP</option><option>BDT</option>
                    </select>
                  </div>
                </div>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Billing Cycle</label>
                    <select className="form-control" {...f('billing_cycle')}>
                      <option value="monthly">Monthly</option>
                      <option value="quarterly">Quarterly</option>
                      <option value="yearly">Yearly</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Status</label>
                    <select className="form-control" {...f('status')}>
                      <option value="active">Active</option>
                      <option value="trial">Trial</option>
                      <option value="paused">Paused</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                </div>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Start Date</label>
                    <input className="form-control" type="date" {...f('start_date')} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Next Billing Date *</label>
                    <input className="form-control" type="date" required {...f('next_billing_date')} />
                  </div>
                </div>
                <div className="form-group" style={{marginBottom:8}}>
                  <label style={{display:'flex',alignItems:'center',gap:8,fontSize:'0.85rem',cursor:'pointer'}}>
                    <input type="checkbox" checked={!!form.auto_invoice} onChange={e => setForm(p=>({...p,auto_invoice:e.target.checked}))} />
                    Auto-generate invoices on billing date
                  </label>
                </div>
                <div className="form-group" style={{marginBottom:0}}>
                  <label className="form-label">Notes</label>
                  <textarea className="form-control" rows={2} {...f('notes')} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}