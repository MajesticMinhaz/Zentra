export const fmt = {
  currency: (v, currency = 'USD') =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(v ?? 0),

  date: (d) => {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  },

  datetime: (d) => {
    if (!d) return '—'
    return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  },

  initials: (name = '') =>
    name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2),
}

export const today = () => new Date().toISOString().split('T')[0]

export const getError = (err) => {
  const d = err?.response?.data
  if (!d) return err?.message || 'Something went wrong'
  if (typeof d === 'string') return d
  const vals = Object.values(d).flat()
  return vals[0] || 'Something went wrong'
}
