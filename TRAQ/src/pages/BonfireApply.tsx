import { useState, useEffect, useCallback, useRef, type FormEvent } from 'react'
import { 
  submitApplication, 
  type ShiftKey, 
  LUNCH_SHIFTS, 
  DINNER_SHIFTS,
  type NewApplicationData 
} from '../services/applications'
import { sendJobApplicationEmailNotification } from '../services/applicationEmail'
import {
  logApplyEvent,
  logPageOpenedOnce,
  logFormStartedOnce,
  hasFormStartedThisSession,
  logFieldEngagedOnce,
  type ApplyClickSource,
  type ApplyQuestionKey,
} from '../services/applyEvents'
import { ScrollBirthDatePicker } from '../components/ScrollBirthDatePicker'
import traqLogoUrl from '../assets/TRAQ.png'
import diningUrl from '../assets/dining.JPG'
import heroSlide2Url from '../assets/IMG_2615.JPG'
import flameUrl from '../assets/flame.jpeg'

const HERO_SLIDES = [
  { src: diningUrl, alt: 'Bonfire restaurant interior' },
  { src: heroSlide2Url, alt: 'Bonfire Hermitage' },
] as const

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
  { icon: '📅', title: 'Flexible shifts', description: 'Lunch, dinner, and weekends—share what you can work on the form.' },
  { icon: '🤝', title: 'Team Vibes', description: 'Friendly, supportive coworkers' },
  { icon: '💵', title: 'Pay + tips', description: '$13 per hour plus tips' },
  { icon: '🍔', title: 'Free Meals', description: 'Delicious food on your shift' },
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

function ApplySiteBrandLockup() {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <img
        src={flameUrl}
        alt=""
        aria-hidden="true"
        className="h-5 w-auto shrink-0 object-contain sm:h-6"
      />
      <span className="min-w-0 flex-1 truncate text-lg font-bold tracking-tight text-brand-dark sm:text-xl">
        Bonfire Hermitage
      </span>
    </div>
  )
}

function ApplySiteTraqApplyMark() {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <img src={traqLogoUrl} alt="TRAQ" className="h-7 w-auto sm:h-9" />
      <span className="-ml-0.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 sm:-ml-1 sm:text-xs">
        Apply
      </span>
    </div>
  )
}

function ApplySiteStickyHeader() {
  return (
    <header className="fixed left-0 right-0 top-0 z-50 flex items-center justify-between gap-2 bg-white px-4 py-2.5 shadow-sm sm:gap-3 sm:px-5 sm:py-3">
      <ApplySiteBrandLockup />
      <ApplySiteTraqApplyMark />
    </header>
  )
}

/** Post-submit: brand only at top; TRAQ + Apply is in {@link ApplySiteSubmittedFooter}. */
function ApplySiteSubmittedTopBar() {
  return (
    <header className="fixed left-0 right-0 top-0 z-50 flex items-center gap-2 bg-white px-4 py-2.5 shadow-sm sm:gap-3 sm:px-5 sm:py-3">
      <ApplySiteBrandLockup />
    </header>
  )
}

