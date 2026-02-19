import { useState, type FormEvent } from 'react'
import { 
  submitApplication, 
  type ShiftKey, 
  LUNCH_SHIFTS, 
  DINNER_SHIFTS,
  type NewApplicationData 
} from '../services/applications'
import tlogoUrl from '../assets/TLOGO.png'
import diningUrl from '../assets/dining.JPG'

const SHIFT_DAY_LABELS: Record<string, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
}

const BENEFITS = [
  { icon: '💰', title: 'Great Pay', description: '$13/hr base + shared tips' },
  { icon: '🤝', title: 'Team Vibes', description: 'Friendly, supportive coworkers' },
  { icon: '🍔', title: 'Free Meals', description: 'Delicious food on your shift' },
  { icon: '📅', title: 'Flexible', description: 'Perfect for busy schedules' },
  { icon: '📈', title: 'Growth', description: 'Learn new skills' },
] as const

const WHAT_YOULL_DO = [
  'Welcome and assist guests with a smile',
  'Operate the register & POS system',
  'Prepare and hand out orders',
  'Help keep the restaurant clean and inviting',
] as const

const WHAT_WERE_LOOKING_FOR = [
  '18 years or older',
  'Legally able to work in the U.S.',
  'Can stand/walk for your shift and lift up to 20 lbs',
  'Punctual, reliable, and a team player',
  'Good communication skills',
  'Willingness to learn',
] as const

