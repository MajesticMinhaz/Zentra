import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { register } from '../utils/api'
import { getError } from '../utils/helpers'
import { Eye, EyeOff, UserPlus } from 'lucide-react'

export default function RegisterPage() {
  const { loginWithTokens } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    first_name: '', last_name: '', email: '', phone: '',
    password: '', confirm_password: '',
  })
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const f = (field) => ({
    value: form[field],
    onChange: (e) => {
      setForm(p => ({ ...p, [field]: e.target.value }))
      if (fieldErrors[field]) setFieldErrors(p => ({ ...p, [field]: null }))
    },
  })

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setFieldErrors({})

    if (form.password !== form.confirm_password) {
      setFieldErrors({ confirm_password: ['Passwords do not match.'] })
      return
    }

    setLoading(true)
    try {
      const { data } = await register(form)
      loginWithTokens(data)
      navigate('/')
    } catch (err) {
      const d = err?.response?.data
      if (d && typeof d === 'object' && !Array.isArray(d)) {
        setFieldErrors(d)
        setError('Please fix the errors below.')
      } else {
        setError(getError(err))
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card" style={{ maxWidth: 440 }}>
        <div className="login-logo">
          <h1>Zentra</h1>
          <p>Create your account</p>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={submit}>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">First Name <span style={{ color: 'var(--danger)' }}>*</span></label>
              <input className="form-control" required placeholder="Jane" {...f('first_name')} />
              {fieldErrors.first_name && <p style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: 4 }}>{[].concat(fieldErrors.first_name)[0]}</p>}
            </div>
            <div className="form-group">
              <label className="form-label">Last Name <span style={{ color: 'var(--danger)' }}>*</span></label>
              <input className="form-control" required placeholder="Smith" {...f('last_name')} />
              {fieldErrors.last_name && <p style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: 4 }}>{[].concat(fieldErrors.last_name)[0]}</p>}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Email address <span style={{ color: 'var(--danger)' }}>*</span></label>
            <input className="form-control" type="email" required placeholder="you@company.com" {...f('email')} />
            {fieldErrors.email && <p style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: 4 }}>{[].concat(fieldErrors.email)[0]}</p>}
          </div>

          <div className="form-group">
            <label className="form-label">Phone <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(optional)</span></label>
            <input className="form-control" type="tel" placeholder="+1 555 000 0000" {...f('phone')} />
          </div>

          <div className="form-group" style={{ position: 'relative' }}>
            <label className="form-label">Password <span style={{ color: 'var(--danger)' }}>*</span></label>
            <input
              className="form-control"
              type={showPass ? 'text' : 'password'}
              required
              minLength={8}
              placeholder="Min. 8 characters"
              style={{ paddingRight: 40 }}
              {...f('password')}
            />
            <button
              type="button"
              onClick={() => setShowPass(p => !p)}
              style={{ position: 'absolute', right: 12, top: 30, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 0 }}
            >
              {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
            {fieldErrors.password && <p style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: 4 }}>{[].concat(fieldErrors.password)[0]}</p>}
          </div>

          <div className="form-group" style={{ position: 'relative' }}>
            <label className="form-label">Confirm Password <span style={{ color: 'var(--danger)' }}>*</span></label>
            <input
              className="form-control"
              type={showConfirm ? 'text' : 'password'}
              required
              placeholder="Repeat password"
              style={{ paddingRight: 40 }}
              {...f('confirm_password')}
            />
            <button
              type="button"
              onClick={() => setShowConfirm(p => !p)}
              style={{ position: 'absolute', right: 12, top: 30, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 0 }}
            >
              {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
            {fieldErrors.confirm_password && <p style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: 4 }}>{[].concat(fieldErrors.confirm_password)[0]}</p>}
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: '11px', marginTop: 4 }}
            disabled={loading}
          >
            {loading ? 'Creating account…' : <><UserPlus size={15} /> Create Account</>}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: '0.85rem', color: 'var(--muted)' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: 'var(--accent)', fontWeight: 500 }}>Sign in</Link>
        </p>
      </div>
    </div>
  )
}
