/**
 * EmailJS manager notification for job applications (same service/template as time off).
 * Fire-and-forget; callers should not await in critical paths.
 */

const EMAILJS_SERVICE_ID = 'service_lh2sttd'
const EMAILJS_TEMPLATE_ID = 'template_g96a7jq'
const EMAILJS_PUBLIC_KEY = '0zmN_x9c6Iy-FFHcR'

export const sendJobApplicationEmailNotification = async (params: {
  name: string
  email: string
  phone: string
}) => {
  try {
    const name = (params.name || '').trim() || 'Applicant'
    const email = (params.email || '').trim()
    const phone = (params.phone || '').trim()

    const templateParams = {
      employee: name,
      days: `NEW JOB APPLICATION: ${email} · ${phone}`,
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
      console.error('EmailJS job application send failed:', response.status, errorText)
    } else {
      console.log('EmailJS job application email sent successfully!')
    }
  } catch (e) {
    console.error('EmailJS job application send error:', e)
  }
}
