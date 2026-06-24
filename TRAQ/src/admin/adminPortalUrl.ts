/** Dedicated admin portal URL (for links from the main TRAQ app and /admin/* redirects). */
export function getAdminPortalUrl(): string {
  const u = import.meta.env.VITE_ADMIN_PORTAL_URL as string | undefined
  if (u && u.length > 0) return u.replace(/\/$/, '')
  return 'https://traq-admin.web.app'
}
