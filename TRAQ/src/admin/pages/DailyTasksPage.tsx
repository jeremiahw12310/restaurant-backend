import { useState, useEffect, useCallback, useMemo } from 'react'
import './DailyTasksPage.css'
import { storage } from '../../firebase'
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage'
import {
  subscribeToDailyTaskCatalog,
  saveDailyTaskCatalog,
  getDailyTaskRun,
  getDailyTaskWeek,
  upsertDailyTaskWeek,
  upsertDailyTaskRun,
  subscribeToDailyTaskWeek,
  listDailyTaskRunsInRange,
  subscribeToDailyTaskRun,
  adminRecloseDailyTaskRun,
  adminPatchDailyTaskRunHistory,
  type DailyTaskCatalog,
  type DailyTaskDef,
  type DailyTaskRun,
  type DailyTaskWeek,
  approvePendingDailyTaskDays,
  setDailyTaskDayApproval,
} from '../../services/firestore'
import {
  approvalStatusLabel,
  createOverrideDayEntry,
  getDayApprovalStatus,
  parseWeekDayEntry,
} from '../../utils/dailyTaskApproval'
import { createNewDailyTaskId, resolveDailyTaskDefFromCatalog } from '../../utils/dailyTaskCatalog'
import {
  formatDailyTaskRunCompletedBy,
  getDailyTaskRunHistoryTitle,
  NO_TASK_DAILY_RUN_LABEL,
} from '../../utils/dailyTaskRunDisplay'
import {
  archiveDailyTaskInCatalog,
  getActiveDailyTasks,
  getArchivedDailyTasks,
  getSchedulableDailyTasks,
  isDailyTaskSchedulable,
  restoreDailyTaskInCatalog,
} from '../../utils/dailyTaskArchive'
import {
  addDaysToDateKey,
  buildMergedRecencyMap,
  DAILY_TASK_WEEK_GENERATOR_VERSION,
  DAILY_TASK_WEEK_GENERATOR_VERSION_AI,
  enumerateWeekStartDateKeysInclusive,
  generateDailyTaskWeek,
  getWeekStartDateKeySunday,
} from '../../utils/dailyTaskWeekGenerator'
import { fetchValidatedWeeklyPlacements } from '../../services/dailyTaskScheduleAi'
import {
  clearDailyTaskScheduleAiSystemPrompt,
  DEFAULT_DAILY_TASK_SCHEDULE_SYSTEM_PROMPT,
  resolveDailyTaskScheduleSystemPrompt,
  saveDailyTaskScheduleAiSettings,
  subscribeToDailyTaskScheduleAiSettings,
} from '../../services/dailyTaskScheduleAiSettings'

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

