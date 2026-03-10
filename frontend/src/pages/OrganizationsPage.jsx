import { useState, useEffect, useCallback, useRef } from 'react'
import {
  getOrganizations, getOrganization, createOrganization, updateOrganization,
  deleteOrganization, setDefaultOrganization, deleteOrganizationLogo
} from '../utils/api'
import { getError } from '../utils/helpers'
import {
  Plus, Building2, Edit2, Trash2, X, Star, ChevronRight,
  Upload, ChevronDown, Mail, Phone, Globe, MapPin, CreditCard, Hash,
} from 'lucide-react'
import toast from 'react-hot-toast'

const FORM_TABS = [
  { key: 'identity', label: 'Identity' },
  { key: 'contact',  label: 'Contact & Address' },
  { key: 'tax',      label: 'Tax & Registration' },
  { key: 'banking',  label: 'Banking' },
  { key: 'defaults', label: 'Defaults & Templates' },
]

const DETAIL_TABS = ['info', 'banking', 'defaults']

const CURRENCIES = ['USD','EUR','GBP','CAD','AUD','NZD','JPY','CHF','SGD','HKD','INR','AED','BDT']

const EMPTY = {
  name: '', legal_name: '', tagline: '',
  is_default: false, is_active: true,
  email: '', phone: '', website: '',
  address_line1: '', address_line2: '', city: '', state: '', postal_code: '', country: '',
  tax_number: '', registration_number: '',
  bank_name: '', bank_account_name: '', bank_account_number: '',
  bank_sort_code: '', bank_swift_iban: '', bank_instructions: '',
  default_currency: 'USD', invoice_prefix: 'INV', quote_prefix: 'QUO',
  default_invoice_notes: '', default_invoice_terms: '',
  default_retainer_notes: '', default_retainer_terms: '',
  default_credit_note_notes: '', default_credit_note_terms: '',
  default_receipt_notes: '', default_receipt_terms: '',
  default_quote_notes: '', default_quote_terms: '',
  default_report_notes: '',
}

