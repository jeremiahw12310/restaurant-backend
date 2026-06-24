import SunCalc from 'suncalc'

/** Matches greeting + body background bands (light UI only). */
export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night'

/** Hermitage, TN — fixed solar reference for the restaurant location (no device GPS). */
export const DEFAULT_SOLAR_COORDS = { lat: 36.2081, lon: -86.6222 } as const

export type SolarCoords = { lat: number; lon: number }

const MS_HOUR = 60 * 60 * 1000

/** Last-resort bands if SunCalc returns unusable times (e.g. edge polar cases). */
function getTimeOfDayClock(now: Date): TimeOfDay {
  const hour = now.getHours()
  if (hour >= 5 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 17) return 'afternoon'
  if (hour >= 17 && hour < 21) return 'evening'
  return 'night'
}

function isValidTime(t: number): boolean {
  return Number.isFinite(t) && !Number.isNaN(t)
}

/**
 * Sun-aligned bands (local calendar day at `coords`):
 * - morning: sunrise → solar noon
 * - afternoon: solar noon → eveningStart, where eveningStart = max(sunset − 90m, solar noon)
 * - evening: eveningStart → civil dusk (or sunset + 45m if dusk unusable)
 * - night: after evening ends until next sunrise
 */
export function getTimeOfDaySolar(now: Date, coords: SolarCoords): TimeOfDay {
  const { lat, lon } = coords
  let times: ReturnType<typeof SunCalc.getTimes>
  try {
    times = SunCalc.getTimes(now, lat, lon)
  } catch {
    return getTimeOfDayClock(now)
  }

  const sr = times.sunrise.getTime()
  const ss = times.sunset.getTime()
  const solarNoon = times.solarNoon.getTime()
  const dusk = times.dusk.getTime()
  const t = now.getTime()

  if (!isValidTime(sr) || !isValidTime(ss) || !isValidTime(solarNoon)) {
    return getTimeOfDayClock(now)
  }

  // Polar / odd cases: fall back if ordering breaks
  if (sr >= ss || solarNoon <= sr || solarNoon >= ss) {
    return getTimeOfDayClock(now)
  }

  const eveningStart = Math.max(ss - 1.5 * MS_HOUR, solarNoon)
  const eveningEnd = isValidTime(dusk) && dusk > eveningStart
    ? dusk
    : Math.max(ss + 45 * 60 * 1000, eveningStart + 60_000)

  if (t < sr || t >= eveningEnd) return 'night'
  if (t >= eveningStart && t < eveningEnd) return 'evening'
  if (t >= sr && t < solarNoon) return 'morning'
  if (t >= solarNoon && t < eveningStart) return 'afternoon'
  return 'night'
}
