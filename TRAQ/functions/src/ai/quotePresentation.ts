import { type ShiftQuoteContext, type ShiftQuotePresentation } from './quoteTypes'

/** Speaker-attributed quotes now live client-side (screensaver only). HUD always gets team quotes. */
export function presentationForContext(_ctx: ShiftQuoteContext, _timeSlot: number): ShiftQuotePresentation {
  return 'team'
}
