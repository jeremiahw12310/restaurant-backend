import { useState, useEffect, useCallback, useMemo } from 'react'
import './TasksPage.css'
import {
  subscribeToTaskCatalog,
  saveTaskCatalog,
  subscribeToTaskOverrides,
  saveTaskOverrides,
  subscribeToTaskStages,
  saveTaskStages,
  subscribeToTaskOrderV3,
  saveTaskOrderV3,
  type TaskCatalog,
  type TaskDef,
  type TaskOverride,
  type TaskOverrides,
  type TaskStageMap,
  type WindowKey,
} from '../../services/firestore'
import { getEffectiveTasksByWindowForDateKey, type TaskLike } from '../../utils/taskScoring'
import { TASKS, ICE_COMBINED_CREATED_AT_MS } from '../../constants/tasks'
import type { Task } from '../../types/task'
import { storage } from '../../firebase'
import { ref as storageRef, uploadBytesResumable } from 'firebase/storage'

// Extended task type for display purposes
type DisplayTask = Task & { source: 'builtin' | 'admin' }

const WINDOW_LABELS: Record<WindowKey, string> = {
  '11': '11AM',
  '17': '5PM',
  '21': '9PM',
}

function formatDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const combineDateTime = (date: Date, time: string) => {
  const [hours, minutes] = time.split(':').map(Number)
  const next = new Date(date)
  next.setHours(hours, minutes, 0, 0)
  return next
}

/** Same window boundaries as the main app (App.tsx). */
const TASK_ORDER_WINDOW_MS = (() => {
  const WINDOWS = [
    { key: '11' as const, start: '11:00' },
    { key: '17' as const, start: '17:00' },
    { key: '21' as const, start: '21:00' },
  ]
  const windowStartMsForDateKey = (dateKey: string, windowKey: WindowKey): number => {
    const baseDate = new Date(`${dateKey}T00:00:00`)
    const w = WINDOWS.find((x) => x.key === windowKey)
    const start = w?.start || '00:00'
    return combineDateTime(baseDate, start).getTime()
  }
  const windowCloseMsForDateKey = (dateKey: string, windowKey: WindowKey): number => {
    const baseDate = new Date(`${dateKey}T00:00:00`)
    const nextWindowKey: WindowKey | null = windowKey === '11' ? '17' : windowKey === '17' ? '21' : null
    if (nextWindowKey) {
      const nextW = WINDOWS.find((x) => x.key === nextWindowKey)
      const nextStart = nextW?.start || '24:00'
      return combineDateTime(baseDate, nextStart).getTime()
    }
    const nextDay = new Date(baseDate)
    nextDay.setDate(nextDay.getDate() + 1)
    nextDay.setHours(0, 0, 0, 0)
    return nextDay.getTime()
  }
  return { windowStartMsForDateKey, windowCloseMsForDateKey }
})()

