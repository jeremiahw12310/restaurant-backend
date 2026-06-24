/** Main TRAQ app URL (for links from the admin-only site). Defaults to primary Firebase Hosting URL. */
export function getTraqAppUrl(): string {
  const u = import.meta.env.VITE_TRAQ_APP_URL as string | undefined
  if (u && u.length > 0) return u.replace(/\/$/, '')
  return 'https://traq-caab9.web.app'
}
