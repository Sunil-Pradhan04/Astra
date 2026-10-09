import { useState, useEffect, useRef } from 'react'
import {
  Camera,
  RotateCcw,
  Upload,
  X,
  AlertTriangle,
  Sparkles,
  Clock,
  ArrowRight,
  ShieldAlert,
  CheckCircle2,
  Info,
  FileImage,
  Lightbulb,
  ScanLine,
  HandMetal,
  ZoomIn,
  QrCode,
  Smartphone,
  ExternalLink,
  Zap,
} from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import {
  uploadPrescription,
  skipPrescription,
  createQRSession,
  getQRSessionStatus,
} from '../../api/deviceApi'
import OcrWorkflowTracker from '../common/OcrWorkflowTracker'

export default function PrescriptionCameraModal({
  isOpen,
  sessionId,
  patientId,
  language,
  onSuccess,
  onSkip,
  onClose,
  playAudio,
}) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const countdownIntervalRef = useRef(null)
  const pollIntervalRef = useRef(null)
  const timerIntervalRef = useRef(null)

  const isModalOpen = isOpen !== undefined ? Boolean(isOpen) : true

  // Mode: 'camera' | 'qr'
  const [activeMode, setActiveMode] = useState('camera')

  // Camera states
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const [countdown, setCountdown] = useState(3)
  const [isCounting, setIsCounting] = useState(false)
  const [capturedBlob, setCapturedBlob] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)

  const [isUploading, setIsUploading] = useState(false)
  const [analysisStatus, setAnalysisStatus] = useState('')
  const [currentOcrStep, setCurrentOcrStep] = useState(1)
  const [ocrStepMetrics, setOcrStepMetrics] = useState(null)
  const [qualityRejection, setQualityRejection] = useState(null)

  // QR Session states
  const [qrToken, setQrToken] = useState(null)
  const [qrUrl, setQrUrl] = useState('')
  const [qrExpiresIn, setQrExpiresIn] = useState(600)
  const [qrStatus, setQrStatus] = useState('idle') // 'idle' | 'loading' | 'waiting' | 'processing' | 'completed' | 'failed' | 'expired'
  const [qrError, setQrError] = useState('')

  const langKey = language?.key || 'english'

  // ── Multilingual UI Content ───────────────────────────────────────────
  const T = {
    title: {
      hindi: '📄 डॉक्टर का पर्चा / मेडिकल रिपोर्ट',
      odia: '📄 ଡାକ୍ତରଙ୍କ ପ୍ରେସକ୍ରିପସନ୍ / ମେଡିକାଲ ରିପୋର୍ଟ',
      english: '📄 Prescription / Medical Report',
    }[langKey] || '📄 Prescription / Medical Report',

    kioskCameraMode: {
      hindi: '📷 कियोस्क कैमरा',
      odia: '📷 କିଓସ୍କ କ୍ୟାମେରା',
      english: '📷 Kiosk Camera',
    }[langKey] || '📷 Kiosk Camera',

    uploadUsingQR: {
      hindi: '📲 फोन से QR अपलोड',
      odia: '📲 ଫୋନରୁ QR ଅପଲୋଡ୍',
      english: '📲 Upload Using QR Code',
    }[langKey] || '📲 Upload Using QR Code',

    howToTitle: {
      hindi: 'फोटो कैसे लें — निर्देश',
      odia: 'ଫଟୋ କିପରି ଉଠାଇବେ — ନିର୍ଦ୍ଦେଶ',
      english: 'How to Take the Photo — Instructions',
    }[langKey] || 'How to Take the Photo — Instructions',

    steps: {
      hindi: [
        '① पर्चे को समतल सतह पर रखें — मेज या किताब पर',
        '② कैमरे को पर्चे के ऊपर सीधा रखें ताकि पूरा कागज दिखे',
        '③ पर्चे पर अच्छी रोशनी (दिन की रोशनी या लाइट) होनी चाहिए',
        '④ कैमरे को हिलाएं नहीं — 3 सेकंड स्थिर रखें',
        '⑤ नीले बॉक्स के अंदर पूरा पर्चा आ जाए',
      ],
      odia: [
        '① ପ୍ରେସକ୍ରିପସନ୍ ସମତଳ ଜାଗାରେ ରଖନ୍ତୁ — ମେଜ ବା ବହି ଉପରେ',
        '② କ୍ୟାମେରାକୁ ପ୍ରେସକ୍ରିପସନ୍ ଉପରେ ସିଧା ରଖନ୍ତୁ ଯାହା ପୁରା କାଗଜ ଦେଖାଯିବ',
        '③ ଭଲ ଆଲୋକ (ଦିନ ଆଲୋକ ବା ଲ୍ୟାମ୍ପ) ଥିବା ଜାଗାରେ ରଖନ୍ତୁ',
        '④ କ୍ୟାମେରା ହଲାନ୍ତୁ ନାହିଁ — ୩ ସେକେଣ୍ଡ ସ୍ଥିର ରଖନ୍ତୁ',
        '⑤ ନୀଳ ବାକ୍ସ ଭିତରେ ପୁରା ପ୍ରେସକ୍ରିପସନ୍ ରଖନ୍ତୁ',
      ],
      english: [
        '① Place the document flat on a surface — a table or book',
        '② Hold the camera directly above so the entire paper is visible',
        '③ Ensure good lighting — near a window or under a lamp',
        '④ Keep the camera steady — do not move for 3 seconds',
        '⑤ Fit the entire prescription inside the blue guide box',
      ],
    }[langKey] || [],

    tips: {
      hindi: 'तस्वीर धुंधली न हो इसलिए हाथ स्थिर रखें। अगर तस्वीर सही नहीं आई तो सिस्टम दोबारा मांगेगा।',
      odia: 'ଫଟୋ ଅସ୍ପଷ୍ଟ ନ ହେଉ ଏଥିପାଇଁ ହାତ ସ୍ଥିର ରଖନ୍ତୁ। ଫଟୋ ଠିକ ନ ହେଲେ ସିଷ୍ଟମ ପୁଣି ଥରେ ଚାହିବ।',
      english: 'Keep your hand steady to avoid blur. If the photo is unclear, the system will ask you to retake it.',
    }[langKey] || '',

    alignLabel: {
      hindi: '← पर्चा यहाँ रखें →',
      odia: '← ପ୍ରେସକ୍ରିପସନ ଏଠାରେ ରଖନ୍ତୁ →',
      english: '← Align Document Here →',
    }[langKey] || '← Align Document Here →',

    capturingIn: {
      hindi: 'फोटो ली जा रही है:',
      odia: 'ଫଟୋ ଉଠାଯାଉଛି:',
      english: 'Capturing in:',
    }[langKey] || 'Capturing in:',

    takeNow: {
      hindi: '📸 अभी फोटो लें',
      odia: '📸 ଏବେ ଫଟୋ ଉଠାନ୍ତୁ',
      english: '📸 Take Photo Now',
    }[langKey] || '📸 Take Photo Now',

    timer3s: {
      hindi: '⏱ 3 सेकंड टाइमर',
      odia: '⏱ ୩ ସେ. ଟାଇମର',
      english: '⏱ 3-Second Timer',
    }[langKey] || '⏱ 3-Second Timer',

    retake: {
      hindi: '↺ दोबारा फोटो लें',
      odia: '↺ ପୁଣି ଫଟୋ ଉଠାନ୍ତୁ',
      english: '↺ Retake Photo',
    }[langKey] || '↺ Retake Photo',

    uploadFile: {
      hindi: '📁 फाइल / गैलरी से अपलोड करें',
      odia: '📁 ଫାଇଲ / ଗ୍ୟାଲେରୀରୁ ଅପଲୋଡ',
      english: '📁 Upload from Gallery / File',
    }[langKey] || '📁 Upload from Gallery / File',

    skipBtn: {
      hindi: 'पर्चे के बिना आगे बढ़ें (Go without report)',
      odia: 'ପ୍ରେସକ୍ରିପସନ ବିନା ଆଗକୁ ଯାନ୍ତୁ (Go without report)',
      english: 'Go Without Report (Skip)',
    }[langKey] || 'Go Without Report (Skip)',

    analyzing: {
      hindi: 'AI चिकित्सा जाँच हो रही है…',
      odia: 'AI ଚିକିତ୍ସା ପରୀକ୍ଷା ଚାଲୁ ଅଛି…',
      english: 'AI Medical Inspection in Progress…',
    }[langKey] || 'AI Medical Inspection in Progress…',

    retakePrompt: {
      hindi: '⚠️ तस्वीर साफ नहीं आई — कृपया दोबारा लें',
      odia: '⚠️ ଫଟୋ ସ୍ପଷ୍ଟ ନୁହେଁ — ଦୟାକରି ପୁଣି ଉଠାନ୍ତୁ',
      english: '⚠️ Photo not clear — Please retake',
    }[langKey] || '⚠️ Photo not clear — Please retake',

    noCameraTitle: {
      hindi: 'कैमरा उपलब्ध नहीं है',
      odia: 'କ୍ୟାମେରା ଉପଲବ୍ଧ ନୁହେଁ',
      english: 'Camera Not Available',
    }[langKey] || 'Camera Not Available',

    noCameraMsg: {
      hindi: 'अपने डिवाइस की गैलरी या फाइल से पर्चे की फोटो चुनें',
      odia: 'ଆପଣଙ୍କ ଡିଭାଇସ ଗ୍ୟାଲେରୀ ବା ଫାଇଲ ରୁ ପ୍ରେସକ୍ରିପସନ ଫଟୋ ବାଛନ୍ତୁ',
      english: 'Select a photo of the prescription from your device gallery or files',
    }[langKey] || 'Select a photo of the prescription from your device gallery or files',

    qrSubtitle: {
      hindi: 'मरीज़ अपने मोबाइल कैमरे से यह QR कोड स्कैन करके सीधे पर्चा अपलोड कर सकते हैं।',
      odia: 'ରୋଗୀ ନିଜ ମୋବାଇଲ୍ କ୍ୟାମେରାରେ ଏହି QR କୋଡ୍ ସ୍କାନ୍ କରି ସିଧାସଳଖ ରିପୋର୍ଟ ଅପଲୋଡ୍ କରିପାରିବେ।',
      english: 'Scan this QR code using your mobile phone camera. Both devices must be on the clinic Wi-Fi.',
    }[langKey] || 'Scan this QR code using your mobile phone camera. Both devices must be on the clinic Wi-Fi.',

    waitingForPhoneScan: {
      hindi: 'फोन से फोटो अपलोड होने की प्रतीक्षा में…',
      odia: 'ଫୋନରୁ ଫଟୋ ଅପଲୋଡ୍ ହେବାକୁ ଅପେକ୍ଷା…',
      english: 'Waiting for photo upload from phone…',
    }[langKey] || 'Waiting for photo upload from phone…',

    processingFromPhone: {
      hindi: 'फोन से फोटो मिल गई! AI द्वारा विश्लेषण जारी है…',
      odia: 'ଫୋନରୁ ଫଟୋ ମିଳିଲା! AI ବିଶ୍ଳେଷଣ ଚାଲିଛି…',
      english: 'Photo received from phone! Running AI clinical analysis…',
    }[langKey] || 'Photo received from phone! Running AI clinical analysis…',

    refreshQR: {
      hindi: 'नया QR कोड बनाएं',
      odia: 'ନୂଆ QR କୋଡ୍ ତିଆରି କରନ୍ତୁ',
      english: 'Generate New QR Code',
    }[langKey] || 'Generate New QR Code',

    backToCamera: {
      hindi: '📷 कियोस्क कैमरा',
      odia: '📷 କିଓସ୍କ କ୍ୟାମେରା',
      english: '📷 Kiosk Camera',
    }[langKey] || '📷 Kiosk Camera',
  }

  // Format timer mm:ss
  const formatTimer = (sec) => {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${m}:${s < 10 ? '0' : ''}${s}`
  }

  // ── Start Camera ───────────────────────────────────────────────────────
  const startCamera = async () => {
    setCameraError('')
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
      }
      let stream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 960 } },
        })
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true })
      }
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play().catch(() => {})
      }
      setCameraActive(true)
    } catch {
      setCameraError('unavailable')
      setCameraActive(false)
    }
  }

  // ── Stop Camera ────────────────────────────────────────────────────────
  const stopCamera = () => {
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current)
    setIsCounting(false)
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    setCameraActive(false)
  }

  // ── Initialize QR Upload Session ────────────────────────────────────────
  const initQRSession = async () => {
    stopCamera()
    setActiveMode('qr')
    setQrStatus('loading')
    setQrError('')

    try {
      const res = await createQRSession({
        session_id: sessionId,
        patient_id: patientId,
        client_host: window.location.hostname !== 'localhost' ? window.location.hostname : undefined,
      })

      if (res.data && res.data.token) {
        setQrToken(res.data.token)
        setQrUrl(res.data.qr_url)
        setQrExpiresIn(res.data.expires_in_seconds || 600)
        setQrStatus('waiting')
      } else {
        setQrStatus('failed')
        setQrError('Failed to generate upload session')
      }
    } catch (err) {
      setQrStatus('failed')
      setQrError(err.response?.data?.detail || 'Could not connect to backend to create QR session.')
    }
  }

  // ── Switch Back to Camera ──────────────────────────────────────────────
  const switchToCameraMode = () => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
    setActiveMode('camera')
    setQualityRejection(null)
    startCamera()
  }

  // ── Polling Hook for QR Upload Status ───────────────────────────────────
  useEffect(() => {
    if (activeMode !== 'qr' || !qrToken || qrStatus === 'completed') {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
      return
    }

    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await getQRSessionStatus(qrToken)
        const data = res.data

        if (data.status === 'processing') {
          setQrStatus('processing')
        } else if (data.status === 'completed') {
          setQrStatus('completed')
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
          setTimeout(() => {
            if (typeof onSuccess === 'function') {
              onSuccess(data.result)
            }
          }, 900)
        } else if (data.status === 'failed') {
          setQrStatus('failed')
          setQrError(data.message || 'The document photo was unclear or rejected by quality inspection.')
        } else if (data.status === 'expired') {
          setQrStatus('expired')
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
        }
      } catch {
        // Retry silently on next cycle
      }
    }, 2000)

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
    }
  }, [activeMode, qrToken, qrStatus, onSuccess])

  // ── QR Timer Countdown ─────────────────────────────────────────────────
  useEffect(() => {
    if (activeMode !== 'qr' || qrStatus !== 'waiting') {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
      return
    }

    timerIntervalRef.current = setInterval(() => {
      setQrExpiresIn((prev) => {
        if (prev <= 1) {
          if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
          setQrStatus('expired')
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
    }
  }, [activeMode, qrStatus])

  // ── 3-Second Auto Capture ──────────────────────────────────────────────
  const startCountdown = () => {
    if (isCounting || isUploading) return
    setCountdown(3)
    setIsCounting(true)
    let cur = 3
    countdownIntervalRef.current = setInterval(() => {
      cur -= 1
      setCountdown(cur)
      if (cur <= 0) {
        clearInterval(countdownIntervalRef.current)
        setIsCounting(false)
        captureFrame()
      }
    }, 1000)
  }

  // ── Capture Frame ──────────────────────────────────────────────────────
  const captureFrame = () => {
    if (!videoRef.current) return
    const v = videoRef.current
    const w = v.videoWidth || 1280
    const h = v.videoHeight || 960

    const canvas = canvasRef.current || document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    ctx.drawImage(v, 0, 0, w, h)

    canvas.toBlob((blob) => {
      if (!blob) return
      setCapturedBlob(blob)
      setPreviewUrl(URL.createObjectURL(blob))
      submitPhoto(blob)
    }, 'image/jpeg', 0.95)
  }

  // ── File Upload ────────────────────────────────────────────────────────
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    stopCamera()
    setCapturedBlob(file)
    setPreviewUrl(URL.createObjectURL(file))
    submitPhoto(file)
  }

  // ── Submit to Backend ──────────────────────────────────────────────────
  const submitPhoto = async (blob) => {
    if (!blob) return
    setIsUploading(true)
    setQualityRejection(null)
    setCurrentOcrStep(1)
    setOcrStepMetrics(null)
    setAnalysisStatus('Step 1/6: Cleaning image (adaptive contrast, binarization & noise reduction)…')

    const fd = new FormData()
    fd.append('session_id', sessionId)
    fd.append('patient_id', patientId)
    fd.append('file', blob, 'prescription.jpg')

    const t1 = setTimeout(() => {
      setCurrentOcrStep(2)
      setAnalysisStatus('Step 2/6: Detecting blur & unreadable image (Laplacian variance sharpness check)…')
    }, 800)

    const t2 = setTimeout(() => {
      setCurrentOcrStep(3)
      setAnalysisStatus('Step 3/6: Classifying printed text vs handwritten document (orthogonal stroke texture)…')
    }, 1800)

    const t3 = setTimeout(() => {
      setCurrentOcrStep(4)
      setAnalysisStatus('Step 4/6: Validating medical report layout & clinical keyword dictionary…')
    }, 2800)

    const t4 = setTimeout(() => {
      setCurrentOcrStep(5)
      setAnalysisStatus('Step 5/6: Extracting clinical data (PaddleOCR reading & Sarvam AI structuring)…')
    }, 4000)

    const t5 = setTimeout(() => {
      setCurrentOcrStep(6)
      setAnalysisStatus('Step 6/6: Storing document in database & attaching to patient triage dossier…')
    }, 5500)

    try {
      const res = await uploadPrescription(fd)
      const data = res.data
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
      clearTimeout(t4)
      clearTimeout(t5)

      const isRejected = data.success === false || data.action_required === 'retake_photo'

      if (isRejected) {
        setCurrentOcrStep(data.classification === 'handwritten' ? 3 : 2)
        setQualityRejection(data.translated_message || data.message || 'Image was unclear. Please hold document steady and recapture.')
        setIsUploading(false)
        if (data.audio_base64 && playAudio) playAudio(data.audio_base64)
        setPreviewUrl(null)
        setCapturedBlob(null)
        startCamera()
      } else {
        setCurrentOcrStep(7)
        if (data.ocr_data) {
          setOcrStepMetrics({
            blur_score: data.ocr_data.blur_score || 85,
            classification: data.ocr_data.classification || 'printed',
            is_medical: true,
            medications_count: Array.isArray(data.ocr_data.structured_data?.medications) ? data.ocr_data.structured_data.medications.length : 1,
            is_stored: true,
          })
        }
        stopCamera()
        setIsUploading(false)
        if (typeof onSuccess === 'function') {
          onSuccess(data)
        }
      }
    } catch (err) {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
      clearTimeout(t4)
      clearTimeout(t5)
      const msg = err.response?.data?.detail || 'Could not analyze the document. Please retake the photo.'
      setQualityRejection(msg)
      setCurrentOcrStep(2)
      setIsUploading(false)
      setPreviewUrl(null)
      setCapturedBlob(null)
      startCamera()
    }
  }

  // ── Skip ───────────────────────────────────────────────────────────────
  const handleSkip = async () => {
    stopCamera()
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
    setIsUploading(true)
    try {
      const fd = new FormData()
      fd.append('session_id', sessionId)
      fd.append('patient_id', patientId)
      const res = await skipPrescription(fd)
      onSkip(res.data)
    } catch {
      onSkip(null)
    } finally {
      setIsUploading(false)
    }
  }

  useEffect(() => {
    if (isModalOpen) {
      setQualityRejection(null)
      setPreviewUrl(null)
      setCapturedBlob(null)
      setActiveMode('camera')
      startCamera()
    } else {
      stopCamera()
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
    }
    return () => {
      stopCamera()
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
    }
  }, [isModalOpen])

  if (!isModalOpen) return null

  const handleCloseModal = () => {
    stopCamera()
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
    if (typeof onClose === 'function') {
      onClose()
    } else {
      handleSkip()
    }
  }

  return (
    <div className="cp-modal-backdrop fade-in" style={{ zIndex: 1200 }}>
      <div className="rx-camera-modal">

        {/* ── Header ── */}
        <div className="rx-camera-header">
          <div className="rx-camera-header__title">
            <div className="rx-camera-icon-badge">
              <Camera size={22} color="#2563eb" />
            </div>
            <div>
              <h3>{T.title}</h3>
              <p style={{ color: '#64748b', fontSize: '12px', margin: 0 }}>
                {langKey === 'hindi'
                  ? 'AI स्वतः दवाइयाँ, खुराक और रिपोर्ट पढ़ेगा'
                  : langKey === 'odia'
                  ? 'AI ନିଜେ ଔଷଧ, ଡୋଜ ଏବଂ ରିପୋର୍ଟ ପଢ଼ିବ'
                  : 'AI will automatically read medicines, dosages and findings'}
              </p>
            </div>
          </div>
          <button className="rx-camera-close" onClick={handleCloseModal} disabled={isUploading || qrStatus === 'processing'} title="Close / Continue without document">
            <X size={18} />
          </button>
        </div>

        {/* ── Mode Selection Tabs (Kiosk Camera vs Phone QR Upload) ── */}
        <div className="rx-mode-tabs">
          <button
            type="button"
            className={`rx-mode-tab ${activeMode === 'camera' ? 'rx-mode-tab--active' : ''}`}
            onClick={switchToCameraMode}
            disabled={isUploading || qrStatus === 'processing'}
          >
            <Camera size={15} />
            <span>{T.kioskCameraMode}</span>
          </button>
          <button
            type="button"
            className={`rx-mode-tab ${activeMode === 'qr' ? 'rx-mode-tab--active' : ''}`}
            onClick={initQRSession}
            disabled={isUploading || qrStatus === 'processing'}
          >
            <QrCode size={15} />
            <span>{T.uploadUsingQR}</span>
          </button>
        </div>

        {/* ── Step-by-step instruction strip (Camera Mode) ── */}
        {activeMode === 'camera' && (
          <div className="rx-instruction-strip">
            <div className="rx-instruction-strip__title">
              <Info size={14} />
              <span>{T.howToTitle}</span>
            </div>
            <ol className="rx-instruction-steps">
              {T.steps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
            <div className="rx-instruction-tip">
              <Lightbulb size={13} />
              <span>{T.tips}</span>
            </div>
          </div>
        )}

        {/* ── Viewport: Camera or QR Code ── */}
        <div className="rx-camera-viewport-wrap">

          {/* Quality rejection banner */}
          {qualityRejection && activeMode === 'camera' && (
            <div className="rx-quality-alert fade-in">
              <ShieldAlert size={20} color="#dc2626" />
              <div className="rx-quality-alert__text">
                <strong>{T.retakePrompt}</strong>
                <span>{qualityRejection}</span>
              </div>
            </div>
          )}

          {/* ──────── QR CODE MODE VIEWPORT ──────── */}
          {activeMode === 'qr' && (
            <div className="rx-qr-viewport fade-in">
              <div className="rx-qr-card">

                {/* Loading QR Session */}
                {qrStatus === 'loading' && (
                  <div className="rx-qr-loading">
                    <div className="cp-spinner" style={{ width: 44, height: 44 }} />
                    <p style={{ margin: 0, fontSize: '14px', color: '#64748b', fontWeight: '500' }}>
                      Generating secure Wi-Fi upload link…
                    </p>
                  </div>
                )}

                {/* QR Generation Failed */}
                {qrStatus === 'failed' && (
                  <div className="rx-qr-failed">
                    <AlertTriangle size={36} color="#dc2626" />
                    <h4 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#1e293b' }}>
                      Upload Session Issue
                    </h4>
                    <p style={{ margin: 0, fontSize: '13px', color: '#64748b', maxWidth: 380 }}>
                      {qrError || 'Could not connect to session. Ensure server is running.'}
                    </p>
                    <button
                      className="rx-btn-capture-primary"
                      onClick={initQRSession}
                      style={{ marginTop: 8 }}
                    >
                      <RotateCcw size={15} />
                      <span>{T.refreshQR}</span>
                    </button>
                  </div>
                )}

                {/* QR Session Expired */}
                {qrStatus === 'expired' && (
                  <div className="rx-qr-expired">
                    <Clock size={36} color="#eab308" />
                    <h4 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#1e293b' }}>
                      QR Code Expired
                    </h4>
                    <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                      This temporary upload session has timed out.
                    </p>
                    <button
                      className="rx-btn-capture-primary"
                      onClick={initQRSession}
                      style={{ marginTop: 8 }}
                    >
                      <RotateCcw size={15} />
                      <span>{T.refreshQR}</span>
                    </button>
                  </div>
                )}

                {/* QR Completed Successfully */}
                {qrStatus === 'completed' && (
                  <div className="rx-qr-success fade-in">
                    <CheckCircle2 size={48} color="#16a34a" />
                    <h4 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: '#15803d' }}>
                      Document Received!
                    </h4>
                    <p style={{ margin: 0, fontSize: '13px', color: '#475569' }}>
                      Prescription verified and attached to active case. Updating consultation…
                    </p>
                  </div>
                )}

                {/* Active QR View (Waiting or Processing) */}
                {(qrStatus === 'waiting' || qrStatus === 'processing') && (
                  <div className="rx-qr-content">
                    <div className="rx-qr-code-box">
                      <QRCodeSVG
                        value={qrUrl}
                        size={195}
                        level="M"
                        includeMargin={true}
                        style={{ borderRadius: 10, display: 'block' }}
                      />
                    </div>

                    <div className="rx-qr-details">
                      <div className="rx-qr-timer-badge">
                        <Clock size={13} color="#2563eb" />
                        <span>Valid for {formatTimer(qrExpiresIn)}</span>
                      </div>

                      {qrStatus === 'waiting' && (
                        <div className="rx-qr-status-indicator">
                          <span className="rx-qr-beacon" />
                          <span>{T.waitingForPhoneScan}</span>
                        </div>
                      )}

                      {qrStatus === 'processing' && (
                        <div className="rx-qr-status-indicator processing">
                          <div className="cp-spinner" style={{ width: 14, height: 14 }} />
                          <span>{T.processingFromPhone}</span>
                        </div>
                      )}

                      <p className="rx-qr-hint-text">
                        {T.qrSubtitle}
                      </p>

                      <a
                        href={qrUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rx-qr-test-link"
                      >
                        <ExternalLink size={12} />
                        <span>Open mobile upload page</span>
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ──────── CAMERA MODE VIEWPORT ──────── */}
          {activeMode === 'camera' && (
            <>
              {/* No camera — file upload fallback */}
              {cameraError === 'unavailable' && !previewUrl && (
                <div className="rx-camera-fallback">
                  <FileImage size={48} color="#94a3b8" />
                  <h4>{T.noCameraTitle}</h4>
                  <p>{T.noCameraMsg}</p>
                  <label className="rx-btn-file-select">
                    <Upload size={16} />
                    <span>{T.uploadFile}</span>
                    <input type="file" accept="image/*" onChange={handleFileUpload} style={{ display: 'none' }} />
                  </label>
                </div>
              )}

              {/* Live viewfinder */}
              {!previewUrl && cameraError !== 'unavailable' && (
                <div className="rx-viewfinder">
                  <video ref={videoRef} autoPlay playsInline muted className="rx-video-feed" />

                  {/* Guide overlay */}
                  <div className="rx-document-guide-box">
                    <div className="rx-corner rx-corner-tl" />
                    <div className="rx-corner rx-corner-tr" />
                    <div className="rx-corner rx-corner-bl" />
                    <div className="rx-corner rx-corner-br" />
                    <span className="rx-guide-label">{T.alignLabel}</span>
                  </div>

                  {/* Corner guide hint */}
                  <div className="rx-viewfinder-hint">
                    <ZoomIn size={13} />
                    <span>
                      {langKey === 'hindi'
                        ? 'पर्चे को नीले बॉक्स में फिट करें'
                        : langKey === 'odia'
                        ? 'ପ୍ରେସକ୍ରିପସନ ନୀଳ ବାକ୍ସ ଭିତରେ ରଖନ୍ତୁ'
                        : 'Fit prescription inside the blue guide box'}
                    </span>
                  </div>

                  {/* Countdown overlay */}
                  {isCounting && (
                    <div className="rx-countdown-overlay">
                      <span className="rx-countdown-sub">{T.capturingIn}</span>
                      <div className="rx-countdown-number">{countdown}</div>
                    </div>
                  )}
                </div>
              )}

              {/* Captured preview + analysis overlay */}
              {previewUrl && (
                <div className="rx-preview-wrap">
                  <img src={previewUrl} alt="Captured prescription" className="rx-preview-img" />
                  {isUploading && (
                    <div className="rx-analyzing-overlay fade-in" style={{ padding: 18 }}>
                      <div style={{ width: '100%', maxWidth: 640 }}>
                        <OcrWorkflowTracker
                          currentStepIndex={currentOcrStep}
                          isProcessing={true}
                          stepMetrics={ocrStepMetrics}
                          rejectionReason={qualityRejection}
                          onGoWithoutReport={handleSkip}
                          compact={true}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              <canvas ref={canvasRef} style={{ display: 'none' }} />
            </>
          )}

        </div>

        {/* ── 6-Stage OCR Pipeline Status Bar (Always visible in idle/camera/qr) ── */}
        {!isUploading && (
          <div style={{ padding: '10px 20px', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
            <OcrWorkflowTracker
              currentStepIndex={qualityRejection ? 2 : 1}
              isProcessing={false}
              rejectionReason={qualityRejection}
              onGoWithoutReport={handleSkip}
              compact={true}
            />
          </div>
        )}

        {/* ── Footer Actions ── */}
        <div className="rx-camera-footer">

          {/* Left: QR Option & File Upload */}
          <div className="rx-footer-left">
            {activeMode === 'camera' ? (
              <button
                type="button"
                className="rx-btn-text-link rx-btn-qr-link"
                onClick={initQRSession}
                disabled={isUploading}
                title="Upload using mobile phone QR code"
              >
                <QrCode size={15} color="#2563eb" />
                <span style={{ fontWeight: 700, color: '#2563eb' }}>{T.uploadUsingQR}</span>
              </button>
            ) : (
              <button
                type="button"
                className="rx-btn-text-link"
                onClick={switchToCameraMode}
                disabled={qrStatus === 'processing'}
                title="Back to kiosk camera"
              >
                <Camera size={15} />
                <span>{T.backToCamera}</span>
              </button>
            )}

            <label className="rx-btn-text-link" title="Upload a file or gallery image">
              <Upload size={14} />
              <span>{T.uploadFile}</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
                disabled={isUploading || qrStatus === 'processing'}
              />
            </label>
          </div>

          {/* Center: Capture controls (Camera) or Status (QR) */}
          <div className="rx-footer-center">
            {activeMode === 'camera' && !previewUrl && cameraError !== 'unavailable' && (
              <div className="rx-capture-actions">
                <button
                  className="rx-btn-capture-primary"
                  onClick={captureFrame}
                  disabled={isCounting || isUploading}
                  title="Capture instantly"
                >
                  <Camera size={17} />
                  <span>{T.takeNow}</span>
                </button>

                <button
                  className="rx-btn-timer-secondary"
                  onClick={startCountdown}
                  disabled={isCounting || isUploading}
                  title="3-second auto capture"
                >
                  <Clock size={14} />
                  <span>{T.timer3s}</span>
                </button>
              </div>
            )}

            {activeMode === 'camera' && previewUrl && !isUploading && (
              <button
                className="rx-btn-retake"
                onClick={() => {
                  setPreviewUrl(null)
                  setCapturedBlob(null)
                  setQualityRejection(null)
                  startCamera()
                }}
              >
                <RotateCcw size={14} />
                <span>{T.retake}</span>
              </button>
            )}

            {activeMode === 'qr' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {qrStatus === 'waiting' && (
                  <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '500' }}>
                    📱 {T.waitingForPhoneScan}
                  </span>
                )}
                {qrStatus === 'processing' && (
                  <span style={{ fontSize: '12px', color: '#d97706', fontWeight: '700' }}>
                    ⚡ {T.processingFromPhone}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Right: Go Without Report (Prominent Skip) */}
          <div className="rx-footer-right">
            <button
              className="rx-btn-skip"
              onClick={handleSkip}
              disabled={isUploading || qrStatus === 'processing'}
              style={{
                background: '#0f172a',
                color: '#ffffff',
                border: '1.5px solid #334155',
                padding: '9px 18px',
                borderRadius: 8,
                fontWeight: 800,
                boxShadow: '0 2px 6px rgba(0, 0, 0, 0.25)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
              title="Continue conversational triage without attaching a document"
              id="btn-modal-go-without-report"
            >
              <span>{T.skipBtn}</span>
              <ArrowRight size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