export function TasksPage() {
  // Data state
  const [taskCatalog, setTaskCatalog] = useState<TaskCatalog>({ tasks: [] })
  const [taskOverrides, setTaskOverrides] = useState<TaskOverrides | null>(null)
  
  // Form state for new task
  const [newTaskName, setNewTaskName] = useState('')
  const [newTaskIcon, setNewTaskIcon] = useState('🧩')
  const [newTaskWindows, setNewTaskWindows] = useState<Record<WindowKey, boolean>>({
    '11': false,
    '17': true,
    '21': false,
  })
  const [newTaskWeight, setNewTaskWeight] = useState('1')
  const [newTaskRequirements, setNewTaskRequirements] = useState('')
  const [newTaskImageFile, setNewTaskImageFile] = useState<File | null>(null)
  const [newTaskImageUploadPct, setNewTaskImageUploadPct] = useState(0)
  const [taskError, setTaskError] = useState<string | null>(null)
  
  // Search and filter
  const [searchQuery, setSearchQuery] = useState('')
  const [filterMode, setFilterMode] = useState<'all' | 'overridden'>('all')
  
  // Task stages (v3 stage grouping)
  const [taskStages, setTaskStages] = useState<TaskStageMap>({})

  // v3-only task order (config/taskOrder.orderV3)
  const [taskOrderV3, setTaskOrderV3] = useState<Record<WindowKey, string[]>>({
    '11': [],
    '17': [],
    '21': [],
  })
  const [orderV3Window, setOrderV3Window] = useState<WindowKey>('11')
  const [orderV3Error, setOrderV3Error] = useState<string | null>(null)
  const [orderV3Busy, setOrderV3Busy] = useState(false)

  // Edit modals
  const [editingTask, setEditingTask] = useState<DisplayTask | null>(null)
  const [editMode, setEditMode] = useState<'name' | 'windows' | 'weight' | 'requirements' | 'image' | 'stages' | null>(null)
  const [editStages, setEditStages] = useState<Partial<Record<WindowKey, 1 | 2>>>({})
  const [editValue, setEditValue] = useState('')
  const [editWindows, setEditWindows] = useState<Record<WindowKey, boolean>>({
    '11': false,
    '17': false,
    '21': false,
  })
  const [editEffectiveDate, setEditEffectiveDate] = useState('')
  const [editError, setEditError] = useState<string | null>(null)
  const [editImageFile, setEditImageFile] = useState<File | null>(null)
  const [editImageRemove, setEditImageRemove] = useState(false)
  const [editImageUploadPct, setEditImageUploadPct] = useState(0)
  
  const [saving, setSaving] = useState(false)

  const [togglingDice, setTogglingDice] = useState(false)
  const toggleDiceEnabled = useCallback(async () => {
    if (!taskOverrides || togglingDice) return
    setTogglingDice(true)
    try {
      const enabled = taskOverrides.diceEnabled === true
      const next: TaskOverrides = { ...taskOverrides, diceEnabled: !enabled }
      await saveTaskOverrides(next)
    } catch (e) {
      console.error('Failed to toggle dice button:', e)
      alert('Failed to update setting. Check connection and try again.')
    } finally {
      setTogglingDice(false)
    }
  }, [taskOverrides, togglingDice])

  const [togglingDiceBetaOnly, setTogglingDiceBetaOnly] = useState(false)
  const toggleDiceBetaOnly = useCallback(async () => {
    if (!taskOverrides || togglingDiceBetaOnly) return
    setTogglingDiceBetaOnly(true)
    try {
      const enabled = taskOverrides.diceBetaOnly === true
      const next: TaskOverrides = { ...taskOverrides, diceBetaOnly: !enabled }
      await saveTaskOverrides(next)
    } catch (e) {
      console.error('Failed to toggle dice beta-only:', e)
      alert('Failed to update setting. Check connection and try again.')
    } finally {
      setTogglingDiceBetaOnly(false)
    }
  }, [taskOverrides, togglingDiceBetaOnly])

  const uploadTaskImage = useCallback(
    async (taskId: string, file: File, setPct: (n: number) => void): Promise<string> => {
      if (!storage) throw new Error('Storage not available')
      const path = `tasks/${taskId}/image_${Date.now()}.jpg`
      const ref = storageRef(storage, path)
      const uploadTask = uploadBytesResumable(ref, file)
      return new Promise((resolve, reject) => {
        uploadTask.on(
          'state_changed',
          (snapshot) => {
            const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)
            setPct(pct)
          },
          reject,
          () => resolve(path)
        )
      })
    },
    []
  )

  // Subscribe to data
  useEffect(() => {
    const unsubCatalog = subscribeToTaskCatalog((catalog) => {
      setTaskCatalog(catalog)
    })

    const unsubOverrides = subscribeToTaskOverrides((overrides) => {
      setTaskOverrides(overrides)
    })

    const unsubStages = subscribeToTaskStages((stages) => {
      setTaskStages(stages)
    })

    const unsubOrderV3 = subscribeToTaskOrderV3((order) => {
      setTaskOrderV3({
        '11': order['11'] || [],
        '17': order['17'] || [],
        '21': order['21'] || [],
      })
    })

    return () => {
      unsubCatalog?.()
      unsubOverrides?.()
      unsubStages?.()
      unsubOrderV3?.()
    }
  }, [])

  // Merge built-in tasks with admin-created tasks
  const allTasks = useMemo((): DisplayTask[] => {
    const byId: Record<string, DisplayTask> = {}
    
    // Add built-in tasks from shared constants
    TASKS.forEach((t) => {
      byId[t.id] = { ...t, source: 'builtin' }
    })
    
    // Add admin-created tasks (override if same id)
    ;(taskCatalog.tasks || []).forEach((t) => {
      byId[t.id] = { ...t, source: 'admin' }
    })
    
    // Apply overrides (name, imagePath, requiresSplit)
    if (taskOverrides?.overrides) {
      Object.entries(taskOverrides.overrides).forEach(([id, ov]) => {
        if (!byId[id] || !ov) return
        if (ov.name) byId[id] = { ...byId[id], name: ov.name }
        if (ov.imagePath !== undefined) {
          byId[id] = { ...byId[id], imagePath: (ov.imagePath && ov.imagePath.trim()) || undefined }
        }
        if (typeof ov.requiresSplit === 'boolean') {
          byId[id] = { ...byId[id], requiresSplit: ov.requiresSplit }
        }
      })
    }
    
    return Object.values(byId)
  }, [taskCatalog.tasks, taskOverrides])

  // Filter tasks
  const filteredTasks = useMemo((): DisplayTask[] => {
    return allTasks
      .filter((t) => {
        // Search filter
        const q = searchQuery.toLowerCase()
        if (q && !t.name.toLowerCase().includes(q) && !t.id.toLowerCase().includes(q)) {
          return false
        }
        // Override filter
        if (filterMode === 'overridden' && !taskOverrides?.overrides?.[t.id]) {
          return false
        }
        return true
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [allTasks, searchQuery, filterMode, taskOverrides])

  const effectiveTasksByWindow = useMemo(() => {
    const dateKey = formatDateKey(new Date())
    return getEffectiveTasksByWindowForDateKey({
      dateKey,
      allTasks: allTasks as TaskLike[],
      taskOverrides,
      windowMs: TASK_ORDER_WINDOW_MS,
    })
  }, [allTasks, taskOverrides])

  const orderV3MergedIds = useMemo(() => {
    const effective = effectiveTasksByWindow[orderV3Window] || []
    const effectiveIds = effective.map((t) => t.id)
    const saved = taskOrderV3[orderV3Window] || []
    const merged: string[] = []
    saved.forEach((id) => {
      if (effectiveIds.includes(id)) merged.push(id)
    })
    effectiveIds.forEach((id) => {
      if (!merged.includes(id)) merged.push(id)
    })
    return merged
  }, [effectiveTasksByWindow, orderV3Window, taskOrderV3])

  const persistOrderV3 = useCallback(async (next: Record<WindowKey, string[]>) => {
    setOrderV3Busy(true)
    setOrderV3Error(null)
    try {
      await saveTaskOrderV3(next)
      setTaskOrderV3(next)
    } catch (e) {
      console.error(e)
      setOrderV3Error('Failed to save order. Try again.')
    } finally {
      setOrderV3Busy(false)
    }
  }, [])

  const moveOrderV3 = useCallback(
    async (index: number, dir: 'up' | 'down') => {
      const nextIdx = dir === 'up' ? index - 1 : index + 1
      const ids = [...orderV3MergedIds]
      if (nextIdx < 0 || nextIdx >= ids.length) return
      const [moved] = ids.splice(index, 1)
      ids.splice(nextIdx, 0, moved)
      const next: Record<WindowKey, string[]> = {
        ...taskOrderV3,
        [orderV3Window]: ids,
      }
      await persistOrderV3(next)
    },
    [orderV3MergedIds, orderV3Window, taskOrderV3, persistOrderV3]
  )

  const clearOrderV3Window = useCallback(async () => {
    const next: Record<WindowKey, string[]> = {
      ...taskOrderV3,
      [orderV3Window]: [],
    }
    await persistOrderV3(next)
  }, [orderV3Window, taskOrderV3, persistOrderV3])

  // Add new task
  const handleAddTask = useCallback(async () => {
    setTaskError(null)
    
    const name = newTaskName.trim()
    if (!name) {
      setTaskError('Task name is required')
      return
    }
    
    const selectedWindows = (['11', '17', '21'] as WindowKey[]).filter((w) => newTaskWindows[w])
    if (selectedWindows.length === 0) {
      setTaskError('Select at least one window')
      return
    }
    
    const weight = Number(newTaskWeight) || 1
    const requirements = newTaskRequirements
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
    
    // Generate ID from name
    const id = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
    
    // Check for duplicate
    if (allTasks.some((t) => t.id === id)) {
      setTaskError('A task with this name already exists')
      return
    }
    
    setSaving(true)
    setNewTaskImageUploadPct(0)
    try {
      let imagePath: string | undefined
      if (newTaskImageFile) {
        imagePath = await uploadTaskImage(id, newTaskImageFile, setNewTaskImageUploadPct)
      }
      const newTask: TaskDef = {
        id,
        name,
        icon: newTaskIcon.trim() || '🧩',
        windows: selectedWindows,
        weight,
        requirements: requirements.length > 0 ? requirements : [],
        createdAtMs: Date.now(),
        ...(imagePath && { imagePath }),
      }
      
      const updated: TaskCatalog = {
        ...taskCatalog,
        tasks: [...(taskCatalog.tasks || []), newTask],
      }
      
      await saveTaskCatalog(updated)
      
      // Reset form
      setNewTaskName('')
      setNewTaskIcon('🧩')
      setNewTaskWindows({ '11': false, '17': true, '21': false })
      setNewTaskWeight('1')
      setNewTaskRequirements('')
      setNewTaskImageFile(null)
    } catch (err) {
      console.error('Failed to add task:', err)
      setTaskError('Failed to save task. Check connection and try again.')
    } finally {
      setSaving(false)
    }
  }, [newTaskName, newTaskIcon, newTaskWindows, newTaskWeight, newTaskRequirements, newTaskImageFile, taskCatalog, allTasks, uploadTaskImage])

  // Start editing
  const startEdit = (task: DisplayTask, mode: 'name' | 'windows' | 'weight' | 'requirements' | 'image' | 'stages') => {
    setEditingTask(task)
    setEditMode(mode)
    setEditError(null)
    
    const override = taskOverrides?.overrides?.[task.id]
    
    switch (mode) {
      case 'name':
        setEditValue(override?.name || task.name || '')
        break
      case 'weight':
        setEditValue(String(override?.weight ?? task.weight ?? 1))
        setEditEffectiveDate(
          override?.weightEffectiveAtMs
            ? formatDateKey(new Date(override.weightEffectiveAtMs))
            : ''
        )
        break
      case 'windows':
        const currentWindows = override?.windows || task.windows || []
        setEditWindows({
          '11': currentWindows.includes('11'),
          '17': currentWindows.includes('17'),
          '21': currentWindows.includes('21'),
        })
        setEditEffectiveDate(
          override?.windowsEffectiveAtMs
            ? formatDateKey(new Date(override.windowsEffectiveAtMs))
            : ''
        )
        break
      case 'requirements':
        const reqs = override?.requirements || task.requirements || []
        setEditValue(reqs.join('\n'))
        break
      case 'stages':
        setEditStages(taskStages[task.id] || {})
        break
      case 'image':
        setEditImageFile(null)
        setEditImageRemove(false)
        setEditImageUploadPct(0)
        break
    }
  }

  // Save edit
  const saveEdit = useCallback(async () => {
    if (!editingTask || !editMode || !taskOverrides) return
    setEditError(null)
    
    const taskId = editingTask.id
    const currentOverrides = taskOverrides?.overrides || {}
    const existingOverride = currentOverrides[taskId] || {}
    
    let newOverride = { ...existingOverride }
    const todayKey = formatDateKey(new Date())
    
    switch (editMode) {
      case 'name': {
        const name = editValue.trim()
        if (!name) {
          setEditError('Name cannot be empty')
          return
        }
        newOverride.name = name
        newOverride.nameUpdatedAtMs = Date.now()
        newOverride.nameUpdatedBy = 'admin'
        break
      }
      case 'weight': {
        const weight = Number(editValue)
        if (isNaN(weight) || weight < 0) {
          setEditError('Weight must be a number >= 0')
          return
        }
        newOverride.weight = weight
        newOverride.weightUpdatedBy = 'admin'
        if (editEffectiveDate && editEffectiveDate >= todayKey) {
          newOverride.weightEffectiveAtMs = new Date(editEffectiveDate + 'T00:00:00').getTime()
        }
        break
      }
      case 'windows': {
        const windows = (['11', '17', '21'] as WindowKey[]).filter((w) => editWindows[w])
        newOverride.windows = windows
        newOverride.windowsUpdatedBy = 'admin'
        if (editEffectiveDate && editEffectiveDate >= todayKey) {
          newOverride.windowsEffectiveAtMs = new Date(editEffectiveDate + 'T00:00:00').getTime()
        }
        break
      }
      case 'requirements': {
        const requirements = editValue
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0)
        if (requirements.length === 0) {
          setEditError('Requirements cannot be empty. Use Reset to restore default.')
          return
        }
        // Check for min checklist if task requires it
        if (editingTask.requiresChecklist && requirements.length < editingTask.requiresChecklist) {
          setEditError(`This task requires at least ${editingTask.requiresChecklist} checklist items`)
          return
        }
        newOverride.requirements = requirements
        newOverride.updatedAtMs = Date.now()
        newOverride.updatedBy = 'admin'
        break
      }
      case 'image': {
        if (editImageRemove) {
          newOverride.imagePath = ''
        } else if (editImageFile) {
          setEditImageUploadPct(0)
          const path = await uploadTaskImage(taskId, editImageFile, setEditImageUploadPct)
          newOverride.imagePath = path
        } else {
          setEditingTask(null)
          setEditMode(null)
          return
        }
        break
      }
      case 'stages': {
        setSaving(true)
        try {
          const entry: Partial<Record<WindowKey, 1 | 2>> = {}
          if (editStages['11']) entry['11'] = editStages['11']
          if (editStages['21']) entry['21'] = editStages['21']
          const next = { ...taskStages }
          if (Object.keys(entry).length > 0) {
            next[taskId] = entry
          } else {
            delete next[taskId]
          }
          await saveTaskStages(next)
          setEditingTask(null)
          setEditMode(null)
        } catch (err) {
          console.error('Failed to save stages:', err)
          setEditError('Failed to save. Check connection and try again.')
        } finally {
          setSaving(false)
        }
        return
      }
    }
    
    setSaving(true)
    try {
      const updated: TaskOverrides = {
        ...taskOverrides,
        overrides: {
          ...currentOverrides,
          [taskId]: newOverride,
        },
      }
      
      await saveTaskOverrides(updated)
      setEditingTask(null)
      setEditMode(null)
    } catch (err) {
      console.error('Failed to save override:', err)
      setEditError('Failed to save. Check connection and try again.')
    } finally {
      setSaving(false)
    }
  }, [editingTask, editMode, editValue, editWindows, editEffectiveDate, editImageFile, editImageRemove, editStages, taskOverrides, taskStages, uploadTaskImage])

  // Reset override
  const resetOverride = useCallback(async (taskId: string, field: 'name' | 'windows' | 'weight' | 'requirements' | 'image') => {
    if (!taskOverrides?.overrides?.[taskId]) return
    
    const confirmed = confirm(`Reset ${field} for this task to default?`)
    if (!confirmed) return
    
    setSaving(true)
    try {
      const currentOverride = { ...taskOverrides.overrides[taskId] }
      
      switch (field) {
        case 'name':
          delete currentOverride.name
          delete currentOverride.nameUpdatedAtMs
          delete currentOverride.nameUpdatedBy
          break
        case 'weight':
          delete currentOverride.weight
          delete currentOverride.weightUpdatedBy
          delete currentOverride.weightEffectiveAtMs
          break
        case 'windows':
          delete currentOverride.windows
          delete currentOverride.windowsUpdatedBy
          delete currentOverride.windowsEffectiveAtMs
          break
        case 'requirements':
          delete currentOverride.requirements
          delete currentOverride.updatedAtMs
          delete currentOverride.updatedBy
          break
        case 'image':
          delete currentOverride.imagePath
          break
      }
      
      const updated: TaskOverrides = {
        ...taskOverrides,
        overrides: {
          ...taskOverrides.overrides,
          [taskId]: Object.keys(currentOverride).length > 0 ? currentOverride : undefined as any,
        },
      }
      
      // Clean up empty overrides
      if (updated.overrides[taskId] === undefined) {
        delete updated.overrides[taskId]
      }
      
      await saveTaskOverrides(updated)
    } catch (err) {
      console.error('Failed to reset override:', err)
    } finally {
      setSaving(false)
    }
  }, [taskOverrides])

  const clearWeightOverrideOnly = useCallback(
    async (taskId: string) => {
      if (!taskOverrides) return
      if (!taskOverrides.overrides?.[taskId]) return
      const currentOverride = { ...taskOverrides.overrides[taskId] }
      delete currentOverride.weight
      delete currentOverride.weightUpdatedBy
      delete currentOverride.weightEffectiveAtMs
      const updated: TaskOverrides = {
        ...taskOverrides,
        overrides: {
          ...taskOverrides.overrides,
          [taskId]: Object.keys(currentOverride).length > 0 ? currentOverride : (undefined as any),
        },
      }
      if (updated.overrides[taskId] === undefined) {
        delete updated.overrides[taskId]
      }
      await saveTaskOverrides(updated)
    },
    [taskOverrides]
  )

  const toggleMorePointsStar = useCallback(
    async (task: DisplayTask, wantOn: boolean) => {
      if (!taskOverrides) return
      const override = taskOverrides.overrides?.[task.id]
      const hasWeightOverride = typeof override?.weight === 'number'
      const baseW = task.weight ?? 1
      const displayW = override?.weight ?? task.weight ?? 1

      if (wantOn) {
        if (displayW > 1) return
        setSaving(true)
        try {
          const currentOverrides = taskOverrides?.overrides || {}
          const existing = currentOverrides[task.id] || {}
          const next: TaskOverrides = {
            ...(taskOverrides || { overrides: {} }),
            overrides: {
              ...currentOverrides,
              [task.id]: {
                ...existing,
                weight: 2,
                weightUpdatedBy: 'admin',
              },
            },
          }
          await saveTaskOverrides(next)
        } catch (err) {
          console.error('Failed to save weight override:', err)
        } finally {
          setSaving(false)
        }
        return
      }

      if (hasWeightOverride) {
        setSaving(true)
        try {
          await clearWeightOverrideOnly(task.id)
        } catch (err) {
          console.error('Failed to clear weight override:', err)
        } finally {
          setSaving(false)
        }
        return
      }

      if (baseW > 1) {
        window.alert(
          'This task already has extra points from its built-in weight. Use “Edit Weight” to change the value.'
        )
      }
    },
    [taskOverrides, clearWeightOverrideOnly]
  )

  const toggleRequiresSplit = useCallback(
    async (task: DisplayTask, wantOn: boolean) => {
      if (!taskOverrides) return
      setSaving(true)
      try {
        const currentOverrides = taskOverrides?.overrides || {}
        const existing = currentOverrides[task.id] || {}
        let nextOverrideForTask: TaskOverride
        if (wantOn) {
          nextOverrideForTask = {
            ...existing,
            requiresSplit: true,
            requiresSplitUpdatedBy: 'admin',
          }
        } else {
          // Clear the requiresSplit fields while preserving any other overrides on this task.
          const { requiresSplit: _rs, requiresSplitUpdatedBy: _rsBy, ...rest } = existing
          nextOverrideForTask = rest
        }
        const hasAnyField = Object.keys(nextOverrideForTask).length > 0
        const nextMap = { ...currentOverrides }
        if (hasAnyField) {
          nextMap[task.id] = nextOverrideForTask
        } else {
          delete nextMap[task.id]
        }
        const next: TaskOverrides = {
          ...taskOverrides,
          overrides: nextMap,
        }
        await saveTaskOverrides(next)
      } catch (err) {
        console.error('Failed to save requiresSplit override:', err)
      } finally {
        setSaving(false)
      }
    },
    [taskOverrides]
  )

  const [repairingIce, setRepairingIce] = useState(false)
  const repairIceCombineOverrides = useCallback(async () => {
    if (!taskOverrides || repairingIce) return
    if (!confirm('Repair Ice Combine overrides?\n\nThis will re-hide legacy Left/Right Ice tasks using the original Jan 5 effective date, fixing scoring for all past dates.')) return
    setRepairingIce(true)
    try {
      const current = taskOverrides.overrides || {}
      const nextOverrides: Record<string, unknown> = { ...current }
      const idsToRemove = ['left-ice-5pm', 'right-ice-5pm', 'left-ice-close', 'right-ice-close']
      idsToRemove.forEach((taskId) => {
        const prev = (nextOverrides as Record<string, unknown>)[taskId]
        const prevObj = prev && typeof prev === 'object' ? (prev as Record<string, unknown>) : {}
        ;(nextOverrides as Record<string, unknown>)[taskId] = {
          ...prevObj,
          windows: [],
          windowsEffectiveAtMs: ICE_COMBINED_CREATED_AT_MS,
          windowsUpdatedBy: 'admin',
        }
      })
      const next: TaskOverrides = { ...taskOverrides, overrides: nextOverrides as any }
      if (typeof next.towelsSplitEffectiveAtMs !== 'number' || next.towelsSplitEffectiveAtMs <= 0) {
        next.towelsSplitEffectiveAtMs = ICE_COMBINED_CREATED_AT_MS
      }
      await saveTaskOverrides(next)
      alert('Ice Combine overrides restored. Scoring for all past dates is now correct.')
    } catch (e) {
      console.error('Failed to repair Ice Combine overrides:', e)
      alert('Failed to repair. Check connection and try again.')
    } finally {
      setRepairingIce(false)
    }
  }, [taskOverrides, repairingIce])

  const closeModal = () => {
    setEditingTask(null)
    setEditMode(null)
    setEditError(null)
  }

  const iceOverridesMissing = taskOverrides != null && (
    !taskOverrides.overrides?.['left-ice-5pm']?.windows ||
    (taskOverrides.overrides['left-ice-5pm'].windows as string[]).length !== 0
  )

  return (
    <div className="tasks-page">
      <header className="admin-page-header">
        <h1>Task Management</h1>
        <p>Create new tasks and customize existing task settings.</p>
      </header>

      <div className="admin-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <strong>Random / fair split (🎲)</strong>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#666' }}>
              Off by default. When enabled, staff see the red 🎲 next to the greeting on 5PM &amp; 9PM only (fair-split
              setup or exit split view). Hidden on 11 AM. Use <strong>beta only</strong> to preview on the beta site
              before rolling out to main.
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'stretch' }}>
            <button
              className="admin-btn admin-btn-primary"
              disabled={!taskOverrides || togglingDice}
              onClick={() => void toggleDiceEnabled()}
              title="Enable or disable the 🎲 next to the greeting on 5PM & 9PM (not shown on 11 AM)."
            >
              {togglingDice
                ? 'Updating…'
                : taskOverrides?.diceEnabled === true
                  ? 'Disable 🎲'
                  : 'Enable 🎲'}
            </button>
            <button
              className="admin-btn"
              disabled={!taskOverrides || togglingDiceBetaOnly}
              onClick={() => void toggleDiceBetaOnly()}
              title="When on, 🎲 appears only on the beta site (traq-beta), not on main."
            >
              {togglingDiceBetaOnly
                ? 'Updating…'
                : taskOverrides?.diceBetaOnly === true
                  ? 'Disable beta only'
                  : 'Enable beta only'}
            </button>
          </div>
        </div>
      </div>

      {iceOverridesMissing && (
        <div className="admin-card" style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 20 }}>⚠️</span>
            <div style={{ flex: 1, minWidth: 200 }}>
              <strong style={{ color: '#dc2626' }}>Ice Combine overrides are missing</strong>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: '#666' }}>
                Legacy Left/Right Ice tasks are visible and past scoring is incorrect. Press the button to repair.
              </p>
            </div>
            <button
              className="admin-btn admin-btn-primary"
              disabled={repairingIce || !taskOverrides}
              onClick={() => void repairIceCombineOverrides()}
            >
              {repairingIce ? 'Repairing…' : 'Repair Ice Combine Overrides'}
            </button>
          </div>
        </div>
      )}

      {/* Add Task Form */}
      <div className="admin-card tasks-add-card">
        <h3 className="admin-card-title">
          <span>➕</span> Add New Task
        </h3>
        
        {taskError && <div className="tasks-error">{taskError}</div>}
        
        <div className="tasks-add-form">
          <div className="tasks-form-row">
            <div className="tasks-form-field tasks-form-field-grow">
              <label className="admin-label">Task Name</label>
              <input
                type="text"
                className="admin-input"
                placeholder="e.g. Restock To-Go Lids"
                value={newTaskName}
                onChange={(e) => setNewTaskName(e.target.value)}
              />
            </div>
            <div className="tasks-form-field">
              <label className="admin-label">Icon</label>
              <input
                type="text"
                className="admin-input tasks-icon-input"
                placeholder="🧩"
                value={newTaskIcon}
                onChange={(e) => setNewTaskIcon(e.target.value)}
              />
            </div>
          </div>
          
          <div className="tasks-form-row">
            <div className="tasks-form-field">
              <label className="admin-label">Windows</label>
              <div className="tasks-windows-checkboxes">
                {(['11', '17', '21'] as WindowKey[]).map((w) => (
                  <label key={w} className="tasks-checkbox-label">
                    <input
                      type="checkbox"
                      checked={newTaskWindows[w]}
                      onChange={(e) =>
                        setNewTaskWindows({ ...newTaskWindows, [w]: e.target.checked })
                      }
                    />
                    <span>{WINDOW_LABELS[w]}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="tasks-form-field">
              <label className="admin-label">Weight</label>
              <input
                type="text"
                inputMode="decimal"
                className="admin-input tasks-weight-input"
                placeholder="1"
                value={newTaskWeight}
                onChange={(e) => setNewTaskWeight(e.target.value)}
              />
            </div>
          </div>
          
          <div className="tasks-form-field">
            <label className="admin-label">Requirements (one per line)</label>
            <textarea
              className="admin-input tasks-textarea"
              placeholder="Example:&#10;- Wipe down shelf&#10;- Refill lids&#10;- Confirm stock is fronted"
              value={newTaskRequirements}
              onChange={(e) => setNewTaskRequirements(e.target.value)}
              rows={4}
            />
          </div>
          
          <div className="tasks-form-field">
            <label className="admin-label">Image (optional)</label>
            <input
              type="file"
              accept="image/*"
              className="admin-input"
              onChange={(e) => setNewTaskImageFile(e.target.files?.[0] ?? null)}
            />
            {newTaskImageFile && (
              <span className="tasks-image-preview">📷 {newTaskImageFile.name}</span>
            )}
            {typeof newTaskImageUploadPct === 'number' && newTaskImageUploadPct > 0 && (
              <div className="tasks-upload-progress">Upload: {newTaskImageUploadPct}%</div>
            )}
          </div>
          
          <button
            className="admin-btn admin-btn-primary"
            onClick={handleAddTask}
            disabled={saving}
          >
            + Add Task
          </button>
        </div>
      </div>

      {/* 3.0 task order — v3 shell only; v2 still uses legacy order */}
      <div className="admin-card tasks-order-v3-card">
        <h3 className="admin-card-title">
          <span>↕</span> Task order (3.0 / v3 only)
        </h3>
        <p className="tasks-order-v3-hint">
          Controls card order on the <strong>v3</strong> app only. The classic (v2) layout keeps using the legacy order until you set a custom 3.0 order here. List matches tasks effective <strong>today</strong> for each window.
        </p>
        {orderV3Error && <div className="tasks-error">{orderV3Error}</div>}
        <div className="tasks-order-v3-tabs">
          {(['11', '17', '21'] as WindowKey[]).map((w) => (
            <button
              key={w}
              type="button"
              className={`tasks-order-v3-tab ${orderV3Window === w ? 'active' : ''}`}
              onClick={() => setOrderV3Window(w)}
            >
              {WINDOW_LABELS[w]}
            </button>
          ))}
        </div>
        <ul className="tasks-order-v3-list">
          {orderV3MergedIds.map((id, index) => {
            const task = allTasks.find((t) => t.id === id)
            const label = task ? `${task.icon} ${task.name}` : id
            return (
              <li key={id} className="tasks-order-v3-row">
                <span className="tasks-order-v3-label">{label}</span>
                <span className="tasks-order-v3-id">{id}</span>
                <div className="tasks-order-v3-actions">
                  <button
                    type="button"
                    className="tasks-order-v3-move"
                    disabled={orderV3Busy || index === 0}
                    onClick={() => void moveOrderV3(index, 'up')}
                    aria-label="Move up"
                  >
                    Up
                  </button>
                  <button
                    type="button"
                    className="tasks-order-v3-move"
                    disabled={orderV3Busy || index >= orderV3MergedIds.length - 1}
                    onClick={() => void moveOrderV3(index, 'down')}
                    aria-label="Move down"
                  >
                    Down
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
        <div className="tasks-order-v3-footer">
          <button
            type="button"
            className="admin-btn admin-btn-secondary"
            disabled={orderV3Busy || (taskOrderV3[orderV3Window]?.length ?? 0) === 0}
            onClick={() => void clearOrderV3Window()}
          >
            Clear 3.0 order for {WINDOW_LABELS[orderV3Window]} (use legacy)
          </button>
        </div>
      </div>

      {/* Search and Filter */}
      <div className="tasks-toolbar">
        <input
          type="text"
          className="admin-input tasks-search"
          placeholder="Search tasks by name or ID..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <div className="tasks-filter-btns">
          <button
            className={`tasks-filter-btn ${filterMode === 'all' ? 'active' : ''}`}
            onClick={() => setFilterMode('all')}
          >
            All Tasks
          </button>
          <button
            className={`tasks-filter-btn ${filterMode === 'overridden' ? 'active' : ''}`}
            onClick={() => setFilterMode('overridden')}
          >
            Overridden Only
          </button>
        </div>
      </div>

      {/* Task List */}
      <div className="admin-card tasks-list-card">
        {filteredTasks.length === 0 ? (
          <div className="admin-empty">
            <span className="admin-empty-icon">✅</span>
            <h3>{searchQuery ? 'No matches found' : 'No tasks'}</h3>
            <p>{searchQuery ? 'Try a different search term' : 'Add your first task above'}</p>
          </div>
        ) : (
          <div className="tasks-list">
            {filteredTasks.map((task) => {
              const override = taskOverrides?.overrides?.[task.id]
              const hasOverride = !!override
              const hasNameOverride = !!(override?.name)
              const hasWindowsOverride = !!(override?.windows)
              const hasWeightOverride = typeof override?.weight === 'number'
              const hasReqOverride = !!(override?.requirements?.length)
              const hasImageOverride = override && 'imagePath' in override
              
              const displayWindows = override?.windows || task.windows || []
              const displayWeight = override?.weight ?? task.weight ?? 1
              
              return (
                <div key={task.id} className={`task-card ${hasOverride ? 'task-card-overridden' : ''}`}>
                  <div className="task-card-header">
                    <div className="task-card-info">
                      <span className="task-card-icon">{task.icon}</span>
                      <div>
                        <h4 className="task-card-name">{task.name}</h4>
                        <span className="task-card-id">{task.id}</span>
                      </div>
                    </div>
                    <div className="task-card-badges">
                      {hasOverride && (
                        <span className="admin-badge admin-badge-accent">Overridden</span>
                      )}
                      {task.source === 'admin' && (
                        <span className="admin-badge admin-badge-info">Custom</span>
                      )}
                    </div>
                  </div>
                  
                  <div className="task-card-details">
                    <div className="task-detail">
                      <span className="task-detail-label">Windows:</span>
                      <span className="task-detail-value">
                        {displayWindows.length > 0
                          ? displayWindows.map((w) => WINDOW_LABELS[w as WindowKey]).join(', ')
                          : '— (none)'}
                        {hasWindowsOverride && <span className="task-override-badge">edited</span>}
                      </span>
                    </div>
                    <div className="task-detail">
                      <span className="task-detail-label">Weight:</span>
                      <span className="task-detail-value">
                        {displayWeight}
                        {hasWeightOverride && <span className="task-override-badge">edited</span>}
                      </span>
                    </div>
                    <div className="task-detail tasks-more-points-row">
                      <span className="task-detail-label">Points (★):</span>
                      <label className="tasks-more-points-label">
                        <input
                          type="checkbox"
                          checked={displayWeight > 1}
                          disabled={saving || !taskOverrides}
                          onChange={(e) => {
                            void toggleMorePointsStar(task, e.target.checked)
                          }}
                        />
                        <span>Counts for more points</span>
                      </label>
                    </div>
                    {(task.weight ?? 1) > 1 && !hasWeightOverride ? (
                      <p className="tasks-more-points-hint">
                        Extra weight is from task defaults; use Edit Weight to change.
                      </p>
                    ) : null}
                    <div className="task-detail tasks-more-points-row">
                      <span className="task-detail-label">Split:</span>
                      <label className="tasks-more-points-label">
                        <input
                          type="checkbox"
                          checked={!!task.requiresSplit}
                          disabled={saving || !taskOverrides}
                          onChange={(e) => {
                            void toggleRequiresSplit(task, e.target.checked)
                          }}
                        />
                        <span>Always split (require 2 employees)</span>
                      </label>
                    </div>
                    {(displayWindows.includes('11') || displayWindows.includes('21')) && (
                      <div className="task-detail">
                        <span className="task-detail-label">Stages:</span>
                        <span className="task-detail-value">
                          {displayWindows.filter((w) => w === '11' || w === '21').map((w) => {
                            const s = taskStages[task.id]?.[w as WindowKey] ?? 2
                            return (
                              <span key={w} className="task-stage-badge">
                                {WINDOW_LABELS[w as WindowKey]} S{s}
                              </span>
                            )
                          })}
                        </span>
                      </div>
                    )}
                  </div>
                  
                  <div className="task-card-actions">
                    <button
                      className="task-action-btn"
                      onClick={() => startEdit(task, 'name')}
                    >
                      Edit Name
                    </button>
                    {hasNameOverride && (
                      <button
                        className="task-action-btn task-action-reset"
                        onClick={() => resetOverride(task.id, 'name')}
                      >
                        Reset
                      </button>
                    )}
                    <button
                      className="task-action-btn"
                      onClick={() => startEdit(task, 'windows')}
                    >
                      Edit Windows
                    </button>
                    {hasWindowsOverride && (
                      <button
                        className="task-action-btn task-action-reset"
                        onClick={() => resetOverride(task.id, 'windows')}
                      >
                        Reset
                      </button>
                    )}
                    <button
                      className="task-action-btn"
                      onClick={() => startEdit(task, 'weight')}
                    >
                      Edit Weight
                    </button>
                    {hasWeightOverride && (
                      <button
                        className="task-action-btn task-action-reset"
                        onClick={() => resetOverride(task.id, 'weight')}
                      >
                        Reset
                      </button>
                    )}
                    <button
                      className="task-action-btn"
                      onClick={() => startEdit(task, 'requirements')}
                    >
                      Edit Requirements
                    </button>
                    {hasReqOverride && (
                      <button
                        className="task-action-btn task-action-reset"
                        onClick={() => resetOverride(task.id, 'requirements')}
                      >
                        Reset
                      </button>
                    )}
                    {(displayWindows.includes('11') || displayWindows.includes('21')) && (
                      <button
                        className="task-action-btn"
                        onClick={() => startEdit(task, 'stages')}
                      >
                        Edit Stages
                      </button>
                    )}
                    <button
                      className="task-action-btn"
                      onClick={() => startEdit(task, 'image')}
                    >
                      Edit Image
                    </button>
                    {hasImageOverride && (
                      <button
                        className="task-action-btn task-action-reset"
                        onClick={() => resetOverride(task.id, 'image')}
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editingTask && editMode && (
        <div className="tasks-modal-backdrop" onClick={closeModal}>
          <div className="tasks-modal" onClick={(e) => e.stopPropagation()}>
            <div className="tasks-modal-header">
              <h3>
                Edit {editMode === 'name' ? 'Name' : editMode === 'windows' ? 'Windows' : editMode === 'weight' ? 'Weight' : editMode === 'image' ? 'Image' : editMode === 'stages' ? 'Stages' : 'Requirements'}
              </h3>
              <button className="tasks-modal-close" onClick={closeModal}>✕</button>
            </div>
            
            <div className="tasks-modal-body">
              <p className="tasks-modal-task">
                {editingTask.icon} {editingTask.name}
              </p>
              
              {editError && <div className="tasks-error">{editError}</div>}
              
              {editMode === 'name' && (
                <div className="tasks-form-field">
                  <label className="admin-label">Display Name</label>
                  <input
                    type="text"
                    className="admin-input"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    autoFocus
                  />
                </div>
              )}
              
              {editMode === 'weight' && (
                <>
                  <div className="tasks-form-field">
                    <label className="admin-label">Weight Value</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      className="admin-input"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div className="tasks-form-field">
                    <label className="admin-label">Effective Date (optional)</label>
                    <input
                      type="date"
                      className="admin-input"
                      value={editEffectiveDate}
                      onChange={(e) => setEditEffectiveDate(e.target.value)}
                    />
                    <p className="tasks-help">Leave empty for immediate effect</p>
                  </div>
                </>
              )}
              
              {editMode === 'windows' && (
                <>
                  <div className="tasks-form-field">
                    <label className="admin-label">Active Windows</label>
                    <div className="tasks-windows-checkboxes tasks-windows-large">
                      {(['11', '17', '21'] as WindowKey[]).map((w) => (
                        <label key={w} className="tasks-checkbox-label">
                          <input
                            type="checkbox"
                            checked={editWindows[w]}
                            onChange={(e) =>
                              setEditWindows({ ...editWindows, [w]: e.target.checked })
                            }
                          />
                          <span>{WINDOW_LABELS[w]}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="tasks-form-field">
                    <label className="admin-label">Effective Date (optional)</label>
                    <input
                      type="date"
                      className="admin-input"
                      value={editEffectiveDate}
                      onChange={(e) => setEditEffectiveDate(e.target.value)}
                    />
                    <p className="tasks-help">Leave empty for immediate effect</p>
                  </div>
                </>
              )}
              
              {editMode === 'requirements' && (
                <div className="tasks-form-field">
                  <label className="admin-label">Requirements (one per line)</label>
                  <textarea
                    className="admin-input tasks-textarea"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    rows={6}
                    autoFocus
                  />
                </div>
              )}
              
              {editMode === 'image' && (
                <div className="tasks-form-field">
                  <label className="admin-label">Task image (optional)</label>
                  {editingTask.imagePath && !editImageRemove && (
                    <p className="tasks-image-current">Current image is set.</p>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="admin-input"
                    onChange={(e) => {
                      setEditImageFile(e.target.files?.[0] ?? null)
                      setEditImageRemove(false)
                    }}
                    disabled={editImageRemove}
                  />
                  {editImageFile && (
                    <span className="tasks-image-preview">📷 {editImageFile.name}</span>
                  )}
                  {editingTask.imagePath && (
                    <label className="tasks-checkbox-label">
                      <input
                        type="checkbox"
                        checked={editImageRemove}
                        onChange={(e) => {
                          setEditImageRemove(e.target.checked)
                          if (e.target.checked) setEditImageFile(null)
                        }}
                      />
                      <span>Remove image</span>
                    </label>
                  )}
                  {typeof editImageUploadPct === 'number' && editImageUploadPct > 0 && (
                    <div className="tasks-upload-progress">Upload: {editImageUploadPct}%</div>
                  )}
                </div>
              )}

              {editMode === 'stages' && editingTask && (
                <div className="tasks-form-field">
                  <p className="tasks-help" style={{ marginBottom: 12 }}>
                    Assign this task to Stage 1 (earlier) or Stage 2 (later) for each window. Stage dividers appear in the v3 task grid.
                  </p>
                  {(['11', '21'] as const).map((w) => {
                    const taskWindows = taskOverrides?.overrides?.[editingTask.id]?.windows || editingTask.windows || []
                    if (!taskWindows.includes(w)) return null
                    return (
                      <div key={w} className="tasks-stage-row">
                        <span className="admin-label">{WINDOW_LABELS[w]}:</span>
                        <div className="tasks-stage-radios">
                          {([1, 2] as const).map((s) => (
                            <label key={s} className="tasks-checkbox-label">
                              <input
                                type="radio"
                                name={`stage-${w}`}
                                checked={(editStages[w] ?? 2) === s}
                                onChange={() => setEditStages({ ...editStages, [w]: s })}
                              />
                              <span>Stage {s}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            
            <div className="tasks-modal-footer">
              <button className="admin-btn admin-btn-secondary" onClick={closeModal}>
                Cancel
              </button>
              <button
                className="admin-btn admin-btn-primary"
                onClick={saveEdit}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default TasksPage