export function BonfireApply() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    birthDate: '',
    address: '',
    phone: '',
    employmentHistory: '',
    felonyConviction: null as boolean | null,
  })
  const [availability, setAvailability] = useState<Set<ShiftKey>>(new Set())
  const [availabilityOther, setAvailabilityOther] = useState('')
  const [showOther, setShowOther] = useState(false)
  
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleInputChange = (field: keyof typeof formData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const toggleShift = (shift: ShiftKey) => {
    setAvailability(prev => {
      const next = new Set(prev)
      if (next.has(shift)) {
        next.delete(shift)
      } else {
        next.add(shift)
      }
      return next
    })
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    // Validation
    if (!formData.name.trim()) {
      setError('Please enter your name')
      return
    }
    if (!formData.email.trim() || !formData.email.includes('@')) {
      setError('Please enter a valid email address')
      return
    }
    if (!formData.birthDate) {
      setError('Please enter your birth date')
      return
    }
    if (!formData.address.trim()) {
      setError('Please enter your home address')
      return
    }
    if (!formData.phone.trim()) {
      setError('Please enter your phone number')
      return
    }
    if (availability.size === 0 && !availabilityOther.trim()) {
      setError('Please select at least one availability option')
      return
    }
    if (!formData.employmentHistory.trim()) {
      setError('Please enter your employment history')
      return
    }
    if (formData.felonyConviction === null) {
      setError('Please answer the felony conviction question')
      return
    }

    setIsSubmitting(true)

    try {
      const applicationData: NewApplicationData = {
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase(),
        birthDate: formData.birthDate,
        address: formData.address.trim(),
        phone: formData.phone.trim(),
        availability: Array.from(availability),
        availabilityOther: availabilityOther.trim() || undefined,
        employmentHistory: formData.employmentHistory.trim(),
        felonyConviction: formData.felonyConviction,
      }

      await submitApplication(applicationData)
      setIsSubmitted(true)
    } catch (err) {
      console.error('Failed to submit application:', err)
      setError('Failed to submit application. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-white to-gray-50 px-4 py-16 text-gray-900 sm:px-6">
        {/* Header */}
        <header className="fixed left-0 right-0 top-0 z-50 flex items-center justify-between bg-white px-4 py-3 shadow-sm">
          <div className="flex items-center gap-1">
            <img src={tlogoUrl} alt="TRAQ" className="h-10 w-auto" />
            <span className="text-xl font-bold tracking-tight text-gray-900">APPLY</span>
          </div>
          <span className="text-xl font-bold tracking-tight text-red-600">Bonfire Hermitage</span>
        </header>
        <div className="mx-auto w-full max-w-xl pt-16">
          <div className="rounded-3xl border border-gray-200 bg-white p-10 shadow-sm">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7" aria-hidden="true">
                <path
                  d="M20 6L9 17l-5-5"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h1 className="mt-6 text-center text-3xl font-semibold tracking-tight text-gray-900">
              Application submitted
            </h1>
            <p className="mt-3 text-center text-base text-gray-600">
              Thank you for applying to join the Bonfire Hermitage team.
            </p>
            <p className="mt-2 text-center text-sm text-gray-500">
              We’ll review your application and be in touch soon.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-white to-gray-50 text-gray-900">
      {/* Header */}
      <header className="fixed left-0 right-0 top-0 z-50 flex items-center justify-between bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-1">
          <img src={tlogoUrl} alt="TRAQ" className="h-10 w-auto" />
          <span className="text-xl font-bold tracking-tight text-gray-900">APPLY</span>
        </div>
        <span className="text-xl font-bold tracking-tight text-red-600">Bonfire Hermitage</span>
      </header>
      {/* Hero image */}
      <div className="mt-16">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
            <div className="relative h-44 sm:h-60 lg:h-72">
              <img
                src={diningUrl}
                alt="Bonfire restaurant interior"
                className="h-full w-full object-cover"
                loading="lazy"
                decoding="async"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-black/10 to-transparent" />

              <div className="absolute left-4 top-4 sm:left-5 sm:top-5">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/85 px-3 py-1 text-xs font-semibold tracking-wide text-brand shadow-sm backdrop-blur">
                  <span className="text-base leading-none" aria-hidden="true">🍽️</span>
                  NOW HIRING
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 pt-8 pb-10 sm:px-6 lg:px-8 lg:pt-10 lg:pb-14">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-start">
          {/* Left: role + details */}
          <div className="lg:col-span-5">
            <div className="rounded-3xl border border-gray-200 bg-white p-7 shadow-sm sm:p-8">
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-gray-900 sm:text-4xl">
                Join the Bonfire Hermitage Team
              </h1>

              <p className="mt-2 text-base font-medium text-gray-600">
                Part-Time Team Member
              </p>

              <div className="mt-5 rounded-2xl bg-gray-50 px-5 py-4">
                <div className="text-sm font-medium text-gray-600">Pay</div>
                <div className="mt-1 text-xl font-semibold text-gray-900">
                  Earn up to{' '}
                  <span className="text-brand">$23/hr</span>{' '}
                  <span className="text-base font-medium text-gray-600">with tips included</span>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {BENEFITS.map((b) => (
                  <div
                    key={b.title}
                    className="rounded-2xl border border-gray-200 bg-white px-4 py-4 shadow-sm"
                  >
                    <div className="text-xl" aria-hidden="true">{b.icon}</div>
                    <div className="mt-2 text-sm font-semibold text-gray-900">{b.title}</div>
                    <div className="mt-1 text-xs leading-snug text-gray-600">{b.description}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 grid gap-6">
              <section className="rounded-3xl border border-gray-200 bg-white p-7 shadow-sm sm:p-8">
                <h2 className="text-lg font-semibold text-gray-900">What you’ll do</h2>
                <ul className="mt-4 space-y-3">
                  {WHAT_YOULL_DO.map((item) => (
                    <li key={item} className="flex gap-3 text-sm text-gray-700">
                      <span className="mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded-full bg-brand/10 text-brand">
                        <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3" aria-hidden="true">
                          <path
                            fillRule="evenodd"
                            d="M16.704 5.29a1 1 0 010 1.414l-7.5 7.5a1 1 0 01-1.414 0l-3.5-3.5A1 1 0 015.704 9.29l2.793 2.793 6.793-6.793a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="rounded-3xl border border-gray-200 bg-white p-7 shadow-sm sm:p-8">
                <h2 className="text-lg font-semibold text-gray-900">What we’re looking for</h2>
                <ul className="mt-4 space-y-3">
                  {WHAT_WERE_LOOKING_FOR.map((item) => (
                    <li key={item} className="flex gap-3 text-sm text-gray-700">
                      <span className="mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded-full bg-gray-100 text-gray-700">
                        <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3" aria-hidden="true">
                          <path
                            fillRule="evenodd"
                            d="M16.704 5.29a1 1 0 010 1.414l-7.5 7.5a1 1 0 01-1.414 0l-3.5-3.5A1 1 0 015.704 9.29l2.793 2.793 6.793-6.793a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="rounded-3xl border border-gray-200 bg-white p-7 shadow-sm sm:p-8">
                <h2 className="text-lg font-semibold text-gray-900">Location</h2>
                <a
                  href="https://www.google.com/maps/dir/?api=1&destination=4021+Lebanon+Pike,+Hermitage,+TN"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 block text-sm text-gray-700 hover:text-red-600 transition-colors"
                >
                  <span className="font-medium">Bonfire Hermitage</span>
                  <br />
                  <span className="underline underline-offset-2">4021 Lebanon Pike, Hermitage, TN</span>
                  <span className="ml-1 text-xs text-gray-500">(Get directions)</span>
                </a>
                <p className="mt-3 text-xs text-gray-500">
                  Bonfire Hermitage — Where great food meets great people.
                </p>
              </section>
            </div>
          </div>

          {/* Right: application form */}
          <div className="lg:col-span-7">
            <section className="rounded-3xl border border-gray-200 bg-white p-7 shadow-sm sm:p-8">
              <div className="flex flex-col gap-2">
                <h2 className="text-2xl font-semibold tracking-tight text-gray-900">
                  Ready to join the team?
                </h2>
                <p className="text-sm text-gray-600">
                  Fill out the quick form below — it only takes a few minutes.
                </p>
              </div>

              {error && (
                <div
                  className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
                  role="alert"
                  aria-live="polite"
                >
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5" aria-hidden="true">⚠️</span>
                    <span>{error}</span>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="mt-7 space-y-8">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Contact info</h3>
                  <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-1">
                      <label htmlFor="name" className="text-sm font-medium text-gray-900">
                        Name <span className="text-brand">*</span>
                      </label>
                      <input
                        type="text"
                        id="name"
                        autoComplete="name"
                        placeholder="First and last name"
                        value={formData.name}
                        onChange={(e) => handleInputChange('name', e.target.value)}
                        disabled={isSubmitting}
                        className="mt-2 block w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15 disabled:bg-gray-50 disabled:text-gray-500"
                      />
                    </div>

                    <div className="sm:col-span-1">
                      <label htmlFor="email" className="text-sm font-medium text-gray-900">
                        Email <span className="text-brand">*</span>
                      </label>
                      <input
                        type="email"
                        id="email"
                        autoComplete="email"
                        placeholder="you@example.com"
                        value={formData.email}
                        onChange={(e) => handleInputChange('email', e.target.value)}
                        disabled={isSubmitting}
                        className="mt-2 block w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15 disabled:bg-gray-50 disabled:text-gray-500"
                      />
                    </div>

                    <div className="sm:col-span-1">
                      <label htmlFor="phone" className="text-sm font-medium text-gray-900">
                        Phone <span className="text-brand">*</span>
                      </label>
                      <input
                        type="tel"
                        id="phone"
                        autoComplete="tel"
                        inputMode="tel"
                        placeholder="(555) 123-4567"
                        value={formData.phone}
                        onChange={(e) => handleInputChange('phone', e.target.value)}
                        disabled={isSubmitting}
                        className="mt-2 block w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15 disabled:bg-gray-50 disabled:text-gray-500"
                      />
                    </div>

                    <div className="sm:col-span-1">
                      <label htmlFor="birthDate" className="text-sm font-medium text-gray-900">
                        Birth date <span className="text-brand">*</span>
                      </label>
                      <input
                        type="date"
                        id="birthDate"
                        autoComplete="bday"
                        value={formData.birthDate}
                        onChange={(e) => handleInputChange('birthDate', e.target.value)}
                        disabled={isSubmitting}
                        className="mt-2 block w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900 shadow-sm focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15 disabled:bg-gray-50 disabled:text-gray-500"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label htmlFor="address" className="text-sm font-medium text-gray-900">
                        Home address <span className="text-brand">*</span>
                      </label>
                      <textarea
                        id="address"
                        autoComplete="street-address"
                        placeholder="Street, City, State, ZIP"
                        value={formData.address}
                        onChange={(e) => handleInputChange('address', e.target.value)}
                        disabled={isSubmitting}
                        rows={2}
                        className="mt-2 block w-full resize-y rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15 disabled:bg-gray-50 disabled:text-gray-500"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Availability</h3>
                  <p className="mt-1 text-sm text-gray-600">
                    Select all shifts you’re available to work.
                    <span className="text-brand"> *</span>
                  </p>

                  <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
                    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                        Lunch (11am–5pm)
                      </div>
                      <div className="mt-3 space-y-2">
                        {LUNCH_SHIFTS.map((shift) => {
                          const day = shift.split('_')[0]
                          return (
                            <label
                              key={shift}
                              className="flex cursor-pointer items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm transition hover:bg-gray-50"
                            >
                              <input
                                type="checkbox"
                                checked={availability.has(shift)}
                                onChange={() => toggleShift(shift)}
                                disabled={isSubmitting}
                                className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand"
                              />
                              <span className="font-medium">{SHIFT_DAY_LABELS[day]}</span>
                            </label>
                          )
                        })}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                        Dinner (5pm–close)
                      </div>
                      <div className="mt-3 space-y-2">
                        {DINNER_SHIFTS.map((shift) => {
                          const day = shift.split('_')[0]
                          const isWeekend = day === 'fri' || day === 'sat' || day === 'sun'
                          return (
                            <label
                              key={shift}
                              className="flex cursor-pointer items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm transition hover:bg-gray-50"
                            >
                              <input
                                type="checkbox"
                                checked={availability.has(shift)}
                                onChange={() => toggleShift(shift)}
                                disabled={isSubmitting}
                                className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand"
                              />
                              <span className="flex items-baseline gap-2">
                                <span className="font-medium">{SHIFT_DAY_LABELS[day]}</span>
                                <span className="text-xs font-normal text-gray-500">
                                  {isWeekend ? '(til 10pm)' : '(til 9pm)'}
                                </span>
                              </span>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4">
                    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 shadow-sm transition hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={showOther}
                        onChange={(e) => setShowOther(e.target.checked)}
                        disabled={isSubmitting}
                        className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand"
                      />
                      <span className="font-medium">Other / notes about availability</span>
                    </label>

                    {showOther && (
                      <textarea
                        className="mt-3 block w-full resize-y rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15 disabled:bg-gray-50 disabled:text-gray-500"
                        placeholder="Any other availability details or schedule notes…"
                        value={availabilityOther}
                        onChange={(e) => setAvailabilityOther(e.target.value)}
                        disabled={isSubmitting}
                        rows={2}
                      />
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Work history</h3>
                  <label htmlFor="employmentHistory" className="mt-4 block text-sm font-medium text-gray-900">
                    Two recent employers <span className="text-brand">*</span>
                  </label>
                  <p className="mt-1 text-sm text-gray-600">Place, position, and duration of employment.</p>
                  <textarea
                    id="employmentHistory"
                    placeholder={`Example:\n• ABC Restaurant, Server, Jan 2024 – Present\n• XYZ Retail, Cashier, Jun 2023 – Dec 2023`}
                    value={formData.employmentHistory}
                    onChange={(e) => handleInputChange('employmentHistory', e.target.value)}
                    disabled={isSubmitting}
                    rows={4}
                    className="mt-2 block w-full resize-y rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15 disabled:bg-gray-50 disabled:text-gray-500"
                  />
                </div>

                <fieldset>
                  <legend className="text-sm font-semibold text-gray-900">
                    Have you ever been convicted of a felony? <span className="text-brand">*</span>
                  </legend>
                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 shadow-sm transition hover:bg-gray-50">
                      <input
                        type="radio"
                        name="felony"
                        checked={formData.felonyConviction === true}
                        onChange={() => handleInputChange('felonyConviction', true)}
                        disabled={isSubmitting}
                        className="h-4 w-4 border-gray-300 text-brand focus:ring-brand"
                      />
                      <span className="font-medium">Yes</span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 shadow-sm transition hover:bg-gray-50">
                      <input
                        type="radio"
                        name="felony"
                        checked={formData.felonyConviction === false}
                        onChange={() => handleInputChange('felonyConviction', false)}
                        disabled={isSubmitting}
                        className="h-4 w-4 border-gray-300 text-brand focus:ring-brand"
                      />
                      <span className="font-medium">No</span>
                    </label>
                  </div>
                </fieldset>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-brand px-6 py-4 text-base font-semibold text-white shadow-sm transition hover:bg-brand-dark focus:outline-none focus:ring-4 focus:ring-brand/20 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isSubmitting ? (
                      <>
                        <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                        Submitting…
                      </>
                    ) : (
                      <>Submit application</>
                    )}
                  </button>
                  <p className="mt-3 text-center text-xs text-gray-500">
                    By submitting, you confirm the information above is accurate.
                  </p>
                </div>
              </form>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