async function loadScheduleWeeksOverlappingDateRange(
  fromDateKey: string,
  toDateKey: string
): Promise<DailyTaskWeek[]> {
  const keys = enumerateWeekStartDateKeysInclusive(fromDateKey, toDateKey)
  const loaded = await Promise.all(keys.map((ws) => getDailyTaskWeek(ws)))
  return loaded.filter((w): w is DailyTaskWeek => !!w && !!(w as DailyTaskWeek).days)
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
  const [approvalSaving, setApprovalSaving] = useState<string | null>(null)
  const [bulkApproving, setBulkApproving] = useState(false)
  const [regenPendingNotice, setRegenPendingNotice] = useState<number | null>(null)
  const [regenerating, setRegenerating] = useState(false)
  const [reclosingToday, setReclosingToday] = useState(false)
  const [debugInfo, setDebugInfo] = useState<string[] | null>(null)

  const [advancedSettingsExpanded, setAdvancedSettingsExpanded] = useState(false)
  const [promptDraft, setPromptDraft] = useState(DEFAULT_DAILY_TASK_SCHEDULE_SYSTEM_PROMPT)
  const [savedPromptOverride, setSavedPromptOverride] = useState<string | undefined>(undefined)
  const [promptDirty, setPromptDirty] = useState(false)
  const [promptSaving, setPromptSaving] = useState(false)
  const [promptSaveError, setPromptSaveError] = useState<string | null>(null)

  const [runHistoryEdit, setRunHistoryEdit] = useState<DailyTaskRun | null>(null)
  const [runHistoryTitle, setRunHistoryTitle] = useState('')
  const [runHistoryEmp1, setRunHistoryEmp1] = useState('')
  const [runHistoryEmp2, setRunHistoryEmp2] = useState('')
  const [runHistoryCreditTaskId, setRunHistoryCreditTaskId] = useState('')
  const [runHistorySaving, setRunHistorySaving] = useState(false)
  const [runHistoryError, setRunHistoryError] = useState<string | null>(null)

  // Quota warning popup state
  const [quotaWarningPopup, setQuotaWarningPopup] = useState<{
    show: boolean
    warnings: string[]
  }>({ show: false, warnings: [] })

  const [showAllRecentRuns, setShowAllRecentRuns] = useState(false)
  const [catalogExpanded, setCatalogExpanded] = useState(false)
  const [catalogSearch, setCatalogSearch] = useState('')
  const [showAllCatalogTasks, setShowAllCatalogTasks] = useState(false)
  const [showArchivedCatalogSection, setShowArchivedCatalogSection] = useState(false)

  const todayDateKey = formatDateKey(new Date())

  // Subscribe to daily task catalog
  useEffect(() => {
    const unsub = subscribeToDailyTaskCatalog((catalog) => {
      setDailyTaskCatalog(catalog)
    })
    return () => unsub?.()
  }, [])

  useEffect(() => {
    const unsub = subscribeToDailyTaskScheduleAiSettings((settings) => {
      setSavedPromptOverride(settings.systemPrompt)
      if (!promptDirty) {
        setPromptDraft(
          settings.systemPrompt?.trim() || DEFAULT_DAILY_TASK_SCHEDULE_SYSTEM_PROMPT
        )
      }
    })
    return () => unsub?.()
  }, [promptDirty])

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

  const reloadRecentRuns = useCallback(async () => {
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
  }, [todayDateKey])

  useEffect(() => {
    void reloadRecentRuns()
  }, [reloadRecentRuns])

  const schedulableTasks = useMemo(
    () => getSchedulableDailyTasks(dailyTaskCatalog.tasks),
    [dailyTaskCatalog.tasks]
  )

  const effectiveSavedPrompt = useMemo(
    () =>
      savedPromptOverride?.trim()
        ? savedPromptOverride.trim()
        : DEFAULT_DAILY_TASK_SCHEDULE_SYSTEM_PROMPT,
    [savedPromptOverride]
  )

  const hasUnsavedPromptChanges = promptDraft.trim() !== effectiveSavedPrompt

  const savePromptDraft = useCallback(async () => {
    setPromptSaving(true)
    setPromptSaveError(null)
    try {
      await saveDailyTaskScheduleAiSettings({ systemPrompt: promptDraft, updatedBy: 'admin' })
      setPromptDirty(false)
    } catch (err) {
      console.error('Failed to save AI schedule prompt:', err)
      setPromptSaveError(
        err instanceof Error && err.message === 'daily-task-schedule-prompt-too-long'
          ? 'Prompt is too long. Shorten it and try again.'
          : 'Failed to save prompt. Please try again.'
      )
    } finally {
      setPromptSaving(false)
    }
  }, [promptDraft])

  const resetPromptToDefault = useCallback(async () => {
    setPromptSaving(true)
    setPromptSaveError(null)
    try {
      await clearDailyTaskScheduleAiSystemPrompt({ updatedBy: 'admin' })
      setPromptDraft(DEFAULT_DAILY_TASK_SCHEDULE_SYSTEM_PROMPT)
      setPromptDirty(false)
    } catch (err) {
      console.error('Failed to reset AI schedule prompt:', err)
      setPromptSaveError('Failed to reset prompt. Please try again.')
    } finally {
      setPromptSaving(false)
    }
  }, [])

  const activeTasks = useMemo(
    () => getActiveDailyTasks(dailyTaskCatalog.tasks),
    [dailyTaskCatalog.tasks]
  )

  const archivedTasks = useMemo(
    () => getArchivedDailyTasks(dailyTaskCatalog.tasks),
    [dailyTaskCatalog.tasks]
  )

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
    setCatalogExpanded(true)
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
    const existing = isEditing ? resolveDailyTaskDefFromCatalog(dailyTaskCatalog.tasks, editingId) : null

    const id = isEditing ? editingId : createNewDailyTaskId()

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
        ...(existing?.disabledAtMs ? { disabledAtMs: existing.disabledAtMs } : {}),
        ...(existing?.archivedAtMs ? { archivedAtMs: existing.archivedAtMs } : {}),
      }

      const updated: DailyTaskCatalog = {
        tasks: isEditing
          ? [...dailyTaskCatalog.tasks.filter((t) => t.id !== id), newTask]
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

  // Delete task (remove from catalog — matches App admin; avoids slug/id collisions on re-add)
  const deleteTask = useCallback(
    async (id: string) => {
      const task = dailyTaskCatalog.tasks.find((t) => t.id === id)
      if (!task) return
      if (!confirm(`Delete daily task "${task.name}"?`)) return

      try {
        const updated: DailyTaskCatalog = {
          tasks: dailyTaskCatalog.tasks.filter((t) => t.id !== id),
        }
        await saveDailyTaskCatalog(updated)
        if (editingId === id) resetForm()
      } catch (err) {
        console.error('Failed to delete daily task:', err)
      }
    },
    [dailyTaskCatalog.tasks, editingId, resetForm]
  )

  const archiveTask = useCallback(
    async (id: string) => {
      const task = dailyTaskCatalog.tasks.find((t) => t.id === id)
      if (!task) return
      if (
        !confirm(
          `Archive "${task.name}"?\n\nIt will not be auto-scheduled on new weeks. Existing schedule slots and run history are unchanged.`
        )
      ) {
        return
      }
      try {
        const updated: DailyTaskCatalog = {
          tasks: archiveDailyTaskInCatalog(dailyTaskCatalog.tasks, id),
        }
        await saveDailyTaskCatalog(updated)
        if (editingId === id) resetForm()
        setShowArchivedCatalogSection(true)
      } catch (err) {
        console.error('Failed to archive daily task:', err)
        alert('Failed to archive daily task')
      }
    },
    [dailyTaskCatalog.tasks, editingId, resetForm]
  )

  const restoreTask = useCallback(
    async (id: string) => {
      try {
        const updated: DailyTaskCatalog = {
          tasks: restoreDailyTaskInCatalog(dailyTaskCatalog.tasks, id),
        }
        await saveDailyTaskCatalog(updated)
      } catch (err) {
        console.error('Failed to restore daily task:', err)
        alert('Failed to restore daily task')
      }
    },
    [dailyTaskCatalog.tasks]
  )

  const catalogSearchNorm = catalogSearch.trim().toLowerCase()
  const filterCatalogBySearch = useCallback(
    (tasks: DailyTaskDef[]) => {
      if (!catalogSearchNorm) return tasks
      return tasks.filter(
        (t) =>
          (t.name || '').toLowerCase().includes(catalogSearchNorm) ||
          (t.id || '').toLowerCase().includes(catalogSearchNorm)
      )
    },
    [catalogSearchNorm]
  )

  // Compute quota warnings for a week (weekly tasks)
  const computeQuotaWarnings = useCallback(
    (week: DailyTaskWeek | null): string[] => {
      if (!week) return []
      const weekly = schedulableTasks.filter((t) => t.frequency?.type === 'weekly') as DailyTaskDef[]
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
    [schedulableTasks]
  )

  // Compute EXCEEDED quota warnings (weekly > quota, monthly > 1)
  const computeExceededQuotaWarnings = useCallback(
    (updatedWeeks: Record<string, DailyTaskWeek>): string[] => {
      const warnings: string[] = []

      // Weekly quota exceeded warnings
      const weekly = schedulableTasks.filter((t) => t.frequency?.type === 'weekly') as DailyTaskDef[]
      const monthly = schedulableTasks.filter((t) => t.frequency?.type === 'monthly') as DailyTaskDef[]

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

      recentRuns.forEach((run) => {
        if (!run.completedAtMs) return
        const d = parseDateKey(run.dateKey)
        const monthKey = `${d.getFullYear()}-${d.getMonth()}`
        if (!monthCounts[monthKey]) monthCounts[monthKey] = {}
        const raw = String(run.taskId || '').trim()
        const credit = typeof run.schedulingCreditTaskId === 'string' ? run.schedulingCreditTaskId.trim() : ''
        const tids: string[] = []
        if (raw && raw !== '__none__') tids.push(raw)
        if (credit && !tids.includes(credit)) tids.push(credit)
        tids.forEach((tid) => {
          monthCounts[monthKey][tid] = (monthCounts[monthKey][tid] || 0) + 1
        })
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
    [schedulableTasks, recentRuns]
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
            [dateKey]: createOverrideDayEntry(taskId),
          },
        }

        await upsertDailyTaskWeek(weekStart, nextWeek)
        setWeeksByStart((prev) => ({ ...prev, [weekStart]: nextWeek }))

        // Keep `dailyTaskRuns/{dateKey}` in sync with the override (including past/future days and `__none__`)
        // so Recent Runs can list the day and admins can use Edit history. Never clobber a completed run.
        const existingRun = await getDailyTaskRun(dateKey)
        if (!existingRun?.completedAtMs) {
          await upsertDailyTaskRun(dateKey, {
            taskId,
            selectedAtMs:
              typeof existingRun?.selectedAtMs === 'number' && Number.isFinite(existingRun.selectedAtMs)
                ? existingRun.selectedAtMs
                : Date.now(),
            override: { taskId, atMs: Date.now(), by: 'admin' },
          })
        }
        await reloadRecentRuns()
      } catch (err) {
        console.error('Failed to set override:', err)
      } finally {
        setOverrideSaving(null)
      }
    },
    [reloadRecentRuns, weeksByStart, todayDateKey]
  )

  // Regenerate schedule for next 7 days
  const regenerateSchedule = useCallback(async () => {
    if (!schedulableTasks.length) return
    setRegenerating(true)

    try {
      const tasks = schedulableTasks
      const today = todayDateKey
      const historyFrom = addDaysToDateKey(today, -120)
      let recentRuns120: DailyTaskRun[] = []
      try {
        recentRuns120 = await listDailyTaskRunsInRange(historyFrom, today)
      } catch (e) {
        console.warn('Failed to load recent runs for schedule regeneration:', e)
      }

      let scheduleWeeks: DailyTaskWeek[] = []
      try {
        scheduleWeeks = await loadScheduleWeeksOverlappingDateRange(historyFrom, today)
      } catch (e) {
        console.warn('Failed to load daily task weeks for recency merge:', e)
      }

      const next7 = Array.from({ length: 7 }).map((_, i) => addDaysToDateKey(today, i))
      const weekStarts = Array.from(new Set(next7.map((dk) => getWeekStartDateKeySunday(dk)))).sort()

      let aiByWeek: Record<string, Record<string, string>> = {}
      let scheduleUsedAi = false
      try {
        const weeksPayload = await Promise.all(
          weekStarts.map(async (weekStart) => ({
            weekStartDateKey: weekStart,
            existingWeek: weeksByStart[weekStart] || (await getDailyTaskWeek(weekStart)) || null,
            todayDateKey: today,
          }))
        )
        const aiResult = await fetchValidatedWeeklyPlacements({
          tasks,
          recentRunsForHistory: recentRuns120,
          weeks: weeksPayload,
          systemPrompt: resolveDailyTaskScheduleSystemPrompt(promptDraft),
        })
        aiByWeek = aiResult.byWeek
        scheduleUsedAi = aiResult.usedAi
      } catch (e) {
        console.warn('AI daily schedule batch skipped:', e)
      }

      const updatedWeeks: Record<string, DailyTaskWeek> = {}
      const allWarnings: string[] = []
      const weeksForRecency = [...scheduleWeeks]

      for (const ws of weekStarts) {
        const existing = weeksByStart[ws] || (await getDailyTaskWeek(ws)) || null
        const picked = aiByWeek[ws]
        const weeklyPlacementOverrides =
          scheduleUsedAi && picked && Object.keys(picked).length > 0 ? picked : undefined
        const generatorVersion = weeklyPlacementOverrides
          ? DAILY_TASK_WEEK_GENERATOR_VERSION_AI
          : undefined

        const result = generateDailyTaskWeek({
          weekStartDateKey: ws,
          tasks,
          recentRuns: recentRuns120,
          scheduleWeeksForRecency: weeksForRecency,
          existingWeek: existing,
          todayDateKey: today,
          weeklyPlacementOverrides,
          generatorVersion,
        })

        if (result.warnings.length) {
          allWarnings.push(...result.warnings)
        }

        if (result.week) {
          await upsertDailyTaskWeek(ws, result.week)
          updatedWeeks[ws] = result.week
          const idx = weeksForRecency.findIndex((w) => w.weekStartDateKey === ws)
          const merged: DailyTaskWeek = { ...result.week, weekStartDateKey: ws }
          if (idx >= 0) weeksForRecency[idx] = merged
          else weeksForRecency.push(merged)
        }
      }

      setWeeksByStart((prev) => ({ ...prev, ...updatedWeeks }))

      let pendingAfterRegen = 0
      next7.forEach((dk) => {
        const ws = getWeekStartDateKeySunday(dk)
        const week = updatedWeeks[ws] || weeksByStart[ws]
        const entry = parseWeekDayEntry(week?.days?.[dk])
        if (entry && getDayApprovalStatus(entry) === 'pending') pendingAfterRegen += 1
      })
      setRegenPendingNotice(pendingAfterRegen > 0 ? pendingAfterRegen : null)

      // Build debug info to show on screen
      const debugLines: string[] = []
      debugLines.push(`Loaded ${recentRuns120.length} task runs from history (last 120 days)`)
      debugLines.push(
        scheduleUsedAi
          ? 'Weekly quota day picks: AI-assisted (validated); monthly/normal fill uses algorithm + run history.'
          : 'Weekly quota day picks: algorithm only (AI unavailable, timed out, or invalid response).'
      )
      debugLines.push('')

      const lastByTask = buildMergedRecencyMap(recentRuns120, scheduleWeeks)
      const freqLabel = (t: DailyTaskDef): string => {
        switch (t.frequency.type) {
          case 'normal':
            return 'normal'
          case 'monthly':
            return 'monthly'
          case 'weekly':
            return `weekly×${t.frequency.quotaPerWeek}`
        }
      }

      debugLines.push(
        'TASK RECENCY (runs + scheduled weeks; higher score = older; normal-slot ties favor oldest):'
      )
      schedulableTasks
        .map((t) => {
          const last = lastByTask[t.id]
          const score = last ? Date.now() - last : 1e15
          const lastDate = last ? new Date(last).toLocaleDateString() : 'NEVER'
          return { name: t.name || t.id, freq: freqLabel(t), last, score, lastDate }
        })
        .sort((a, b) => b.score - a.score)
        .forEach(({ name, freq, score, lastDate }) => {
          const scoreStr =
            score === 1e15 ? 'MAX (never done)' : Math.round(score / (1000 * 60 * 60 * 24)) + ' days ago'
          debugLines.push(`  • [${freq}] ${name}: ${lastDate} (${scoreStr})`)
        })
      
      debugLines.push('')
      debugLines.push('SCHEDULE RESULT:')
      Object.entries(updatedWeeks).forEach(([ws, week]) => {
        debugLines.push(`Week ${ws}:`)
        Object.entries(week.days || {}).sort().forEach(([dk, entry]) => {
          const task = schedulableTasks.find(t => t.id === entry.taskId)
          const isPast = dk < todayDateKey ? '(past)' : dk === todayDateKey ? '(TODAY)' : ''
          debugLines.push(`  ${dk}: ${task?.name || entry.taskId} [${entry.source}] ${isPast}`)
        })
      })

      if (allWarnings.length) {
        debugLines.push('')
        debugLines.push('WARNINGS:')
        allWarnings.forEach((w) => debugLines.push(`  ⚠️ ${w}`))
      }

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
  }, [schedulableTasks, todayDateKey, weeksByStart, computeExceededQuotaWarnings, promptDraft])

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

  const openRunHistoryEdit = useCallback(
    (run: DailyTaskRun) => {
      const isNoTask = run.taskId === '__none__'
      const isCompleted = typeof run.completedAtMs === 'number' && Number.isFinite(run.completedAtMs)
      if (!isNoTask && !isCompleted) return
      setRunHistoryError(null)
      setRunHistoryEdit(run)
      setRunHistoryTitle(getDailyTaskRunHistoryTitle(run, dailyTaskCatalog.tasks))
      const list = (run.completedByList || []).map((s) => (s || '').trim()).filter(Boolean)
      const splitLegacy = (run.completedBy || '').split(/\s*\+\s*/)
      const e1 = list[0] || splitLegacy[0]?.trim() || ''
      const e2 = list[1] || splitLegacy[1]?.trim() || ''
      setRunHistoryEmp1(e1)
      setRunHistoryEmp2(e2)
      setRunHistoryCreditTaskId(run.taskId === '__none__' ? (run.schedulingCreditTaskId || '').trim() : '')
    },
    [dailyTaskCatalog.tasks]
  )

  const saveRunHistoryEdit = useCallback(async () => {
    if (!runHistoryEdit) return
    const defaultTitle =
      runHistoryEdit.taskId === '__none__'
        ? NO_TASK_DAILY_RUN_LABEL
        : resolveDailyTaskDefFromCatalog(dailyTaskCatalog.tasks, runHistoryEdit.taskId)?.name || runHistoryEdit.taskId
    const titleTrim = runHistoryTitle.trim()
    const titleForApi = titleTrim === defaultTitle.trim() ? '' : titleTrim
    setRunHistorySaving(true)
    setRunHistoryError(null)
    try {
      const creditTrim = runHistoryCreditTaskId.trim()
      if (runHistoryEdit.taskId === '__none__' && creditTrim) {
        const found = resolveDailyTaskDefFromCatalog(dailyTaskCatalog.tasks, creditTrim)
        if (!found) {
          setRunHistoryError('Scheduling credit: choose a valid task from the list.')
          setRunHistorySaving(false)
          return
        }
      }
      await adminPatchDailyTaskRunHistory(runHistoryEdit.dateKey, {
        historyDisplayName: titleForApi,
        completedBy1: runHistoryEmp1,
        completedBy2: runHistoryEmp2,
        ...(runHistoryEdit.taskId === '__none__' ? { schedulingCreditTaskId: creditTrim } : {}),
      })
      setRunHistoryEdit(null)
      await reloadRecentRuns()
    } catch (e) {
      const code = e instanceof Error ? e.message : ''
      const msg =
        code === 'daily-task-run-missing'
          ? 'No run document for that day.'
          : code === 'daily-task-run-not-completed'
            ? 'That day is not marked completed yet.'
            : code === 'daily-task-run-completers-required'
              ? 'Enter at least one completer name.'
              : 'Save failed. Check connection and try again.'
      setRunHistoryError(msg)
    } finally {
      setRunHistorySaving(false)
    }
  }, [
    dailyTaskCatalog.tasks,
    reloadRecentRuns,
    runHistoryEdit,
    runHistoryEmp1,
    runHistoryEmp2,
    runHistoryCreditTaskId,
    runHistoryTitle,
  ])

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

  const pendingNext7Count = useMemo(() => {
    let n = 0
    next7Days.forEach(({ dateKey, weekStart }) => {
      const entry = parseWeekDayEntry(weeksByStart[weekStart]?.days?.[dateKey])
      if (entry && getDayApprovalStatus(entry) === 'pending') n += 1
    })
    return n
  }, [next7Days, weeksByStart])

  const setDayApproval = useCallback(
    async (dateKey: string, status: 'approved' | 'denied') => {
      setApprovalSaving(dateKey)
      try {
        const weekStart = getWeekStartDateKeySunday(dateKey)
        await setDailyTaskDayApproval(weekStart, dateKey, status)
        const week = weeksByStart[weekStart] || (await getDailyTaskWeek(weekStart))
        if (week) {
          const entry = parseWeekDayEntry(week.days?.[dateKey])
          if (entry) {
            const nextWeek: DailyTaskWeek = {
              ...week,
              days: {
                ...week.days,
                [dateKey]: {
                  ...entry,
                  approvalStatus: status,
                  approvalAtMs: Date.now(),
                  approvalBy: 'admin',
                },
              },
            }
            setWeeksByStart((prev) => ({ ...prev, [weekStart]: nextWeek }))
          }
        }
      } catch (err) {
        console.error('Failed to update day approval:', err)
      } finally {
        setApprovalSaving(null)
      }
    },
    [weeksByStart]
  )

  const approveAllPendingNext7 = useCallback(async () => {
    if (pendingNext7Count === 0) return
    setBulkApproving(true)
    try {
      const dateKeys = next7Days.map((d) => d.dateKey)
      await approvePendingDailyTaskDays(dateKeys)
      setRegenPendingNotice(null)
    } catch (err) {
      console.error('Failed to bulk approve:', err)
    } finally {
      setBulkApproving(false)
    }
  }, [next7Days, pendingNext7Count])

  // All warnings for displayed weeks
  const allWarnings = useMemo(() => {
    const weekStarts = Array.from(new Set(next7Days.map((d) => d.weekStart)))
    return Array.from(new Set(weekStarts.flatMap((ws) => computeQuotaWarnings(weeksByStart[ws] || null))))
  }, [next7Days, weeksByStart, computeQuotaWarnings])

  const RECENT_RUNS_PREVIEW = 6
  const CATALOG_TASKS_PREVIEW = 5

  const displayedRuns = useMemo(
    () => (showAllRecentRuns ? recentRuns : recentRuns.slice(0, RECENT_RUNS_PREVIEW)),
    [recentRuns, showAllRecentRuns]
  )

  const filteredCatalogTasks = useMemo(() => {
    const sorted = activeTasks
      .slice()
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    return filterCatalogBySearch(sorted)
  }, [activeTasks, filterCatalogBySearch])

  const filteredArchivedCatalogTasks = useMemo(() => {
    const sorted = archivedTasks
      .slice()
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    return filterCatalogBySearch(sorted)
  }, [archivedTasks, filterCatalogBySearch])

  const displayedCatalogTasks = useMemo(
    () =>
      showAllCatalogTasks
        ? filteredCatalogTasks
        : filteredCatalogTasks.slice(0, CATALOG_TASKS_PREVIEW),
    [filteredCatalogTasks, showAllCatalogTasks]
  )

  useEffect(() => {
    if (editingId) setCatalogExpanded(true)
  }, [editingId])

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

      {runHistoryEdit && (
        <div
          className="daily-quota-popup-overlay"
          onClick={() => {
            if (!runHistorySaving) setRunHistoryEdit(null)
          }}
        >
          <div className="daily-quota-popup" onClick={(e) => e.stopPropagation()}>
            <h3 className="daily-quota-popup-title">Edit run — {runHistoryEdit.dateKey}</h3>
            <div className="daily-quota-popup-content">
              <p className="daily-quota-popup-note">
                This only updates the saved run record. It does not rename the task in the catalog or change the
                scheduled <code>taskId</code>. Leave the title empty or match the catalog name to clear a custom title.
                For <strong>— No task —</strong> days, completer fields can be left blank.
              </p>
              {runHistoryError ? <div className="daily-error">{runHistoryError}</div> : null}
              <div className="daily-form-field">
                <label className="admin-label">Title in history</label>
                <input
                  type="text"
                  className="admin-input"
                  value={runHistoryTitle}
                  onChange={(e) => setRunHistoryTitle(e.target.value)}
                  disabled={runHistorySaving}
                />
              </div>
              <div className="daily-form-field">
                <label className="admin-label">Completed by (1st)</label>
                <input
                  type="text"
                  className="admin-input"
                  value={runHistoryEmp1}
                  onChange={(e) => setRunHistoryEmp1(e.target.value)}
                  disabled={runHistorySaving}
                />
              </div>
              <div className="daily-form-field">
                <label className="admin-label">Completed by (2nd, optional)</label>
                <input
                  type="text"
                  className="admin-input"
                  value={runHistoryEmp2}
                  onChange={(e) => setRunHistoryEmp2(e.target.value)}
                  disabled={runHistorySaving}
                />
              </div>
              {runHistoryEdit.taskId === '__none__' ? (
                <div className="daily-form-field">
                  <label className="admin-label">Count work toward task (scheduling)</label>
                  <p className="daily-quota-popup-note" style={{ marginTop: 0 }}>
                    Optional. Credits this day toward recency and monthly/weekly-from-runs for a catalog task.
                  </p>
                  <select
                    className="admin-input"
                    value={runHistoryCreditTaskId}
                    onChange={(e) => setRunHistoryCreditTaskId(e.target.value)}
                    disabled={runHistorySaving}
                  >
                    <option value="">(none)</option>
                    {(dailyTaskCatalog.tasks || [])
                      .filter(isDailyTaskSchedulable)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name || t.id}
                        </option>
                      ))}
                  </select>
                </div>
              ) : null}
            </div>
            <div className="daily-quota-popup-actions">
              <button
                type="button"
                className="admin-btn admin-btn-secondary"
                disabled={runHistorySaving}
                onClick={() => setRunHistoryEdit(null)}
              >
                Cancel
              </button>
              <button type="button" className="admin-btn admin-btn-primary" disabled={runHistorySaving} onClick={() => void saveRunHistoryEdit()}>
                {runHistorySaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Next 7 Days */}
      <div className="admin-card">
        <div className="admin-card-header">
          <h3 className="admin-card-title">
            <span>📅</span> Next 7 Days
          </h3>
          <div className="daily-schedule-header-actions">
            <button
              type="button"
              className="admin-btn admin-btn-secondary"
              disabled={bulkApproving || pendingNext7Count === 0}
              onClick={() => void approveAllPendingNext7()}
            >
              {bulkApproving ? 'Approving…' : `Approve all pending (${pendingNext7Count})`}
            </button>
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
        </div>

        {regenPendingNotice != null && regenPendingNotice > 0 ? (
          <p className="daily-approval-regen-notice" role="status">
            {regenPendingNotice} day(s) pending approval — players won&apos;t see them until approved.
          </p>
        ) : null}

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
                ? schedulableTasks.find((t) => t.id === currentId)?.name || currentId
                : '(unassigned)'
            const pick = overridePickByDateKey[dateKey] ?? currentId
            const label = parseDateKey(dateKey).toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })
            const isToday = dateKey === todayDateKey
            const parsedEntry = parseWeekDayEntry(entry)
            const approvalStatus = getDayApprovalStatus(parsedEntry)

            return (
              <div key={dateKey} className={`daily-schedule-item ${isToday ? 'daily-schedule-today' : ''}`}>
                <div className="daily-schedule-header">
                  <span className="daily-schedule-date">
                    {label}
                    {isToday && <span className="daily-today-badge">Today</span>}
                  </span>
                  <span className="daily-schedule-badges">
                    <span
                      className={`admin-badge daily-approval-badge daily-approval-badge--${approvalStatus}`}
                    >
                      {approvalStatusLabel(approvalStatus)}
                    </span>
                    <span
                      className={`admin-badge ${
                        entry?.source === 'override' ? 'admin-badge-accent' : 'admin-badge-info'
                      }`}
                    >
                      {entry?.source === 'override' ? 'Override' : 'Auto'}
                    </span>
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
                    {schedulableTasks
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
                          : schedulableTasks.find((t) => t.id === nextId)?.name || nextId
                      if (confirm(`Override ${label} to "${displayName}"?`)) {
                        setOverride(dateKey, nextId)
                      }
                    }}
                  >
                    {overrideSaving === dateKey ? '...' : 'Set'}
                  </button>
                  {parsedEntry && approvalStatus === 'pending' ? (
                    <>
                      <button
                        type="button"
                        className="admin-btn admin-btn-primary"
                        disabled={approvalSaving === dateKey}
                        onClick={() => void setDayApproval(dateKey, 'approved')}
                      >
                        {approvalSaving === dateKey ? '...' : 'Approve'}
                      </button>
                      <button
                        type="button"
                        className="admin-btn admin-btn-secondary"
                        disabled={approvalSaving === dateKey}
                        onClick={() => {
                          if (confirm(`Deny the daily task for ${label}? Players will not see a task that day.`)) {
                            void setDayApproval(dateKey, 'denied')
                          }
                        }}
                      >
                        Deny
                      </button>
                    </>
                  ) : null}
                  {parsedEntry && approvalStatus === 'denied' ? (
                    <button
                      type="button"
                      className="admin-btn admin-btn-secondary"
                      disabled={approvalSaving === dateKey}
                      onClick={() => void setDayApproval(dateKey, 'approved')}
                    >
                      {approvalSaving === dateKey ? '...' : 'Approve'}
                    </button>
                  ) : null}
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
      <div id="recent-daily-runs" className="admin-card">
        <h3 className="admin-card-title">
          <span>📜</span> Recent Runs (Last 30 Days)
        </h3>
        <p className="admin-help" style={{ marginTop: 0 }}>
          Rows with status <strong>Completed by …</strong> include <strong>Edit history</strong> (does not rename the
          catalog task).
        </p>

        {runsLoading ? (
          <div className="admin-empty">Loading...</div>
        ) : recentRuns.length === 0 ? (
          <div className="admin-empty">
            <span className="admin-empty-icon">📜</span>
            <h3>No runs found</h3>
            <p>Daily task runs will appear here</p>
          </div>
        ) : (
          <>
            <div className="daily-runs-list">
              {displayedRuns.map((run) => {
                const taskName = getDailyTaskRunHistoryTitle(run, dailyTaskCatalog.tasks)
                const completedBy = formatDailyTaskRunCompletedBy(run)
                const status = run.completedAtMs
                  ? `Completed by ${completedBy || 'unknown'}`
                  : run.revealedAtMs
                  ? 'Revealed'
                  : 'Selected'
                const canEditHistory =
                  run.taskId === '__none__' ||
                  (typeof run.completedAtMs === 'number' && Number.isFinite(run.completedAtMs))

                return (
                  <div key={run.dateKey} className="daily-run-item">
                    <div className="daily-run-header">
                      <span className="daily-run-date">{run.dateKey}</span>
                      <span className="admin-badge admin-badge-success">{status}</span>
                    </div>
                    <div className="daily-run-task">
                      <strong>Task:</strong> {taskName}
                    </div>
                    {canEditHistory ? (
                      <div className="daily-run-actions">
                        <button type="button" className="admin-btn admin-btn-primary" onClick={() => openRunHistoryEdit(run)}>
                          Edit history
                        </button>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
            {recentRuns.length > RECENT_RUNS_PREVIEW && (
              <button
                type="button"
                className="admin-btn daily-toggle-btn"
                onClick={() => setShowAllRecentRuns((v) => !v)}
              >
                {showAllRecentRuns ? 'Show less' : `View all (${recentRuns.length})`}
              </button>
            )}
          </>
        )}
      </div>

      {/* Daily task catalog (add / edit / list) */}
      <div className="admin-card daily-catalog-card">
        <div className="daily-catalog-header">
          <div className="daily-catalog-header-main">
            <h3 className="admin-card-title">
              <span>📋</span> Daily task catalog
              {activeTasks.length > 0 && (
                <span className="admin-badge admin-badge-info daily-catalog-count">{activeTasks.length}</span>
              )}
            </h3>
            <p className="admin-help daily-catalog-help">
              Add and edit tasks, materials, and weekly quotas. Archive retired tasks so they are not auto-scheduled.
            </p>
          </div>
          <button
            type="button"
            className="admin-btn admin-btn-secondary daily-catalog-expand-btn"
            aria-expanded={catalogExpanded}
            onClick={() => setCatalogExpanded((v) => !v)}
          >
            {catalogExpanded ? 'Collapse' : 'Expand'}
          </button>
        </div>

        {catalogExpanded && (
          <div className="daily-catalog-body">
            <div className="daily-form-card daily-form-card--nested">
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

            <div className="daily-catalog-search">
              <label className="admin-label" htmlFor="daily-catalog-search-input">
                Search tasks
              </label>
              <input
                id="daily-catalog-search-input"
                type="search"
                className="admin-input"
                placeholder="Search by name or ID…"
                value={catalogSearch}
                onChange={(e) => {
                  setCatalogSearch(e.target.value)
                  setShowAllCatalogTasks(false)
                }}
              />
            </div>

            {activeTasks.length === 0 && archivedTasks.length === 0 ? (
              <div className="admin-empty">
                <span className="admin-empty-icon">📋</span>
                <h3>No daily tasks yet</h3>
                <p>Add your first daily task using the form above</p>
              </div>
            ) : activeTasks.length === 0 && !catalogSearchNorm ? (
              <div className="admin-empty admin-empty--compact">
                <p>No active tasks. Expand archived below or restore a task.</p>
              </div>
            ) : filteredCatalogTasks.length === 0 && catalogSearchNorm ? (
              <div className="admin-empty admin-empty--compact">
                <p>No active tasks match &ldquo;{catalogSearch.trim()}&rdquo;</p>
              </div>
            ) : filteredCatalogTasks.length > 0 ? (
              <>
                <div className="daily-task-list">
                  {displayedCatalogTasks.map((task) => {
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
                            type="button"
                            className="admin-btn admin-btn-secondary"
                            onClick={() => startEdit(task)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="admin-btn daily-btn-archive"
                            onClick={() => void archiveTask(task.id)}
                          >
                            Archive
                          </button>
                          <button
                            type="button"
                            className="admin-btn daily-btn-danger"
                            onClick={() => void deleteTask(task.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
                {filteredCatalogTasks.length > CATALOG_TASKS_PREVIEW && (
                  <button
                    type="button"
                    className="admin-btn daily-toggle-btn"
                    onClick={() => setShowAllCatalogTasks((v) => !v)}
                  >
                    {showAllCatalogTasks
                      ? 'Show less'
                      : `View all (${filteredCatalogTasks.length})`}
                  </button>
                )}
              </>
            ) : null}

            {archivedTasks.length > 0 && (
              <div className="daily-archived-catalog">
                <button
                  type="button"
                  className="daily-archived-catalog-header"
                  aria-expanded={showArchivedCatalogSection}
                  onClick={() => setShowArchivedCatalogSection((v) => !v)}
                >
                  <h4 className="daily-archived-catalog-title">
                    <span>📦</span> Archived ({archivedTasks.length})
                  </h4>
                  <span className="daily-archived-catalog-toggle">
                    {showArchivedCatalogSection ? 'Collapse' : 'Expand'}
                  </span>
                </button>
                {showArchivedCatalogSection && (
                  <div className="daily-task-list">
                    {filteredArchivedCatalogTasks.length === 0 ? (
                      <div className="admin-empty admin-empty--compact">
                        <p>No archived tasks match this search.</p>
                      </div>
                    ) : (
                      filteredArchivedCatalogTasks.map((task) => {
                        const freqLabel =
                          task.frequency?.type === 'weekly'
                            ? `Weekly: ${task.frequency.quotaPerWeek}/week`
                            : task.frequency?.type === 'monthly'
                            ? 'Rare: 1/month'
                            : 'Normal'
                        return (
                          <div key={task.id} className="daily-task-item daily-task-item--archived">
                            <div className="daily-task-header">
                              <span className="daily-task-name">{task.name}</span>
                              <span className="admin-badge admin-badge-info">{freqLabel}</span>
                              <span className="daily-archived-badge">Archived</span>
                            </div>
                            <div className="daily-task-id">ID: {task.id}</div>
                            <div className="daily-task-actions">
                              <button
                                type="button"
                                className="admin-btn admin-btn-secondary"
                                onClick={() => startEdit(task)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="admin-btn daily-btn-restore"
                                onClick={() => void restoreTask(task.id)}
                              >
                                Restore
                              </button>
                              <button
                                type="button"
                                className="admin-btn daily-btn-danger"
                                onClick={() => void deleteTask(task.id)}
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="admin-card daily-advanced-settings">
        <button
          type="button"
          className="daily-advanced-settings-header"
          aria-expanded={advancedSettingsExpanded}
          onClick={() => setAdvancedSettingsExpanded((v) => !v)}
        >
          <h3 className="admin-card-title daily-advanced-settings-title">
            <span>⚙️</span> Advanced settings
          </h3>
          <span className="daily-advanced-settings-toggle">
            {advancedSettingsExpanded ? 'Collapse' : 'Expand'}
          </span>
        </button>

        {advancedSettingsExpanded ? (
          <div className="daily-advanced-settings-body">
            <p className="daily-advanced-settings-help">
              Used for AI weekly-quota day picks when you click Regenerate. Monthly and normal slots
              still use the built-in algorithm.
            </p>
            <div className="daily-form-field">
              <label className="admin-label" htmlFor="daily-ai-system-prompt">
                AI schedule system prompt
              </label>
              <textarea
                id="daily-ai-system-prompt"
                className="admin-input daily-ai-prompt-textarea"
                rows={20}
                value={promptDraft}
                onChange={(e) => {
                  setPromptDraft(e.target.value)
                  setPromptDirty(true)
                  setPromptSaveError(null)
                }}
                disabled={promptSaving}
                spellCheck={false}
              />
            </div>
            {promptSaveError ? <div className="daily-error">{promptSaveError}</div> : null}
            {hasUnsavedPromptChanges ? (
              <p className="daily-advanced-settings-unsaved" role="status">
                Unsaved changes — Regenerate uses this draft; Save prompt updates the team default.
              </p>
            ) : null}
            <div className="daily-advanced-settings-actions">
              <button
                type="button"
                className="admin-btn admin-btn-primary"
                disabled={promptSaving || !hasUnsavedPromptChanges}
                onClick={() => void savePromptDraft()}
              >
                {promptSaving ? 'Saving…' : 'Save prompt'}
              </button>
              <button
                type="button"
                className="admin-btn admin-btn-secondary"
                disabled={promptSaving}
                onClick={() => void resetPromptToDefault()}
              >
                Reset to default
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default DailyTasksPage