function ApplySiteSubmittedFooter() {
  return (
    <footer className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-center border-t border-gray-200 bg-white px-4 py-2.5 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] sm:py-3">
      <ApplySiteTraqApplyMark />
    </footer>
  )
}

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
  const [heroSlide, setHeroSlide] = useState(0)

  // Analytics refs (no PII; only flags + the field key the user last touched).
  const submittedRef = useRef(false)
  const lastQuestionRef = useRef<ApplyQuestionKey | null>(null)

  useEffect(() => {
    const id = window.setInterval(() => {
      setHeroSlide((i) => (i + 1) % HERO_SLIDES.length)
    }, 5500)
    return () => window.clearInterval(id)
  }, [])

  // Fire `page_opened` once per page load (deduped at module scope so StrictMode and SPA
  // remounts don't double-log; bfcache restore re-arms it as a fresh open).
  useEffect(() => {
    logPageOpenedOnce()
  }, [])

  // Exit telemetry, split into two distinct signals:
  //   - `apply_tab_hidden` (visibilitychange -> hidden): tab switch / app switch. Users often return.
  //   - `abandoned` (pagehide/beforeunload): true exit. Best-effort — Firestore JS SDK is not
  //     `keepalive`, so the write may not flush on hard tab kill.
  useEffect(() => {
    let tabHiddenFired = false
    let abandonedFired = false

    const onVisibility = () => {
      if (document.visibilityState !== 'hidden') return
      if (tabHiddenFired) return
      if (submittedRef.current) return
      if (!hasFormStartedThisSession()) return
      tabHiddenFired = true
      const lastQuestion = lastQuestionRef.current
      logApplyEvent('apply_tab_hidden', {
        reason: 'visibility',
        ...(lastQuestion ? { lastQuestion } : {}),
      })
    }

    const fireAbandoned = (reason: 'pagehide' | 'beforeunload') => {
      if (abandonedFired) return
      if (submittedRef.current) return
      if (!hasFormStartedThisSession()) return
      abandonedFired = true
      const lastQuestion = lastQuestionRef.current
      logApplyEvent('abandoned', {
        reason,
        ...(lastQuestion ? { lastQuestion } : {}),
      })
    }
    const onPageHide = () => fireAbandoned('pagehide')
    const onBeforeUnload = () => fireAbandoned('beforeunload')

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [])

  const markFormStarted = useCallback(() => {
    logFormStartedOnce()
  }, [])

  /** Records the field the user is on (for abandonment attribution) and emits
   *  `field_engaged` the first time per session — gives admin a reliable "farthest
   *  field reached" signal that does not depend on the (best-effort) `abandoned` write. */
  const markQuestionFocused = useCallback((key: ApplyQuestionKey) => {
    lastQuestionRef.current = key
    logFieldEngagedOnce(key)
  }, [])

  const scrollToApply = useCallback((source: ApplyClickSource) => {
    logApplyEvent('apply_clicked', { source })
    const el = document.getElementById('apply')
    if (!el) return
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
  }, [])

  const handleInputChange = (field: keyof typeof formData, value: string | boolean) => {
    markFormStarted()
    // All `formData` keys map 1:1 to `ApplyQuestionKey` (availability is handled separately).
    markQuestionFocused(field as ApplyQuestionKey)
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const toggleShift = (shift: ShiftKey) => {
    markFormStarted()
    markQuestionFocused('availability')
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

      const applicationId = await submitApplication(applicationData)
      submittedRef.current = true
      logApplyEvent('submitted', { applicationId })
      void sendJobApplicationEmailNotification({
        name: applicationData.name,
        email: applicationData.email,
        phone: applicationData.phone,
      })
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
      <div className="min-h-screen bg-gradient-to-b from-white to-gray-50 px-4 pb-20 pt-12 text-gray-900 sm:px-6 sm:pb-24 sm:pt-16">
        <ApplySiteSubmittedTopBar />
        <div className="mx-auto w-full max-w-xl pt-14 sm:pt-16">
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
        <ApplySiteSubmittedFooter />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-white to-gray-50 text-gray-900">
      <ApplySiteStickyHeader />
      {/* Hero carousel */}
      <div className="mt-14 sm:mt-16">
        <div className="mx-auto w-full max-w-6xl px-3 sm:px-6 lg:px-8">
          <div
            className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm sm:rounded-3xl"
            role="region"
            aria-roledescription="carousel"
            aria-label="Restaurant photos"
          >
            <div className="relative h-56 sm:h-72 lg:h-96">
              {HERO_SLIDES.map((slide, i) => (
                <img
                  key={slide.src}
                  src={slide.src}
                  alt={slide.alt}
                  aria-hidden={heroSlide !== i}
                  className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ease-out ${
                    heroSlide === i ? 'z-[1] opacity-100' : 'z-0 opacity-0'
                  }`}
                  loading="eager"
                  decoding="async"
                />
              ))}
              <div className="pointer-events-none absolute inset-0 z-[2] bg-gradient-to-b from-black/15 via-transparent to-black/55" />

              <div className="absolute left-4 top-4 z-[3] sm:left-5 sm:top-5">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/90 px-3 py-1.5 text-sm font-semibold tracking-wide text-brand shadow-sm backdrop-blur sm:text-xs">
                  <span className="text-base leading-none" aria-hidden="true">🍽️</span>
                  NOW HIRING
                </div>
              </div>

              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[3] flex flex-col items-center gap-3 px-4 pb-3 sm:px-5 sm:pb-4">
                <button
                  type="button"
                  onClick={() => scrollToApply('hero_button')}
                  className="pointer-events-auto w-full min-h-[44px] max-w-xs rounded-xl bg-white px-4 py-2.5 text-center text-sm font-semibold text-gray-900 shadow-md transition hover:bg-gray-100 sm:max-w-none sm:min-w-[12rem]"
                >
                  Apply now
                </button>
                <div
                  className="pointer-events-auto flex justify-center gap-2"
                  role="tablist"
                  aria-label="Choose photo"
                >
                  {HERO_SLIDES.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      role="tab"
                      aria-selected={heroSlide === i}
                      aria-label={`Photo ${i + 1} of ${HERO_SLIDES.length}`}
                      onClick={() => setHeroSlide(i)}
                      className={`h-2 rounded-full transition-all duration-300 ${
                        heroSlide === i ? 'w-6 bg-white shadow-sm' : 'w-2 bg-white/55 hover:bg-white/80'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl px-3 pt-5 pb-10 sm:px-6 sm:pt-8 lg:px-8 lg:pt-10 lg:pb-14">
        <div className="grid grid-cols-1 gap-5 sm:gap-8 lg:grid-cols-12 lg:items-start">
          {/* Role / pay / benefits — top-left on desktop, first on mobile */}
          <div className="lg:col-span-5 lg:col-start-1 lg:row-start-1">
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:rounded-3xl sm:p-8">
              <h1 className="flex flex-wrap items-center gap-2 text-3xl font-semibold tracking-tight text-gray-900 sm:gap-3 sm:text-4xl">
                <img
                  src={flameUrl}
                  alt=""
                  aria-hidden="true"
                  className="h-8 w-auto shrink-0 object-contain sm:h-10"
                />
                <span>Join the Bonfire Hermitage Team</span>
              </h1>

              <p className="mt-1 text-2xl font-medium leading-snug text-gray-600 sm:mt-2 sm:text-2xl">
                Team Member Position Part-Time
              </p>

              <div className="mt-4 rounded-xl bg-gray-50 px-4 py-3 sm:mt-5 sm:rounded-2xl sm:px-5 sm:py-4">
                <div className="text-sm font-medium uppercase tracking-wide text-gray-600 sm:text-sm sm:normal-case sm:tracking-normal">
                  Pay
                </div>
                <p className="mt-1 text-base font-medium leading-snug text-gray-800 sm:text-lg">
                  Team members earn{' '}
                  <span className="font-semibold text-brand">$18–$23/hr</span> after tips.
                </p>
              </div>

              <div className="mt-4 sm:mt-5">
                <button
                  type="button"
                  onClick={() => scrollToApply('role_card_button')}
                  className="w-full min-h-[44px] rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 shadow-sm transition hover:border-brand/30 hover:bg-gray-50 sm:text-base"
                >
                  Quick apply
                </button>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 sm:mt-6 sm:grid-cols-3 sm:gap-3">
                {BENEFITS.map((b) => (
                  <div
                    key={b.title}
                    className="rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-sm sm:rounded-2xl sm:px-4 sm:py-4"
                  >
                    <div className="text-lg sm:text-xl" aria-hidden="true">{b.icon}</div>
                    <div className="mt-1 text-base font-semibold text-gray-900 sm:mt-2">{b.title}</div>
                    <div className="mt-0.5 text-sm leading-snug text-gray-600 sm:mt-1">{b.description}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Details / location — bottom-left on desktop, above form on mobile */}
          <div className="grid gap-5 sm:gap-6 lg:col-span-5 lg:col-start-1 lg:row-start-2">
            <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:rounded-3xl sm:p-8">
              <h2 className="text-lg font-semibold text-gray-900 sm:text-lg">What you’ll do</h2>
              <ul className="mt-3 space-y-2.5 sm:mt-4 sm:space-y-3">
                {WHAT_YOULL_DO.map((item) => (
                  <li key={item} className="flex gap-3 text-base text-gray-700">
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

            <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:rounded-3xl sm:p-8">
              <h2 className="text-lg font-semibold text-gray-900 sm:text-lg">What we’re looking for</h2>
              <ul className="mt-3 space-y-2.5 sm:mt-4 sm:space-y-3">
                {WHAT_WERE_LOOKING_FOR.map((item) => (
                  <li key={item} className="flex gap-3 text-base text-gray-700">
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

            <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:rounded-3xl sm:p-8">
              <h2 className="text-lg font-semibold text-gray-900 sm:text-lg">Location</h2>
              <a
                href="https://www.google.com/maps/dir/?api=1&destination=4021+Lebanon+Pike,+Hermitage,+TN"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 block text-base text-gray-700 transition-colors hover:text-brand-dark"
              >
                <span className="font-medium">Bonfire Hermitage</span>
                <br />
                <span className="underline underline-offset-2">4021 Lebanon Pike, Hermitage, TN</span>
                <span className="ml-1 text-xs text-gray-500">(Get directions)</span>
              </a>
              <p className="mt-3 text-sm text-gray-500">
                Bonfire Hermitage — Where great food meets great people.
              </p>
            </section>
          </div>

          {/* Application form — right column on desktop, after details on mobile */}
          <div className="lg:col-span-7 lg:col-start-6 lg:row-span-2 lg:row-start-1">
            <section
              id="apply"
              tabIndex={-1}
              className="scroll-mt-28 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:scroll-mt-32 sm:rounded-3xl sm:p-8"
            >
              <div className="flex flex-col gap-1 sm:gap-2">
                <h2 className="text-2xl font-semibold tracking-tight text-gray-900 sm:text-2xl">
                  Ready to join the team?
                </h2>
                <p className="text-base text-gray-600">
                  Fill out the quick form below — it only takes a few minutes.
                </p>
              </div>

              {error && (
                <div
                  className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 sm:mt-6 sm:rounded-2xl"
                  role="alert"
                  aria-live="polite"
                >
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5" aria-hidden="true">⚠️</span>
                    <span>{error}</span>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="mt-5 space-y-6 sm:mt-7 sm:space-y-8">
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Contact info</h3>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:mt-4 sm:grid-cols-2 sm:gap-4">
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
                        onFocus={() => markQuestionFocused('name')}
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
                        onFocus={() => markQuestionFocused('email')}
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
                        onFocus={() => markQuestionFocused('phone')}
                        disabled={isSubmitting}
                        className="mt-2 block w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15 disabled:bg-gray-50 disabled:text-gray-500"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label id="birthDate-label" className="text-sm font-medium text-gray-900">
                        Birth date <span className="text-brand">*</span>
                      </label>
                      <p className="mt-1 text-xs text-gray-500">Scroll each column to choose month, day, and year.</p>
                      <ScrollBirthDatePicker
                        id="birthDate"
                        aria-labelledby="birthDate-label"
                        value={formData.birthDate}
                        onChange={(ymd) => {
                          markQuestionFocused('birthDate')
                          handleInputChange('birthDate', ymd)
                        }}
                        disabled={isSubmitting}
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
                        onFocus={() => markQuestionFocused('address')}
                        disabled={isSubmitting}
                        rows={2}
                        className="mt-2 block w-full resize-y rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15 disabled:bg-gray-50 disabled:text-gray-500"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Availability</h3>
                  <p className="mt-1 text-base text-gray-600">
                    Select all shifts you’re available to work.
                    <span className="text-brand"> *</span>
                  </p>

                  <div className="mt-3 grid grid-cols-1 gap-3 sm:mt-4 sm:grid-cols-2 sm:gap-5">
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 sm:rounded-2xl sm:p-4">
                      <div className="text-sm font-semibold uppercase tracking-wide text-gray-600">
                        Lunch (11am–5pm)
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-1 sm:gap-2 sm:space-y-0">
                        {LUNCH_SHIFTS.map((shift) => {
                          const day = shift.split('_')[0]
                          return (
                            <label
                              key={shift}
                              className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-base text-gray-900 shadow-sm transition hover:bg-gray-50 sm:gap-3 sm:rounded-xl sm:py-2"
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

                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 sm:rounded-2xl sm:p-4">
                      <div className="text-sm font-semibold uppercase tracking-wide text-gray-600">
                        Dinner (5pm–close)
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-1 sm:gap-2 sm:space-y-0">
                        {DINNER_SHIFTS.map((shift) => {
                          const day = shift.split('_')[0]
                          const isLateClose = day === 'fri' || day === 'sat'
                          return (
                            <label
                              key={shift}
                              className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-base text-gray-900 shadow-sm transition hover:bg-gray-50 sm:gap-3 sm:rounded-xl sm:py-2"
                            >
                              <input
                                type="checkbox"
                                checked={availability.has(shift)}
                                onChange={() => toggleShift(shift)}
                                disabled={isSubmitting}
                                className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand"
                              />
                              <span className="flex items-baseline gap-1.5 sm:gap-2">
                                <span className="font-medium">{SHIFT_DAY_LABELS[day]}</span>
                                <span className="text-xs font-normal text-gray-500 sm:text-xs">
                                  {isLateClose ? '(til 10pm)' : '(til 9pm)'}
                                </span>
                              </span>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 sm:mt-4">
                    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900 shadow-sm transition hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={showOther}
                        onChange={(e) => {
                          markFormStarted()
                          markQuestionFocused('availability')
                          setShowOther(e.target.checked)
                        }}
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
                        onChange={(e) => {
                          markFormStarted()
                          markQuestionFocused('availability')
                          setAvailabilityOther(e.target.value)
                        }}
                        onFocus={() => markQuestionFocused('availability')}
                        disabled={isSubmitting}
                        rows={2}
                      />
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Work history</h3>
                  <label htmlFor="employmentHistory" className="mt-3 block text-sm font-medium text-gray-900 sm:mt-4">
                    Two recent employers <span className="text-brand">*</span>
                  </label>
                  <p className="mt-1 text-base text-gray-600">Place, position, and duration of employment.</p>
                  <textarea
                    id="employmentHistory"
                    placeholder={`Example:\n• ABC Restaurant, Server, Jan 2024 – Present\n• XYZ Retail, Cashier, Jun 2023 – Dec 2023`}
                    value={formData.employmentHistory}
                    onChange={(e) => handleInputChange('employmentHistory', e.target.value)}
                    onFocus={() => markQuestionFocused('employmentHistory')}
                    disabled={isSubmitting}
                    rows={4}
                    className="mt-2 block w-full resize-y rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15 disabled:bg-gray-50 disabled:text-gray-500"
                  />
                </div>

                <fieldset>
                  <legend className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                    Felony conviction <span className="text-brand">*</span>
                  </legend>
                  <p className="mt-1 text-base text-gray-600">Have you ever been convicted of a felony?</p>
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:mt-4">
                    <label className="flex cursor-pointer items-center justify-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900 shadow-sm transition hover:bg-gray-50">
                      <input
                        type="radio"
                        name="felony"
                        checked={formData.felonyConviction === true}
                        onChange={() => {
                          markQuestionFocused('felonyConviction')
                          handleInputChange('felonyConviction', true)
                        }}
                        onFocus={() => markQuestionFocused('felonyConviction')}
                        disabled={isSubmitting}
                        className="h-4 w-4 border-gray-300 text-brand focus:ring-brand"
                      />
                      <span className="font-medium">Yes</span>
                    </label>
                    <label className="flex cursor-pointer items-center justify-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900 shadow-sm transition hover:bg-gray-50">
                      <input
                        type="radio"
                        name="felony"
                        checked={formData.felonyConviction === false}
                        onChange={() => {
                          markQuestionFocused('felonyConviction')
                          handleInputChange('felonyConviction', false)
                        }}
                        onFocus={() => markQuestionFocused('felonyConviction')}
                        disabled={isSubmitting}
                        className="h-4 w-4 border-gray-300 text-brand focus:ring-brand"
                      />
                      <span className="font-medium">No</span>
                    </label>
                  </div>
                </fieldset>

                <div className="pt-1 sm:pt-2">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-6 py-3.5 text-base font-semibold text-white shadow-sm transition hover:bg-brand-dark focus:outline-none focus:ring-4 focus:ring-brand/20 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70 sm:rounded-2xl sm:py-4"
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
                  <p className="mt-3 text-center text-sm text-gray-500">
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
