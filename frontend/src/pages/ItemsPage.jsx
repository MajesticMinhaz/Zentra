import { useState, useEffect, useCallback } from 'react'
import { getItems, createItem, updateItem, deleteItem } from '../utils/api'
import { fmt, getError } from '../utils/helpers'
import { Plus, Search, Edit2, Trash2, X, Package } from 'lucide-react'
import toast from 'react-hot-toast'

const EMPTY = {
  item_type: 'service', name: '', sku: '', description: '',
  unit_price: '', currency: 'USD', unit_of_measure: 'hour',
  tax_rate: '0', is_taxable: true, is_recurring: false, is_active: true,
}

export default function ItemsPage() {
  const [items, setItems] = useState([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await getItems({ search, page_size: 50 })
      setItems(data.results || [])
      setCount(data.count || 0)
    } catch {}
    setLoading(false)
  }, [search])

  useEffect(() => { load() }, [load])

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = { ...form, unit_price: parseFloat(form.unit_price) || 0, tax_rate: parseFloat(form.tax_rate) || 0 }
      if (modal === 'create') { await createItem(payload); toast.success('Item created') }
      else { await updateItem(modal.id, payload); toast.success('Item updated') }
      setModal(null); load()
    } catch (err) { toast.error(getError(err)) }
    setSaving(false)
  }

  const del = async (item) => {
    if (!confirm(`Delete "${item.name}"?`)) return
    try { await deleteItem(item.id); toast.success('Deleted'); load() }
    catch (err) { toast.error(getError(err)) }
  }

  const f = (field) => ({ value: form[field] ?? '', onChange: e => setForm(p => ({ ...p, [field]: e.target.value })) })

  return (
    <>
      <div className="page-header">
        <div>
          <h2 className="page-title">Items & Services</h2>
          <p className="page-subtitle">{count} items in catalog</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setForm(EMPTY); setModal('create') }}>
          <Plus size={15} /> New Item
        </button>
      </div>

      <div className="page-body">
        <div className="toolbar">
          <div className="search-wrap">
            <Search />
            <input className="search-input" placeholder="Search items…" value={search}
              onChange={e => setSearch(e.target.value)} />
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>SKU</th>
                <th>Unit Price</th>
                <th>Unit</th>
                <th>Tax Rate</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8}><div className="loading"><div className="spinner" /></div></td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={8}>
                  <div className="empty-state"><Package /><h3>No items yet</h3><p>Add products or services to use in invoices</p></div>
                </td></tr>
              ) : items.map(item => (
                <tr key={item.id}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{item.name}</div>
                    {item.description && <div style={{ fontSize: '0.75rem', color: 'var(--muted)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description}</div>}
                  </td>
                  <td><span className={`badge badge-${item.item_type === 'product' ? 'sent' : 'trial'}`}>{item.item_type}</span></td>
                  <td className="td-mono">{item.sku || '—'}</td>
                  <td style={{ fontWeight: 600 }}>{fmt.currency(item.unit_price, item.currency)}</td>
                  <td className="td-muted">{item.unit_of_measure}</td>
                  <td className="td-muted">{item.tax_rate}%</td>
                  <td><span className={`badge badge-${item.is_active ? 'active' : 'inactive'}`}>{item.is_active ? 'Active' : 'Inactive'}</span></td>
                  <td>
                    <div className="action-row">
                      <button className="btn btn-ghost btn-sm" onClick={() => { setForm(item); setModal(item) }}><Edit2 /></button>
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => del(item)}><Trash2 /></button>
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
              <h3 className="modal-title">{modal === 'create' ? 'New Item' : 'Edit Item'}</h3>
              <button className="btn-close" onClick={() => setModal(null)}><X size={18} /></button>
            </div>
            <form onSubmit={save}>
              <div className="modal-body">
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Name *</label>
                    <input className="form-control" required {...f('name')} placeholder="e.g. Web Design" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Type</label>
                    <select className="form-control" {...f('item_type')}>
                      <option value="service">Service</option>
                      <option value="product">Product</option>
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Description</label>
                  <textarea className="form-control" {...f('description')} rows={2} />
                </div>
                <div className="form-grid-3">
                  <div className="form-group">
                    <label className="form-label">Unit Price *</label>
                    <input className="form-control" type="number" step="0.01" required {...f('unit_price')} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Unit of Measure</label>
                    <select className="form-control" {...f('unit_of_measure')}>
                      <option value="hour">Hour</option><option value="day">Day</option>
                      <option value="unit">Unit</option><option value="month">Month</option>
                      <option value="year">Year</option><option value="kg">Kilogram</option>
                      <option value="lb">Pound</option><option value="meter">Meter</option>
                      <option value="liter">Liter</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Tax Rate %</label>
                    <input className="form-control" type="number" step="0.01" {...f('tax_rate')} />
                  </div>
                </div>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">SKU</label>
                    <input className="form-control" {...f('sku')} placeholder="Optional" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Currency</label>
                    <select className="form-control" {...f('currency')}>
                      <option>USD</option><option>EUR</option><option>GBP</option><option>BDT</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 20 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!form.is_active} onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))} />
                    Active
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!form.is_recurring} onChange={e => setForm(p => ({ ...p, is_recurring: e.target.checked }))} />
                    Recurring
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!form.is_taxable} onChange={e => setForm(p => ({ ...p, is_taxable: e.target.checked }))} />
                    Taxable
                  </label>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Item'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
