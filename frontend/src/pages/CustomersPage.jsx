import { useState, useEffect, useCallback, useRef } from 'react'
import {
  getCustomers, getCustomer, createCustomer, updateCustomer, deleteCustomer, restoreCustomer,
  getCustomerContacts, createCustomerContact, updateCustomerContact, deleteCustomerContact,
  getCustomerStatement, applyCustomerCredit, getInvoices,
} from '../utils/api'
import { fmt, getError } from '../utils/helpers'
import {
  Plus, Search, Edit2, Trash2, X, Users, Building2, User, ChevronRight,
  Phone, Mail, Globe, MapPin, FileText, RotateCcw, Star, UserPlus,
  Filter, ExternalLink, CreditCard, AlertCircle, CheckCircle,
} from 'lucide-react'
import toast from 'react-hot-toast'

// ── Constants ──────────────────────────────────────────────────────────────
const CURRENCIES = ['USD', 'EUR', 'GBP', 'BDT', 'CAD', 'AUD']

const EMPTY_CUSTOMER = {
  customer_type: 'business',
  display_name: '', company_name: '',
  email: '', phone: '', website: '', tax_number: '',
  currency: 'USD', notes: '',
  billing_address_line1: '', billing_address_line2: '',
  billing_city: '', billing_state: '', billing_postal_code: '', billing_country: '',
  shipping_address_line1: '', shipping_address_line2: '',
  shipping_city: '', shipping_state: '', shipping_postal_code: '', shipping_country: '',
}

const EMPTY_CONTACT = {
  first_name: '', last_name: '', email: '', phone: '', job_title: '', is_primary: false,
}

// ── Small reusable pieces ───────────────────────────────────────────────────
function Badge({ type }) {
  return <span className={`badge badge-${type}`}>{type}</span>
}

function FieldError({ errors, field }) {
  if (!errors?.[field]) return null
  const msgs = [].concat(errors[field])
  return <p style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: 4 }}>{msgs[0]}</p>
}