export default function OrganizationsPage() {
  const [orgs, setOrgs]       = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [detailTab, setDetailTab] = useState('info')
  const [modal, setModal]     = useState(null)
  const [form, setForm]       = useState(EMPTY)
  const [formTab, setFormTab] = useState('identity')
  const [saving, setSaving]   = useState(false)
  const [logoFile, setLogoFile]       = useState(null)
  const [logoPreview, setLogoPreview] = useState(null)
  const fileRef = useRef()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await getOrganizations({ page_size: 100 })
      setOrgs(Array.isArray(data.results) ? data.results : (Array.isArray(data) ? data : []))
    } catch (err) { toast.error(getError(err)) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const openCreate = () => {
    setForm({ ...EMPTY })
    setLogoFile(null); setLogoPreview(null)
    setFormTab('identity')
    setModal('create')
  }

  const openEdit = async (org) => {
    // Always fetch the full org detail before editing — the list only has a subset of fields
    try {
      const { data } = await getOrganization(org.id)
      setForm({ ...EMPTY, ...data })
      setLogoFile(null); setLogoPreview(data.logo_url || null)
    } catch {
      setForm({ ...EMPTY, ...org })
      setLogoFile(null); setLogoPreview(org.logo_url || null)
    }
    setFormTab('identity')
    setModal(org)
  }

  const closeModal = () => { setModal(null); setLogoFile(null); setLogoPreview(null) }

  const openDetail = async (org) => {
    setSelected(org)   // show immediately with list data
    setDetailTab('info')
    // Then fetch full detail to populate banking/defaults tabs
    try {
      const { data } = await getOrganization(org.id)
      setSelected(data)
    } catch { /* keep list data */ }
  }
  const closeDetail = () => setSelected(null)
  const setF = (field, val) => setForm(p => ({ ...p, [field]: val }))

  const handleLogoChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { toast.error('Logo must be under 2 MB'); return }
    if (!['image/png', 'image/jpeg'].includes(file.type)) { toast.error('Logo must be PNG or JPEG'); return }
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
  }

  const handleDeleteLogo = async () => {
    if (modal && modal !== 'create' && modal.id) {
      try { await deleteOrganizationLogo(modal.id); toast.success('Logo removed'); setLogoPreview(null); load() }
      catch (err) { toast.error(getError(err)) }
    } else { setLogoFile(null); setLogoPreview(null) }
  }

  const save = async (e) => {
    e.preventDefault(); setSaving(true)
    try {
      const fd = new FormData()
      Object.entries(form).forEach(([k, v]) => {
        if (k === 'logo' || k === 'logo_url') return
        if (v === null || v === undefined) return
        if (typeof v === 'boolean') { fd.append(k, v ? 'true' : 'false'); return }
        fd.append(k, v)
      })
      if (logoFile instanceof File) fd.append('logo', logoFile)
      if (modal === 'create') {
        const { data } = await createOrganization(fd)
        toast.success('Organization created')
        closeModal(); await load(); setSelected(data)
      } else {
        const { data } = await updateOrganization(modal.id, fd)
        toast.success('Organization updated')
        closeModal(); await load(); setSelected(data)
      }
    } catch (err) { toast.error(getError(err)) }
    setSaving(false)
  }

  const handleDelete = async (org) => {
    if (!confirm(`Delete "${org.name}"? This cannot be undone.`)) return
    try {
      await deleteOrganization(org.id)
      toast.success('Organization deleted')
      if (selected?.id === org.id) closeDetail()
      load()
    } catch (err) { toast.error(getError(err)) }
  }

  const handleSetDefault = async (org) => {
    try {
      await setDefaultOrganization(org.id)
      toast.success(`"${org.name}" is now the default`)
      setOrgs(prev => prev.map(o => ({ ...o, is_default: o.id === org.id })))
      if (selected?.id === org.id) setSelected(s => ({ ...s, is_default: true }))
      else setSelected(s => s ? { ...s, is_default: false } : s)
    } catch (err) { toast.error(getError(err)) }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h2 className="page-title">Organizations</h2>
          <p className="page-subtitle">{orgs.length} organization{orgs.length !== 1 ? 's' : ''}</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>
          <Plus size={15} /> New Organization
        </button>
      </div>

      <div className="page-body">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Organization</th>
                <th>Contact</th>
                <th>Currency</th>
                <th>Prefixes</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6}><div className="loading"><div className="spinner" /></div></td></tr>
              ) : orgs.length === 0 ? (
                <tr><td colSpan={6}>
                  <div className="empty-state">
                    <Building2 />
                    <h3>No organizations yet</h3>
                    <p>Create your first organization to start issuing invoices and quotes with your branding.</p>
                  </div>
                </td></tr>
              ) : orgs.map(org => (
                <tr key={org.id} style={{ cursor: 'pointer' }} onClick={() => openDetail(org)}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      {org.logo_url
                        ? <img src={org.logo_url} alt={org.name} style={{ height: 30, maxWidth: 72, objectFit: 'contain', borderRadius: 4, border: '1px solid #e2e8f0', flexShrink: 0 }} />
                        : <div style={{ width: 32, height: 32, background: '#f1f5f9', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', flexShrink: 0 }}><Building2 size={15} /></div>
                      }
                      <div>
                        <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                          {org.name}
                          {org.is_default && <span className="badge badge-paid" style={{ fontSize: '0.68rem' }}>Default</span>}
                        </div>
                        {org.legal_name && org.legal_name !== org.name && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{org.legal_name}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td>
                    {org.email && <div style={{ fontSize: '0.82rem' }}>{org.email}</div>}
                    {org.phone && <div style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>{org.phone}</div>}
                    {!org.email && !org.phone && <span style={{ color: 'var(--muted)' }}>—</span>}
                  </td>
                  <td><span className="badge">{org.default_currency || 'USD'}</span></td>
                  <td className="td-mono" style={{ fontSize: '0.8rem' }}>{org.invoice_prefix || 'INV'} · {org.quote_prefix || 'QUO'}</td>
                  <td><span className={`badge badge-${org.is_active ? 'active' : 'inactive'}`}>{org.is_active ? 'Active' : 'Inactive'}</span></td>
                  <td><ChevronRight size={14} style={{ color: 'var(--muted)' }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Detail panel ── */}
      {selected && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && closeDetail()}>
          <div className="modal modal-lg" style={{ maxWidth: 680 }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                {selected.logo_url
                  ? <img src={selected.logo_url} alt={selected.name} style={{ height: 40, maxWidth: 110, objectFit: 'contain', borderRadius: 6, border: '1px solid #e2e8f0' }} />
                  : <div style={{ width: 44, height: 44, background: '#f1f5f9', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}><Building2 size={20} /></div>
                }
                <div>
                  <h3 className="modal-title" style={{ marginBottom: 2 }}>
                    {selected.name}
                    {selected.is_default && <span className="badge badge-paid" style={{ marginLeft: 8, fontSize: '0.7rem' }}>Default</span>}
                  </h3>
                  {selected.legal_name && selected.legal_name !== selected.name && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{selected.legal_name}</div>
                  )}
                  {selected.tagline && (
                    <div style={{ fontSize: '0.78rem', color: 'var(--muted)', fontStyle: 'italic' }}>{selected.tagline}</div>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {!selected.is_default && (
                  <button className="btn btn-sm" style={{ color: 'var(--accent)', border: '1px solid var(--accent)', background: 'transparent' }} onClick={() => handleSetDefault(selected)}>
                    <Star size={13} /> Set Default
                  </button>
                )}
                <button className="btn btn-secondary btn-sm" onClick={() => { closeDetail(); openEdit(selected) }}>
                  <Edit2 size={13} /> Edit
                </button>
                <button className="btn btn-sm" style={{ color: 'var(--danger)', border: '1px solid var(--danger)', background: 'transparent' }} onClick={() => handleDelete(selected)}>
                  <Trash2 size={13} /> Delete
                </button>
                <button className="btn-close" onClick={closeDetail}><X size={18} /></button>
              </div>
            </div>

            {/* Stats strip */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
              {[
                { label: 'Currency', value: selected.default_currency || 'USD' },
                { label: 'Invoice Prefix', value: selected.invoice_prefix || 'INV' },
                { label: 'Quote Prefix', value: selected.quote_prefix || 'QUO' },
              ].map(item => (
                <div key={item.label} style={{ padding: '12px 22px', borderRight: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>{item.label}</div>
                  <div style={{ fontSize: '1.05rem', fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>{item.value}</div>
                </div>
              ))}
            </div>

            {/* Detail tabs */}
            <div className="tab-bar" style={{ padding: '0 26px', borderBottom: '1px solid var(--border)' }}>
              {DETAIL_TABS.map(t => (
                <button key={t} className={`tab${detailTab === t ? ' active' : ''}`} onClick={() => setDetailTab(t)} style={{ textTransform: 'capitalize' }}>{t}</button>
              ))}
            </div>

            <div className="modal-body" style={{ maxHeight: '52vh', overflowY: 'auto' }}>
              {detailTab === 'info' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                  <div>
                    <p className="detail-section-label">Contact</p>
                    {selected.email && <div className="detail-row"><Mail size={13} /><a href={`mailto:${selected.email}`} style={{ color: 'var(--accent)' }}>{selected.email}</a></div>}
                    {selected.phone && <div className="detail-row"><Phone size={13} /><span>{selected.phone}</span></div>}
                    {selected.website && <div className="detail-row"><Globe size={13} /><a href={selected.website} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>{selected.website.replace(/^https?:\/\//, '')}</a></div>}
                    {!selected.email && !selected.phone && !selected.website && <p style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>No contact info</p>}
                    {(selected.tax_number || selected.registration_number) && (
                      <>
                        <p className="detail-section-label" style={{ marginTop: 16 }}>Tax & Registration</p>
                        {selected.tax_number && <div className="detail-row"><Hash size={13} /><span>Tax: {selected.tax_number}</span></div>}
                        {selected.registration_number && <div className="detail-row"><Hash size={13} /><span>Reg: {selected.registration_number}</span></div>}
                      </>
                    )}
                  </div>
                  <div>
                    <p className="detail-section-label">Address</p>
                    {selected.full_address
                      ? <div className="detail-row" style={{ alignItems: 'flex-start' }}><MapPin size={13} style={{ marginTop: 2 }} /><span style={{ whiteSpace: 'pre-line' }}>{selected.full_address}</span></div>
                      : <p style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>No address on file</p>
                    }
                  </div>
                </div>
              )}

              {detailTab === 'banking' && (
                <div>
                  {(selected.bank_name || selected.bank_account_name || selected.bank_account_number || selected.bank_sort_code || selected.bank_swift_iban || selected.bank_instructions) ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                      {[
                        { label: 'Bank Name', value: selected.bank_name },
                        { label: 'Account Name', value: selected.bank_account_name },
                        { label: 'Account Number', value: selected.bank_account_number },
                        { label: 'Routing / Sort Code', value: selected.bank_sort_code },
                        { label: 'SWIFT / IBAN', value: selected.bank_swift_iban },
                      ].filter(r => r.value).map(row => (
                        <div key={row.label}>
                          <p className="detail-section-label">{row.label}</p>
                          <p style={{ fontSize: '0.9rem', fontFamily: 'var(--font-mono)', color: 'var(--ink)' }}>{row.value}</p>
                        </div>
                      ))}
                      {selected.bank_instructions && (
                        <div style={{ gridColumn: '1 / -1' }}>
                          <p className="detail-section-label">Payment Instructions</p>
                          <p style={{ fontSize: '0.85rem', color: 'var(--muted)', whiteSpace: 'pre-line' }}>{selected.bank_instructions}</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="empty-state" style={{ padding: '32px 0' }}>
                      <CreditCard /><h3>No banking details</h3><p>Edit this organization to add banking info.</p>
                    </div>
                  )}
                </div>
              )}

              {detailTab === 'defaults' && (() => {
                const rows = [
                  { label: 'Sales Invoice',    notes: selected.default_invoice_notes,     terms: selected.default_invoice_terms },
                  { label: 'Retainer Invoice', notes: selected.default_retainer_notes,    terms: selected.default_retainer_terms },
                  { label: 'Credit Note',      notes: selected.default_credit_note_notes, terms: selected.default_credit_note_terms },
                  { label: 'Sales Receipt',    notes: selected.default_receipt_notes,     terms: selected.default_receipt_terms },
                  { label: 'Quote',            notes: selected.default_quote_notes,       terms: selected.default_quote_terms },
                  { label: 'Report',           notes: selected.default_report_notes,      terms: null },
                ].filter(r => r.notes || r.terms)
                return rows.length === 0 ? (
                  <div className="empty-state" style={{ padding: '32px 0' }}>
                    <Building2 /><h3>No defaults configured</h3><p>Edit this organization to set default notes and terms.</p>
                  </div>
                ) : rows.map(row => (
                  <div key={row.label} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
                    <p className="detail-section-label">{row.label}</p>
                    <div style={{ display: 'grid', gridTemplateColumns: row.terms ? '1fr 1fr' : '1fr', gap: 12 }}>
                      {row.notes && <div><p style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>Notes</p><p style={{ fontSize: '0.82rem', whiteSpace: 'pre-line' }}>{row.notes}</p></div>}
                      {row.terms && <div><p style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>Terms</p><p style={{ fontSize: '0.82rem', whiteSpace: 'pre-line' }}>{row.terms}</p></div>}
                    </div>
                  </div>
                ))
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ── Create / Edit modal ── */}
      {modal && (
        <div className="modal-overlay" style={{ zIndex: 600 }} onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="modal modal-lg" style={{ maxWidth: 720 }}>
            <div className="modal-header">
              <h3 className="modal-title">{modal === 'create' ? 'New Organization' : `Edit — ${modal.name}`}</h3>
              <button className="btn-close" onClick={closeModal}><X size={18} /></button>
            </div>

            <div className="tab-bar" style={{ padding: '0 26px', borderBottom: '1px solid var(--border)' }}>
              {FORM_TABS.map(t => (
                <button key={t.key} type="button" className={`tab${formTab === t.key ? ' active' : ''}`} onClick={() => setFormTab(t.key)}>{t.label}</button>
              ))}
            </div>

            <form onSubmit={save}>
              <div className="modal-body">
                <input ref={fileRef} type="file" accept="image/png,image/jpeg" style={{ display: 'none' }} onChange={handleLogoChange} />

                {formTab === 'identity' && (
                  <div className="form-grid">
                    <div className="form-group form-group-full">
                      <label className="form-label">Logo <span style={{ fontWeight: 400, color: 'var(--muted)' }}>PNG or JPEG, max 2 MB</span></label>
                      <div className="logo-upload-area">
                        {logoPreview ? (
                          <div className="logo-preview-wrap">
                            <img src={logoPreview} alt="Logo preview" className="logo-preview-img" />
                            <div className="logo-preview-actions">
                              <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()}><Upload size={13} /> Replace</button>
                              <button type="button" className="btn btn-sm" style={{ color: 'var(--danger)', border: '1px solid var(--danger)', background: 'transparent' }} onClick={handleDeleteLogo}><Trash2 size={13} /> Remove</button>
                            </div>
                          </div>
                        ) : (
                          <button type="button" className="logo-upload-btn" onClick={() => fileRef.current?.click()}>
                            <Upload size={20} /><span>Click to upload logo</span><span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>PNG or JPEG up to 2 MB</span>
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Organization Name <span style={{ color: 'var(--danger)' }}>*</span></label>
                      <input className="form-control" required value={form.name} onChange={e => setF('name', e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Legal Name <span style={{ color: 'var(--muted)', fontWeight: 400 }}>if different</span></label>
                      <input className="form-control" value={form.legal_name} onChange={e => setF('legal_name', e.target.value)} />
                    </div>
                    <div className="form-group form-group-full">
                      <label className="form-label">Tagline</label>
                      <input className="form-control" value={form.tagline} onChange={e => setF('tagline', e.target.value)} placeholder="e.g. Finance & Billing" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Default Currency</label>
                      <select className="form-control" value={form.default_currency} onChange={e => setF('default_currency', e.target.value)}>
                        {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Invoice Prefix</label>
                      <input className="form-control" value={form.invoice_prefix} onChange={e => setF('invoice_prefix', e.target.value.toUpperCase())} maxLength={10} placeholder="INV" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Quote Prefix</label>
                      <input className="form-control" value={form.quote_prefix} onChange={e => setF('quote_prefix', e.target.value.toUpperCase())} maxLength={10} placeholder="QUO" />
                    </div>
                    <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <input type="checkbox" id="chk-default" checked={form.is_default} onChange={e => setF('is_default', e.target.checked)} style={{ width: 16, height: 16, cursor: 'pointer' }} />
                      <label htmlFor="chk-default" style={{ fontSize: '0.85rem', cursor: 'pointer', marginBottom: 0 }}>Set as default organization</label>
                    </div>
                  </div>
                )}

                {formTab === 'contact' && (
                  <div className="form-grid">
                    <div className="form-group"><label className="form-label">Email</label><input className="form-control" type="email" value={form.email} onChange={e => setF('email', e.target.value)} /></div>
                    <div className="form-group"><label className="form-label">Phone</label><input className="form-control" value={form.phone} onChange={e => setF('phone', e.target.value)} /></div>
                    <div className="form-group form-group-full"><label className="form-label">Website</label><input className="form-control" type="url" value={form.website} onChange={e => setF('website', e.target.value)} placeholder="https://" /></div>
                    <div className="form-group form-group-full"><label className="form-label">Address Line 1</label><input className="form-control" value={form.address_line1} onChange={e => setF('address_line1', e.target.value)} /></div>
                    <div className="form-group form-group-full"><label className="form-label">Address Line 2</label><input className="form-control" value={form.address_line2} onChange={e => setF('address_line2', e.target.value)} /></div>
                    <div className="form-group"><label className="form-label">City</label><input className="form-control" value={form.city} onChange={e => setF('city', e.target.value)} /></div>
                    <div className="form-group"><label className="form-label">State / Province</label><input className="form-control" value={form.state} onChange={e => setF('state', e.target.value)} /></div>
                    <div className="form-group"><label className="form-label">Postal Code</label><input className="form-control" value={form.postal_code} onChange={e => setF('postal_code', e.target.value)} /></div>
                    <div className="form-group"><label className="form-label">Country</label><input className="form-control" value={form.country} onChange={e => setF('country', e.target.value)} /></div>
                  </div>
                )}

                {formTab === 'tax' && (
                  <div className="form-grid">
                    <div className="form-group"><label className="form-label">Tax Number <span style={{ color: 'var(--muted)', fontWeight: 400 }}>VAT / GST / Tax ID</span></label><input className="form-control" value={form.tax_number} onChange={e => setF('tax_number', e.target.value)} placeholder="e.g. GB123456789" /></div>
                    <div className="form-group"><label className="form-label">Registration Number <span style={{ color: 'var(--muted)', fontWeight: 400 }}>ABN / EIN / Co. Reg</span></label><input className="form-control" value={form.registration_number} onChange={e => setF('registration_number', e.target.value)} /></div>
                  </div>
                )}

                {formTab === 'banking' && (
                  <div className="form-grid">
                    <div className="form-group form-group-full"><label className="form-label">Bank Name</label><input className="form-control" value={form.bank_name} onChange={e => setF('bank_name', e.target.value)} /></div>
                    <div className="form-group"><label className="form-label">Account Name</label><input className="form-control" value={form.bank_account_name} onChange={e => setF('bank_account_name', e.target.value)} /></div>
                    <div className="form-group"><label className="form-label">Account Number</label><input className="form-control" value={form.bank_account_number} onChange={e => setF('bank_account_number', e.target.value)} /></div>
                    <div className="form-group"><label className="form-label">Routing Number / Sort Code</label><input className="form-control" value={form.bank_sort_code} onChange={e => setF('bank_sort_code', e.target.value)} placeholder="e.g. 04-00-04" /></div>
                    <div className="form-group"><label className="form-label">SWIFT / BIC / IBAN</label><input className="form-control" value={form.bank_swift_iban} onChange={e => setF('bank_swift_iban', e.target.value)} placeholder="e.g. BARCGB22" /></div>
                    <div className="form-group form-group-full"><label className="form-label">Additional Payment Instructions</label><textarea className="form-control" value={form.bank_instructions} onChange={e => setF('bank_instructions', e.target.value)} rows={3} placeholder="Shown at the bottom of invoices…" /></div>
                  </div>
                )}

                {formTab === 'defaults' && (
                  <div>
                    {[
                      { label: 'Sales Invoice',    noteKey: 'default_invoice_notes',     termsKey: 'default_invoice_terms' },
                      { label: 'Retainer Invoice', noteKey: 'default_retainer_notes',    termsKey: 'default_retainer_terms' },
                      { label: 'Credit Note',      noteKey: 'default_credit_note_notes', termsKey: 'default_credit_note_terms' },
                      { label: 'Sales Receipt',    noteKey: 'default_receipt_notes',     termsKey: 'default_receipt_terms' },
                      { label: 'Quote',            noteKey: 'default_quote_notes',       termsKey: 'default_quote_terms' },
                    ].map(({ label, noteKey, termsKey }) => (
                      <DefaultsSection key={label} label={label} noteValue={form[noteKey]} termsValue={form[termsKey]} onNoteChange={v => setF(noteKey, v)} onTermsChange={v => setF(termsKey, v)} />
                    ))}
                    <div className="form-group" style={{ marginTop: 16 }}>
                      <label className="form-label">Report Notes</label>
                      <textarea className="form-control" value={form.default_report_notes} onChange={e => setF('default_report_notes', e.target.value)} rows={3} placeholder="Notes printed on generated reports…" />
                    </div>
                  </div>
                )}
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : modal === 'create' ? 'Create Organization' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        .logo-upload-area { margin-top: 6px; }
        .logo-upload-btn { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; width: 100%; padding: 32px; border: 2px dashed #e2e8f0; border-radius: 10px; background: #f8fafc; cursor: pointer; color: #64748b; font-size: 0.875rem; transition: border-color 0.15s; }
        .logo-upload-btn:hover { border-color: #3b82f6; background: #eff6ff; }
        .logo-preview-wrap { display: flex; align-items: center; gap: 16px; padding: 16px; border: 1px solid #e2e8f0; border-radius: 10px; background: #f8fafc; }
        .logo-preview-img { max-height: 64px; max-width: 200px; object-fit: contain; border-radius: 4px; }
        .logo-preview-actions { display: flex; flex-direction: column; gap: 6px; }
        .defaults-section { border: 1px solid #e2e8f0; border-radius: 10px; margin-bottom: 12px; overflow: hidden; }
        .defaults-section-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: #f8fafc; cursor: pointer; font-weight: 500; font-size: 0.875rem; }
        .defaults-section-body { padding: 16px; display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        @media (max-width: 540px) { .defaults-section-body { grid-template-columns: 1fr; } }
        .detail-section-label { font-size: 0.7rem; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; }
        .detail-row { display: flex; align-items: center; gap: 8px; font-size: 0.85rem; color: var(--ink); margin-bottom: 6px; }
      `}</style>
    </>
  )
}

function DefaultsSection({ label, noteValue, termsValue, onNoteChange, onTermsChange }) {
  const [open, setOpen] = useState(false)
  const hasContent = noteValue || termsValue
  return (
    <div className="defaults-section">
      <div className="defaults-section-header" onClick={() => setOpen(p => !p)}>
        <span>{label} Defaults {hasContent && <span style={{ color: '#3b82f6', fontSize: '0.75rem', marginLeft: 8 }}>● Configured</span>}</span>
        <ChevronDown size={16} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </div>
      {open && (
        <div className="defaults-section-body">
          <div className="form-group">
            <label className="form-label">Default Notes</label>
            <textarea className="form-control" value={noteValue} onChange={e => onNoteChange(e.target.value)} rows={4} placeholder={`Default notes for ${label}…`} />
          </div>
          <div className="form-group">
            <label className="form-label">Default Terms & Conditions</label>
            <textarea className="form-control" value={termsValue} onChange={e => onTermsChange(e.target.value)} rows={4} placeholder={`Default T&C for ${label}…`} />
          </div>
        </div>
      )}
    </div>
  )
}