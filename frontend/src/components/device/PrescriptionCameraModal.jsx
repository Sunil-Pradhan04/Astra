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
} from 'lucide-react'
import { uploadPrescription, skipPrescription } from '../../api/deviceApi'

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

  const isModalOpen = isOpen !== undefined ? Boolean(isOpen) : true

  const [cameraActive, setCameraActive] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const [countdown, setCountdown] = useState(3)
  const [isCounting, setIsCounting] = useState(false)
  const [capturedBlob, setCapturedBlob] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)

  const [isUploading, setIsUploading] = useState(false)
  const [analysisStatus, setAnalysisStatus] = useState('')
  const [qualityRejection, setQualityRejection] = useState(null)

  const langKey = language?.key || 'english'

  // ── All multilingual UI content ────────────────────────────────────────
  const T = {
    title: {
      hindi: '📄 डॉक्टर का पर्चा / मेडिकल रिपोर्ट',
      odia: '📄 ଡାକ୍ତରଙ୍କ ପ୍ରେସକ୍ରିପସନ୍ / ମେଡିକାଲ ରିପୋର୍ଟ',
      english: '📄 Prescription / Medical Report',
    }[langKey] || '📄 Prescription / Medical Report',

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

    tipTitle: {
      hindi: '💡 ध्यान दें:',
      odia: '💡 ଧ୍ୟାନ ଦିଅନ୍ତୁ:',
      english: '💡 Tips:',
    }[langKey] || '💡 Tips:',

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
      hindi: 'पर्चे के बिना आगे बढ़ें',
      odia: 'ପ୍ରେସକ୍ରିପସନ ବିନା ଆଗକୁ ଯାନ୍ତୁ',
      english: 'Continue Without Document',
    }[langKey] || 'Continue Without Document',

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
  }

  // ── Start Camera ───────────────────────────────────────────────────────
  const startCamera = async () => {
    setCameraError('')
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
      }
      let stream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 960 } },
        })
      } catch (e1) {
        // Fallback for laptops / desktop webcams
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
        })
      }
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play().catch(e => console.warn('Video auto-play blocked:', e))
      }
      setCameraActive(true)
    } catch (err) {
      console.warn('Camera unavailable:', err)
      setCameraError('unavailable')
      setCameraActive(false)
    }
  }

  const stopCamera = () => {
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current)
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    setCameraActive(false)
    setIsCounting(false)
  }

  // ── 3-Second Countdown ─────────────────────────────────────────────────
  const startCountdown = () => {
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current)
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

  // ── Instant Capture ────────────────────────────────────────────────────
  const captureFrame = () => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current)
      setIsCounting(false)
    }
    if (!videoRef.current || !canvasRef.current) return
    const video = videoRef.current
    const canvas = canvasRef.current
    canvas.width = video.videoWidth || 1280
    canvas.height = video.videoHeight || 720
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(blob => {
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
    setAnalysisStatus('1/4 Checking image quality — sharpness, brightness, resolution…')

    const fd = new FormData()
    fd.append('session_id', sessionId)
    fd.append('patient_id', patientId)
    fd.append('file', blob, 'prescription.jpg')

    const t1 = setTimeout(() => setAnalysisStatus('2/4 MobileNetV3: Classifying printed vs handwritten…'), 1400)
    const t2 = setTimeout(() => setAnalysisStatus('3/4 PaddleOCR: Reading medical text & validating…'), 2800)
    const t3 = setTimeout(() => setAnalysisStatus('4/4 Sarvam AI: Extracting medications, dosages, vitals…'), 4500)

    try {
      const res = await uploadPrescription(fd)
      const data = res.data
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3)

      // Rejection only happens if backend explicitly returns success === false
      const isRejected = data.success === false || data.action_required === 'retake_photo'

      if (isRejected) {
        // Quality rejected → play audio, show reason, reset to live camera
        setQualityRejection(data.translated_message || data.message || 'Image was unclear. Please hold document steady and recapture.')
        setIsUploading(false)
        if (data.audio_base64 && playAudio) playAudio(data.audio_base64)
        setPreviewUrl(null)
        setCapturedBlob(null)
        startCamera()
      } else {
        stopCamera()
        setIsUploading(false)
        if (typeof onSuccess === 'function') {
          onSuccess(data)
        }
      }
    } catch (err) {
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3)
      const msg = err.response?.data?.detail || 'Could not analyze the document. Please retake the photo.'
      setQualityRejection(msg)
      setIsUploading(false)
      setPreviewUrl(null)
      setCapturedBlob(null)
      startCamera()
    }
  }

  // ── Skip ───────────────────────────────────────────────────────────────
  const handleSkip = async () => {
    stopCamera()
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
      startCamera()
    } else {
      stopCamera()
    }
    return () => stopCamera()
  }, [isModalOpen])

  if (!isModalOpen) return null

  const handleCloseModal = () => {
    stopCamera()
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
          <button className="rx-camera-close" onClick={handleCloseModal} disabled={isUploading} title="Close / Continue without document">
            <X size={18} />
          </button>
        </div>

        {/* ── Step-by-step instruction strip ── */}
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

        {/* ── Viewport ── */}
        <div className="rx-camera-viewport-wrap">

          {/* Quality rejection banner */}
          {qualityRejection && (
            <div className="rx-quality-alert fade-in">
              <ShieldAlert size={20} color="#dc2626" />
              <div className="rx-quality-alert__text">
                <strong>{T.retakePrompt}</strong>
                <span>{qualityRejection}</span>
              </div>
            </div>
          )}

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

              {/* Corner guide icons */}
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
                <div className="rx-analyzing-overlay fade-in">
                  <div className="cp-spinner" style={{ width: 48, height: 48 }} />
                  <div className="rx-analyzing-text">
                    <h4>{T.analyzing}</h4>
                    <p>{analysisStatus}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          <canvas ref={canvasRef} style={{ display: 'none' }} />
        </div>

        {/* ── Footer Actions ── */}
        <div className="rx-camera-footer">

          {/* Left: Upload file */}
          <div className="rx-footer-left">
            <label className="rx-btn-text-link" title="Upload a file or gallery image">
              <Upload size={14} />
              <span>{T.uploadFile}</span>
              <input type="file" accept="image/*" onChange={handleFileUpload} style={{ display: 'none' }} disabled={isUploading} />
            </label>
          </div>

          {/* Center: Capture / retake controls */}
          <div className="rx-footer-center">
            {!previewUrl && cameraError !== 'unavailable' && (
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

            {previewUrl && !isUploading && (
              <button
                className="rx-btn-retake"
                onClick={() => { setPreviewUrl(null); setCapturedBlob(null); setQualityRejection(null); startCamera() }}
              >
                <RotateCcw size={14} />
                <span>{T.retake}</span>
              </button>
            )}
          </div>

          {/* Right: Skip */}
          <div className="rx-footer-right">
            <button className="rx-btn-skip" onClick={handleSkip} disabled={isUploading}>
              <span>{T.skipBtn}</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
