/**
 * EmailJS manager notification for stock reports (same service/template as time off).
 * Fire-and-forget; callers should not await in critical paths.
 */

const EMAILJS_SERVICE_ID = 'service_lh2sttd'
const EMAILJS_TEMPLATE_ID = 'template_g96a7jq'
const EMAILJS_PUBLIC_KEY = '0zmN_x9c6Iy-FFHcR'

export const sendStockReportEmailNotification = async (params: {
  kind: 'low' | 'out'
  item: string
  by?: string
  reportedAtIso?: string
}) => {
  try {
    const kindLabel = params.kind === 'out' ? 'OUT OF STOCK' : 'LOW STOCK'
    const by = (params.by || '').trim() || 'Staff'
    const item = String(params.item || '').trim()
    const reportedAtIso = params.reportedAtIso || new Date().toISOString()

    const templateParams = {
      employee: by,
      days: `${kindLabel}: ${item}`,
      kind: kindLabel,
      item,
      reported_at: reportedAtIso,
    }

    const formData = new FormData()
    formData.append('service_id', EMAILJS_SERVICE_ID)
    formData.append('template_id', EMAILJS_TEMPLATE_ID)
    formData.append('user_id', EMAILJS_PUBLIC_KEY)
    formData.append('template_params', JSON.stringify(templateParams))

    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send-form', {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('EmailJS stock report send failed:', response.status, errorText)
    } else {
      console.log('EmailJS stock report email sent successfully!')
    }
  } catch (e) {
    console.error('EmailJS stock report send error:', e)
  }
}
