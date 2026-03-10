import { createContext, useContext, useState, useEffect } from 'react'
import { login as apiLogin, logout as apiLogout } from '../utils/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

useEffect(() => {
  const token = localStorage.getItem('access_token')
  const userData = localStorage.getItem('user_data')

  if (token && userData) {
    try {
      setUser(JSON.parse(userData))
    } catch {
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      localStorage.removeItem('user_data')
      setUser(null)
    }
  } else {
    setUser(null)
  }

  setLoading(false)
}, [])

  const login = async (email, password) => {
    const { data } = await apiLogin(email, password)
    localStorage.setItem('access_token', data.access)
    localStorage.setItem('refresh_token', data.refresh)
    const user = data.user || { email, first_name: email.split('@')[0] }
    localStorage.setItem('user_data', JSON.stringify(user))
    setUser(user)
    return user
  }

  // Store tokens from registration response (same shape as login)
  const loginWithTokens = (data) => {
    localStorage.setItem('access_token', data.access)
    localStorage.setItem('refresh_token', data.refresh)
    const user = data.user
    localStorage.setItem('user_data', JSON.stringify(user))
    setUser(user)
    return user
  }

  const logout = async () => {
    const refresh = localStorage.getItem('refresh_token')
    // Best-effort: blacklist the token on the server
    if (refresh) {
      try { await apiLogout(refresh) } catch {}
    }
    localStorage.clear()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, login, loginWithTokens, logout, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