// ── Main component ──────────────────────────────────────────────────────────
export default function CustomersPage() {
  // List state
  const [customers, setCustomers] = useState([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterCurrency, setFilterCurrency] = useState('')
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 20

  // Debounce search
  const searchTimer = useRef(null)
  const handleSearch = (val) => {
    setSearch(val)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setPage(1), 300)
  }

  // Modal state
  const [modal, setModal] = useState(null) // null | 'create' | 'edit' | 'detail'
  const [selected, setSelected] = useState(null)
  const [formTab, setFormTab] = useState('info') // 'info' | 'billing' | 'shipping' | 'contacts'
  const [form, setForm] = useState(EMPTY_CUSTOMER)
  const [fieldErrors, setFieldErrors] = useState({})
  const [saving, setSaving] = useState(false)

  // Detail / statement state
  const [detailTab, setDetailTab] = useState('info') // 'info' | 'contacts' | 'statement'
  const [contacts, setContacts] = useState([])
  const [statement, setStatement] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // Contact form
  const [contactModal, setContactModal] = useState(null) // null | 'create' | contact obj
  const [contactForm, setContactForm] = useState(EMPTY_CONTACT)
  const [contactSaving, setContactSaving] = useState(false)

  // Apply credit modal
  const [creditModal, setCreditModal] = useState(false)
  const [creditForm, setCreditForm] = useState({ invoice_id: '', amount: '' })
  const [creditInvoices, setCreditInvoices] = useState([])
  const [creditSaving, setCreditSaving] = useState(false)

  // ── Data loading ────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = { page, page_size: PAGE_SIZE }
      if (search) params.search = search
      if (filterType) params.customer_type = filterType
      if (filterCurrency) params.currency = filterCurrency
      const { data } = await getCustomers(params)
      setCustomers(data.results || [])
      setCount(data.count || 0)
    } catch (err) {
      toast.error(getError(err))
    }
    setLoading(false)
  }, [search, page, filterType, filterCurrency])

  useEffect(() => { load() }, [load])

  const loadContacts = async (customerId) => {
    try {
      const { data } = await getCustomerContacts(customerId)
      setContacts(data.results || data || [])
    } catch { setContacts([]) }
  }

  const loadStatement = async (customerId) => {
    setDetailLoading(true)
    try {
      const { data } = await getCustomerStatement(customerId)
      setStatement(data)
    } catch { setStatement(null) }
    setDetailLoading(false)
  }

  // ── Modal helpers ───────────────────────────────────────────────────────
  const openCreate = () => {
    setForm(EMPTY_CUSTOMER)
    setFieldErrors({})
    setFormTab('info')
    setModal('create')
  }

  const openEdit = (c) => {
    setForm({ ...EMPTY_CUSTOMER, ...c })
    setFieldErrors({})
    setFormTab('info')
    setSelected(c)
    setModal('edit')
  }

  const openDetail = async (c) => {
    setSelected(c)
    setDetailTab('info')
    setContacts([])
    setStatement(null)
    setModal('detail')
    // Fetch full customer detail (list view only has subset of fields)
    try {
      const { data } = await getCustomer(c.id)
      setSelected(data)
    } catch { /* keep list data as fallback */ }
    await loadContacts(c.id)
  }

  const closeModal = () => { setModal(null); setSelected(null) }

  // ── Form field helper ───────────────────────────────────────────────────
  const f = (field) => ({
    value: form[field] ?? '',
    onChange: (e) => {
      const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value
      setForm(p => ({ ...p, [field]: val }))
      if (fieldErrors[field]) setFieldErrors(p => ({ ...p, [field]: null }))
    },
  })

  // ── Save customer ───────────────────────────────────────────────────────
  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    setFieldErrors({})

    // Strip read-only fields before sending
    const { outstanding_balance, credit_balance, contacts: _c, billing_address_display: _b,
      created_at, updated_at, created_by, ...payload } = form

    try {
      if (modal === 'create') {
        await createCustomer(payload)
        toast.success('Customer created')
      } else {
        await updateCustomer(selected.id, payload)
        toast.success('Customer updated')
      }
      closeModal()
      load()
    } catch (err) {
      const data = err?.response?.data
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        setFieldErrors(data)
        toast.error('Please fix the errors below')
      } else {
        toast.error(getError(err))
      }
    }
    setSaving(false)
  }

  // ── Delete / restore ────────────────────────────────────────────────────
  const del = async (c, e) => {
    e.stopPropagation()
    if (!confirm(`Archive ${c.display_name}? They can be restored later.`)) return
    try {
      await deleteCustomer(c.id)
      toast.success('Customer archived')
      load()
    } catch (err) { toast.error(getError(err)) }
  }

  const restore = async (c) => {
    try {
      await restoreCustomer(c.id)
      toast.success('Customer restored')
      load()
    } catch (err) { toast.error(getError(err)) }
  }

  // ── Contacts CRUD ───────────────────────────────────────────────────────
  const openContactCreate = () => { setContactForm(EMPTY_CONTACT); setContactModal('create') }
  const openContactEdit = (ct) => { setContactForm({ ...ct }); setContactModal(ct) }
  const closeContactModal = () => setContactModal(null)

  const saveContact = async (e) => {
    e.preventDefault()
    setContactSaving(true)
    try {
      if (contactModal === 'create') {
        await createCustomerContact(selected.id, contactForm)
        toast.success('Contact added')
      } else {
        await updateCustomerContact(selected.id, contactModal.id, contactForm)
        toast.success('Contact updated')
      }
      closeContactModal()
      await loadContacts(selected.id)
    } catch (err) { toast.error(getError(err)) }
    setContactSaving(false)
  }

  const delContact = async (ct) => {
    if (!confirm(`Remove ${ct.first_name} ${ct.last_name}?`)) return
    try {
      await deleteCustomerContact(selected.id, ct.id)
      toast.success('Contact removed')
      await loadContacts(selected.id)
    } catch (err) { toast.error(getError(err)) }
  }

  // ── Apply credit ────────────────────────────────────────────────────────
  const openCreditModal = async () => {
    setCreditForm({ invoice_id: '', amount: '' })
    // Load open invoices for this customer
    try {
      const [r1, r2, r3] = await Promise.all([
        getInvoices({ customer: selected.id, status: 'sent', page_size: 100 }),
        getInvoices({ customer: selected.id, status: 'partially_paid', page_size: 100 }),
        getInvoices({ customer: selected.id, status: 'overdue', page_size: 100 }),
      ])
      const all = [
        ...(r1.data.results || []),
        ...(r2.data.results || []),
        ...(r3.data.results || []),
      ].filter(inv => inv.invoice_type !== 'credit_note')
      setCreditInvoices(all)

    } catch { setCreditInvoices([]) }
    setCreditModal(true)
  }

  const submitCredit = async (e) => {
    e.preventDefault()
    setCreditSaving(true)
    try {
      await applyCustomerCredit(selected.id, {
        invoice_id: creditForm.invoice_id,
        amount: parseFloat(creditForm.amount),
      })
      toast.success('Credit applied successfully')
      setCreditModal(false)
      // Refresh the selected customer data to reflect new balances
      const { data } = await getCustomer(selected.id)
      setSelected(data)
    } catch (err) { toast.error(getError(err)) }
    setCreditSaving(false)
  }

  const cf = (field) => ({
    value: contactForm[field] ?? '',
    onChange: (e) => {
      const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value
      setContactForm(p => ({ ...p, [field]: val }))
    },
  })

  // ── Detail tab change ───────────────────────────────────────────────────
  const handleDetailTab = async (tab) => {
    setDetailTab(tab)
    if (tab === 'statement' && !statement) {
      await loadStatement(selected.id)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <>
      {/* Page header */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Customers</h2>
          <p className="page-subtitle">{count} total</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>
          <Plus size={15} /> New Customer
        </button>
      </div>

      {/* Body */}
      <div className="page-body">

        {/* Toolbar */}
        <div className="toolbar">
          <div className="search-wrap">
            <Search />
            <input
              className="search-input"
              placeholder="Search by name, email, phone…"
              value={search}
              onChange={e => handleSearch(e.target.value)}
            />
          </div>
          <select
            className="form-control"
            style={{ width: 'auto', minWidth: 130 }}
            value={filterType}
            onChange={e => { setFilterType(e.target.value); setPage(1) }}
          >
            <option value="">All Types</option>
            <option value="individual">Individual</option>
            <option value="business">Business</option>
          </select>
          <select
            className="form-control"
            style={{ width: 'auto', minWidth: 110 }}
            value={filterCurrency}
            onChange={e => { setFilterCurrency(e.target.value); setPage(1) }}
          >
            <option value="">All Currencies</option>
            {CURRENCIES.map(c => <option key={c}>{c}</option>)}
          </select>
          {(filterType || filterCurrency || search) && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => { setSearch(''); setFilterType(''); setFilterCurrency(''); setPage(1) }}
            >
              <X size={13} /> Clear
            </button>
          )}
        </div>

        {/* Table */}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Type</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Currency</th>
                <th style={{ textAlign: 'right' }}>Outstanding</th>
                <th>Since</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8}><div className="loading"><div className="spinner" /></div></td></tr>
              ) : customers.length === 0 ? (
                <tr><td colSpan={8}>
                  <div className="empty-state">
                    <Users />
                    <h3>No customers found</h3>
                    <p>{search || filterType || filterCurrency ? 'Try adjusting your filters' : 'Add your first customer to get started'}</p>
                  </div>
                </td></tr>
              ) : customers.map(c => (
                <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => openDetail(c)}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div className="customer-avatar">
                        {c.customer_type === 'business' ? <Building2 size={14} /> : <User size={14} />}
                      </div>
                      <div>
                        <div style={{ fontWeight: 500 }}>{c.display_name}</div>
                        {c.company_name && (
                          <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{c.company_name}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td><Badge type={c.customer_type} /></td>
                  <td className="td-muted">{c.email || '—'}</td>
                  <td className="td-muted">{c.phone || '—'}</td>
                  <td className="td-muted">{c.currency}</td>
                  <td style={{
                    textAlign: 'right',
                    fontWeight: parseFloat(c.outstanding_balance) > 0 ? 600 : 400,
                    color: parseFloat(c.outstanding_balance) > 0 ? 'var(--danger)' : 'inherit',
                  }}>
                    {fmt.currency(c.outstanding_balance, c.currency)}
                  </td>
                  <td className="td-muted">{fmt.date(c.created_at)}</td>
                  <td>
                    <ChevronRight size={14} style={{ color: 'var(--muted)' }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          {count > PAGE_SIZE && (
            <div className="pagination">
              <span>
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, count)} of {count}
              </span>
              <div className="pagination-btns">
                <button className="page-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                  Previous
                </button>
                {Array.from({ length: Math.min(5, Math.ceil(count / PAGE_SIZE)) }, (_, i) => {
                  const p = i + 1
                  return (
                    <button
                      key={p}
                      className={`page-btn${page === p ? ' active' : ''}`}
                      onClick={() => setPage(p)}
                    >
                      {p}
                    </button>
                  )
                })}
                <button
                  className="page-btn"
                  disabled={page * PAGE_SIZE >= count}
                  onClick={() => setPage(p => p + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Create / Edit modal ─────────────────────────────────────────── */}
      {(modal === 'create' || modal === 'edit') && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="modal modal-lg">
            <div className="modal-header">
              <h3 className="modal-title">
                {modal === 'create' ? 'New Customer' : `Edit — ${selected?.display_name}`}
              </h3>
              <button className="btn-close" onClick={closeModal}><X size={18} /></button>
            </div>

            {/* Form tabs */}
            <div className="tab-bar" style={{ margin: '0 26px', borderBottom: '1px solid var(--border)' }}>
              {[
                { key: 'info', label: 'General' },
                { key: 'billing', label: 'Billing Address' },
                { key: 'shipping', label: 'Shipping Address' },
              ].map(t => (
                <button
                  key={t.key}
                  type="button"
                  className={`tab${formTab === t.key ? ' active' : ''}`}
                  onClick={() => setFormTab(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <form onSubmit={save}>
              <div className="modal-body">

                {/* ── General tab ── */}
                {formTab === 'info' && (
                  <>
                    <div className="form-grid" style={{ marginBottom: 16 }}>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Customer Type</label>
                        <select className="form-control" {...f('customer_type')}>
                          <option value="individual">Individual</option>
                          <option value="business">Business</option>
                        </select>
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Currency</label>
                        <select className="form-control" {...f('currency')}>
                          {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <FieldError errors={fieldErrors} field="currency" />
                      </div>
                    </div>

                    <div className="form-grid">
                      <div className="form-group">
                        <label className="form-label">Display Name <span style={{ color: 'var(--danger)' }}>*</span></label>
                        <input className="form-control" required placeholder="How they appear on invoices" {...f('display_name')} />
                        <FieldError errors={fieldErrors} field="display_name" />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Company Name</label>
                        <input className="form-control" placeholder="Legal company name" {...f('company_name')} />
                        <FieldError errors={fieldErrors} field="company_name" />
                      </div>
                    </div>

                    <div className="form-grid">
                      <div className="form-group">
                        <label className="form-label">Email</label>
                        <input className="form-control" type="email" {...f('email')} />
                        <FieldError errors={fieldErrors} field="email" />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Phone</label>
                        <input className="form-control" type="tel" {...f('phone')} />
                        <FieldError errors={fieldErrors} field="phone" />
                      </div>
                    </div>

                    <div className="form-grid">
                      <div className="form-group">
                        <label className="form-label">Website</label>
                        <input className="form-control" type="url" placeholder="https://" {...f('website')} />
                        <FieldError errors={fieldErrors} field="website" />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Tax / VAT Number</label>
                        <input className="form-control" placeholder="VAT / GST / EIN" {...f('tax_number')} />
                        <FieldError errors={fieldErrors} field="tax_number" />
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Notes</label>
                      <textarea className="form-control" rows={3} placeholder="Internal notes about this customer…" {...f('notes')} />
                    </div>
                  </>
                )}

                {/* ── Billing address tab ── */}
                {formTab === 'billing' && (
                  <>
                    <div className="form-group">
                      <label className="form-label">Address Line 1</label>
                      <input className="form-control" placeholder="Street address, P.O. box" {...f('billing_address_line1')} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Address Line 2</label>
                      <input className="form-control" placeholder="Apartment, suite, unit, floor…" {...f('billing_address_line2')} />
                    </div>
                    <div className="form-grid">
                      <div className="form-group">
                        <label className="form-label">City</label>
                        <input className="form-control" {...f('billing_city')} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">State / Province</label>
                        <input className="form-control" {...f('billing_state')} />
                      </div>
                    </div>
                    <div className="form-grid">
                      <div className="form-group">
                        <label className="form-label">Postal Code</label>
                        <input className="form-control" {...f('billing_postal_code')} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Country</label>
                        <input className="form-control" {...f('billing_country')} />
                      </div>
                    </div>
                  </>
                )}

                {/* ── Shipping address tab ── */}
                {formTab === 'shipping' && (
                  <>
                    <div className="form-group">
                      <label className="form-label">Address Line 1</label>
                      <input className="form-control" placeholder="Street address, P.O. box" {...f('shipping_address_line1')} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Address Line 2</label>
                      <input className="form-control" placeholder="Apartment, suite, unit, floor…" {...f('shipping_address_line2')} />
                    </div>
                    <div className="form-grid">
                      <div className="form-group">
                        <label className="form-label">City</label>
                        <input className="form-control" {...f('shipping_city')} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">State / Province</label>
                        <input className="form-control" {...f('shipping_state')} />
                      </div>
                    </div>
                    <div className="form-grid">
                      <div className="form-group">
                        <label className="form-label">Postal Code</label>
                        <input className="form-control" {...f('shipping_postal_code')} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Country</label>
                        <input className="form-control" {...f('shipping_country')} />
                      </div>
                    </div>
                    <div
                      style={{ marginTop: 4 }}
                    >
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setForm(p => ({
                          ...p,
                          shipping_address_line1: p.billing_address_line1,
                          shipping_address_line2: p.billing_address_line2,
                          shipping_city: p.billing_city,
                          shipping_state: p.billing_state,
                          shipping_postal_code: p.billing_postal_code,
                          shipping_country: p.billing_country,
                        }))}
                      >
                        Copy from billing address
                      </button>
                    </div>
                  </>
                )}
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : modal === 'create' ? 'Create Customer' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Detail / drawer modal ───────────────────────────────────────── */}
      {modal === 'detail' && selected && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="modal modal-lg" style={{ maxWidth: 780 }}>

            {/* Header */}
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div className="customer-avatar customer-avatar-lg">
                  {selected.customer_type === 'business'
                    ? <Building2 size={20} />
                    : <User size={20} />}
                </div>
                <div>
                  <h3 className="modal-title" style={{ marginBottom: 2 }}>{selected.display_name}</h3>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Badge type={selected.customer_type} />
                    {selected.company_name && (
                      <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{selected.company_name}</span>
                    )}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => { closeModal(); openEdit(selected) }}>
                  <Edit2 size={13} /> Edit
                </button>
                {parseFloat(selected.credit_balance) > 0 && (
                  <button className="btn btn-sm" style={{ color: 'var(--success)', border: '1px solid var(--success)', background: 'transparent' }} onClick={openCreditModal}>
                    <CreditCard size={13} /> Apply Credit
                  </button>
                )}
                <button
                  className="btn btn-sm"
                  style={{ color: 'var(--danger)', border: '1px solid var(--danger)', background: 'transparent' }}
                  onClick={async (e) => {
                    if (!confirm(`Archive ${selected.display_name}? They can be restored later.`)) return
                    try {
                      await deleteCustomer(selected.id)
                      toast.success('Customer archived')
                      closeModal()
                      load()
                    } catch (err) { toast.error(getError(err)) }
                  }}
                >
                  <Trash2 size={13} /> Delete
                </button>
                <button className="btn-close" onClick={closeModal}><X size={18} /></button>
              </div>
            </div>

            {/* Balance strip */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr',
              borderBottom: '1px solid var(--border)',
              background: 'var(--surface-2)',
            }}>
              {[
                { label: 'Total Invoiced', value: fmt.currency(selected.total_invoiced, selected.currency) },
                { label: 'Total Paid', value: fmt.currency(selected.total_paid, selected.currency), success: parseFloat(selected.total_paid) > 0 },
                { label: 'Outstanding', value: fmt.currency(selected.outstanding_balance, selected.currency), danger: parseFloat(selected.outstanding_balance) > 0 },
                { label: 'Credit Balance', value: fmt.currency(selected.credit_balance, selected.currency), success: parseFloat(selected.credit_balance) > 0 },
              ].map(item => (
                <div key={item.label} style={{ padding: '14px 22px', borderRight: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                    {item.label}
                  </div>
                  <div style={{
                    fontSize: '1.15rem', fontFamily: 'var(--font-display)',
                    color: item.danger ? 'var(--danger)' : item.success ? 'var(--success)' : 'var(--ink)',
                  }}>
                    {item.value}
                  </div>
                </div>
              ))}
            </div>

            {/* Tabs */}
            <div className="tab-bar" style={{ margin: '0 0 0 0', padding: '0 26px', borderBottom: '1px solid var(--border)' }}>
              {['info', 'contacts', 'statement'].map(t => (
                <button
                  key={t}
                  className={`tab${detailTab === t ? ' active' : ''}`}
                  onClick={() => handleDetailTab(t)}
                  style={{ textTransform: 'capitalize' }}
                >
                  {t}
                  {t === 'contacts' && contacts.length > 0 && (
                    <span style={{
                      marginLeft: 6, background: 'var(--accent)', color: 'white',
                      fontSize: '0.65rem', borderRadius: '100px', padding: '1px 6px',
                    }}>
                      {contacts.length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className="modal-body" style={{ maxHeight: '55vh', overflowY: 'auto' }}>

              {/* ── Info tab ── */}
              {detailTab === 'info' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                  {/* Contact info */}
                  <div>
                    <p className="detail-section-label">Contact</p>
                    {selected.email && (
                      <div className="detail-row">
                        <Mail size={13} />
                        <a href={`mailto:${selected.email}`} style={{ color: 'var(--accent)' }}>{selected.email}</a>
                      </div>
                    )}
                    {selected.phone && (
                      <div className="detail-row">
                        <Phone size={13} />
                        <span>{selected.phone}</span>
                      </div>
                    )}
                    {selected.website && (
                      <div className="detail-row">
                        <Globe size={13} />
                        <a href={selected.website} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
                          {selected.website.replace(/^https?:\/\//, '')}
                        </a>
                      </div>
                    )}
                    {selected.tax_number && (
                      <div className="detail-row">
                        <FileText size={13} />
                        <span>Tax: {selected.tax_number}</span>
                      </div>
                    )}
                    {!selected.email && !selected.phone && !selected.website && !selected.tax_number && (
                      <p style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>No contact details</p>
                    )}
                  </div>

                  {/* Billing address */}
                  <div>
                    <p className="detail-section-label">Billing Address</p>
                    {selected.billing_address_display ? (
                      <div className="detail-row" style={{ alignItems: 'flex-start' }}>
                        <MapPin size={13} style={{ marginTop: 2 }} />
                        <span style={{ lineHeight: 1.6 }}>
                          {[
                            selected.billing_address_line1,
                            selected.billing_address_line2,
                            [selected.billing_city, selected.billing_state].filter(Boolean).join(', '),
                            selected.billing_postal_code,
                            selected.billing_country,
                          ].filter(Boolean).map((line, i) => (
                            <span key={i} style={{ display: 'block' }}>{line}</span>
                          ))}
                        </span>
                      </div>
                    ) : (
                      <p style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>No billing address</p>
                    )}
                  </div>

                  {/* Notes */}
                  {selected.notes && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <p className="detail-section-label">Notes</p>
                      <p style={{ fontSize: '0.85rem', color: 'var(--ink-2)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                        {selected.notes}
                      </p>
                    </div>
                  )}

                  <div style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                    <p style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                      Customer since {fmt.date(selected.created_at)}
                    </p>
                  </div>
                </div>
              )}

              {/* ── Contacts tab ── */}
              {detailTab === 'contacts' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                    <button className="btn btn-primary btn-sm" onClick={openContactCreate}>
                      <UserPlus size={13} /> Add Contact
                    </button>
                  </div>
                  {contacts.length === 0 ? (
                    <div className="empty-state" style={{ padding: '30px 20px' }}>
                      <Users />
                      <h3>No contacts yet</h3>
                      <p>Add contacts associated with this customer</p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {contacts.map(ct => (
                        <div key={ct.id} className="contact-card">
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div className="customer-avatar" style={{ background: 'var(--surface-3)', color: 'var(--muted)' }}>
                              <User size={14} />
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontWeight: 500, fontSize: '0.875rem' }}>
                                  {ct.first_name} {ct.last_name}
                                </span>
                                {ct.is_primary && (
                                  <span style={{
                                    fontSize: '0.65rem', fontWeight: 600, background: 'var(--accent-light)',
                                    color: 'var(--accent)', padding: '1px 7px', borderRadius: '100px',
                                  }}>
                                    Primary
                                  </span>
                                )}
                              </div>
                              {ct.job_title && (
                                <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{ct.job_title}</div>
                              )}
                              <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 2, display: 'flex', gap: 12 }}>
                                {ct.email && <span>{ct.email}</span>}
                                {ct.phone && <span>{ct.phone}</span>}
                              </div>
                            </div>
                          </div>
                          <div className="action-row">
                            <button className="btn btn-ghost btn-sm" onClick={() => openContactEdit(ct)}><Edit2 size={13} /></button>
                            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => delContact(ct)}><Trash2 size={13} /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── Statement tab ── */}
              {detailTab === 'statement' && (
                detailLoading ? (
                  <div className="loading"><div className="spinner" /></div>
                ) : !statement ? (
                  <div className="empty-state"><AlertCircle /><h3>Could not load statement</h3></div>
                ) : (
                  <div>
                    {statement.invoices.length === 0 ? (
                      <div className="empty-state" style={{ padding: '30px 0' }}>
                        <FileText /><h3>No invoices yet</h3>
                      </div>
                    ) : (
                      <table>
                        <thead>
                          <tr>
                            <th>Invoice</th>
                            <th>Date</th>
                            <th>Due</th>
                            <th>Status</th>
                            <th style={{ textAlign: 'right' }}>Amount</th>
                            <th style={{ textAlign: 'right' }}>Paid</th>
                            <th style={{ textAlign: 'right' }}>Balance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {statement.invoices.map(inv => (
                            <tr key={inv.id}>
                              <td className="td-mono">{inv.number}</td>
                              <td className="td-muted">{fmt.date(inv.issue_date)}</td>
                              <td className="td-muted">{fmt.date(inv.due_date)}</td>
                              <td><Badge type={inv.status} /></td>
                              <td style={{ textAlign: 'right' }}>{fmt.currency(inv.total, selected.currency)}</td>
                              <td style={{ textAlign: 'right', color: 'var(--success)' }}>{fmt.currency(inv.amount_paid, selected.currency)}</td>
                              <td style={{ textAlign: 'right', color: parseFloat(inv.balance_due) > 0 ? 'var(--danger)' : 'inherit', fontWeight: 500 }}>
                                {fmt.currency(inv.balance_due, selected.currency)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Contact create / edit modal ─────────────────────────────────── */}
      {contactModal && (
        <div className="modal-overlay" style={{ zIndex: 600 }} onClick={e => e.target === e.currentTarget && closeContactModal()}>
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h3 className="modal-title">
                {contactModal === 'create' ? 'Add Contact' : 'Edit Contact'}
              </h3>
              <button className="btn-close" onClick={closeContactModal}><X size={18} /></button>
            </div>
            <form onSubmit={saveContact}>
              <div className="modal-body">
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">First Name <span style={{ color: 'var(--danger)' }}>*</span></label>
                    <input className="form-control" required {...cf('first_name')} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Last Name <span style={{ color: 'var(--danger)' }}>*</span></label>
                    <input className="form-control" required {...cf('last_name')} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Job Title</label>
                  <input className="form-control" {...cf('job_title')} />
                </div>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Email</label>
                    <input className="form-control" type="email" {...cf('email')} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Phone</label>
                    <input className="form-control" type="tel" {...cf('phone')} />
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input
                    type="checkbox"
                    id="is_primary"
                    checked={contactForm.is_primary}
                    onChange={e => setContactForm(p => ({ ...p, is_primary: e.target.checked }))}
                    style={{ width: 16, height: 16, cursor: 'pointer' }}
                  />
                  <label htmlFor="is_primary" style={{ fontSize: '0.85rem', cursor: 'pointer' }}>
                    Primary contact
                  </label>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={closeContactModal}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={contactSaving}>
                  {contactSaving ? 'Saving…' : contactModal === 'create' ? 'Add Contact' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ── Apply Credit modal ─────────────────────────────────────────── */}
      {creditModal && selected && (
        <div className="modal-overlay" style={{ zIndex: 700 }} onClick={e => e.target === e.currentTarget && setCreditModal(false)}>
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title">Apply Credit Balance</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 2 }}>
                  Available credit: <strong style={{ color: 'var(--success)' }}>{fmt.currency(selected.credit_balance, selected.currency)}</strong>
                </p>
              </div>
              <button className="btn-close" onClick={() => setCreditModal(false)}><X size={18} /></button>
            </div>
            <form onSubmit={submitCredit}>
              <div className="modal-body">
                {creditInvoices.length === 0 ? (
                  <div className="empty-state" style={{ padding: '30px 0' }}>
                    <FileText />
                    <h3>No open invoices</h3>
                    <p>This customer has no outstanding invoices to apply credit to.</p>
                  </div>
                ) : (
                  <>
                    <div className="form-group">
                      <label className="form-label">Invoice to apply credit to <span style={{ color: 'var(--danger)' }}>*</span></label>
                      <select
                        className="form-control"
                        required
                        value={creditForm.invoice_id}
                        onChange={e => {
                          const inv = creditInvoices.find(i => i.id === e.target.value)
                          setCreditForm(p => ({
                            ...p,
                            invoice_id: e.target.value,
                            amount: inv ? String(Math.min(parseFloat(inv.balance_due), parseFloat(selected.credit_balance))) : '',
                          }))
                        }}
                      >
                        <option value="">Select invoice…</option>
                        {creditInvoices.map(i => (
                          <option key={i.id} value={i.id}>
                            {i.number} — {fmt.currency(i.balance_due, i.currency)} due
                          </option>
                        ))}
                      </select>
                    </div>
                    {creditForm.invoice_id && (() => {
                      const inv = creditInvoices.find(i => i.id === creditForm.invoice_id)
                      const maxCredit = inv ? Math.min(parseFloat(inv.balance_due), parseFloat(selected.credit_balance)) : 0
                      return (
                        <>
                          <div style={{ background: 'var(--surface-2)', borderRadius: 'var(--radius)', padding: '10px 14px', marginBottom: 16, fontSize: '0.82rem', color: 'var(--muted)' }}>
                            Invoice balance: <strong style={{ color: 'var(--ink)' }}>{inv && fmt.currency(inv.balance_due, inv.currency)}</strong>
                            &nbsp;·&nbsp;
                            Max credit applicable: <strong style={{ color: 'var(--success)' }}>{fmt.currency(maxCredit, selected.currency)}</strong>
                          </div>
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label">Amount to apply <span style={{ color: 'var(--danger)' }}>*</span></label>
                            <input
                              className="form-control"
                              type="number"
                              min="0.01"
                              max={maxCredit}
                              step="0.01"
                              required
                              value={creditForm.amount}
                              onChange={e => setCreditForm(p => ({ ...p, amount: e.target.value }))}
                            />
                          </div>
                        </>
                      )
                    })()}
                  </>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setCreditModal(false)}>Cancel</button>
                {creditInvoices.length > 0 && (
                  <button type="submit" className="btn btn-primary" disabled={creditSaving || !creditForm.invoice_id}>
                    <CheckCircle size={14} /> {creditSaving ? 'Applying…' : 'Apply Credit'}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}