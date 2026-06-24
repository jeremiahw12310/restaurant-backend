import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { getAdminPortalUrl } from '../admin/adminPortalUrl'

/**
 * Redirects legacy main-site URLs `/admin` and `/admin/*` to the dedicated admin hosting URL.
 */
export function AdminPortalRedirect() {
  const location = useLocation()

  useEffect(() => {
    const base = getAdminPortalUrl()
    const suffix = location.pathname.replace(/^\/admin\/?/, '') || '/'
    const path = suffix.startsWith('/') ? suffix : `/${suffix}`
    const url = `${base}${path === '//' ? '/' : path}${location.search ?? ''}`
    window.location.replace(url)
  }, [location.pathname, location.search])

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <p>Opening admin portal…</p>
    </div>
  )
}
