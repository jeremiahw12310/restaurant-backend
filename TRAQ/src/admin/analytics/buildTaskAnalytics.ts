import {
  type TaskState,
  type TaskCatalog,
  type WindowKey,
  type TaskOverrides,
} from '../../services/firestore'
import { getWeightsForDateKey, type TaskLike, type WindowMsFns } from '../../utils/taskScoring'

export const WINDOW_LABELS: Record<WindowKey, string> = {
  '11': '11am',
  '17': '5pm',
  '21': '9pm',
}

export function formatDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function formatDisplayDate(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** Window boundaries aligned with the main app shift windows. */
export function createAnalyticsWindowMs(): WindowMsFns {
  const windowStartMsForDateKey = (dateKey: string, windowKey: WindowKey): number => {
    const baseDate = new Date(`${dateKey}T00:00:00`)
    const start = windowKey === '11' ? '11:00' : windowKey === '17' ? '17:00' : '21:00'
    const [hh, mm] = start.split(':').map((x) => Number(x))
    const d = new Date(baseDate)
    d.setHours(hh || 0, mm || 0, 0, 0)
    return d.getTime()
  }
  const windowCloseMsForDateKey = (dateKey: string, windowKey: WindowKey): number => {
    const baseDate = new Date(`${dateKey}T00:00:00`)
    const nextWindowKey: WindowKey | null = windowKey === '11' ? '17' : windowKey === '17' ? '21' : null
    if (nextWindowKey) {
      const nextStart = nextWindowKey === '17' ? '17:00' : '21:00'
      const [hh, mm] = nextStart.split(':').map((x) => Number(x))
      const d = new Date(baseDate)
      d.setHours(hh || 0, mm || 0, 0, 0)
      return d.getTime()
    }
    const nextDay = new Date(baseDate)
    nextDay.setDate(nextDay.getDate() + 1)
    nextDay.setHours(0, 0, 0, 0)
    return nextDay.getTime()
  }
  return { windowStartMsForDateKey, windowCloseMsForDateKey }
}

export type TaskAnalytics = ReturnType<typeof buildTaskAnalytics>

export function buildTaskAnalytics(args: {
  taskState: TaskState
  taskCatalog: TaskCatalog
  taskOverrides: TaskOverrides | null
  employees: string[]
  windowMs: WindowMsFns
  dateRange: { from: string; to: string }
}): {
  totalCompletions: number
  totalSplitCompletions: number
  splitTaskRate: number
  byEmployee: Record<string, number>
  byTask: Record<string, number>
  byTaskKey: Record<string, number>
  byWindow: Record<WindowKey, number>
  byDate: Record<string, number>
  employeeRanking: Array<{ name: string; count: number }>
  taskRanking: Array<{ id: string; name: string; count: number }>
  taskKeyRanking: Array<{
    taskKey: string
    taskId: string
    windowKey: WindowKey
    name: string
    count: number
  }>
  employeeTaskMatrix: Record<string, Record<string, number>>
  employeeTaskKeyMatrix: Record<string, Record<string, number>>
  taskWindowMatrix: Record<string, Record<WindowKey, number>>
  availableTaskKeys: Record<string, number>
  skipRates: Array<{
    taskKey: string
    taskName: string
    available: number
    completed: number
    skipRate: number
  }>
  partnerWorkTasks: Array<{
    taskKey: string
    taskName: string
    splitCount: number
    singleCount: number
    splitPercentage: number
  }>
  employeeNeverDoes: Record<string, string[]>
  dailyTrends: Array<{ date: string; dateKey: string; completions: number }>
  employeeTrends: Array<Record<string, string | number>>
  redFlags: string[]
  recommendations: string[]
  dateKeys: string[]
} {
  const { taskState, taskCatalog, taskOverrides, employees, windowMs, dateRange } = args
  const { from, to } = dateRange

  const taskNameLookup: Record<string, string> = {}
  taskCatalog.tasks.forEach((t) => {
    taskNameLookup[t.id] = t.name
  })

  const dateKeys: string[] = []
  const current = new Date(from)
  const end = new Date(to)
  while (current <= end) {
    dateKeys.push(formatDateKey(current))
    current.setDate(current.getDate() + 1)
  }

  const byEmployee: Record<string, number> = {}
  const byTask: Record<string, number> = {}
  const byTaskKey: Record<string, number> = {}
  const byWindow: Record<WindowKey, number> = { '11': 0, '17': 0, '21': 0 }
  const byDate: Record<string, number> = {}
  const employeeTaskMatrix: Record<string, Record<string, number>> = {}
  const employeeTaskKeyMatrix: Record<string, Record<string, number>> = {}
  const taskWindowMatrix: Record<string, Record<WindowKey, number>> = {}
  const splitCompletions: Record<string, number> = {}
  const singleAssigneeCompletions: Record<string, number> = {}
  const employeeDailyActivity: Record<string, Record<string, number>> = {}

  let totalCompletions = 0
  let totalSplitCompletions = 0

  Object.entries(taskState).forEach(([dateKey, windows]) => {
    Object.entries(windows).forEach(([windowKey, tasks]) => {
      const wk = windowKey as WindowKey

      Object.entries(tasks).forEach(([taskId, completion]) => {
        const taskKey = `${taskId}::${wk}`
        const isSplit = completion.assignees.length > 1

        if (isSplit) {
          totalSplitCompletions++
          splitCompletions[taskKey] = (splitCompletions[taskKey] || 0) + 1
        } else {
          singleAssigneeCompletions[taskKey] = (singleAssigneeCompletions[taskKey] || 0) + 1
        }

        totalCompletions++
        byTask[taskId] = (byTask[taskId] || 0) + 1
        byTaskKey[taskKey] = (byTaskKey[taskKey] || 0) + 1
        byDate[dateKey] = (byDate[dateKey] || 0) + 1
        byWindow[wk]++

        if (!taskWindowMatrix[taskId]) {
          taskWindowMatrix[taskId] = { '11': 0, '17': 0, '21': 0 }
        }
        taskWindowMatrix[taskId][wk]++

        completion.assignees.forEach((emp) => {
          byEmployee[emp] = (byEmployee[emp] || 0) + 1

          if (!employeeTaskMatrix[emp]) employeeTaskMatrix[emp] = {}
          employeeTaskMatrix[emp][taskId] = (employeeTaskMatrix[emp][taskId] || 0) + 1

          if (!employeeTaskKeyMatrix[emp]) employeeTaskKeyMatrix[emp] = {}
          employeeTaskKeyMatrix[emp][taskKey] = (employeeTaskKeyMatrix[emp][taskKey] || 0) + 1

          if (!employeeDailyActivity[emp]) employeeDailyActivity[emp] = {}
          employeeDailyActivity[emp][dateKey] = (employeeDailyActivity[emp][dateKey] || 0) + 1
        })
      })
    })
  })

  const availableTaskKeys: Record<string, number> = {}
  const allTasks = (taskCatalog.tasks || []) as unknown as TaskLike[]

  dateKeys.forEach((dateKey) => {
    const { taskIdsByWindow } = getWeightsForDateKey({
      dateKey,
      allTasks,
      taskOverrides,
      windowMs,
    })

    ;(['11', '17', '21'] as WindowKey[]).forEach((wk) => {
      taskIdsByWindow[wk].forEach((tid) => {
        const taskKey = `${tid}::${wk}`
        availableTaskKeys[taskKey] = (availableTaskKeys[taskKey] || 0) + 1
      })
    })
  })

  const skipRates: Array<{
    taskKey: string
    taskName: string
    available: number
    completed: number
    skipRate: number
  }> = []
  Object.entries(availableTaskKeys).forEach(([taskKey, available]) => {
    const completed = byTaskKey[taskKey] || 0
    const skipRate = available > 0 ? ((available - completed) / available) * 100 : 0
    const [taskId] = taskKey.split('::')
    const taskName = taskNameLookup[taskId] || taskId
    skipRates.push({ taskKey, taskName, available, completed, skipRate })
  })
  skipRates.sort((a, b) => b.skipRate - a.skipRate)

  const partnerWorkTasks: Array<{
    taskKey: string
    taskName: string
    splitCount: number
    singleCount: number
    splitPercentage: number
  }> = []
  Object.keys(availableTaskKeys).forEach((taskKey) => {
    const splitCount = splitCompletions[taskKey] || 0
    const singleCount = singleAssigneeCompletions[taskKey] || 0
    const total = splitCount + singleCount
    const splitPercentage = total > 0 ? (splitCount / total) * 100 : 0
    const [taskId] = taskKey.split('::')
    const taskName = taskNameLookup[taskId] || taskId
    if (total > 0) {
      partnerWorkTasks.push({ taskKey, taskName, splitCount, singleCount, splitPercentage })
    }
  })
  partnerWorkTasks.sort((a, b) => b.splitPercentage - a.splitPercentage)

  const employeeNeverDoes: Record<string, string[]> = {}
  employees.forEach((emp) => {
    const done = employeeTaskKeyMatrix[emp] || {}
    const neverDoes: string[] = []
    Object.keys(availableTaskKeys).forEach((taskKey) => {
      if (!done[taskKey]) {
        const [taskId, wk] = taskKey.split('::')
        const taskName = taskNameLookup[taskId] || taskId
        neverDoes.push(`${taskName} (${WINDOW_LABELS[wk as WindowKey]})`)
      }
    })
    if (neverDoes.length > 0) {
      employeeNeverDoes[emp] = neverDoes
    }
  })

  const employeeRanking = Object.entries(byEmployee)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }))

  const taskRanking = Object.entries(byTask)
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => ({ id, name: taskNameLookup[id] || id, count }))

  const taskKeyRanking = Object.entries(byTaskKey)
    .sort((a, b) => b[1] - a[1])
    .map(([taskKey, count]) => {
      const [taskId, wk] = taskKey.split('::')
      return {
        taskKey,
        taskId,
        windowKey: wk as WindowKey,
        name: `${taskNameLookup[taskId] || taskId} (${WINDOW_LABELS[wk as WindowKey]})`,
        count,
      }
    })

  const dailyTrends = dateKeys.map((dateKey) => ({
    date: formatDisplayDate(dateKey),
    dateKey,
    completions: byDate[dateKey] || 0,
  }))

  const employeeTrends: Array<Record<string, string | number>> = dateKeys.map((dateKey) => {
    const entry: Record<string, string | number> = {
      date: formatDisplayDate(dateKey),
      dateKey,
    }
    employees.forEach((emp) => {
      entry[emp] = employeeDailyActivity[emp]?.[dateKey] || 0
    })
    return entry
  })

  const redFlags: string[] = []
  const recommendations: string[] = []

  Object.entries(employeeNeverDoes).forEach(([emp, tasks]) => {
    if (tasks.length > 5) {
      redFlags.push(`${emp} never does ${tasks.length} different tasks`)
    }
  })

  partnerWorkTasks.forEach(({ taskName, splitPercentage }) => {
    if (splitPercentage > 80) {
      redFlags.push(`${taskName} is almost always done by multiple people (${Math.round(splitPercentage)}%)`)
    }
  })

  skipRates.forEach(({ taskName, skipRate }) => {
    if (skipRate > 50) {
      redFlags.push(`${taskName} is skipped ${Math.round(skipRate)}% of the time`)
    }
  })

  const topEmployees = employeeRanking.slice(0, 3).map((e) => e.name)
  const bottomEmployees = employeeRanking.slice(-3).map((e) => e.name)
  if (bottomEmployees.length > 0) {
    recommendations.push(
      `Consider redistributing tasks from ${topEmployees.join(', ')} to ${bottomEmployees.join(', ')}`
    )
  }

  const alwaysSplitTasks = partnerWorkTasks.filter((t) => t.splitPercentage > 90).map((t) => t.taskName)
  if (alwaysSplitTasks.length > 0) {
    recommendations.push(
      `These tasks are always split: ${alwaysSplitTasks.slice(0, 3).join(', ')} - consider if workload is too high`
    )
  }

  return {
    totalCompletions,
    totalSplitCompletions,
    splitTaskRate: totalCompletions > 0 ? (totalSplitCompletions / totalCompletions) * 100 : 0,
    byEmployee,
    byTask,
    byTaskKey,
    byWindow,
    byDate,
    employeeRanking,
    taskRanking,
    taskKeyRanking,
    employeeTaskMatrix,
    employeeTaskKeyMatrix,
    taskWindowMatrix,
    availableTaskKeys,
    skipRates,
    partnerWorkTasks,
    employeeNeverDoes,
    dailyTrends,
    employeeTrends,
    redFlags,
    recommendations,
    dateKeys,
  }
}
