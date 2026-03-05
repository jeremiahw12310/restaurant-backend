import { useState, useEffect, useCallback, useMemo } from 'react'
import './TasksPage.css'
import {
  subscribeToTaskCatalog,
  saveTaskCatalog,
  subscribeToTaskOverrides,
  saveTaskOverrides,
  type TaskCatalog,
  type TaskDef,
  type TaskOverrides,
  type WindowKey,
} from '../../services/firestore'
import { TASKS } from '../../constants/tasks'
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
  
  // Edit modals
  const [editingTask, setEditingTask] = useState<DisplayTask | null>(null)
  const [editMode, setEditMode] = useState<'name' | 'windows' | 'weight' | 'requirements' | 'image' | null>(null)
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

    return () => {
      unsubCatalog?.()
      unsubOverrides?.()
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
    
    // Apply overrides (name, imagePath)
    if (taskOverrides?.overrides) {
      Object.entries(taskOverrides.overrides).forEach(([id, ov]) => {
        if (!byId[id] || !ov) return
        if (ov.name) byId[id] = { ...byId[id], name: ov.name }
        if (ov.imagePath !== undefined) {
          byId[id] = { ...byId[id], imagePath: (ov.imagePath && ov.imagePath.trim()) || undefined }
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
  const startEdit = (task: DisplayTask, mode: 'name' | 'windows' | 'weight' | 'requirements' | 'image') => {
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
      case 'image':
        setEditImageFile(null)
        setEditImageRemove(false)
        setEditImageUploadPct(0)
        break
    }
  }

  // Save edit
  const saveEdit = useCallback(async () => {
    if (!editingTask || !editMode) return
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
          // No change
          setEditingTask(null)
          setEditMode(null)
          return
        }
        break
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
  }, [editingTask, editMode, editValue, editWindows, editEffectiveDate, editImageFile, editImageRemove, taskOverrides, uploadTaskImage])

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

  const closeModal = () => {
    setEditingTask(null)
    setEditMode(null)
    setEditError(null)
  }

  return (
    <div className="tasks-page">
      <header className="admin-page-header">
        <h1>Task Management</h1>
        <p>Create new tasks and customize existing task settings.</p>
      </header>

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
                Edit {editMode === 'name' ? 'Name' : editMode === 'windows' ? 'Windows' : editMode === 'weight' ? 'Weight' : editMode === 'image' ? 'Image' : 'Requirements'}
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
