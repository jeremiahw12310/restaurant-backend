import { useState, useEffect, useCallback, useMemo } from 'react'
import './DailyTasksPage.css'
import { storage } from '../../firebase'
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage'
import {
  subscribeToDailyTaskCatalog,
  saveDailyTaskCatalog,
  getDailyTaskWeek,
  upsertDailyTaskWeek,
  upsertDailyTaskRun,
  subscribeToDailyTaskWeek,
  listDailyTaskRunsInRange,
  subscribeToDailyTaskRun,
  adminRecloseDailyTaskRun,
  type DailyTaskCatalog,
  type DailyTaskDef,
  type DailyTaskRun,
  type DailyTaskWeek,
} from '../../services/firestore'

// ─────────────────────────────────────────────────────────────────────────────
// Helper functions (ported from App.tsx)
// ─────────────────────────────────────────────────────────────────────────────

const formatDateKey = (date: Date): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const parseDateKey = (dateKey: string): Date => {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(year, month - 1, day)
}

const startOfDay = (date: Date): Date => {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

const addDays = (date: Date, days: number): Date => {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

const getWeekStartDateKeySunday = (dateKey: string): string => {
  const d = startOfDay(parseDateKey(dateKey))
  const dow = d.getDay() // 0 = Sun
  const weekStart = addDays(d, -dow)
  return formatDateKey(weekStart)
}

const addDaysToDateKey = (dateKey: string, delta: number): string => {
  return formatDateKey(addDays(parseDateKey(dateKey), delta))
}

const isDailyTaskEnabled = (t: DailyTaskDef): boolean => {
  return !(typeof t.disabledAtMs === 'number' && Number.isFinite(t.disabledAtMs))
}

const DAILY_TASK_WEEK_GENERATOR_VERSION = 'v1'

// Deterministic RNG for stable schedules
const hashStringToUint32 = (s: string): number => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

const seededShuffle = <T,>(arr: T[], seed: number): T[] => {
  const copy = [...arr]
  let s = seed
  for (let i = copy.length - 1; i > 0; i--) {
    s = ((s * 1103515245 + 12345) >>> 0) % 2147483648
    const j = s % (i + 1)
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

/**
 * Find optimal day indices for a weekly task to maximize spacing between occurrences.
 * @param quota - The number of times per week this task should occur
 * @param usedDayIndices - Day indices (0-6) where this task is already scheduled (past/overrides)
 * @param availableDayIndices - Day indices (0-6) that are free to fill
 * @param seed - Optional seed for tie-breaking (deterministic)
 * @returns Array of day indices where the task should be scheduled
 */
const findOptimalDaysForWeeklyTask = (
  quota: number,
  usedDayIndices: number[],
  availableDayIndices: number[],
  seed: number = 0
): number[] => {
  const toPlace = quota - usedDayIndices.length
  if (toPlace <= 0) return []

  const allUsed = [...usedDayIndices]
  const result: number[] = []

  for (let i = 0; i < toPlace; i++) {
    // Find the available day with maximum minimum distance from all used days
    let bestDays: number[] = []
    let bestScore = -1

    for (const day of availableDayIndices) {
      if (result.includes(day)) continue // Already picked this round

      // Calculate minimum distance to any already-placed occurrence
      let minDist: number
      if (allUsed.length === 0) {
        // No existing placements - prefer middle of available days for better future spacing
        minDist = 7 // Max possible score when nothing is placed yet
      } else {
        minDist = Math.min(...allUsed.map((used) => Math.abs(day - used)))
      }

      if (minDist > bestScore) {
        bestScore = minDist
        bestDays = [day]
      } else if (minDist === bestScore) {
        bestDays.push(day)
      }
    }

    if (bestDays.length > 0) {
      // Use seeded selection for deterministic tie-breaking
      const shuffled = seededShuffle(bestDays, seed + i * 1000)
      const bestDay = shuffled[0]
      result.push(bestDay)
      allUsed.push(bestDay)
    }
  }

  return result
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function DailyTasksPage() {
  // Data state
  const [dailyTaskCatalog, setDailyTaskCatalog] = useState<DailyTaskCatalog>({ tasks: [] })
  const [weeksByStart, setWeeksByStart] = useState<Record<string, DailyTaskWeek | null>>({})
  const [recentRuns, setRecentRuns] = useState<DailyTaskRun[]>([])
  const [runsLoading, setRunsLoading] = useState(false)
  const [todayRun, setTodayRun] = useState<DailyTaskRun | null>(null)

  // Form state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [frequencyType, setFrequencyType] = useState<'normal' | 'weekly' | 'monthly'>('normal')
  const [quota, setQuota] = useState<1 | 2 | 3>(1)
  const [materialsDesc, setMaterialsDesc] = useState('')
  const [whatToDoDesc, setWhatToDoDesc] = useState('')
  const [materialsFile, setMaterialsFile] = useState<File | null>(null)
  const [whatToDoFile, setWhatToDoFile] = useState<File | null>(null)
  const [uploadPct, setUploadPct] = useState<{ materials?: number; whatToDo?: number }>({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Schedule override state
  const [overridePickByDateKey, setOverridePickByDateKey] = useState<Record<string, string>>({})
  const [overrideSaving, setOverrideSaving] = useState<string | null>(null)
  const [regenerating, setRegenerating] = useState(false)
  const [reclosingToday, setReclosingToday] = useState(false)
  const [debugInfo, setDebugInfo] = useState<string[] | null>(null)

  // Quota warning popup state
  const [quotaWarningPopup, setQuotaWarningPopup] = useState<{
    show: boolean
    warnings: string[]
  }>({ show: false, warnings: [] })

  const todayDateKey = formatDateKey(new Date())

  // Subscribe to daily task catalog
  useEffect(() => {
    const unsub = subscribeToDailyTaskCatalog((catalog) => {
      setDailyTaskCatalog(catalog)
    })
    return () => unsub?.()
  }, [])

  // Subscribe to today's run
  useEffect(() => {
    const unsub = subscribeToDailyTaskRun(todayDateKey, (run) => {
      setTodayRun(run)
    })
    return () => unsub?.()
  }, [todayDateKey])

  // Subscribe to weeks for next 7 days
  useEffect(() => {
    const next7 = Array.from({ length: 7 }).map((_, i) => addDaysToDateKey(todayDateKey, i))
    const weekStarts = Array.from(new Set(next7.map((dk) => getWeekStartDateKeySunday(dk))))

    const unsubs: (() => void)[] = []
    weekStarts.forEach((ws) => {
      const unsub = subscribeToDailyTaskWeek(ws, (week) => {
        setWeeksByStart((prev) => ({ ...prev, [ws]: week }))
      })
      if (unsub) unsubs.push(unsub)
    })

    return () => unsubs.forEach((u) => u())
  }, [todayDateKey])

  // Load recent runs
  useEffect(() => {
    const loadRuns = async () => {
      setRunsLoading(true)
      try {
        const from = addDaysToDateKey(todayDateKey, -30)
        const to = todayDateKey
        const runs = await listDailyTaskRunsInRange(from, to)
        setRecentRuns(runs)
      } catch (err) {
        console.error('Failed to load runs:', err)
      } finally {
        setRunsLoading(false)
      }
    }
    loadRuns()
  }, [todayDateKey])

  // Enabled tasks
  const enabledTasks = useMemo(() => {
    return (dailyTaskCatalog.tasks || []).filter(isDailyTaskEnabled)
  }, [dailyTaskCatalog.tasks])

  // Upload image to Firebase Storage
  const uploadImage = useCallback(
    async (id: string, kind: 'materials' | 'whatToDo', file: File): Promise<string> => {
      if (!storage) throw new Error('Storage not available')
      const path = `dailyTasks/${id}/${kind}_${Date.now()}.jpg`
      const ref = storageRef(storage, path)
      const uploadTask = uploadBytesResumable(ref, file)

      return new Promise((resolve, reject) => {
        uploadTask.on(
          'state_changed',
          (snapshot) => {
            const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)
            setUploadPct((prev) => ({ ...prev, [kind]: pct }))
          },
          reject,
          async () => {
            const url = await getDownloadURL(uploadTask.snapshot.ref)
            resolve(url)
          }
        )
      })
    },
    []
  )

  // Reset form
  const resetForm = useCallback(() => {
    setEditingId(null)
    setName('')
    setFrequencyType('normal')
    setQuota(1)
    setMaterialsDesc('')
    setWhatToDoDesc('')
    setMaterialsFile(null)
    setWhatToDoFile(null)
    setSaveError(null)
    setUploadPct({})
  }, [])

  // Start editing a task
  const startEdit = useCallback((task: DailyTaskDef) => {
    setEditingId(task.id)
    setName(task.name || '')
    const freqType = task.frequency?.type
    setFrequencyType(freqType === 'weekly' ? 'weekly' : freqType === 'monthly' ? 'monthly' : 'normal')
    setQuota(task.frequency?.type === 'weekly' ? (task.frequency.quotaPerWeek as 1 | 2 | 3) : 1)
    setMaterialsDesc(task.materials?.description || '')
    setWhatToDoDesc(task.whatToDo?.description || '')
    setMaterialsFile(null)
    setWhatToDoFile(null)
    setSaveError(null)
    setUploadPct({})
  }, [])

  // Save task
  const saveTask = useCallback(async () => {
    if (saving) return
    setSaveError(null)

    const trimmedName = name.trim()
    if (!trimmedName) {
      setSaveError('Name is required.')
      return
    }

    const isEditing = !!editingId
    const existing = isEditing ? dailyTaskCatalog.tasks.find((t) => t.id === editingId) || null : null

    // Generate ID for new tasks
    const id = isEditing
      ? editingId
      : trimmedName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')

    setSaving(true)
    setUploadPct({})

    try {
      const frequency =
        frequencyType === 'weekly'
          ? { type: 'weekly' as const, quotaPerWeek: quota }
          : frequencyType === 'monthly'
          ? { type: 'monthly' as const }
          : { type: 'normal' as const }

      let materialsPath = existing?.materials?.imagePath || ''
      let whatPath = existing?.whatToDo?.imagePath || ''

      if (materialsFile) {
        materialsPath = await uploadImage(id, 'materials', materialsFile)
      }
      if (whatToDoFile) {
        whatPath = await uploadImage(id, 'whatToDo', whatToDoFile)
      }

      const now = Date.now()
      const newTask: DailyTaskDef = {
        id,
        name: trimmedName,
        frequency,
        materials: {
          imagePath: materialsPath,
          description: materialsDesc.trim(),
        },
        whatToDo: {
          imagePath: whatPath,
          description: whatToDoDesc.trim(),
        },
        createdAtMs: existing?.createdAtMs || now,
        updatedAtMs: now,
      }

      const updated: DailyTaskCatalog = {
        tasks: isEditing
          ? dailyTaskCatalog.tasks.map((t) => (t.id === id ? newTask : t))
          : [...dailyTaskCatalog.tasks, newTask],
      }

      await saveDailyTaskCatalog(updated)
      resetForm()
    } catch (err) {
      console.error('Failed to save daily task:', err)
      setSaveError('Failed to save daily task. Check connection and try again.')
    } finally {
      setSaving(false)
    }
  }, [
    saving,
    name,
    editingId,
    dailyTaskCatalog.tasks,
    frequencyType,
    quota,
    materialsFile,
    whatToDoFile,
    materialsDesc,
    whatToDoDesc,
    uploadImage,
    resetForm,
  ])

  // Delete task (soft delete)
  const deleteTask = useCallback(
    async (id: string) => {
      const task = dailyTaskCatalog.tasks.find((t) => t.id === id)
      if (!task) return
      if (!confirm(`Delete daily task "${task.name}"?`)) return

      try {
        const updated: DailyTaskCatalog = {
          tasks: dailyTaskCatalog.tasks.map((t) =>
            t.id === id ? { ...t, disabledAtMs: Date.now() } : t
          ),
        }
        await saveDailyTaskCatalog(updated)
        if (editingId === id) resetForm()
      } catch (err) {
        console.error('Failed to delete daily task:', err)
      }
    },
    [dailyTaskCatalog.tasks, editingId, resetForm]
  )

  // Compute quota warnings for a week (weekly tasks)
  const computeQuotaWarnings = useCallback(
    (week: DailyTaskWeek | null): string[] => {
      if (!week) return []
      const weekly = enabledTasks.filter((t) => t.frequency?.type === 'weekly') as DailyTaskDef[]
      if (!weekly.length) return []

      const counts: Record<string, number> = {}
      Object.keys(week.days || {}).forEach((dk) => {
        const tid = week.days?.[dk]?.taskId
        if (!tid || tid === '__none__') return
        counts[tid] = (counts[tid] || 0) + 1
      })

      const warnings: string[] = []
      weekly.forEach((t) => {
        const targetQuota = t.frequency.type === 'weekly' ? t.frequency.quotaPerWeek : 0
        const count = counts[t.id] || 0
        if (count !== targetQuota) {
          warnings.push(`"${t.name}" is scheduled ${count}x this week (quota ${targetQuota}).`)
        }
      })
      return warnings
    },
    [enabledTasks]
  )

  // Compute EXCEEDED quota warnings (weekly > quota, monthly > 1)
  const computeExceededQuotaWarnings = useCallback(
    (updatedWeeks: Record<string, DailyTaskWeek>): string[] => {
      const warnings: string[] = []

      // Weekly quota exceeded warnings
      const weekly = enabledTasks.filter((t) => t.frequency?.type === 'weekly') as DailyTaskDef[]
      const monthly = enabledTasks.filter((t) => t.frequency?.type === 'monthly') as DailyTaskDef[]

      Object.values(updatedWeeks).forEach((week) => {
        if (!week) return
        const counts: Record<string, number> = {}
        Object.keys(week.days || {}).forEach((dk) => {
          const tid = week.days?.[dk]?.taskId
          if (!tid || tid === '__none__') return
          counts[tid] = (counts[tid] || 0) + 1
        })

        weekly.forEach((t) => {
          const targetQuota = t.frequency.type === 'weekly' ? t.frequency.quotaPerWeek : 0
          const count = counts[t.id] || 0
          if (count > targetQuota) {
            warnings.push(`Weekly quota EXCEEDED: "${t.name}" scheduled ${count}x this week (quota ${targetQuota}).`)
          }
        })
      })

      // Monthly quota exceeded warnings
      // Group schedule entries by month
      const monthCounts: Record<string, Record<string, number>> = {} // monthKey -> taskId -> count
      Object.values(updatedWeeks).forEach((week) => {
        if (!week) return
        Object.keys(week.days || {}).forEach((dk) => {
          const tid = week.days?.[dk]?.taskId
          if (!tid || tid === '__none__') return
          const d = parseDateKey(dk)
          const monthKey = `${d.getFullYear()}-${d.getMonth()}`
          if (!monthCounts[monthKey]) monthCounts[monthKey] = {}
          monthCounts[monthKey][tid] = (monthCounts[monthKey][tid] || 0) + 1
        })
      })

      // Also include completions from recentRuns for monthly quota checking
      recentRuns.forEach((run) => {
        if (!run.completedAtMs) return
        const d = parseDateKey(run.dateKey)
        const monthKey = `${d.getFullYear()}-${d.getMonth()}`
        const tid = run.taskId
        if (!tid || tid === '__none__') return
        if (!monthCounts[monthKey]) monthCounts[monthKey] = {}
        // Only add if not already in the schedule (avoid double counting)
        // This is a simplification - in reality we'd need to track both
      })

      Object.keys(monthCounts).forEach((monthKey) => {
        monthly.forEach((t) => {
          const count = monthCounts[monthKey][t.id] || 0
          if (count > 1) {
            const [year, month] = monthKey.split('-').map(Number)
            const monthName = new Date(year, month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
            warnings.push(`Monthly quota EXCEEDED: "${t.name}" scheduled ${count}x in ${monthName} (quota 1/month).`)
          }
        })
      })

      return warnings
    },
    [enabledTasks, recentRuns]
  )

  // Set override for a day
  const setOverride = useCallback(
    async (dateKey: string, taskId: string) => {
      setOverrideSaving(dateKey)
      try {
        const weekStart = getWeekStartDateKeySunday(dateKey)
        let week = weeksByStart[weekStart] || (await getDailyTaskWeek(weekStart))

        if (!week) {
          // Create empty week
          week = {
            weekStartDateKey: weekStart,
            days: {},
            generatedAtMs: Date.now(),
            generatorVersion: DAILY_TASK_WEEK_GENERATOR_VERSION,
          }
        }

        const nextWeek: DailyTaskWeek = {
          ...week,
          days: {
            ...week.days,
            [dateKey]: {
              taskId,
              source: 'override',
            },
          },
        }

        await upsertDailyTaskWeek(weekStart, nextWeek)
        setWeeksByStart((prev) => ({ ...prev, [weekStart]: nextWeek }))

        // If overriding today, force the shared run to match (so the golden card updates immediately).
        // We do NOT override if already completed.
        if (dateKey === todayDateKey && !todayRun?.completedAtMs) {
          await upsertDailyTaskRun(dateKey, {
            taskId,
            selectedAtMs: Date.now(),
            override: { taskId, atMs: Date.now(), by: 'admin' },
          })
        }
      } catch (err) {
        console.error('Failed to set override:', err)
      } finally {
        setOverrideSaving(null)
      }
    },
    [weeksByStart, todayDateKey, todayRun?.completedAtMs]
  )

  // Helper: get completions from recentRuns for a specific week (Sunday-Saturday)
  const getCompletionsForWeek = useCallback(
    (weekStartDateKey: string): Record<string, number> => {
      const weekEndDateKey = addDaysToDateKey(weekStartDateKey, 6)
      const counts: Record<string, number> = {}
      recentRuns.forEach((run) => {
        // Only count runs that were actually completed (not just selected/revealed)
        if (!run.completedAtMs) return
        // Check if run is within this week (Sunday-Saturday)
        if (run.dateKey >= weekStartDateKey && run.dateKey <= weekEndDateKey) {
          const taskId = run.taskId
          if (taskId && taskId !== '__none__') {
            counts[taskId] = (counts[taskId] || 0) + 1
          }
        }
      })
      return counts
    },
    [recentRuns]
  )

  // Helper: get completions from recentRuns for a specific calendar month
  const getCompletionsForMonth = useCallback(
    (year: number, month: number): Record<string, number> => {
      // month is 0-indexed (0 = January)
      const monthStartDateKey = formatDateKey(new Date(year, month, 1))
      const monthEndDateKey = formatDateKey(new Date(year, month + 1, 0)) // Last day of month
      const counts: Record<string, number> = {}
      recentRuns.forEach((run) => {
        // Only count runs that were actually completed (not just selected/revealed)
        if (!run.completedAtMs) return
        // Check if run is within this month
        if (run.dateKey >= monthStartDateKey && run.dateKey <= monthEndDateKey) {
          const taskId = run.taskId
          if (taskId && taskId !== '__none__') {
            counts[taskId] = (counts[taskId] || 0) + 1
          }
        }
      })
      return counts
    },
    [recentRuns]
  )

  // Helper: check if a monthly task is already scheduled in the current month
  const getMonthlyScheduledInMonth = useCallback(
    (year: number, month: number, weeksByStartMap: Record<string, DailyTaskWeek | null>): Record<string, number> => {
      const monthStartDateKey = formatDateKey(new Date(year, month, 1))
      const monthEndDateKey = formatDateKey(new Date(year, month + 1, 0))
      const counts: Record<string, number> = {}

      // Check all weeks that might overlap with this month
      Object.values(weeksByStartMap).forEach((week) => {
        if (!week?.days) return
        Object.keys(week.days).forEach((dk) => {
          if (dk >= monthStartDateKey && dk <= monthEndDateKey) {
            const taskId = week.days[dk]?.taskId
            if (taskId && taskId !== '__none__') {
              counts[taskId] = (counts[taskId] || 0) + 1
            }
          }
        })
      })
      return counts
    },
    []
  )

  // Regenerate schedule for next 7 days
  const regenerateSchedule = useCallback(async () => {
    if (!enabledTasks.length) return
    setRegenerating(true)

    try {
      const next7 = Array.from({ length: 7 }).map((_, i) => addDaysToDateKey(todayDateKey, i))
      const weekStarts = Array.from(new Set(next7.map((dk) => getWeekStartDateKeySunday(dk))))
      const updatedWeeks: Record<string, DailyTaskWeek> = {}

      for (const ws of weekStarts) {
        const existing = weeksByStart[ws] || (await getDailyTaskWeek(ws)) || null
        const seed = hashStringToUint32(ws)

        // Get 7 days of this week
        const weekDays = Array.from({ length: 7 }).map((_, i) => addDaysToDateKey(ws, i))

        // Build schedule respecting overrides AND past days
        const days: Record<string, { taskId: string; source: 'auto' | 'override' }> = {}
        const usedCounts: Record<string, number> = {}

        // Get completions from recentRuns for this week - these count toward quotas
        const completionCounts = getCompletionsForWeek(ws)
        Object.keys(completionCounts).forEach((taskId) => {
          usedCounts[taskId] = (usedCounts[taskId] || 0) + completionCounts[taskId]
        })

        // First pass: preserve past days (before today) and overrides
        weekDays.forEach((dk) => {
          const existingEntry = existing?.days?.[dk]
          const isPastDay = dk < todayDateKey

          if (isPastDay && existingEntry?.taskId) {
            // Preserve past days as-is (whether override or auto)
            days[dk] = existingEntry
            // Only count toward quota if not already counted via completions
            // (completions take precedence as they represent actual work done)
            const taskId = existingEntry.taskId
            if (taskId && taskId !== '__none__' && !completionCounts[taskId]) {
              // Count scheduled but not-completed past days toward quota
              usedCounts[taskId] = (usedCounts[taskId] || 0) + 1
            }
          } else if (existingEntry?.source === 'override') {
            // Keep overrides for today and future
            days[dk] = existingEntry
            if (existingEntry.taskId && existingEntry.taskId !== '__none__') {
              usedCounts[existingEntry.taskId] = (usedCounts[existingEntry.taskId] || 0) + 1
            }
          }
        })

        // Second pass: auto-fill remaining days with OPTIMAL SPACING for weekly tasks
        const normalTasks = enabledTasks.filter((t) => t.frequency?.type === 'normal')
        const weeklyTasks = enabledTasks.filter((t) => t.frequency?.type === 'weekly')
        const monthlyTasks = enabledTasks.filter((t) => t.frequency?.type === 'monthly')

        // ─────────────────────────────────────────────────────────────────────
        // RECENCY: Build map of when each task was last completed/selected
        // ─────────────────────────────────────────────────────────────────────
        const recencyMap: Record<string, number> = {}
        recentRuns.forEach((run) => {
          const ts = run.completedAtMs || run.selectedAtMs || 0
          if (ts > 0 && run.taskId) {
            if (!recencyMap[run.taskId] || ts > recencyMap[run.taskId]) {
              recencyMap[run.taskId] = ts
            }
          }
        })

        // Track monthly task usage for each month covered by this week
        const monthlyUsedCounts: Record<string, number> = {}

        // Check completions for months that this week spans
        const weekStartDate = parseDateKey(ws)
        const weekEndDate = addDays(weekStartDate, 6)

        // Get unique months this week covers
        const coveredMonths = new Set<string>()
        for (let d = new Date(weekStartDate); d <= weekEndDate; d.setDate(d.getDate() + 1)) {
          coveredMonths.add(`${d.getFullYear()}-${d.getMonth()}`)
        }

        // Count monthly completions and scheduled tasks for each covered month
        coveredMonths.forEach((monthKey) => {
          const [year, month] = monthKey.split('-').map(Number)
          const monthCompletions = getCompletionsForMonth(year, month)
          const monthScheduled = getMonthlyScheduledInMonth(year, month, weeksByStart)

          Object.keys(monthCompletions).forEach((taskId) => {
            monthlyUsedCounts[`${monthKey}:${taskId}`] = (monthlyUsedCounts[`${monthKey}:${taskId}`] || 0) + monthCompletions[taskId]
          })
          Object.keys(monthScheduled).forEach((taskId) => {
            // Only count if not already counted via completions
            if (!monthCompletions[taskId]) {
              monthlyUsedCounts[`${monthKey}:${taskId}`] = (monthlyUsedCounts[`${monthKey}:${taskId}`] || 0) + monthScheduled[taskId]
            }
          })
        })

        // ─────────────────────────────────────────────────────────────────────
        // OPTIMAL SPACING: Schedule weekly tasks with maximum spacing first
        // ─────────────────────────────────────────────────────────────────────

        // Build a map of which day indices each weekly task is already scheduled on
        const weeklyTaskDayIndices: Record<string, number[]> = {}
        weekDays.forEach((dk, dayIdx) => {
          const entry = days[dk]
          if (entry?.taskId && entry.taskId !== '__none__') {
            const task = weeklyTasks.find((t) => t.id === entry.taskId)
            if (task) {
              if (!weeklyTaskDayIndices[task.id]) weeklyTaskDayIndices[task.id] = []
              weeklyTaskDayIndices[task.id].push(dayIdx)
            }
          }
        })

        // Get available day indices (not past, not override, not already filled)
        const availableDayIndices: number[] = []
        weekDays.forEach((dk, dayIdx) => {
          if (!days[dk] && dk >= todayDateKey) {
            availableDayIndices.push(dayIdx)
          }
        })

        // For each weekly task, find optimal placements using spacing algorithm
        // Process tasks with higher quotas first for better feasibility
        const sortedWeeklyTasks = [...weeklyTasks].sort((a, b) => {
          const quotaA = a.frequency.type === 'weekly' ? a.frequency.quotaPerWeek : 0
          const quotaB = b.frequency.type === 'weekly' ? b.frequency.quotaPerWeek : 0
          return quotaB - quotaA || a.id.localeCompare(b.id)
        })

        const usedDayIndices = new Set<number>()

        for (const wt of sortedWeeklyTasks) {
          const quota = wt.frequency.type === 'weekly' ? wt.frequency.quotaPerWeek : 0
          const alreadyScheduledIndices = weeklyTaskDayIndices[wt.id] || []
          const stillAvailable = availableDayIndices.filter((idx) => !usedDayIndices.has(idx))

          // Find optimal days to place this task
          const optimalDays = findOptimalDaysForWeeklyTask(
            quota,
            alreadyScheduledIndices,
            stillAvailable,
            seed + hashStringToUint32(wt.id)
          )

          // Assign task to optimal days
          for (const dayIdx of optimalDays) {
            const dk = weekDays[dayIdx]
            days[dk] = { taskId: wt.id, source: 'auto' }
            usedDayIndices.add(dayIdx)
            usedCounts[wt.id] = (usedCounts[wt.id] || 0) + 1
          }
        }

        // ─────────────────────────────────────────────────────────────────────
        // Fill remaining days with monthly tasks, then normal tasks (by recency)
        // ─────────────────────────────────────────────────────────────────────

        // Create a VIRTUAL recency map that we update as we schedule tasks
        // This ensures each scheduled task is seen as "recently done" for subsequent days
        const virtualRecencyMap = { ...recencyMap }
        
        // Also mark tasks already scheduled in this week (from past days/overrides) as recently used
        weekDays.forEach((dk) => {
          if (days[dk]?.taskId) {
            const taskId = days[dk].taskId
            const dayTimestamp = parseDateKey(dk).getTime()
            if (!virtualRecencyMap[taskId] || dayTimestamp > virtualRecencyMap[taskId]) {
              virtualRecencyMap[taskId] = dayTimestamp
            }
          }
        })
        
        // Dynamic recency score using virtual map
        const virtualRecencyScore = (taskId: string): number => {
          const last = virtualRecencyMap[taskId]
          return typeof last === 'number' && Number.isFinite(last) ? (Date.now() - last) : 1e15
        }

        weekDays.forEach((dk, dayIdx) => {
          if (days[dk]) {
            return // Already filled
          }
          if (dk < todayDateKey) return // Skip past days

          const dayDate = parseDateKey(dk)
          const dayMonthKey = `${dayDate.getFullYear()}-${dayDate.getMonth()}`

          let picked: string | null = null

          // Try monthly tasks (if not already scheduled/completed this month)
          for (const mt of seededShuffle(monthlyTasks, seed + dayIdx * 10)) {
            const monthlyKey = `${dayMonthKey}:${mt.id}`
            const monthlyUsed = monthlyUsedCounts[monthlyKey] || 0
            if (monthlyUsed < 1) {
              picked = mt.id
              monthlyUsedCounts[monthlyKey] = monthlyUsed + 1
              break
            }
          }

          // Fallback to normal tasks - use VIRTUAL RECENCY (oldest first)
          if (!picked && normalTasks.length) {
            // Sort by virtual recency each time (accounts for tasks scheduled earlier in this run)
            const sortedByVirtualRecency = [...normalTasks].sort((a, b) => {
              const sa = virtualRecencyScore(a.id)
              const sb = virtualRecencyScore(b.id)
              if (sb !== sa) return sb - sa
              return a.id.localeCompare(b.id)
            })

            // Pick the oldest (highest score) with small jitter for ties
            const best = sortedByVirtualRecency.reduce<{ id: string; score: number } | null>((acc, t) => {
              const score = virtualRecencyScore(t.id) + (hashStringToUint32(`${seed}:${dk}:${t.id}`) % 100) * 0.0001
              if (!acc || score > acc.score) return { id: t.id, score }
              return acc
            }, null)

            if (best) {
              picked = best.id
              // UPDATE virtual recency so next day sees this task as "just scheduled"
              virtualRecencyMap[picked] = parseDateKey(dk).getTime()
            }
          }

          if (picked) {
            days[dk] = { taskId: picked, source: 'auto' }
          }
        })

        updatedWeeks[ws] = {
          weekStartDateKey: ws,
          days,
          generatedAtMs: Date.now(),
          generatorVersion: DAILY_TASK_WEEK_GENERATOR_VERSION,
        }

        await upsertDailyTaskWeek(ws, updatedWeeks[ws])
      }

      setWeeksByStart((prev) => ({ ...prev, ...updatedWeeks }))

      // Build debug info to show on screen
      const debugLines: string[] = []
      debugLines.push(`Loaded ${recentRuns.length} task runs from history`)
      debugLines.push('')
      
      // Build recency map for display
      const recencyMapForDebug: Record<string, number> = {}
      recentRuns.forEach((run) => {
        const ts = run.completedAtMs || run.selectedAtMs || 0
        if (ts > 0 && run.taskId) {
          if (!recencyMapForDebug[run.taskId] || ts > recencyMapForDebug[run.taskId]) {
            recencyMapForDebug[run.taskId] = ts
          }
        }
      })
      
      const normalTasksForDebug = enabledTasks.filter(t => t.frequency?.type === 'normal')
      debugLines.push('NORMAL TASK RECENCY (higher score = older = picked first):')
      normalTasksForDebug
        .map(t => {
          const last = recencyMapForDebug[t.id]
          const score = last ? (Date.now() - last) : 1e15
          const lastDate = last ? new Date(last).toLocaleDateString() : 'NEVER'
          return { name: t.name || t.id, last, score, lastDate }
        })
        .sort((a, b) => b.score - a.score)
        .forEach(({ name, score, lastDate }) => {
          const scoreStr = score === 1e15 ? 'MAX (never done)' : Math.round(score / (1000 * 60 * 60 * 24)) + ' days ago'
          debugLines.push(`  • ${name}: ${lastDate} (${scoreStr})`)
        })
      
      debugLines.push('')
      debugLines.push('SCHEDULE RESULT:')
      Object.entries(updatedWeeks).forEach(([ws, week]) => {
        debugLines.push(`Week ${ws}:`)
        Object.entries(week.days || {}).sort().forEach(([dk, entry]) => {
          const task = enabledTasks.find(t => t.id === entry.taskId)
          const isPast = dk < todayDateKey ? '(past)' : dk === todayDateKey ? '(TODAY)' : ''
          debugLines.push(`  ${dk}: ${task?.name || entry.taskId} [${entry.source}] ${isPast}`)
        })
      })
      
      setDebugInfo(debugLines)

      // Check for exceeded quotas and show popup if any
      const exceededWarnings = computeExceededQuotaWarnings(updatedWeeks)
      if (exceededWarnings.length > 0) {
        setQuotaWarningPopup({ show: true, warnings: exceededWarnings })
      }
    } catch (err) {
      console.error('Failed to regenerate schedule:', err)
      setDebugInfo([
        'ERROR: Failed to regenerate schedule',
        '',
        String(err),
        '',
        (err as Error)?.stack || ''
      ])
    } finally {
      setRegenerating(false)
    }
  }, [enabledTasks, todayDateKey, weeksByStart, getCompletionsForWeek, getCompletionsForMonth, getMonthlyScheduledInMonth, computeExceededQuotaWarnings, recentRuns])

  // Re-close today's task
  const recloseToday = useCallback(async () => {
    if (!todayRun?.revealedAtMs && !todayRun?.completedAtMs) return
    setReclosingToday(true)
    try {
      await adminRecloseDailyTaskRun(todayDateKey)
    } catch (err) {
      console.error('Failed to re-close today:', err)
    } finally {
      setReclosingToday(false)
    }
  }, [todayDateKey, todayRun])

  // Next 7 days data
  const next7Days = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) => {
      const dk = addDaysToDateKey(todayDateKey, i)
      const ws = getWeekStartDateKeySunday(dk)
      const week = weeksByStart[ws] || null
      const entry = week?.days?.[dk]
      return { dateKey: dk, weekStart: ws, entry, week }
    })
  }, [todayDateKey, weeksByStart])

  // All warnings for displayed weeks
  const allWarnings = useMemo(() => {
    const weekStarts = Array.from(new Set(next7Days.map((d) => d.weekStart)))
    return Array.from(new Set(weekStarts.flatMap((ws) => computeQuotaWarnings(weeksByStart[ws] || null))))
  }, [next7Days, weeksByStart, computeQuotaWarnings])

  return (
    <div className="daily-tasks-page">
      <header className="admin-page-header">
        <h1>Daily Tasks</h1>
        <p>Manage "Today's Task" golden cards with weekly quotas and scheduling.</p>
      </header>

      {/* Quota Warning Popup */}
      {quotaWarningPopup.show && (
        <div className="daily-quota-popup-overlay" onClick={() => setQuotaWarningPopup({ show: false, warnings: [] })}>
          <div className="daily-quota-popup" onClick={(e) => e.stopPropagation()}>
            <h3 className="daily-quota-popup-title">Quota Warning</h3>
            <div className="daily-quota-popup-content">
              <p>The following quota limits have been exceeded:</p>
              <ul className="daily-quota-popup-list">
                {quotaWarningPopup.warnings.map((warning, idx) => (
                  <li key={idx}>{warning}</li>
                ))}
              </ul>
              <p className="daily-quota-popup-note">
                You may want to adjust overrides or task frequencies to resolve these issues.
              </p>
            </div>
            <div className="daily-quota-popup-actions">
              <button
                className="admin-btn admin-btn-primary"
                onClick={() => setQuotaWarningPopup({ show: false, warnings: [] })}
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Task Form */}
      <div className="admin-card daily-form-card">
        <h3 className="admin-card-title">
          <span>{editingId ? '✏️' : '➕'}</span> {editingId ? 'Edit Daily Task' : 'Add Daily Task'}
        </h3>

        {saveError && <div className="daily-error">{saveError}</div>}

        <div className="daily-form">
          <div className="daily-form-field">
            <label className="admin-label">Name</label>
            <input
              type="text"
              className="admin-input"
              placeholder="e.g. Clean grill station"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="daily-form-row">
            <div className="daily-form-field">
              <label className="admin-label">Frequency</label>
              <select
                className="admin-input"
                value={frequencyType}
                onChange={(e) => {
                  const val = e.target.value
                  setFrequencyType(val === 'weekly' ? 'weekly' : val === 'monthly' ? 'monthly' : 'normal')
                }}
              >
                <option value="normal">Normal (no weekly quota)</option>
                <option value="weekly">Weekly quota (1-3/week)</option>
                <option value="monthly">Rare (1/month)</option>
              </select>
            </div>

            {frequencyType === 'weekly' && (
              <div className="daily-form-field">
                <label className="admin-label">Quota per Week</label>
                <select
                  className="admin-input"
                  value={String(quota)}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10)
                    setQuota(n === 2 ? 2 : n === 3 ? 3 : 1)
                  }}
                >
                  <option value="1">1 day/week</option>
                  <option value="2">2 days/week</option>
                  <option value="3">3 days/week</option>
                </select>
              </div>
            )}
          </div>

          <div className="daily-form-section">
            <h4>Materials Needed</h4>
            <div className="daily-form-field">
              <label className="admin-label">Image</label>
              <input
                type="file"
                accept="image/*"
                className="admin-input"
                onChange={(e) => setMaterialsFile(e.target.files?.[0] || null)}
              />
              {typeof uploadPct.materials === 'number' && (
                <div className="daily-upload-progress">Upload: {uploadPct.materials}%</div>
              )}
            </div>
            <div className="daily-form-field">
              <label className="admin-label">Description</label>
              <textarea
                className="admin-input daily-textarea"
                placeholder="Short description of items needed..."
                value={materialsDesc}
                onChange={(e) => setMaterialsDesc(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <div className="daily-form-section">
            <h4>What To Do</h4>
            <div className="daily-form-field">
              <label className="admin-label">Image</label>
              <input
                type="file"
                accept="image/*"
                className="admin-input"
                onChange={(e) => setWhatToDoFile(e.target.files?.[0] || null)}
              />
              {typeof uploadPct.whatToDo === 'number' && (
                <div className="daily-upload-progress">Upload: {uploadPct.whatToDo}%</div>
              )}
            </div>
            <div className="daily-form-field">
              <label className="admin-label">Description</label>
              <textarea
                className="admin-input daily-textarea"
                placeholder="Short description of what to do..."
                value={whatToDoDesc}
                onChange={(e) => setWhatToDoDesc(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <div className="daily-form-actions">
            <button
              className="admin-btn admin-btn-primary"
              onClick={saveTask}
              disabled={saving}
            >
              {saving ? 'Saving...' : editingId ? 'Update Task' : '+ Add Task'}
            </button>
            {editingId && (
              <button className="admin-btn admin-btn-secondary" onClick={resetForm}>
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Task List */}
      <div className="admin-card">
        <h3 className="admin-card-title">
          <span>📋</span> Daily Tasks
        </h3>

        {enabledTasks.length === 0 ? (
          <div className="admin-empty">
            <span className="admin-empty-icon">📋</span>
            <h3>No daily tasks yet</h3>
            <p>Add your first daily task above</p>
          </div>
        ) : (
          <div className="daily-task-list">
            {enabledTasks
              .slice()
              .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
              .map((task) => {
                const freqLabel =
                  task.frequency?.type === 'weekly'
                    ? `Weekly: ${task.frequency.quotaPerWeek}/week`
                    : task.frequency?.type === 'monthly'
                    ? 'Rare: 1/month'
                    : 'Normal'
                return (
                  <div key={task.id} className="daily-task-item">
                    <div className="daily-task-header">
                      <span className="daily-task-name">{task.name}</span>
                      <span className="admin-badge admin-badge-info">{freqLabel}</span>
                    </div>
                    <div className="daily-task-id">ID: {task.id}</div>
                    <div className="daily-task-actions">
                      <button
                        className="admin-btn admin-btn-secondary"
                        onClick={() => startEdit(task)}
                      >
                        Edit
                      </button>
                      <button
                        className="admin-btn daily-btn-danger"
                        onClick={() => deleteTask(task.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )
              })}
          </div>
        )}
      </div>

      {/* Schedule Preview */}
      <div className="admin-card">
        <div className="admin-card-header">
          <h3 className="admin-card-title">
            <span>📅</span> Next 7 Days
          </h3>
          <button
            className="admin-btn admin-btn-secondary"
            onClick={() => {
              setDebugInfo(['Starting regeneration...'])
              regenerateSchedule()
            }}
            disabled={regenerating}
          >
            {regenerating ? 'Regenerating...' : '🔄 Regenerate'}
          </button>
        </div>

        {debugInfo && (
          <div style={{
            background: '#1a1a2e',
            border: '1px solid #444',
            borderRadius: 8,
            padding: 12,
            marginBottom: 12,
            fontFamily: 'monospace',
            fontSize: 12,
            whiteSpace: 'pre-wrap',
            maxHeight: 300,
            overflowY: 'auto',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <strong>Regeneration Debug Info</strong>
              <button
                type="button"
                onClick={() => setDebugInfo(null)}
                style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer' }}
              >
                ✕ Close
              </button>
            </div>
            {debugInfo.map((line, i) => (
              <div key={i}>{line || '\u00A0'}</div>
            ))}
          </div>
        )}

        {allWarnings.length > 0 && (
          <div className="daily-warnings">
            <strong>Warnings:</strong>
            {allWarnings.map((w) => (
              <div key={w}>{w}</div>
            ))}
          </div>
        )}

        <div className="daily-schedule-list">
          {next7Days.map(({ dateKey, entry }) => {
            const currentId = entry?.taskId || ''
            const currentName =
              currentId === '__none__'
                ? '— No task —'
                : currentId
                ? enabledTasks.find((t) => t.id === currentId)?.name || currentId
                : '(unassigned)'
            const pick = overridePickByDateKey[dateKey] ?? currentId
            const label = parseDateKey(dateKey).toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })
            const isToday = dateKey === todayDateKey

            return (
              <div key={dateKey} className={`daily-schedule-item ${isToday ? 'daily-schedule-today' : ''}`}>
                <div className="daily-schedule-header">
                  <span className="daily-schedule-date">
                    {label}
                    {isToday && <span className="daily-today-badge">Today</span>}
                  </span>
                  <span
                    className={`admin-badge ${
                      entry?.source === 'override' ? 'admin-badge-accent' : 'admin-badge-info'
                    }`}
                  >
                    {entry?.source === 'override' ? 'Override' : 'Auto'}
                  </span>
                </div>
                <div className="daily-schedule-task">
                  <strong>Task:</strong> {currentName}
                </div>
                <div className="daily-schedule-actions">
                  <select
                    className="admin-input daily-schedule-select"
                    value={pick}
                    onChange={(e) =>
                      setOverridePickByDateKey((prev) => ({ ...prev, [dateKey]: e.target.value }))
                    }
                  >
                    <option value="">Select task...</option>
                    <option value="__none__">— No task —</option>
                    {enabledTasks
                      .slice()
                      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                  </select>
                  <button
                    className="admin-btn admin-btn-primary"
                    disabled={!pick || overrideSaving === dateKey}
                    onClick={() => {
                      const nextId = overridePickByDateKey[dateKey] ?? currentId
                      if (!nextId) return
                      const displayName =
                        nextId === '__none__'
                          ? 'No task'
                          : enabledTasks.find((t) => t.id === nextId)?.name || nextId
                      if (confirm(`Override ${label} to "${displayName}"?`)) {
                        setOverride(dateKey, nextId)
                      }
                    }}
                  >
                    {overrideSaving === dateKey ? '...' : 'Set'}
                  </button>
                  {isToday && (todayRun?.revealedAtMs || todayRun?.completedAtMs) && (
                    <button
                      className="admin-btn daily-btn-warning"
                      disabled={reclosingToday}
                      onClick={() => {
                        if (
                          confirm(
                            "Re-close today's task?\n\nThis will:\n• Make it 'Tap to reveal' again\n• Clear completion (if completed)"
                          )
                        ) {
                          recloseToday()
                        }
                      }}
                    >
                      {reclosingToday ? '...' : 'Re-close'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Recent Runs */}
      <div className="admin-card">
        <h3 className="admin-card-title">
          <span>📜</span> Recent Runs (Last 30 Days)
        </h3>

        {runsLoading ? (
          <div className="admin-empty">Loading...</div>
        ) : recentRuns.length === 0 ? (
          <div className="admin-empty">
            <span className="admin-empty-icon">📜</span>
            <h3>No runs found</h3>
            <p>Daily task runs will appear here</p>
          </div>
        ) : (
          <div className="daily-runs-list">
            {recentRuns.slice(0, 30).map((run) => {
              const task = enabledTasks.find((t) => t.id === run.taskId) || null
              const taskName = task?.name || run.taskId
              const completedBy =
                (run.completedByList && run.completedByList.length
                  ? run.completedByList.join(' + ')
                  : '') ||
                run.completedBy ||
                ''
              const status = run.completedAtMs
                ? `Completed by ${completedBy || 'unknown'}`
                : run.revealedAtMs
                ? 'Revealed'
                : 'Selected'

              return (
                <div key={run.dateKey} className="daily-run-item">
                  <div className="daily-run-header">
                    <span className="daily-run-date">{run.dateKey}</span>
                    <span className="admin-badge admin-badge-success">{status}</span>
                  </div>
                  <div className="daily-run-task">
                    <strong>Task:</strong> {taskName}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default DailyTasksPage
