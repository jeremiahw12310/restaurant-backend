import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  type POSItem,
  type POSModifier,
  type POSCartItem,
  type POSOrder,
  subscribeToPOSConfig,
  subscribeToPOSOrders,
  savePOSItems,
  savePOSModifiers,
  savePOSOrder,
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
  const [items, setItems] = useState<POSItem[]>([])
  const [modifiers, setModifiers] = useState<POSModifier[]>([])

  // Order state
  const [cart, setCart] = useState<POSCartItem[]>([])
  const [selectedModifiers, setSelectedModifiers] = useState<Set<string>>(new Set())
  const [orders, setOrders] = useState<POSOrder[]>([])
  const [nextOrderNumber, setNextOrderNumber] = useState(1)

  // UI state
  const [editMode, setEditMode] = useState(false)
  const [showOrders, setShowOrders] = useState(false)
  const [showAddItem, setShowAddItem] = useState(false)
  const [showAddModifier, setShowAddModifier] = useState(false)
  const [showEditItem, setShowEditItem] = useState<POSItem | null>(null)
  const [showEditModifier, setShowEditModifier] = useState<POSModifier | null>(null)
  const [showCashPayment, setShowCashPayment] = useState(false)
  const [cashTendered, setCashTendered] = useState(0) // in cents

  // Form state
  const [newItemName, setNewItemName] = useState('')
  const [newItemPrice, setNewItemPrice] = useState('')
  const [newModifierName, setNewModifierName] = useState('')
  const [newModifierPrice, setNewModifierPrice] = useState('')

  // Subscribe to config and orders
  useEffect(() => {
    const unsubConfig = subscribeToPOSConfig((config) => {
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

  // Add item to cart
  const addToCart = useCallback((item: POSItem) => {
    const activeModifiers = modifiers.filter((m) => selectedModifiers.has(m.id))

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
  }, [modifiers, selectedModifiers])

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

  // Clear cart
  const clearCart = useCallback(() => {
    setCart([])
    setSelectedModifiers(new Set())
  }, [])

  // Toggle modifier
  const toggleModifier = useCallback((modifierId: string) => {
    setSelectedModifiers((prev) => {
      const next = new Set(prev)
      if (next.has(modifierId)) {
        next.delete(modifierId)
      } else {
        next.add(modifierId)
      }
      return next
    })
  }, [])

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
  }, [cart, nextOrderNumber, cashTendered, clearCart])

  // Add new item
  const handleAddItem = useCallback(async () => {
    const name = newItemName.trim()
    const priceStr = newItemPrice.trim()
    if (!name || !priceStr) return

    const price = Math.round(parseFloat(priceStr) * 100)
    if (isNaN(price) || price < 0) return

    const newItem: POSItem = {
      id: generateId(),
      name,
      price,
    }

    try {
      await savePOSItems([...items, newItem])
      setNewItemName('')
      setNewItemPrice('')
      setShowAddItem(false)
    } catch (error) {
      console.error('Failed to add item:', error)
      alert('Failed to add item')
    }
  }, [items, newItemName, newItemPrice])

  // Update item
  const handleUpdateItem = useCallback(async () => {
    if (!showEditItem) return
    const name = newItemName.trim()
    const priceStr = newItemPrice.trim()
    if (!name || !priceStr) return

    const price = Math.round(parseFloat(priceStr) * 100)
    if (isNaN(price) || price < 0) return

    const updatedItems = items.map((item) =>
      item.id === showEditItem.id ? { ...item, name, price } : item
    )

    try {
      await savePOSItems(updatedItems)
      setNewItemName('')
      setNewItemPrice('')
      setShowEditItem(null)
    } catch (error) {
      console.error('Failed to update item:', error)
      alert('Failed to update item')
    }
  }, [items, showEditItem, newItemName, newItemPrice])

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

    const newModifier: POSModifier = {
      id: generateId(),
      name,
      priceAdjustment,
    }

    try {
      await savePOSModifiers([...modifiers, newModifier])
      setNewModifierName('')
      setNewModifierPrice('')
      setShowAddModifier(false)
    } catch (error) {
      console.error('Failed to add modifier:', error)
      alert('Failed to add modifier')
    }
  }, [modifiers, newModifierName, newModifierPrice])

  // Update modifier
  const handleUpdateModifier = useCallback(async () => {
    if (!showEditModifier) return
    const name = newModifierName.trim()
    const priceStr = newModifierPrice.trim()
    if (!name) return

    const priceAdjustment = priceStr ? Math.round(parseFloat(priceStr) * 100) : 0
    if (isNaN(priceAdjustment) || priceAdjustment < 0) return

    const updatedModifiers = modifiers.map((mod) =>
      mod.id === showEditModifier.id ? { ...mod, name, priceAdjustment } : mod
    )

    try {
      await savePOSModifiers(updatedModifiers)
      setNewModifierName('')
      setNewModifierPrice('')
      setShowEditModifier(null)
    } catch (error) {
      console.error('Failed to update modifier:', error)
      alert('Failed to update modifier')
    }
  }, [modifiers, showEditModifier, newModifierName, newModifierPrice])

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
    setShowEditItem(item)
  }

  // Open edit modifier modal
  const openEditModifier = (modifier: POSModifier) => {
    setNewModifierName(modifier.name)
    setNewModifierPrice((modifier.priceAdjustment / 100).toFixed(2))
    setShowEditModifier(modifier)
  }

  // Format cart item description
  const formatCartItem = (cartItem: POSCartItem): string => {
    const parts = [cartItem.item.name]
    if (cartItem.modifiers.length > 0) {
      parts.push('+ ' + cartItem.modifiers.map((m) => m.name).join(', '))
    }
    return parts.join(' ')
  }

  // Calculate individual cart item total
  const getCartItemTotal = (cartItem: POSCartItem): number => {
    const itemTotal = cartItem.item.price
    const modifiersTotal = cartItem.modifiers.reduce((m, mod) => m + mod.priceAdjustment, 0)
    return (itemTotal + modifiersTotal) * cartItem.quantity
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
          <button className="pos-clear-btn" onClick={handleClearOrders}>
            Clear All
          </button>
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
                  <span className="pos-order-number">ORDER #{order.orderNumber}</span>
                  <span className="pos-order-time">
                    {new Date(order.createdAt).toLocaleTimeString([], {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </span>
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
        <h1 className="pos-title">Quick POS</h1>
        <div className="pos-header-right">
          <span className="pos-header-summary">
            Today: {dailySummary.orderCount} orders · {formatPrice(dailySummary.totalSales)}
          </span>
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
                <button
                  key={item.id}
                  className="pos-item-btn"
                  onClick={() => (editMode ? openEditItem(item) : addToCart(item))}
                >
                  <span className="pos-item-name">{item.name}</span>
                  <span className="pos-item-price">{formatPrice(item.price)}</span>
                  {editMode && (
                    <button
                      className="pos-item-delete"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteItem(item.id)
                      }}
                    >
                      ×
                    </button>
                  )}
                </button>
              ))}
              {editMode && (
                <button
                  className="pos-item-btn pos-add-btn"
                  onClick={() => {
                    setNewItemName('')
                    setNewItemPrice('')
                    setShowAddItem(true)
                  }}
                >
                  <span className="pos-add-icon">+</span>
                  <span className="pos-add-label">Add Item</span>
                </button>
              )}
            </div>
          </section>

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
                    setShowAddModifier(true)
                  }}
                >
                  + Add
                </button>
              )}
            </div>
            <div className="pos-modifiers-list">
              {modifiers.map((mod) => (
                <button
                  key={mod.id}
                  className={`pos-modifier-btn ${selectedModifiers.has(mod.id) ? 'active' : ''}`}
                  onClick={() => (editMode ? openEditModifier(mod) : toggleModifier(mod.id))}
                >
                  {mod.name} {formatPriceAdjustment(mod.priceAdjustment)}
                  {editMode && (
                    <span
                      className="pos-modifier-delete"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteModifier(mod.id)
                      }}
                    >
                      ×
                    </span>
                  )}
                </button>
              ))}
              {modifiers.length === 0 && !editMode && (
                <span className="pos-no-modifiers">No modifiers - tap Edit to add</span>
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

      {/* Add Item Modal */}
      {showAddItem && (
        <div className="pos-modal-backdrop" onClick={() => setShowAddItem(false)}>
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
            <div className="pos-modal-actions">
              <button onClick={() => setShowAddItem(false)}>Cancel</button>
              <button className="primary" onClick={handleAddItem}>
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Item Modal */}
      {showEditItem && (
        <div className="pos-modal-backdrop" onClick={() => setShowEditItem(null)}>
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
            <div className="pos-modal-actions">
              <button onClick={() => setShowEditItem(null)}>Cancel</button>
              <button className="primary" onClick={handleUpdateItem}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Modifier Modal */}
      {showAddModifier && (
        <div className="pos-modal-backdrop" onClick={() => setShowAddModifier(false)}>
          <div className="pos-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Add Modifier</h2>
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
              <button onClick={() => setShowAddModifier(false)}>Cancel</button>
              <button className="primary" onClick={handleAddModifier}>
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modifier Modal */}
      {showEditModifier && (
        <div className="pos-modal-backdrop" onClick={() => setShowEditModifier(null)}>
          <div className="pos-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Edit Modifier</h2>
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
              <button onClick={() => setShowEditModifier(null)}>Cancel</button>
              <button className="primary" onClick={handleUpdateModifier}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
