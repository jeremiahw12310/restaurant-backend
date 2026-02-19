import { useState, useCallback, useRef, useEffect } from 'react'
import './SendToPrintPage.css'
import { storage } from '../../firebase'
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage'
import { createPrintRequest, subscribeToPrintRequestForAdmin, cancelPrintRequest, type PrintRequestDoc } from '../../services/firestore'

function getFileType(file: File): 'pdf' | 'docx' | 'doc' {
  const name = file.name.toLowerCase()
  const type = file.type?.toLowerCase() || ''
  if (name.endsWith('.pdf') || type === 'application/pdf') return 'pdf'
  if (name.endsWith('.docx') || type.includes('openxmlformats')) return 'docx'
  if (name.endsWith('.doc') || type === 'application/msword') return 'doc'
  return 'pdf'
}

function formatPrintTime(iso: string): string {
  try {
    const d = new Date(iso)
    const today = new Date()
    const isToday = d.toDateString() === today.toDateString()
    if (isToday) {
      return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    }
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
  } catch {
    return ''
  }
}

export function SendToPrintPage() {
  const [message, setMessage] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [sending, setSending] = useState(false)
  const [currentPrintRequest, setCurrentPrintRequest] = useState<PrintRequestDoc | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [sendError, setSendError] = useState<string | null>(null)
  const [sendSuccess, setSendSuccess] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) {
      setFile(f)
      setSendSuccess(false)
    }
  }, [])

  const handleSend = useCallback(async () => {
    if (!file) {
      setSendError('Please select a file to send.')
      return
    }
    if (!storage) {
      setSendError('Storage not available')
      return
    }

    setSending(true)
    setSendError(null)
    setUploadProgress(0)

    try {
      const fileType = getFileType(file)
      const timestamp = Date.now()
      const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
      const storagePath = `printDocs/${timestamp}_${safeName}`
      const ref = storageRef(storage, storagePath)

      const task = uploadBytesResumable(ref, file, {
        contentType: file.type || (fileType === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
      })

      const downloadUrl = await new Promise<string>((resolve, reject) => {
        task.on(
          'state_changed',
          (snap) => {
            const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100)
            setUploadProgress(pct)
          },
          (err) => reject(err),
          async () => {
            try {
              const url = await getDownloadURL(task.snapshot.ref)
              resolve(url)
            } catch (err) {
              reject(err)
            }
          }
        )
      })

      await createPrintRequest(downloadUrl, message.trim() || 'Please print this document.', fileType)

      setFile(null)
      setMessage('')
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      setSendSuccess(true)
    } catch (err) {
      console.error('Failed to send print request:', err)
      setSendError('Failed to send. Please try again.')
    } finally {
      setSending(false)
      setUploadProgress(0)
    }
  }, [file, message])

  useEffect(() => {
    const unsub = subscribeToPrintRequestForAdmin((req) => setCurrentPrintRequest(req))
    return () => unsub?.()
  }, [])

  const handleCancel = useCallback(async () => {
    setCancelling(true)
    try {
      await cancelPrintRequest()
    } catch (err) {
      console.error('Failed to cancel print request:', err)
    } finally {
      setCancelling(false)
    }
  }, [])

  const isPending = currentPrintRequest?.status === 'pending'

  return (
    <div className="send-to-print-page">
      <header className="admin-page-header">
        <h1>Send to Print</h1>
        <p>Send a PDF or Word document to the iPad. Staff will see a popup and can print via AirPrint.</p>
      </header>

      <div className="admin-card send-print-form-card">
        <h3 className="admin-card-title">
          <span>🖨️</span> Send Document
        </h3>

        <div className="send-print-form">
          <div className="send-print-form-field">
            <label className="admin-label">File (PDF or Word):</label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx"
              onChange={handleFileSelect}
              disabled={sending}
              className="send-print-file-input"
            />
            {file && (
              <span className="send-print-file-name">{file.name}</span>
            )}
          </div>

          <div className="send-print-form-field">
            <label className="admin-label">Message (shown to staff):</label>
            <textarea
              className="admin-input send-print-message-input"
              placeholder="e.g. Please print and sign this form."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={sending}
              rows={3}
            />
          </div>

          <p className="send-print-hint">PDF is recommended for best print results on iPad.</p>

          {sendError && <div className="notif-error">{sendError}</div>}
          {sendSuccess && <div className="send-print-success">Document sent! The iPad will show the print popup.</div>}

          <button
            className="admin-btn admin-btn-primary send-print-send-btn"
            onClick={handleSend}
            disabled={sending || !file}
          >
            {sending ? `Uploading... ${uploadProgress}%` : 'Send to iPad'}
          </button>
        </div>
      </div>

      {/* Pending Print */}
      <div className="admin-card send-print-pending-card">
        <h3 className="admin-card-title">
          <span>⏳</span> Pending Print
        </h3>
        {isPending && currentPrintRequest ? (
          <div className="send-print-pending-content">
            <div className="send-print-pending-message">{currentPrintRequest.message}</div>
            <div className="send-print-pending-meta">
              {currentPrintRequest.fileType.toUpperCase()} · Sent {formatPrintTime(currentPrintRequest.createdAt)}
            </div>
            <button
              className="admin-btn send-print-cancel-btn"
              onClick={handleCancel}
              disabled={cancelling}
            >
              {cancelling ? 'Cancelling...' : 'Cancel'}
            </button>
          </div>
        ) : (
          <div className="send-print-empty">No pending print request</div>
        )}
      </div>

      {/* Recently Sent */}
      <div className="admin-card send-print-recent-card">
        <h3 className="admin-card-title">
          <span>📄</span> Recently Sent
        </h3>
        {currentPrintRequest ? (
          <div className={`send-print-recent-content send-print-recent-${currentPrintRequest.status}`}>
            <div className="send-print-recent-message">{currentPrintRequest.message}</div>
            <div className="send-print-recent-meta">
              {currentPrintRequest.fileType.toUpperCase()} · {formatPrintTime(currentPrintRequest.createdAt)}
            </div>
            <span className={`send-print-recent-status send-print-status-${currentPrintRequest.status}`}>
              {currentPrintRequest.status === 'pending' ? 'Pending on iPad' : 'Completed / Cancelled'}
            </span>
          </div>
        ) : (
          <div className="send-print-empty">No recent print requests</div>
        )}
      </div>
    </div>
  )
}

export default SendToPrintPage
