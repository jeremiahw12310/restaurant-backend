/** Front/side door cleaning — same spacing family as numbered window tasks. */
export function isDoorCleaningTaskName(name: string): boolean {
  const n = name.trim().toLowerCase()
  if (!n) return false
  return (
    /\bfront\s*(?:and|&)\s*side\s*door\b/.test(n) ||
    /\bfront\s*\/\s*side\s*door\b/.test(n) ||
    /\bfront\s*door\b/.test(n) ||
    /\bside\s*door\b/.test(n) ||
    (/\bdoor\b/.test(n) && /\bclean/.test(n))
  )
}

/** Window / exterior cleaning tasks (numbered panes, front door, side door, combined door cleaning). */
export function isWindowCleaningRelatedTaskName(name: string): boolean {
  const n = name.trim()
  if (!n) return false
  return /\bwindows?\b/i.test(n) || isDoorCleaningTaskName(n)
}

/**
 * Sort key for window tasks — uses the first (lowest) pane number in the name.
 * Handles "Windows 1+2", "Windows 3+4", "Windows 11+12", etc.
 * Door cleaning tasks (including "Front and Side Door Cleaning") sort after numbered windows.
 */
export function extractWindowTaskNumber(name: string): number | null {
  const n = name.trim()
  if (!n) return null

  if (isDoorCleaningTaskName(n) && !/\bwindows?\b/i.test(n)) {
    return null
  }

  // "Windows 1+2", "Window 11+12"
  const groupedAfterWindow = n.match(/\bwindows?\b[^0-9]*(\d+)\s*\+\s*\d+/i)
  if (groupedAfterWindow) {
    const parsed = parseInt(groupedAfterWindow[1], 10)
    if (Number.isFinite(parsed)) return parsed
  }

  // "1+2 Windows", "3+4 windows"
  const groupedBeforeWindow = n.match(/(\d+)\s*\+\s*\d+[^a-zA-Z]*\bwindows?\b/i)
  if (groupedBeforeWindow) {
    const parsed = parseInt(groupedBeforeWindow[1], 10)
    if (Number.isFinite(parsed)) return parsed
  }

  // "Windows 1", "Window #2"
  const singleAfterWindow = n.match(/\bwindows?\b\s*#?\s*(\d+)\b/i)
  if (singleAfterWindow) {
    const parsed = parseInt(singleAfterWindow[1], 10)
    if (Number.isFinite(parsed)) return parsed
  }

  // "1 - Window", "3 Window"
  const singleBeforeWindow = n.match(/\b(\d+)\s*[-–]?\s*windows?\b/i)
  if (singleBeforeWindow) {
    const parsed = parseInt(singleBeforeWindow[1], 10)
    if (Number.isFinite(parsed)) return parsed
  }

  // Leading "1+2 ..." without the word window
  const leadingGrouped = n.match(/^(\d+)\s*\+/)
  if (leadingGrouped) {
    const parsed = parseInt(leadingGrouped[1], 10)
    if (Number.isFinite(parsed)) return parsed
  }

  if (/\bwindows?\b/i.test(n)) {
    const firstDigit = n.match(/\d+/)
    if (firstDigit) {
      const parsed = parseInt(firstDigit[0], 10)
      if (Number.isFinite(parsed)) return parsed
    }
  }

  return null
}

/** Lower sorts first; door cleaning after all numbered window groups. */
function windowTaskSortKey(name: string): number {
  const num = extractWindowTaskNumber(name)
  if (num !== null) return num
  if (isDoorCleaningTaskName(name)) return 10_000
  if (isWindowCleaningRelatedTaskName(name)) return 9_999
  return 10_001
}

export function compareWindowCleaningTaskNames(a: string, b: string): number {
  const keyA = windowTaskSortKey(a)
  const keyB = windowTaskSortKey(b)
  if (keyA !== keyB) return keyA - keyB
  return a.localeCompare(b, undefined, { sensitivity: 'base' })
}

export function sortWindowCleaningTaskNames(names: string[]): string[] {
  return names.slice().sort(compareWindowCleaningTaskNames)
}

export function sortMonthlyTaskIdsForScheduling(
  taskIds: string[],
  nameForId: (id: string) => string
): string[] {
  const windowIds: string[] = []
  const otherIds: string[] = []
  taskIds.forEach((id) => {
    const name = nameForId(id)
    if (isWindowCleaningRelatedTaskName(name)) windowIds.push(id)
    else otherIds.push(id)
  })

  const sortedWindowIds = windowIds.slice().sort((a, b) => {
    const cmp = compareWindowCleaningTaskNames(nameForId(a), nameForId(b))
    return cmp !== 0 ? cmp : a.localeCompare(b)
  })

  const sortedOther = otherIds.slice().sort((a, b) => {
    const na = nameForId(a)
    const nb = nameForId(b)
    return na.localeCompare(nb, undefined, { sensitivity: 'base' }) || a.localeCompare(b)
  })

  return [...sortedWindowIds, ...sortedOther]
}

export function pickMonthlyTaskForDay(args: {
  needsScheduling: string[]
  alreadyScheduledThisMonth: Set<string>
  prevTaskId: string
  nameForId: (id: string) => string
}): string | null {
  const remaining = args.needsScheduling.filter((id) => !args.alreadyScheduledThisMonth.has(id))
  if (!remaining.length) return null

  const sorted = sortMonthlyTaskIdsForScheduling(remaining, args.nameForId)
  const prevName = args.prevTaskId ? args.nameForId(args.prevTaskId) : ''
  const prevIsWindow = prevName ? isWindowCleaningRelatedTaskName(prevName) : false

  for (const id of sorted) {
    const name = args.nameForId(id)
    if (prevIsWindow && isWindowCleaningRelatedTaskName(name)) continue
    return id
  }

  return null
}
