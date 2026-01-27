import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  type POSItem,
  type POSModifier,
  type POSModifierCategory,
  type POSCartItem,
  type POSOrder,
  subscribeToPOSConfig,
  subscribeToPOSOrders,
  savePOSItems,
  savePOSModifiers,
  savePOSCategories,
  savePOSOrder,
  deletePOSOrder,
  clearPOSOrders,
} from '../services/firestore'
import './POSPage.css'

// Helper to format cents as dollars
const formatPrice = (cents: number): string => {
  return `$${(cents / 100).toFixed(2)}`
}

// Helper to format modifier price adjustment
const formatPriceAdjustment = (cents: number): string => {
  if (cents === 0) return '+$0'
  return `+$${(cents / 100).toFixed(2)}`
}

// Generate unique ID
const generateId = (): string => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2)
}

// Get today's date key (YYYY-MM-DD)
const getTodayKey = (): string => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function POSPage() {
  const navigate = useNavigate()

  // Config state
  const [categories, setCategories] = useState<POSModifierCategory[]>([])
  const [items, setItems] = useState<POSItem[]>([])
  const [modifiers, setModifiers] = useState<POSModifier[]>([])

  // Order state
  const [cart, setCart] = useState<POSCartItem[]>([])
  const [selectedModifiers, setSelectedModifiers] = useState<Set<string>>(new Set())
  const [selectedItemForModifiers, setSelectedItemForModifiers] = useState<POSItem | null>(null)
  const [orders, setOrders] = useState<POSOrder[]>([])
  const [nextOrderNumber, setNextOrderNumber] = useState(1)

  // UI state
  const [editMode, setEditMode] = useState(false)
  const [showOrders, setShowOrders] = useState(false)
  const [showAddItem, setShowAddItem] = useState(false)
  const [showAddModifier, setShowAddModifier] = useState(false)
  const [showAddCategory, setShowAddCategory] = useState(false)
  const [showEditItem, setShowEditItem] = useState<POSItem | null>(null)
  const [showEditModifier, setShowEditModifier] = useState<POSModifier | null>(null)
  const [showEditCategory, setShowEditCategory] = useState<POSModifierCategory | null>(null)
  const [showItemModifiers, setShowItemModifiers] = useState(false)
  const [showCashPayment, setShowCashPayment] = useState(false)
  const [cashTendered, setCashTendered] = useState(0) // in cents
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null)
  const [dragOverItemId, setDragOverItemId] = useState<string | null>(null)
  const [showReports, setShowReports] = useState(false)
  const [reportStartDate, setReportStartDate] = useState(getTodayKey())
  const [reportEndDate, setReportEndDate] = useState(getTodayKey())
  const [showOpenKitchen, setShowOpenKitchen] = useState(false)
  const [openKitchenName, setOpenKitchenName] = useState('')
  const [openKitchenPrice, setOpenKitchenPrice] = useState('')
  const [orderType, setOrderType] = useState<'dineIn' | 'toGo' | null>(null)
  const [showOrderTypeModal, setShowOrderTypeModal] = useState(false)

  // Form state
  const [newItemName, setNewItemName] = useState('')
  const [newItemPrice, setNewItemPrice] = useState('')
  const [newItemCategoryIds, setNewItemCategoryIds] = useState<Set<string>>(new Set())
  const [newModifierName, setNewModifierName] = useState('')
  const [newModifierPrice, setNewModifierPrice] = useState('')
  const [newModifierCategoryId, setNewModifierCategoryId] = useState('')
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategorySingleSelect, setNewCategorySingleSelect] = useState(false)

  // Subscribe to config and orders
  useEffect(() => {
    const unsubConfig = subscribeToPOSConfig((config) => {
      setCategories(config.categories)
      setItems(config.items)
      setModifiers(config.modifiers)
    })

    const unsubOrders = subscribeToPOSOrders((data) => {
      setOrders(data.orders)
      setNextOrderNumber(data.nextOrderNumber)
    })

    return () => {
      unsubConfig()
      unsubOrders()
    }
  }, [])

  // Show order type modal when cart is empty and orderType is not set
  useEffect(() => {
    if (cart.length === 0 && orderType === null && !showOrders && !showReports) {
      setShowOrderTypeModal(true)
    } else if (cart.length > 0 || orderType !== null) {
      setShowOrderTypeModal(false)
    }
  }, [cart.length, orderType, showOrders, showReports])

  // Reset orderType when cart is cleared
  const clearCart = useCallback(() => {
    setCart([])
    setSelectedModifiers(new Set())
    setOrderType(null)
  }, [])

  // Calculate cart totals
  // All calculations in cents to avoid floating point errors
  const subtotal = cart.reduce((sum, cartItem) => {
    const itemTotal = cartItem.item.price * cartItem.quantity
    const modifiersTotal = cartItem.modifiers.reduce((m, mod) => m + mod.priceAdjustment, 0) * cartItem.quantity
    return sum + itemTotal + modifiersTotal
  }, 0)

  // 10% tax, rounded to nearest cent
  const tax = Math.round(subtotal * 0.1)
  
  // Total must be subtotal + tax (both in cents)
  const total = subtotal + tax
  
  // Change due: cash tendered minus total (can be negative if insufficient)
  const changeDue = cashTendered - total

  // Calculate daily summary
  const dailySummary = useMemo(() => {
    const todayKey = getTodayKey()
    const todayOrders = orders.filter((order) => {
      const orderDate = order.createdAt.split('T')[0]
      return orderDate === todayKey
    })
    const totalSales = todayOrders.reduce((sum, order) => sum + order.total, 0)
    return {
      orderCount: todayOrders.length,
      totalSales,
    }
  }, [orders])

  // Calculate report data based on date range
  const reportData = useMemo(() => {
    const filteredOrders = orders.filter((order) => {
      const orderDate = order.createdAt.split('T')[0]
      return orderDate >= reportStartDate && orderDate <= reportEndDate
    })

    const houseCash = filteredOrders.reduce((sum, order) => sum + order.total, 0)
    const orderCount = filteredOrders.length
    const grossCashReceived = filteredOrders.reduce((sum, order) => sum + (order.cashTendered || order.total), 0)
    const changeGiven = filteredOrders.reduce((sum, order) => sum + (order.changeDue || 0), 0)
    const taxCollected = filteredOrders.reduce((sum, order) => sum + order.tax, 0)
    const netSales = filteredOrders.reduce((sum, order) => sum + order.subtotal, 0)

    return {
      houseCash,
      orderCount,
      grossCashReceived,
      changeGiven,
      taxCollected,
      netSales,
    }
  }, [orders, reportStartDate, reportEndDate])

  // Quick date selection helpers for reports
  const setReportDateToday = useCallback(() => {
    const today = getTodayKey()
    setReportStartDate(today)
    setReportEndDate(today)
  }, [])

  const setReportDateYesterday = useCallback(() => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const key = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`
    setReportStartDate(key)
    setReportEndDate(key)
  }, [])

  const setReportDateThisWeek = useCallback(() => {
    const today = new Date()
    const dayOfWeek = today.getDay()
    const startOfWeek = new Date(today)
    startOfWeek.setDate(today.getDate() - dayOfWeek)
    const startKey = `${startOfWeek.getFullYear()}-${String(startOfWeek.getMonth() + 1).padStart(2, '0')}-${String(startOfWeek.getDate()).padStart(2, '0')}`
    const endKey = getTodayKey()
    setReportStartDate(startKey)
    setReportEndDate(endKey)
  }, [])

  const setReportDateAllTime = useCallback(() => {
    setReportStartDate('2000-01-01')
    setReportEndDate('2099-12-31')
  }, [])

  // Open modifier selection for item
  const openItemModifiers = useCallback((item: POSItem) => {
    setSelectedItemForModifiers(item)
    setSelectedModifiers(new Set())
    setShowItemModifiers(true)
  }, [])

  // Add item to cart with selected modifiers
  const addToCart = useCallback(() => {
    if (!selectedItemForModifiers) return
    
    // Get selected modifiers, ensuring single-select categories only have one
    const selectedModifierIds = Array.from(selectedModifiers)
    const activeModifiers = modifiers.filter((m) => selectedModifierIds.includes(m.id))
    
    // Validate single-select categories
    for (const category of categories) {
      if (category.singleSelect) {
        const categoryModifiers = activeModifiers.filter(m => m.categoryId === category.id)
        if (categoryModifiers.length > 1) {
          alert(`Only one modifier can be selected from "${category.name}"`)
          return
        }
      }
    }

    const item = selectedItemForModifiers

    setCart((prev) => {
      // Check if same item with same modifiers exists
      const existingIndex = prev.findIndex(
        (ci) =>
          ci.item.id === item.id &&
          ci.modifiers.length === activeModifiers.length &&
          ci.modifiers.every((m) => activeModifiers.some((am) => am.id === m.id))
      )

      if (existingIndex >= 0) {
        // Increment quantity
        const updated = [...prev]
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: updated[existingIndex].quantity + 1,
        }
        return updated
      }

      // Add new cart item
      return [
        ...prev,
        {
          id: generateId(),
          item,
          modifiers: activeModifiers,
          quantity: 1,
        },
      ]
    })
    
    // Close modal and reset
    setShowItemModifiers(false)
    setSelectedItemForModifiers(null)
    setSelectedModifiers(new Set())
  }, [modifiers, selectedModifiers, selectedItemForModifiers, categories])

  // Update cart item quantity
  const updateQuantity = useCallback((cartItemId: string, delta: number) => {
    setCart((prev) => {
      return prev
        .map((ci) => {
          if (ci.id === cartItemId) {
            const newQty = ci.quantity + delta
            return newQty > 0 ? { ...ci, quantity: newQty } : null
          }
          return ci
        })
        .filter((ci): ci is POSCartItem => ci !== null)
    })
  }, [])

  // Remove from cart
  const removeFromCart = useCallback((cartItemId: string) => {
    setCart((prev) => prev.filter((ci) => ci.id !== cartItemId))
  }, [])

  // Add open kitchen item to cart (one-off custom item)
  const addOpenKitchenItem = useCallback(() => {
    const name = openKitchenName.trim()
    const priceStr = openKitchenPrice.trim()
    if (!name || !priceStr) return

    const price = Math.round(parseFloat(priceStr) * 100)
    if (isNaN(price) || price < 0) {
      alert('Please enter a valid price')
      return
    }

    // Create a temporary item (not saved to database)
    const tempItem: POSItem = {
      id: 'open-kitchen-' + generateId(),
      name: `[OK] ${name}`,
      price,
      allowedCategoryIds: [],
      displayOrder: -1,
    }

    // Add directly to cart with no modifiers
    setCart((prev) => [
      ...prev,
      {
        id: generateId(),
        item: tempItem,
        modifiers: [],
        quantity: 1,
      },
    ])

    // Close modal and reset
    setShowOpenKitchen(false)
    setOpenKitchenName('')
    setOpenKitchenPrice('')
  }, [openKitchenName, openKitchenPrice])

  // Toggle modifier with single-select category handling
  const toggleModifier = useCallback((modifierId: string) => {
    const modifier = modifiers.find(m => m.id === modifierId)
    if (!modifier) return
    
    const category = categories.find(c => c.id === modifier.categoryId)
    if (!category) return
    
    setSelectedModifiers((prev) => {
      const next = new Set(prev)
      
      if (category.singleSelect) {
        // Single-select: deselect all other modifiers from this category, then toggle this one
        modifiers
          .filter(m => m.categoryId === modifier.categoryId)
          .forEach(m => next.delete(m.id))
        
        // If this one wasn't selected, add it
        if (!prev.has(modifierId)) {
          next.add(modifierId)
        }
      } else {
        // Multi-select: toggle normally
        if (next.has(modifierId)) {
          next.delete(modifierId)
        } else {
          next.add(modifierId)
        }
      }
      
      return next
    })
  }, [modifiers, categories])

  // Open cash payment modal
  const openCashPayment = useCallback(() => {
    if (cart.length === 0) return
    setCashTendered(0)
    setShowCashPayment(true)
  }, [cart.length])

  // Add cash denomination
  const addCashDenomination = useCallback((cents: number) => {
    setCashTendered((prev) => prev + cents)
  }, [])

  // Set exact cash
  const setExactCash = useCallback(() => {
    setCashTendered(total)
  }, [total])

  // Clear cash tendered
  const clearCashTendered = useCallback(() => {
    setCashTendered(0)
  }, [])

  // Complete order with cash payment
  const completeOrder = useCallback(async () => {
    if (cart.length === 0) return
    
    // Validate order type is set
    if (!orderType) {
      alert('Please select Dine In or To Go')
      setShowOrderTypeModal(true)
      return
    }
    
    // Recalculate totals to ensure accuracy at moment of completion
    const finalSubtotal = cart.reduce((sum, cartItem) => {
      const itemTotal = cartItem.item.price * cartItem.quantity
      const modifiersTotal = cartItem.modifiers.reduce((m, mod) => m + mod.priceAdjustment, 0) * cartItem.quantity
      return sum + itemTotal + modifiersTotal
    }, 0)
    
    const finalTax = Math.round(finalSubtotal * 0.1)
    const finalTotal = finalSubtotal + finalTax
    const finalChangeDue = cashTendered - finalTotal
    
    // Validate sufficient cash
    if (cashTendered < finalTotal) {
      alert('Insufficient cash tendered')
      return
    }
    
    // Ensure change is non-negative (should be guaranteed by check above, but double-check)
    if (finalChangeDue < 0) {
      alert('Error: Change calculation is negative. Please try again.')
      return
    }

    const order: POSOrder = {
      id: generateId(),
      orderNumber: nextOrderNumber,
      items: cart,
      orderType,
      subtotal: finalSubtotal,
      tax: finalTax,
      total: finalTotal,
      cashTendered,
      changeDue: finalChangeDue,
      createdAt: new Date().toISOString(),
    }

    try {
      await savePOSOrder(order)
      clearCart()
      setCashTendered(0)
      setShowCashPayment(false)
    } catch (error) {
      console.error('Failed to save order:', error)
      alert('Failed to save order')
    }
  }, [cart, nextOrderNumber, cashTendered, orderType, clearCart])

  // Category management functions
  const handleAddCategory = useCallback(async () => {
    const name = newCategoryName.trim()
    if (!name) return

    const maxOrder = categories.length > 0 ? Math.max(...categories.map(c => c.displayOrder)) : -1
    const newCategory: POSModifierCategory = {
      id: generateId(),
      name,
      singleSelect: newCategorySingleSelect,
      displayOrder: maxOrder + 1,
    }

    try {
      await savePOSCategories([...categories, newCategory])
      setNewCategoryName('')
      setNewCategorySingleSelect(false)
      setShowAddCategory(false)
    } catch (error) {
      console.error('Failed to add category:', error)
      alert('Failed to add category')
    }
  }, [categories, newCategoryName, newCategorySingleSelect])

  const handleUpdateCategory = useCallback(async () => {
    if (!showEditCategory) return
    const name = newCategoryName.trim()
    if (!name) return

    const updatedCategories = categories.map((cat) =>
      cat.id === showEditCategory.id
        ? { ...cat, name, singleSelect: newCategorySingleSelect }
        : cat
    )

    try {
      await savePOSCategories(updatedCategories)
      setNewCategoryName('')
      setNewCategorySingleSelect(false)
      setShowEditCategory(null)
    } catch (error) {
      console.error('Failed to update category:', error)
      alert('Failed to update category')
    }
  }, [categories, showEditCategory, newCategoryName, newCategorySingleSelect])

  const handleDeleteCategory = useCallback(async (categoryId: string) => {
    if (!confirm('Delete this category? Modifiers in this category will be removed.')) return

    // Check if any modifiers use this category
    const modifiersInCategory = modifiers.filter(m => m.categoryId === categoryId)
    if (modifiersInCategory.length > 0) {
      if (!confirm(`This category has ${modifiersInCategory.length} modifier(s). They will be deleted. Continue?`)) {
        return
      }
      // Delete modifiers in this category
      await savePOSModifiers(modifiers.filter(m => m.categoryId !== categoryId))
    }

    // Remove category from items' allowedCategoryIds
    const updatedItems = items.map(item => ({
      ...item,
      allowedCategoryIds: item.allowedCategoryIds.filter(id => id !== categoryId),
    }))
    await savePOSItems(updatedItems)

    try {
      await savePOSCategories(categories.filter(c => c.id !== categoryId))
    } catch (error) {
      console.error('Failed to delete category:', error)
      alert('Failed to delete category')
    }
  }, [categories, modifiers, items])

  const handleMoveCategory = useCallback(async (categoryId: string, direction: 'up' | 'down') => {
    const index = categories.findIndex(c => c.id === categoryId)
    if (index === -1) return

    const newIndex = direction === 'up' ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= categories.length) return

    const updated = [...categories]
    const temp = updated[index].displayOrder
    updated[index].displayOrder = updated[newIndex].displayOrder
    updated[newIndex].displayOrder = temp

    // Swap items
    ;[updated[index], updated[newIndex]] = [updated[newIndex], updated[index]]

    try {
      await savePOSCategories(updated)
    } catch (error) {
      console.error('Failed to reorder category:', error)
      alert('Failed to reorder category')
    }
  }, [categories])

  // Add new item
  const handleAddItem = useCallback(async () => {
    const name = newItemName.trim()
    const priceStr = newItemPrice.trim()
    if (!name || !priceStr) return

    const price = Math.round(parseFloat(priceStr) * 100)
    if (isNaN(price) || price < 0) return

    const maxOrder = items.length > 0 ? Math.max(...items.map(i => i.displayOrder)) : -1
    const newItem: POSItem = {
      id: generateId(),
      name,
      price,
      allowedCategoryIds: Array.from(newItemCategoryIds),
      displayOrder: maxOrder + 1,
    }

    try {
      await savePOSItems([...items, newItem])
      setNewItemName('')
      setNewItemPrice('')
      setNewItemCategoryIds(new Set())
      setShowAddItem(false)
    } catch (error) {
      console.error('Failed to add item:', error)
      alert('Failed to add item')
    }
  }, [items, newItemName, newItemPrice, newItemCategoryIds])

  // Update item
  const handleUpdateItem = useCallback(async () => {
    if (!showEditItem) return
    const name = newItemName.trim()
    const priceStr = newItemPrice.trim()
    if (!name || !priceStr) return

    const price = Math.round(parseFloat(priceStr) * 100)
    if (isNaN(price) || price < 0) return

    const updatedItems = items.map((item) =>
      item.id === showEditItem.id
        ? { ...item, name, price, allowedCategoryIds: Array.from(newItemCategoryIds) }
        : item
    )

    try {
      await savePOSItems(updatedItems)
      setNewItemName('')
      setNewItemPrice('')
      setNewItemCategoryIds(new Set())
      setShowEditItem(null)
    } catch (error) {
      console.error('Failed to update item:', error)
      alert('Failed to update item')
    }
  }, [items, showEditItem, newItemName, newItemPrice, newItemCategoryIds])

  // Delete item
  const handleDeleteItem = useCallback(async (itemId: string) => {
    if (!confirm('Delete this item?')) return

    try {
      await savePOSItems(items.filter((i) => i.id !== itemId))
    } catch (error) {
      console.error('Failed to delete item:', error)
      alert('Failed to delete item')
    }
  }, [items])

  // Add new modifier
  const handleAddModifier = useCallback(async () => {
    const name = newModifierName.trim()
    const priceStr = newModifierPrice.trim()
    if (!name) return

    const priceAdjustment = priceStr ? Math.round(parseFloat(priceStr) * 100) : 0
    if (isNaN(priceAdjustment) || priceAdjustment < 0) return

    if (!newModifierCategoryId) {
      alert('Please select a category')
      return
    }

    const categoryModifiers = modifiers.filter(m => m.categoryId === newModifierCategoryId)
    const maxOrder = categoryModifiers.length > 0 ? Math.max(...categoryModifiers.map(m => m.displayOrder)) : -1

    const newModifier: POSModifier = {
      id: generateId(),
      name,
      priceAdjustment,
      categoryId: newModifierCategoryId,
      displayOrder: maxOrder + 1,
    }

    try {
      await savePOSModifiers([...modifiers, newModifier])
      setNewModifierName('')
      setNewModifierPrice('')
      setNewModifierCategoryId('')
      setShowAddModifier(false)
    } catch (error) {
      console.error('Failed to add modifier:', error)
      alert('Failed to add modifier')
    }
  }, [modifiers, newModifierName, newModifierPrice, newModifierCategoryId])

  // Update modifier
  const handleUpdateModifier = useCallback(async () => {
    if (!showEditModifier) return
    const name = newModifierName.trim()
    const priceStr = newModifierPrice.trim()
    if (!name) return

    const priceAdjustment = priceStr ? Math.round(parseFloat(priceStr) * 100) : 0
    if (isNaN(priceAdjustment) || priceAdjustment < 0) return

    if (!newModifierCategoryId) {
      alert('Please select a category')
      return
    }

    const updatedModifiers = modifiers.map((mod) =>
      mod.id === showEditModifier.id
        ? { ...mod, name, priceAdjustment, categoryId: newModifierCategoryId }
        : mod
    )

    try {
      await savePOSModifiers(updatedModifiers)
      setNewModifierName('')
      setNewModifierPrice('')
      setNewModifierCategoryId('')
      setShowEditModifier(null)
    } catch (error) {
      console.error('Failed to update modifier:', error)
      alert('Failed to update modifier')
    }
  }, [modifiers, showEditModifier, newModifierName, newModifierPrice, newModifierCategoryId])

  // Delete modifier
  const handleDeleteModifier = useCallback(async (modifierId: string) => {
    if (!confirm('Delete this modifier?')) return

    try {
      await savePOSModifiers(modifiers.filter((m) => m.id !== modifierId))
      setSelectedModifiers((prev) => {
        const next = new Set(prev)
        next.delete(modifierId)
        return next
      })
    } catch (error) {
      console.error('Failed to delete modifier:', error)
      alert('Failed to delete modifier')
    }
  }, [modifiers])

  // Delete a single order
  const handleDeleteOrder = useCallback(async (orderId: string) => {
    if (!confirm('Delete this order?')) return

    try {
      await deletePOSOrder(orderId)
    } catch (error) {
      console.error('Failed to delete order:', error)
      alert('Failed to delete order')
    }
  }, [])

  // Clear order history
  const handleClearOrders = useCallback(async () => {
    if (!confirm('Clear all order history?')) return

    try {
      await clearPOSOrders()
    } catch (error) {
      console.error('Failed to clear orders:', error)
      alert('Failed to clear orders')
    }
  }, [])

  // Open edit item modal
  const openEditItem = (item: POSItem) => {
    setNewItemName(item.name)
    setNewItemPrice((item.price / 100).toFixed(2))
    setNewItemCategoryIds(new Set(item.allowedCategoryIds || []))
    setShowEditItem(item)
  }

  // Open edit modifier modal
  const openEditModifier = (modifier: POSModifier) => {
    setNewModifierName(modifier.name)
    setNewModifierPrice((modifier.priceAdjustment / 100).toFixed(2))
    setNewModifierCategoryId(modifier.categoryId || '')
    setShowEditModifier(modifier)
  }

  // Open edit category modal
  const openEditCategory = (category: POSModifierCategory) => {
    setNewCategoryName(category.name)
    setNewCategorySingleSelect(category.singleSelect)
    setShowEditCategory(category)
  }

  // Handle item drag start (touch)
  const handleItemTouchStart = (_e: React.TouchEvent, itemId: string) => {
    if (!editMode) return
    setDraggedItemId(itemId)
  }

  // Handle item touch move
  const handleItemTouchMove = (e: React.TouchEvent) => {
    if (!editMode || !draggedItemId) return
    
    const touch = e.touches[0]
    const element = document.elementFromPoint(touch.clientX, touch.clientY)
    const wrapper = element?.closest('.pos-item-wrapper')
    if (wrapper) {
      const targetId = wrapper.getAttribute('data-item-id')
      if (targetId && targetId !== draggedItemId) {
        setDragOverItemId(targetId)
      } else {
        setDragOverItemId(null)
      }
    }
  }

  // Handle item drag end and reorder
  const handleItemTouchEnd = useCallback(async () => {
    if (!editMode || !draggedItemId) {
      setDraggedItemId(null)
      setDragOverItemId(null)
      return
    }

    if (dragOverItemId && draggedItemId !== dragOverItemId) {
      const draggedIndex = items.findIndex(i => i.id === draggedItemId)
      const targetIndex = items.findIndex(i => i.id === dragOverItemId)
      
      if (draggedIndex !== -1 && targetIndex !== -1) {
        const updated = [...items]
        const temp = updated[draggedIndex].displayOrder
        updated[draggedIndex].displayOrder = updated[targetIndex].displayOrder
        updated[targetIndex].displayOrder = temp

        // Swap items
        ;[updated[draggedIndex], updated[targetIndex]] = [updated[targetIndex], updated[draggedIndex]]

        try {
          await savePOSItems(updated)
        } catch (error) {
          console.error('Failed to reorder items:', error)
          alert('Failed to reorder items')
        }
      }
    }
    
    setDraggedItemId(null)
    setDragOverItemId(null)
  }, [editMode, draggedItemId, dragOverItemId, items])

  // Format cart item description
  const formatCartItem = (cartItem: POSCartItem): string => {
    const parts = [cartItem.item.name]
    if (cartItem.modifiers.length > 0) {
      // Group modifiers by category
      const modifiersByCategory = new Map<string, POSModifier[]>()
      cartItem.modifiers.forEach(mod => {
        const catId = mod.categoryId || 'uncategorized'
        if (!modifiersByCategory.has(catId)) {
          modifiersByCategory.set(catId, [])
        }
        modifiersByCategory.get(catId)!.push(mod)
      })
      
      const modifierParts: string[] = []
      modifiersByCategory.forEach((mods, catId) => {
        const category = categories.find(c => c.id === catId)
        const categoryName = category ? category.name : 'Modifiers'
        const modNames = mods.map(m => m.name).join(', ')
        modifierParts.push(`${categoryName}: ${modNames}`)
      })
      
      if (modifierParts.length > 0) {
        parts.push('+ ' + modifierParts.join(' | '))
      }
    }
    return parts.join(' ')
  }

  // Calculate individual cart item total
  const getCartItemTotal = (cartItem: POSCartItem): number => {
    const itemTotal = cartItem.item.price
    const modifiersTotal = cartItem.modifiers.reduce((m, mod) => m + mod.priceAdjustment, 0)
    return (itemTotal + modifiersTotal) * cartItem.quantity
  }

  // Reports View
  if (showReports) {
    return (
      <div className="pos-page">
        <header className="pos-header">
          <button className="pos-back-btn" onClick={() => setShowReports(false)}>
            ← Back
          </button>
          <h1 className="pos-title">Reports</h1>
          <button
            className="pos-report-today-btn"
            onClick={setReportDateToday}
          >
            Today
          </button>
        </header>

        <div className="pos-report-date-range">
          <div className="pos-report-date-inputs">
            <label className="pos-report-date-label">
              <span>From</span>
              <input
                type="date"
                className="pos-report-date-input"
                value={reportStartDate}
                onChange={(e) => setReportStartDate(e.target.value)}
              />
            </label>
            <label className="pos-report-date-label">
              <span>To</span>
              <input
                type="date"
                className="pos-report-date-input"
                value={reportEndDate}
                onChange={(e) => setReportEndDate(e.target.value)}
              />
            </label>
          </div>
          <div className="pos-report-quick-btns">
            <button onClick={setReportDateToday}>Today</button>
            <button onClick={setReportDateYesterday}>Yesterday</button>
            <button onClick={setReportDateThisWeek}>This Week</button>
            <button onClick={setReportDateAllTime}>All Time</button>
          </div>
        </div>

        <div className="pos-report-house-cash">
          <div className="pos-report-house-cash-label">HOUSE CASH</div>
          <div className="pos-report-house-cash-amount">{formatPrice(reportData.houseCash)}</div>
          <div className="pos-report-house-cash-hint">Collect this from drawer</div>
        </div>

        <div className="pos-report-metrics">
          <div className="pos-report-metric">
            <span className="pos-report-metric-label">Orders</span>
            <span className="pos-report-metric-value">{reportData.orderCount}</span>
          </div>
          <div className="pos-report-metric">
            <span className="pos-report-metric-label">Net Sales</span>
            <span className="pos-report-metric-value">{formatPrice(reportData.netSales)}</span>
          </div>
          <div className="pos-report-metric">
            <span className="pos-report-metric-label">Tax Collected</span>
            <span className="pos-report-metric-value">{formatPrice(reportData.taxCollected)}</span>
          </div>
          <div className="pos-report-divider" />
          <div className="pos-report-metric">
            <span className="pos-report-metric-label">Cash Received</span>
            <span className="pos-report-metric-value">{formatPrice(reportData.grossCashReceived)}</span>
          </div>
          <div className="pos-report-metric">
            <span className="pos-report-metric-label">Change Given</span>
            <span className="pos-report-metric-value pos-report-change">-{formatPrice(reportData.changeGiven)}</span>
          </div>
        </div>
      </div>
    )
  }

  // Order History View
  if (showOrders) {
    return (
      <div className="pos-page">
        <header className="pos-header">
          <button className="pos-back-btn" onClick={() => setShowOrders(false)}>
            ← Back
          </button>
          <h1 className="pos-title">Order History</h1>
          <div className="pos-header-actions">
            <button
              className="pos-report-btn"
              onClick={() => {
                setReportDateToday()
                setShowOrders(false)
                setShowReports(true)
              }}
            >
              Reports
            </button>
            <button className="pos-clear-btn" onClick={handleClearOrders}>
              Clear All
            </button>
          </div>
        </header>

        <div className="pos-daily-summary">
          <div className="pos-daily-stat">
            <span className="pos-daily-label">Today's Orders</span>
            <span className="pos-daily-value">{dailySummary.orderCount}</span>
          </div>
          <div className="pos-daily-stat">
            <span className="pos-daily-label">Today's Sales</span>
            <span className="pos-daily-value pos-daily-sales">{formatPrice(dailySummary.totalSales)}</span>
          </div>
        </div>

        <div className="pos-orders-list">
          {orders.length === 0 ? (
            <div className="pos-empty">No orders yet</div>
          ) : (
            [...orders].reverse().map((order) => (
              <div key={order.id} className="pos-order-card">
                <div className="pos-order-header">
                  <div className="pos-order-header-left">
                    <span className="pos-order-number">ORDER #{order.orderNumber}</span>
                    {order.orderType && (
                      <span className={`pos-order-type-badge pos-order-type-badge-${order.orderType}`}>
                        {order.orderType === 'dineIn' ? 'DINE IN' : 'TO GO'}
                      </span>
                    )}
                  </div>
                  <div className="pos-order-header-right">
                    <span className="pos-order-time">
                      {new Date(order.createdAt).toLocaleTimeString([], {
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </span>
                    <button
                      className="pos-order-delete-btn"
                      onClick={() => handleDeleteOrder(order.id)}
                      title="Delete order"
                    >
                      ×
                    </button>
                  </div>
                </div>
                <div className="pos-order-items">
                  {order.items.map((ci, idx) => (
                    <span key={idx}>
                      {ci.quantity}x {formatCartItem(ci)}
                      {idx < order.items.length - 1 ? ', ' : ''}
                    </span>
                  ))}
                </div>
                <div className="pos-order-totals">
                  <span>Subtotal: {formatPrice(order.subtotal)}</span>
                  <span>Tax: {formatPrice(order.tax)}</span>
                </div>
                <div className="pos-order-payment">
                  <span>Cash: {formatPrice(order.cashTendered || order.total)}</span>
                  <span>Change: {formatPrice(order.changeDue || 0)}</span>
                </div>
                <div className="pos-order-total">TOTAL: {formatPrice(order.total)}</div>
              </div>
            ))
          )}
        </div>
      </div>
    )
  }

  // Main POS View - Landscape two-column layout
  return (
    <div className="pos-page">
      <header className="pos-header">
        <button className="pos-back-btn" onClick={() => navigate('/')}>
          ← Back
        </button>
        <h1 className="pos-title">Cash Only POS</h1>
        <div className="pos-header-right">
          <span className="pos-header-summary">
            Today: {dailySummary.orderCount} orders · {formatPrice(dailySummary.totalSales)}
          </span>
          <button
            className="pos-report-btn"
            onClick={() => {
              setReportDateToday()
              setShowReports(true)
            }}
          >
            Reports
          </button>
          <button
            className={`pos-edit-btn ${editMode ? 'active' : ''}`}
            onClick={() => setEditMode(!editMode)}
          >
            {editMode ? 'Done' : 'Edit'}
          </button>
        </div>
      </header>

      <div className="pos-main-layout">
        {/* Left Column - Items and Modifiers */}
        <div className="pos-left-column">
          {/* Items Grid */}
          <section className="pos-items-section">
            <div className="pos-items-grid">
              {items.map((item) => (
                <div
                  key={item.id}
                  data-item-id={item.id}
                  className={`pos-item-wrapper ${draggedItemId === item.id ? 'dragging' : ''} ${dragOverItemId === item.id ? 'drag-over' : ''}`}
                  onTouchStart={(e) => handleItemTouchStart(e, item.id)}
                  onTouchMove={handleItemTouchMove}
                  onTouchEnd={handleItemTouchEnd}
                >
                  <button
                    className="pos-item-btn"
                    onClick={() => (editMode ? openEditItem(item) : openItemModifiers(item))}
                  >
                    <span className="pos-item-name">{item.name}</span>
                    <span className="pos-item-price">{formatPrice(item.price)}</span>
                    {editMode && (
                      <>
                        <div className="pos-item-categories">
                          {item.allowedCategoryIds.length > 0 ? (
                            categories
                              .filter(c => item.allowedCategoryIds.includes(c.id))
                              .map(c => (
                                <span key={c.id} className="pos-item-category-badge">
                                  {c.name}
                                </span>
                              ))
                          ) : (
                            <span className="pos-item-no-categories">No categories</span>
                          )}
                        </div>
                        <div className="pos-item-drag-handle" title="Drag to reorder">
                          ⋮⋮
                        </div>
                        <button
                          className="pos-item-delete"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteItem(item.id)
                          }}
                        >
                          ×
                        </button>
                      </>
                    )}
                  </button>
                </div>
              ))}
              {editMode && (
                <button
                  className="pos-item-btn pos-add-btn"
                  onClick={() => {
                    setNewItemName('')
                    setNewItemPrice('')
                    setNewItemCategoryIds(new Set())
                    setShowAddItem(true)
                  }}
                >
                  <span className="pos-add-icon">+</span>
                  <span className="pos-add-label">Add Item</span>
                </button>
              )}
              {!editMode && (
                <button
                  className="pos-item-btn pos-open-kitchen-btn"
                  onClick={() => {
                    setOpenKitchenName('')
                    setOpenKitchenPrice('')
                    setShowOpenKitchen(true)
                  }}
                >
                  <span className="pos-open-kitchen-icon">🍳</span>
                  <span className="pos-open-kitchen-label">Open Kitchen</span>
                </button>
              )}
            </div>
          </section>

          {/* Categories (Edit Mode Only) */}
          {editMode && (
            <section className="pos-categories-section">
              <div className="pos-categories-header">
                <span>MODIFIER CATEGORIES</span>
                <button
                  className="pos-add-category-btn"
                  onClick={() => {
                    setNewCategoryName('')
                    setNewCategorySingleSelect(false)
                    setShowAddCategory(true)
                  }}
                >
                  + Add Category
                </button>
              </div>
              <div className="pos-categories-list">
                {categories.map((category) => {
                  const categoryModifiers = modifiers.filter(m => m.categoryId === category.id)
                  return (
                    <div key={category.id} className="pos-category-item">
                      <div className="pos-category-header">
                        <span className="pos-category-name">
                          {category.name} ({category.singleSelect ? 'Single-select' : 'Multi-select'})
                        </span>
                        <div className="pos-category-actions">
                          <button
                            className="pos-category-move-btn"
                            onClick={() => handleMoveCategory(category.id, 'up')}
                            disabled={category.displayOrder === 0}
                          >
                            ↑
                          </button>
                          <button
                            className="pos-category-move-btn"
                            onClick={() => handleMoveCategory(category.id, 'down')}
                            disabled={category.displayOrder === categories.length - 1}
                          >
                            ↓
                          </button>
                          <button
                            className="pos-category-edit-btn"
                            onClick={() => openEditCategory(category)}
                          >
                            Edit
                          </button>
                          <button
                            className="pos-category-delete-btn"
                            onClick={() => handleDeleteCategory(category.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                      <div className="pos-category-modifiers">
                        {categoryModifiers.length === 0 ? (
                          <span className="pos-no-modifiers-in-category">No modifiers in this category</span>
                        ) : (
                          categoryModifiers.map((mod) => (
                            <span key={mod.id} className="pos-category-modifier">
                              {mod.name} {formatPriceAdjustment(mod.priceAdjustment)}
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                  )
                })}
                {categories.length === 0 && (
                  <span className="pos-no-categories">No categories - add one to organize modifiers</span>
                )}
              </div>
            </section>
          )}

          {/* Modifiers */}
          <section className="pos-modifiers-section">
            <div className="pos-modifiers-header">
              <span>MODIFIERS</span>
              {editMode && (
                <button
                  className="pos-add-modifier-btn"
                  onClick={() => {
                    setNewModifierName('')
                    setNewModifierPrice('')
                    setNewModifierCategoryId('')
                    setShowAddModifier(true)
                  }}
                >
                  + Add
                </button>
              )}
            </div>
            <div className="pos-modifiers-list">
              {editMode ? (
                // Edit mode: show grouped by category
                <>
                  {categories.map((category) => {
                    const categoryModifiers = modifiers
                      .filter(m => m.categoryId === category.id)
                      .sort((a, b) => a.displayOrder - b.displayOrder)
                    
                    if (categoryModifiers.length === 0) return null
                    
                    return (
                      <div key={category.id} className="pos-modifier-category-group">
                        <div className="pos-modifier-category-label">{category.name}</div>
                        {categoryModifiers.map((mod) => (
                          <button
                            key={mod.id}
                            className="pos-modifier-btn"
                            onClick={() => openEditModifier(mod)}
                          >
                            {mod.name} {formatPriceAdjustment(mod.priceAdjustment)}
                            <span
                              className="pos-modifier-delete"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDeleteModifier(mod.id)
                              }}
                            >
                              ×
                            </span>
                          </button>
                        ))}
                      </div>
                    )
                  })}
                  {/* Show modifiers with invalid/missing categories */}
                  {(() => {
                    const invalidModifiers = modifiers.filter(m => {
                      const catId = m.categoryId || ''
                      return !catId || !categories.find(c => c.id === catId)
                    })
                    if (invalidModifiers.length === 0) return null
                    return (
                      <div className="pos-modifier-category-group">
                        <div className="pos-modifier-category-label">Orphaned Modifiers</div>
                        {invalidModifiers.map((mod) => (
                          <button
                            key={mod.id}
                            className="pos-modifier-btn"
                            onClick={() => openEditModifier(mod)}
                          >
                            {mod.name} {formatPriceAdjustment(mod.priceAdjustment)}
                            <span
                              className="pos-modifier-delete"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDeleteModifier(mod.id)
                              }}
                            >
                              ×
                            </span>
                          </button>
                        ))}
                      </div>
                    )
                  })()}
                </>
              ) : (
                // Normal mode: modifiers are selected via item modal, not shown here
                <span className="pos-no-modifiers">Tap an item to select modifiers</span>
              )}
            </div>
          </section>
        </div>

        {/* Right Column - Cart and Totals */}
        <div className="pos-right-column">
          {/* Cart */}
          <section className="pos-cart-section">
            <div className="pos-cart-header">
              <span>CURRENT ORDER</span>
              {cart.length > 0 && (
                <button className="pos-clear-cart-btn" onClick={clearCart}>
                  Clear
                </button>
              )}
            </div>
            <div className="pos-cart-list">
              {cart.length === 0 ? (
                <div className="pos-cart-empty">Tap items to add to order</div>
              ) : (
                cart.map((cartItem) => (
                  <div key={cartItem.id} className="pos-cart-item">
                    <div className="pos-cart-item-qty">
                      <button onClick={() => updateQuantity(cartItem.id, -1)}>−</button>
                      <span>{cartItem.quantity}</span>
                      <button onClick={() => updateQuantity(cartItem.id, 1)}>+</button>
                    </div>
                    <div className="pos-cart-item-desc">{formatCartItem(cartItem)}</div>
                    <div className="pos-cart-item-price">{formatPrice(getCartItemTotal(cartItem))}</div>
                    <button className="pos-cart-item-remove" onClick={() => removeFromCart(cartItem.id)}>
                      ×
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Totals */}
          <section className="pos-totals-section">
            <div className="pos-totals-row">
              <span>Subtotal</span>
              <span>{formatPrice(subtotal)}</span>
            </div>
            <div className="pos-totals-row">
              <span>Tax (10%)</span>
              <span>{formatPrice(tax)}</span>
            </div>
            <div className="pos-totals-row pos-total">
              <span>TOTAL</span>
              <span>{formatPrice(total)}</span>
            </div>
          </section>

          {/* Actions */}
          <section className="pos-actions-section">
            <button
              className="pos-pay-btn"
              onClick={openCashPayment}
              disabled={cart.length === 0}
            >
              PAY CASH
            </button>
            <button className="pos-view-orders-btn" onClick={() => setShowOrders(true)}>
              Orders ({orders.length})
            </button>
          </section>
        </div>
      </div>

      {/* Item Modifier Selection Modal */}
      {showItemModifiers && selectedItemForModifiers && (
        <div className="pos-modal-backdrop" onClick={() => {
          setShowItemModifiers(false)
          setSelectedItemForModifiers(null)
          setSelectedModifiers(new Set())
        }}>
          <div className="pos-item-modifiers-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Select Modifiers: {selectedItemForModifiers.name}</h2>
            
            {(() => {
              const allowedCategories = categories.filter(c => 
                selectedItemForModifiers.allowedCategoryIds.includes(c.id)
              )
              
              if (allowedCategories.length === 0) {
                return (
                  <div className="pos-no-allowed-categories">
                    <p>No modifier categories assigned to this item.</p>
                    <p>Edit the item to assign categories.</p>
                  </div>
                )
              }
              
              return allowedCategories.map((category) => {
                const categoryModifiers = modifiers
                  .filter(m => m.categoryId === category.id)
                  .sort((a, b) => a.displayOrder - b.displayOrder)
                
                if (categoryModifiers.length === 0) return null
                
                return (
                  <div key={category.id} className="pos-modifier-category-selection">
                    <div className="pos-modifier-category-title">
                      {category.name} {category.singleSelect ? '(select one)' : '(select multiple)'}
                    </div>
                    <div className="pos-modifier-selection-list">
                      {categoryModifiers.map((mod) => {
                        const isSelected = selectedModifiers.has(mod.id)
                        return (
                          <button
                            key={mod.id}
                            className={`pos-modifier-selection-btn ${isSelected ? 'selected' : ''}`}
                            onClick={() => toggleModifier(mod.id)}
                          >
                            {category.singleSelect ? (
                              <span className="pos-modifier-radio">{isSelected ? '●' : '○'}</span>
                            ) : (
                              <span className="pos-modifier-checkbox">{isSelected ? '☑' : '☐'}</span>
                            )}
                            <span className="pos-modifier-selection-name">{mod.name}</span>
                            <span className="pos-modifier-selection-price">{formatPriceAdjustment(mod.priceAdjustment)}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })
            })()}
            
            <div className="pos-item-modifiers-actions">
              <button
                className="pos-cancel-btn"
                onClick={() => {
                  setShowItemModifiers(false)
                  setSelectedItemForModifiers(null)
                  setSelectedModifiers(new Set())
                }}
              >
                Cancel
              </button>
              <button
                className="pos-add-to-cart-btn"
                onClick={addToCart}
              >
                Add to Cart
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Order Type Selection Modal */}
      {showOrderTypeModal && (
        <div className="pos-modal-backdrop pos-order-type-backdrop">
          <div className="pos-order-type-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="pos-order-type-title">Select Order Type</h2>
            <div className="pos-order-type-buttons">
              <button
                className="pos-order-type-btn pos-order-type-dinein"
                onClick={() => {
                  setOrderType('dineIn')
                  setShowOrderTypeModal(false)
                }}
              >
                <span className="pos-order-type-icon">🍽️</span>
                <span className="pos-order-type-label">DINE IN</span>
              </button>
              <button
                className="pos-order-type-btn pos-order-type-togo"
                onClick={() => {
                  setOrderType('toGo')
                  setShowOrderTypeModal(false)
                }}
              >
                <span className="pos-order-type-icon">📦</span>
                <span className="pos-order-type-label">TO GO</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cash Payment Modal */}
      {showCashPayment && (
        <div className="pos-modal-backdrop" onClick={() => setShowCashPayment(false)}>
          <div className="pos-cash-modal" onClick={(e) => e.stopPropagation()}>
            <h2>PAY CASH</h2>
            
            <div className="pos-cash-total-due">
              <span>Total Due</span>
              <span className="pos-cash-amount">{formatPrice(total)}</span>
            </div>

            <div className="pos-cash-tendered">
              <span>Cash Tendered</span>
              <span className="pos-cash-amount">{formatPrice(cashTendered)}</span>
            </div>

            <div className="pos-cash-denominations">
              <button onClick={() => addCashDenomination(100)}>$1</button>
              <button onClick={() => addCashDenomination(500)}>$5</button>
              <button onClick={() => addCashDenomination(1000)}>$10</button>
              <button onClick={() => addCashDenomination(2000)}>$20</button>
              <button onClick={() => addCashDenomination(5000)}>$50</button>
              <button onClick={() => addCashDenomination(10000)}>$100</button>
            </div>

            <div className="pos-cash-quick-actions">
              <button className="pos-exact-btn" onClick={setExactCash}>
                EXACT CASH
              </button>
              <button className="pos-clear-cash-btn" onClick={clearCashTendered}>
                CLEAR
              </button>
            </div>

            <div className={`pos-cash-change ${changeDue >= 0 ? 'valid' : 'invalid'}`}>
              <span>Change Due</span>
              <span className="pos-change-amount">
                {changeDue >= 0 ? formatPrice(changeDue) : `(${formatPrice(Math.abs(changeDue))} short)`}
              </span>
            </div>

            <div className="pos-cash-actions">
              <button className="pos-cancel-btn" onClick={() => setShowCashPayment(false)}>
                Cancel
              </button>
              <button
                className="pos-complete-sale-btn"
                onClick={completeOrder}
                disabled={cashTendered < total}
              >
                Complete Sale
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Open Kitchen Modal */}
      {showOpenKitchen && (
        <div className="pos-modal-backdrop" onClick={() => setShowOpenKitchen(false)}>
          <div className="pos-modal pos-open-kitchen-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Open Kitchen</h2>
            <p className="pos-open-kitchen-desc">Create a one-time item for this order only</p>
            <input
              type="text"
              placeholder="Item name"
              value={openKitchenName}
              onChange={(e) => setOpenKitchenName(e.target.value)}
              autoFocus
            />
            <input
              type="number"
              placeholder="Price (e.g., 5.99)"
              value={openKitchenPrice}
              onChange={(e) => setOpenKitchenPrice(e.target.value)}
              step="0.01"
              min="0"
            />
            <div className="pos-modal-actions">
              <button onClick={() => setShowOpenKitchen(false)}>Cancel</button>
              <button
                className="pos-modal-primary"
                onClick={addOpenKitchenItem}
                disabled={!openKitchenName.trim() || !openKitchenPrice.trim()}
              >
                Add to Order
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Item Modal */}
      {showAddItem && (
        <div className="pos-modal-backdrop" onClick={() => {
          setShowAddItem(false)
          setNewItemCategoryIds(new Set())
        }}>
          <div className="pos-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Add Item</h2>
            <input
              type="text"
              placeholder="Item name"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              autoFocus
            />
            <input
              type="number"
              placeholder="Price (e.g., 5.99)"
              value={newItemPrice}
              onChange={(e) => setNewItemPrice(e.target.value)}
              step="0.01"
              min="0"
            />
            <div className="pos-modal-categories-section">
              <label>Available Modifier Categories:</label>
              <div className="pos-modal-categories-list">
                {categories.map((category) => (
                  <label key={category.id} className="pos-modal-category-checkbox">
                    <input
                      type="checkbox"
                      checked={newItemCategoryIds.has(category.id)}
                      onChange={(e) => {
                        const next = new Set(newItemCategoryIds)
                        if (e.target.checked) {
                          next.add(category.id)
                        } else {
                          next.delete(category.id)
                        }
                        setNewItemCategoryIds(next)
                      }}
                    />
                    <span>{category.name}</span>
                  </label>
                ))}
                {categories.length === 0 && (
                  <span className="pos-no-categories-hint">No categories yet - add categories first</span>
                )}
              </div>
            </div>
            <div className="pos-modal-actions">
              <button onClick={() => {
                setShowAddItem(false)
                setNewItemCategoryIds(new Set())
              }}>Cancel</button>
              <button className="primary" onClick={handleAddItem}>
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Item Modal */}
      {showEditItem && (
        <div className="pos-modal-backdrop" onClick={() => {
          setShowEditItem(null)
          setNewItemCategoryIds(new Set())
        }}>
          <div className="pos-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Edit Item</h2>
            <input
              type="text"
              placeholder="Item name"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              autoFocus
            />
            <input
              type="number"
              placeholder="Price (e.g., 5.99)"
              value={newItemPrice}
              onChange={(e) => setNewItemPrice(e.target.value)}
              step="0.01"
              min="0"
            />
            <div className="pos-modal-categories-section">
              <label>Available Modifier Categories:</label>
              <div className="pos-modal-categories-list">
                {categories.map((category) => (
                  <label key={category.id} className="pos-modal-category-checkbox">
                    <input
                      type="checkbox"
                      checked={newItemCategoryIds.has(category.id)}
                      onChange={(e) => {
                        const next = new Set(newItemCategoryIds)
                        if (e.target.checked) {
                          next.add(category.id)
                        } else {
                          next.delete(category.id)
                        }
                        setNewItemCategoryIds(next)
                      }}
                    />
                    <span>{category.name}</span>
                  </label>
                ))}
                {categories.length === 0 && (
                  <span className="pos-no-categories-hint">No categories yet - add categories first</span>
                )}
              </div>
            </div>
            <div className="pos-modal-actions">
              <button onClick={() => {
                setShowEditItem(null)
                setNewItemCategoryIds(new Set())
              }}>Cancel</button>
              <button className="primary" onClick={handleUpdateItem}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Modifier Modal */}
      {showAddModifier && (
        <div className="pos-modal-backdrop" onClick={() => {
          setShowAddModifier(false)
          setNewModifierCategoryId('')
        }}>
          <div className="pos-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Add Modifier</h2>
            <select
              value={newModifierCategoryId}
              onChange={(e) => setNewModifierCategoryId(e.target.value)}
              className="pos-modal-category-select"
            >
              <option value="">Select Category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Modifier name"
              value={newModifierName}
              onChange={(e) => setNewModifierName(e.target.value)}
              autoFocus
            />
            <input
              type="number"
              placeholder="Price adjustment (e.g., 1.00 or 0)"
              value={newModifierPrice}
              onChange={(e) => setNewModifierPrice(e.target.value)}
              step="0.01"
              min="0"
            />
            <div className="pos-modal-actions">
              <button onClick={() => {
                setShowAddModifier(false)
                setNewModifierCategoryId('')
              }}>Cancel</button>
              <button className="primary" onClick={handleAddModifier}>
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modifier Modal */}
      {showEditModifier && (
        <div className="pos-modal-backdrop" onClick={() => {
          setShowEditModifier(null)
          setNewModifierCategoryId('')
        }}>
          <div className="pos-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Edit Modifier</h2>
            <select
              value={newModifierCategoryId}
              onChange={(e) => setNewModifierCategoryId(e.target.value)}
              className="pos-modal-category-select"
            >
              <option value="">Select Category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Modifier name"
              value={newModifierName}
              onChange={(e) => setNewModifierName(e.target.value)}
              autoFocus
            />
            <input
              type="number"
              placeholder="Price adjustment (e.g., 1.00 or 0)"
              value={newModifierPrice}
              onChange={(e) => setNewModifierPrice(e.target.value)}
              step="0.01"
              min="0"
            />
            <div className="pos-modal-actions">
              <button onClick={() => {
                setShowEditModifier(null)
                setNewModifierCategoryId('')
              }}>Cancel</button>
              <button className="primary" onClick={handleUpdateModifier}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Category Modal */}
      {showAddCategory && (
        <div className="pos-modal-backdrop" onClick={() => {
          setShowAddCategory(false)
          setNewCategorySingleSelect(false)
        }}>
          <div className="pos-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Add Category</h2>
            <input
              type="text"
              placeholder="Category name (e.g., Size, Add-ons)"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              autoFocus
            />
            <label className="pos-modal-checkbox-label">
              <input
                type="checkbox"
                checked={newCategorySingleSelect}
                onChange={(e) => setNewCategorySingleSelect(e.target.checked)}
              />
              <span>Only allow one selection (single-select)</span>
            </label>
            <div className="pos-modal-actions">
              <button onClick={() => {
                setShowAddCategory(false)
                setNewCategorySingleSelect(false)
              }}>Cancel</button>
              <button className="primary" onClick={handleAddCategory}>
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Category Modal */}
      {showEditCategory && (
        <div className="pos-modal-backdrop" onClick={() => {
          setShowEditCategory(null)
          setNewCategorySingleSelect(false)
        }}>
          <div className="pos-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Edit Category</h2>
            <input
              type="text"
              placeholder="Category name"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              autoFocus
            />
            <label className="pos-modal-checkbox-label">
              <input
                type="checkbox"
                checked={newCategorySingleSelect}
                onChange={(e) => setNewCategorySingleSelect(e.target.checked)}
              />
              <span>Only allow one selection (single-select)</span>
            </label>
            <div className="pos-modal-actions">
              <button onClick={() => {
                setShowEditCategory(null)
                setNewCategorySingleSelect(false)
              }}>Cancel</button>
              <button className="primary" onClick={handleUpdateCategory}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
