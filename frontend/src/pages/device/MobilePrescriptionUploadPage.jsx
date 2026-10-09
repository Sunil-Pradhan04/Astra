import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Camera,
  Upload,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  FileText,
  ShieldCheck,
  Sparkles,
  Info,
  Clock,
  ArrowRight,
  RefreshCw,
  Image as ImageIcon,
} from 'lucide-react'
import { getQRMobileSession, submitQRMobileUpload } from '../../api/deviceApi'

export default function MobilePrescriptionUploadPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')

  const [loadingSession, setLoadingSession] = useState(true)
  const [sessionValid, setSessionValid] = useState(false)
  const [sessionData, setSessionData] = useState(null)
  const [errorMessage, setErrorMessage] = useState('')

  const [selectedFile, setSelectedFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [uploadSuccess, setUploadSuccess] = useState(false)
  const [processingStep, setProcessingStep] = useState('')
  const [rejectionReason, setRejectionReason] = useState('')

  const cameraInputRef = useRef(null)
  const galleryInputRef = useRef(null)

  // Verify session on mount
  useEffect(() => {
    if (!token) {
      setLoadingSession(false)
      setSessionValid(false)
      setErrorMessage('No upload token found. Please scan the QR code on the Astra kiosk screen.')
      return
    }

    const checkSession = async () => {
      try {
        setLoadingSession(true)
        const res = await getQRMobileSession(token)
        if (res.data && res.data.valid) {
          setSessionValid(true)
          setSessionData(res.data)
          if (res.data.has_completed) {
            setUploadSuccess(true)
          }
        } else {
          setSessionValid(false)
          setErrorMessage('This upload session has expired or is no longer valid. Please refresh the QR code on the kiosk.')
        }
      } catch (err) {
        setSessionValid(false)
        const msg = err.response?.data?.detail || 'Unable to connect to the session. Please ensure your phone is connected to the clinic Wi-Fi.'
        setErrorMessage(msg)
      } finally {
        setLoadingSession(false)
      }
    }

    checkSession()
  }, [token])

  // Handle file selection
  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setRejectionReason('')
    setSelectedFile(file)
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
  }

  // Clear current selection
  const handleResetSelection = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
    }
    setSelectedFile(null)
    setPreviewUrl(null)
    setRejectionReason('')
  }

  // Submit file to backend
  const handleSubmit = async () => {
    if (!selectedFile || !token) return

    setIsSubmitting(true)
    setRejectionReason('')
    setProcessingStep('1/3 Uploading document to Astra server…')

    const stepTimer1 = setTimeout(() => {
      setProcessingStep('2/3 Checking document sharpness & clinical content…')
    }, 1500)

    const stepTimer2 = setTimeout(() => {
      setProcessingStep('3/3 Reading medications, doses & clinical findings…')
    }, 3200)

    try {
      const formData = new FormData()
      formData.append('file', selectedFile, selectedFile.name || 'mobile_prescription.jpg')

      const res = await submitQRMobileUpload(token, formData)
      clearTimeout(stepTimer1)
      clearTimeout(stepTimer2)

      if (res.data && res.data.success) {
        setUploadSuccess(true)
        setIsSubmitting(false)
      } else {
        setIsSubmitting(false)
        const reason = res.data?.message || 'The document photo was unclear. Please retake the photo.'
        setRejectionReason(reason)
      }
    } catch (err) {
      clearTimeout(stepTimer1)
      clearTimeout(stepTimer2)
      setIsSubmitting(false)
      const msg = err.response?.data?.detail || err.response?.data?.message || 'Failed to upload photo. Please ensure Wi-Fi connection and try again.'
      setRejectionReason(msg)
    }
  }

  // Allow patient to submit another document
  const handleUploadAnother = () => {
    handleResetSelection()
    setUploadSuccess(false)
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f8fafc',
      color: '#0f172a',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      padding: '16px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
    }}>
      {/* Top Branding Header */}
      <header style={{
        width: '100%',
        maxWidth: '480px',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#ffffff',
        borderRadius: '16px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        marginBottom: '20px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            backgroundColor: '#eff6ff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#2563eb',
            fontWeight: 'bold',
          }}>
            <Sparkles size={20} />
          </div>
          <div>
            <h1 style={{ fontSize: '16px', fontWeight: '700', margin: 0, color: '#1e293b' }}>
              Astra Healthcare
            </h1>
            <p style={{ fontSize: '12px', margin: 0, color: '#64748b' }}>
              Secure Mobile Document Import
            </p>
          </div>
        </div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          fontSize: '11px',
          color: '#16a34a',
          backgroundColor: '#f0fdf4',
          padding: '4px 8px',
          borderRadius: '999px',
          fontWeight: '600',
        }}>
          <ShieldCheck size={13} />
          <span>Encrypted Session</span>
        </div>
      </header>

      {/* Main Content Area */}
      <main style={{ width: '100%', maxWidth: '480px' }}>

        {/* 1. Loading State */}
        {loadingSession && (
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '20px',
            padding: '40px 20px',
            textAlign: 'center',
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
          }}>
            <div style={{
              width: '40px',
              height: '40px',
              border: '3px solid #e2e8f0',
              borderTopColor: '#2563eb',
              borderRadius: '50%',
              margin: '0 auto 16px',
              animation: 'spin 0.8s linear infinite',
            }} />
            <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#334155', margin: 0 }}>
              Verifying upload session…
            </h2>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* 2. Invalid / Expired State */}
        {!loadingSession && !sessionValid && (
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '20px',
            padding: '32px 20px',
            textAlign: 'center',
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
          }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              backgroundColor: '#fef2f2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              color: '#dc2626',
            }}>
              <AlertTriangle size={28} />
            </div>
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', marginBottom: '8px' }}>
              Session Expired or Invalid
            </h2>
            <p style={{ fontSize: '14px', color: '#64748b', lineHeight: '1.5', marginBottom: '24px' }}>
              {errorMessage}
            </p>
            <div style={{
              backgroundColor: '#f8fafc',
              borderRadius: '12px',
              padding: '14px',
              fontSize: '13px',
              color: '#475569',
              textAlign: 'left',
              display: 'flex',
              gap: '10px',
              alignItems: 'flex-start',
            }}>
              <Info size={18} style={{ flexShrink: 0, marginTop: '2px', color: '#2563eb' }} />
              <span>
                Please look at the <strong>Astra Kiosk screen</strong> and click <strong>"Upload Using QR Code"</strong> again to generate a fresh QR code.
              </span>
            </div>
          </div>
        )}

        {/* 3. Success State */}
        {!loadingSession && sessionValid && uploadSuccess && (
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '20px',
            padding: '36px 20px',
            textAlign: 'center',
            boxShadow: '0 10px 15px -3px rgba(0,0,0,0.07)',
          }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              backgroundColor: '#ecfdf5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 18px',
              color: '#10b981',
            }}>
              <CheckCircle2 size={36} />
            </div>
            <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#065f46', marginBottom: '10px' }}>
              Document Uploaded!
            </h2>
            <p style={{ fontSize: '14px', color: '#334155', lineHeight: '1.6', marginBottom: '24px' }}>
              Your prescription / medical report has been received and analyzed by Astra AI. It is now linked to your consultation.
            </p>

            <div style={{
              backgroundColor: '#eff6ff',
              border: '1px solid #bfdbfe',
              borderRadius: '14px',
              padding: '16px',
              marginBottom: '24px',
              textAlign: 'left',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#1e40af', fontWeight: '700', fontSize: '14px', marginBottom: '4px' }}>
                <Sparkles size={16} />
                <span>Next Step</span>
              </div>
              <p style={{ margin: 0, fontSize: '13px', color: '#1e3a8a', lineHeight: '1.5' }}>
                Please look back at the <strong>Astra Kiosk screen</strong>. Your session is updating automatically without requiring a reload!
              </p>
            </div>

            <button
              onClick={handleUploadAnother}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '12px',
                backgroundColor: '#f1f5f9',
                color: '#334155',
                border: 'none',
                fontWeight: '600',
                fontSize: '14px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              <RotateCcw size={16} />
              <span>Upload Another Page / Report</span>
            </button>
          </div>
        )}

        {/* 4. Active Upload Form */}
        {!loadingSession && sessionValid && !uploadSuccess && (
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '20px',
            padding: '24px 20px',
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
          }}>
            <div style={{ marginBottom: '20px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '800', color: '#0f172a', margin: '0 0 6px' }}>
                Upload Prescription / Report
              </h2>
              <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
                Take a photo or choose an image from your device gallery.
              </p>
            </div>

            {/* Quality Rejection Alert */}
            {rejectionReason && (
              <div style={{
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '14px',
                padding: '14px',
                marginBottom: '18px',
                display: 'flex',
                gap: '10px',
                alignItems: 'flex-start',
              }}>
                <AlertTriangle size={20} style={{ color: '#dc2626', flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <strong style={{ display: 'block', fontSize: '13px', color: '#991b1b', marginBottom: '2px' }}>
                    Photo needs improvement:
                  </strong>
                  <span style={{ fontSize: '13px', color: '#b91c1c', lineHeight: '1.4' }}>
                    {rejectionReason}
                  </span>
                </div>
              </div>
            )}

            {/* Instruction Banner */}
            {!previewUrl && (
              <div style={{
                backgroundColor: '#f8fafc',
                borderRadius: '14px',
                padding: '14px 16px',
                marginBottom: '20px',
                border: '1px dashed #cbd5e1',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: '700', color: '#475569', marginBottom: '8px' }}>
                  <Info size={14} color="#2563eb" />
                  <span>Tips for best results:</span>
                </div>
                <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: '#64748b', lineHeight: '1.6' }}>
                  <li>Lay paper flat on a table under good lighting.</li>
                  <li>Ensure all doctor notes, dates, and medicine names are visible.</li>
                  <li>Hold phone steady to prevent blur.</li>
                </ul>
              </div>
            )}

            {/* Image Preview */}
            {previewUrl && (
              <div style={{ marginBottom: '20px' }}>
                <div style={{
                  position: 'relative',
                  width: '100%',
                  maxHeight: '340px',
                  borderRadius: '14px',
                  overflow: 'hidden',
                  backgroundColor: '#0f172a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                }}>
                  <img
                    src={previewUrl}
                    alt="Prescription preview"
                    style={{
                      maxWidth: '100%',
                      maxHeight: '340px',
                      objectFit: 'contain',
                    }}
                  />
                  {isSubmitting && (
                    <div style={{
                      position: 'absolute',
                      inset: 0,
                      backgroundColor: 'rgba(15, 23, 42, 0.82)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '20px',
                      textAlign: 'center',
                      color: '#ffffff',
                    }}>
                      <div style={{
                        width: '42px',
                        height: '42px',
                        border: '3px solid rgba(255,255,255,0.2)',
                        borderTopColor: '#38bdf8',
                        borderRadius: '50%',
                        animation: 'spin 0.8s linear infinite',
                        marginBottom: '16px',
                      }} />
                      <h4 style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: '700' }}>
                        Analyzing Document…
                      </h4>
                      <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>
                        {processingStep}
                      </p>
                    </div>
                  )}
                </div>

                {!isSubmitting && (
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: '10px',
                  }}>
                    <span style={{ fontSize: '12px', color: '#64748b' }}>
                      {selectedFile ? `${selectedFile.name} (${(selectedFile.size / 1024).toFixed(0)} KB)` : ''}
                    </span>
                    <button
                      onClick={handleResetSelection}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#ef4444',
                        fontSize: '12px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 8px',
                      }}
                    >
                      <RotateCcw size={13} />
                      <span>Retake / Change</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Hidden Input Elements */}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              ref={cameraInputRef}
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
            <input
              type="file"
              accept="image/*"
              ref={galleryInputRef}
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />

            {/* Action Buttons */}
            {!previewUrl ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <button
                  onClick={() => cameraInputRef.current?.click()}
                  style={{
                    width: '100%',
                    padding: '16px',
                    borderRadius: '14px',
                    backgroundColor: '#2563eb',
                    color: '#ffffff',
                    border: 'none',
                    fontWeight: '700',
                    fontSize: '15px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
                  }}
                >
                  <Camera size={20} />
                  <span>Take Photo with Camera</span>
                </button>

                <button
                  onClick={() => galleryInputRef.current?.click()}
                  style={{
                    width: '100%',
                    padding: '14px',
                    borderRadius: '14px',
                    backgroundColor: '#f1f5f9',
                    color: '#334155',
                    border: '1px solid #e2e8f0',
                    fontWeight: '600',
                    fontSize: '14px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                  }}
                >
                  <ImageIcon size={18} color="#64748b" />
                  <span>Choose from Gallery / Files</span>
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  style={{
                    width: '100%',
                    padding: '16px',
                    borderRadius: '14px',
                    backgroundColor: isSubmitting ? '#94a3b8' : '#16a34a',
                    color: '#ffffff',
                    border: 'none',
                    fontWeight: '700',
                    fontSize: '15px',
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    boxShadow: '0 4px 12px rgba(22, 163, 74, 0.25)',
                  }}
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw size={18} style={{ animation: 'spin 1s linear infinite' }} />
                      <span>Processing OCR…</span>
                    </>
                  ) : (
                    <>
                      <Upload size={18} />
                      <span>Confirm & Send to Kiosk</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}

      </main>

      {/* Footer Disclaimer */}
      <footer style={{
        marginTop: 'auto',
        paddingTop: '30px',
        paddingBottom: '16px',
        textAlign: 'center',
        fontSize: '11px',
        color: '#94a3b8',
        maxWidth: '480px',
      }}>
        <p style={{ margin: '0 0 4px' }}>
          🔒 End-to-end encrypted temporary link. Expires automatically after 10 minutes.
        </p>
        <p style={{ margin: 0 }}>
          Astra Telemedicine & Smart Healthcare Ecosystem
        </p>
      </footer>
    </div>
  )
}
