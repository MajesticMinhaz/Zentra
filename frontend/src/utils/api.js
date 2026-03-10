import axios from 'axios'

const api = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('access_token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

api.interceptors.response.use(
  r => r,
  async err => {
    const original = err.config
    if (err.response?.status === 401 && !original._retry) {
      original._retry = true
      const refresh = localStorage.getItem('refresh_token')
      if (refresh) {
        try {
          const { data } = await axios.post('/api/v1/auth/refresh/', { refresh })
          localStorage.setItem('access_token', data.access)
          original.headers.Authorization = `Bearer ${data.access}`
          return api(original)
        } catch {
          localStorage.clear()
          window.location.href = '/login'
        }
      } else {
        localStorage.clear()
        window.location.href = '/login'
      }
    }
    return Promise.reject(err)
  }
)

export default api

// Helper: download a PDF URL that requires auth headers
export const downloadPdfUrl = async (url, filename) => {
  // build_absolute_uri returns the internal backend URL (e.g. http://localhost:8000/media/...)
  // Convert to a relative path so the browser fetches through nginx instead
  let fetchUrl = url
  try {
    const parsed = new URL(url)
    fetchUrl = parsed.pathname + parsed.search
  } catch { /* already relative */ }

  // Append cache-busting timestamp so the browser never serves a stale cached PDF
  const separator = fetchUrl.includes('?') ? '&' : '?'
  fetchUrl = `${fetchUrl}${separator}v=${Date.now()}`

  // Media files are served directly by Nginx — no Authorization header needed
  // (adding it triggers a CORS preflight that Nginx rejects)
  const response = await fetch(fetchUrl)
  if (!response.ok) throw new Error(`Download failed: ${response.status}`)
  const blob = await response.blob()
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = filename || 'document.pdf'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(objectUrl)
}

// Organizations
export const getOrganizations = (params) => api.get('/organizations/', { params })
export const getOrganization = (id) => api.get(`/organizations/${id}/`)
export const getDefaultOrganization = () => api.get('/organizations/default/')
export const createOrganization = (data) => api.post('/organizations/', data)
export const updateOrganization = (id, data) => api.patch(`/organizations/${id}/`, data)
export const deleteOrganization = (id) => api.delete(`/organizations/${id}/`)
export const setDefaultOrganization = (id) => api.post(`/organizations/${id}/set-default/`)
export const deleteOrganizationLogo = (id) => api.delete(`/organizations/${id}/logo/`)

// Auth
export const login = (email, password) =>
  api.post('/auth/login/', { email, password })

export const register = (data) =>
  api.post('/auth/register/', data)

export const logout = (refresh) =>
  api.post('/auth/logout/', { refresh })

// Customers
export const getCustomers = (params) => api.get('/customers/', { params })
export const getCustomer = (id) => api.get(`/customers/${id}/`)
export const createCustomer = (data) => api.post('/customers/', data)
export const updateCustomer = (id, data) => api.patch(`/customers/${id}/`, data)
export const deleteCustomer = (id) => api.delete(`/customers/${id}/`)
export const restoreCustomer = (id) => api.post(`/customers/${id}/restore/`)
export const getCustomerStatement = (id) => api.get(`/customers/${id}/statement/`)
export const applyCustomerCredit = (id, data) => api.post(`/customers/${id}/apply-credit/`, data)

// Customer Contacts
export const getCustomerContacts = (customerId) =>
  api.get(`/customers/${customerId}/contacts/`)
export const createCustomerContact = (customerId, data) =>
  api.post(`/customers/${customerId}/contacts/`, data)
export const updateCustomerContact = (customerId, contactId, data) =>
  api.patch(`/customers/${customerId}/contacts/${contactId}/`, data)
export const deleteCustomerContact = (customerId, contactId) =>
  api.delete(`/customers/${customerId}/contacts/${contactId}/`)

// Items
export const getItems = (params) => api.get('/items/', { params })
export const getItem = (id) => api.get(`/items/${id}/`)
export const createItem = (data) => api.post('/items/', data)
export const updateItem = (id, data) => api.patch(`/items/${id}/`, data)
export const deleteItem = (id) => api.delete(`/items/${id}/`)

// Invoices
export const getInvoices = (params) => api.get('/invoices/', { params })
export const getInvoice = (id) => api.get(`/invoices/${id}/`)
export const createInvoice = (data) => api.post('/invoices/', data)
export const updateInvoice = (id, data) => api.patch(`/invoices/${id}/`, data)
export const deleteInvoice = (id) => api.delete(`/invoices/${id}/`)
export const sendInvoice = (id) => api.post(`/invoices/${id}/send/`)
export const cancelInvoice = (id) => api.post(`/invoices/${id}/cancel/`)
export const generateInvoicePdf = (id) => api.post(`/invoices/${id}/generate-pdf/`)
export const getInvoicePdf = (id) => api.get(`/invoices/${id}/pdf/`)
export const createCreditNote = (id, data) => api.post(`/invoices/${id}/credit-note/`, data)

// Quotes
export const getQuotes = (params) => api.get('/quotes/', { params })
export const getQuote = (id) => api.get(`/quotes/${id}/`)
export const createQuote = (data) => api.post('/quotes/', data)
export const updateQuote = (id, data) => api.patch(`/quotes/${id}/`, data)
export const deleteQuote = (id) => api.delete(`/quotes/${id}/`)
export const sendQuote = (id) => api.post(`/quotes/${id}/send/`)
export const acceptQuote = (id) => api.post(`/quotes/${id}/accept/`)
export const rejectQuote = (id) => api.post(`/quotes/${id}/reject/`)
export const convertQuoteToInvoice = (id) => api.post(`/quotes/${id}/convert-to-invoice/`)
export const getQuotePdf = (id) => api.get(`/quotes/${id}/pdf/`)

// Payments
export const getPayments = (params) => api.get('/payments/', { params })
export const createPayment = (data) => api.post('/payments/', data)
export const refundPayment = (id, data) => api.post(`/payments/${id}/refund/`, data)

// Tax rates
export const getTaxRates = () => api.get('/tax-rates/')
export const createTaxRate = (data) => api.post('/tax-rates/', data)

// Subscriptions
export const getSubscriptions = (params) => api.get('/subscriptions/', { params })
export const createSubscription = (data) => api.post('/subscriptions/', data)
export const updateSubscription = (id, data) => api.patch(`/subscriptions/${id}/`, data)
export const deleteSubscription = (id) => api.delete(`/subscriptions/${id}/`)

// Reports
export const getRevenueReport = (params) => api.get('/reports/revenue-by-month/', { params })
export const getOutstandingReport = () => api.get('/reports/outstanding-invoices/')
export const getMRRReport = () => api.get('/reports/mrr/')
export const getCustomerBalances = () => api.get('/reports/customer-balances/')
export const getRevenueReportPdfUrl = (year) => `/api/v1/reports/revenue-pdf/?year=${year}`