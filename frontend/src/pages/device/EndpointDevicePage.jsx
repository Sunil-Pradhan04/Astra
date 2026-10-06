import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Play,
  RotateCcw,
  AlertCircle,
  Clock,
  ArrowRight,
  Sparkles,
  Bot,
  User,
  ShieldCheck,
  Send,
  Radio,
  Cpu,
  Globe,
  RefreshCw,
  LogOut,
  ListOrdered,
  Activity,
  AlertTriangle,
  FileText,
  Pill,
  XCircle,
  Flame,
  ShieldAlert,
  Check,
  CheckCircle2,
  Camera,
  Eye,
} from 'lucide-react'
import {
  getQueuedPatientIds,
  startKioskSession,
  replyText,
  replyAudio,
  deviceHeartbeat,
  deviceLogout,
} from '../../api/deviceApi'
import PrescriptionCameraModal from '../../components/device/PrescriptionCameraModal'

const LANGUAGES = [
  {
    key: 'hindi',
    code: 'hi-IN',
    label: 'हिन्दी',
    sublabel: 'Hindi',
    greeting: 'नमस्ते! अपने स्वास्थ्य के बारे में बात करें।',
    flag: '🇮🇳',
  },
  {
    key: 'tamil',
    code: 'ta-IN',
    label: 'தமிழ்',
    sublabel: 'Tamil',
    greeting: 'வணக்கம்! உங்கள் உடல்நலம் குறித்து பேசுங்கள்.',
    flag: '🏛️',
  },
  {
    key: 'telugu',
    code: 'te-IN',
    label: 'తెలుగు',
    sublabel: 'Telugu',
    greeting: 'నమస్కారం! మీ ఆరోగ్యం గురించి మాట్లాడండి.',
    flag: '🌾',
  },
  {
    key: 'bengali',
    code: 'bn-IN',
    label: 'বাংলা',
    sublabel: 'Bengali',
    greeting: 'নমস্কার! আপনার স্বাস্থ্য সম্পর্কে বলুন।',
    flag: '🌊',
  },
  {
    key: 'malayalam',
    code: 'ml-IN',
    label: 'മലയാളം',
    sublabel: 'Malayalam',
    greeting: 'നമസ്കാരം! നിങ്ങളുടെ ആരോഗ്യത്തെക്കുറിച്ച് സംസാരിക്കൂ.',
    flag: '🌴',
  },
  {
    key: 'marathi',
    code: 'mr-IN',
    label: 'मराठी',
    sublabel: 'Marathi',
    greeting: 'नमस्कार! तुमच्या आरोग्याविषयी सांगा.',
    flag: '🚩',
  },
  {
    key: 'gujarati',
    code: 'gu-IN',
    label: 'ગુજરાતી',
    sublabel: 'Gujarati',
    greeting: 'નમસ્તે! તમારા સ્વાસ્થ્ય વિશે વાત કરો.',
    flag: '🦁',
  },
  {
    key: 'kannada',
    code: 'kn-IN',
    label: 'ಕನ್ನಡ',
    sublabel: 'Kannada',
    greeting: 'ನಮಸ್ಕಾರ! ನಿಮ್ಮ ಆರೋಗ್ಯದ ಬಗ್ಗೆ ತಿಳಿಸಿ.',
    flag: '🌿',
  },
  {
    key: 'punjabi',
    code: 'pa-IN',
    label: 'ਪੰਜਾਬੀ',
    sublabel: 'Punjabi',
    greeting: 'ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ! ਆਪਣੀ ਸਿਹਤ ਬਾਰੇ ਦੱਸੋ।',
    flag: '🌻',
  },
  {
    key: 'odia',
    code: 'od-IN',
    label: 'ଓଡ଼ିଆ',
    sublabel: 'Odia',
    greeting: 'ନମସ୍କାର! ଆପଣଙ୍କ ସ୍ୱାସ୍ଥ୍ୟ ବିଷୟରେ ଜଣାନ୍ତୁ।',
    flag: '🌺',
  },
  {
    key: 'english',
    code: 'en-IN',
    label: 'English',
    sublabel: 'English',
    greeting: 'Hello! Describe your health concerns.',
    flag: '🌐',
  },
]

export default function EndpointDevicePage() {
  const navigate = useNavigate()

  // Terminal Device Info
  const [deviceInfo, setDeviceInfo] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('device_info') || '{}')
    } catch {
      return {}
    }
  })

  // Workflow Stages: 1: 'select_patient' (Queue) | 2: 'language' | 3: 'interrogation' | 4: 'completed'
  const [stage, setStage] = useState('select_patient')
  const [selectedLanguage, setSelectedLanguage] = useState(LANGUAGES[0])

  // Patient Queue & Active Patient
  const [queuedIds, setQueuedIds] = useState([])
  const [loadingQueue, setLoadingQueue] = useState(false)
  const [activePatient, setActivePatient] = useState(null)
  const [activePatientId, setActivePatientId] = useState('')
  const [patientIdInput, setPatientIdInput] = useState('')

  // Interrogation State
  const [sessionId, setSessionId] = useState(null)
  const [currentQuestion, setCurrentQuestion] = useState('')
  const [currentIntent, setCurrentIntent] = useState('')
  const [questionsMemory, setQuestionsMemory] = useState([])
  const [conversationHistory, setConversationHistory] = useState([])
  const [textAnswer, setTextAnswer] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  // Audio Playback & TTS Engine Selection
  // 'local' = hexgrad/Kokoro-82M on-device (Zero Cloud Cost, DEFAULT) | 'sarvam' = Sarvam Indic Cloud API
  const [ttsEngine, setTtsEngine] = useState('local')
  const [activeEngineUsed, setActiveEngineUsed] = useState('local')
  const [isPlayingAudio, setIsPlayingAudio] = useState(false)
  const currentAudioRef = useRef(null)

  // Voice Recording
  const [isRecording, setIsRecording] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const timerRef = useRef(null)

  // Completion State
  const [completionData, setCompletionData] = useState(null)

  // Prescription / Document Scanning State
  const [showCameraModal, setShowCameraModal] = useState(false)
  const [isPrescriptionPromptActive, setIsPrescriptionPromptActive] = useState(false)
  const [previewModalImg, setPreviewModalImg] = useState(null)

  // ── Heartbeat ──────────────────────────────────────────────────────────
  useEffect(() => {
    deviceHeartbeat().catch(() => {})
    const interval = setInterval(() => {
      deviceHeartbeat().catch(() => {})
    }, 2 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  // ── Fetch Queued Patient IDs ──────────────────────────────────────────
  const fetchQueue = async () => {
    setLoadingQueue(true)
    try {
      const res = await getQueuedPatientIds()
      setQueuedIds(res.data || [])
    } catch (err) {
      console.error('Failed to load queued IDs:', err)
    } finally {
      setLoadingQueue(false)
    }
  }

  useEffect(() => {
    if (stage === 'select_patient') {
      fetchQueue()
      const interval = setInterval(fetchQueue, 3500)
      return () => clearInterval(interval)
    }
  }, [stage])

  // ── Audio Playback Helper ─────────────────────────────────────────────
  const playAudioBase64 = (base64Wav, onEndedCallback) => {
    if (!base64Wav) {
      if (typeof onEndedCallback === 'function') onEndedCallback()
      return
    }
    try {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause()
      }
      const audioUrl = `data:audio/wav;base64,${base64Wav}`
      const audio = new Audio(audioUrl)
      currentAudioRef.current = audio
      setIsPlayingAudio(true)

      audio.onended = () => {
        setIsPlayingAudio(false)
        if (typeof onEndedCallback === 'function') onEndedCallback()
      }
      audio.onerror = () => {
        setIsPlayingAudio(false)
        if (typeof onEndedCallback === 'function') onEndedCallback()
      }

      audio.play().catch(e => {
        console.warn('Audio auto-play blocked or failed:', e)
        setIsPlayingAudio(false)
        if (typeof onEndedCallback === 'function') onEndedCallback()
      })
    } catch (e) {
      console.error('Audio play error:', e)
      setIsPlayingAudio(false)
      if (typeof onEndedCallback === 'function') onEndedCallback()
    }
  }

  // ── Stage 1 (Queue) -> Stage 2 (Language Selection) ───────────────────
  const handleProceedToLanguage = (patientOrId) => {
    setErrorMsg('')
    if (typeof patientOrId === 'object' && patientOrId !== null) {
      setActivePatient(patientOrId)
      setActivePatientId(patientOrId.patient_id)
      setPatientIdInput(patientOrId.patient_id)
    } else {
      const pid = (patientOrId || patientIdInput || '').trim().toUpperCase()
      if (!pid) {
        setErrorMsg('Please select or enter a valid Patient ID / Token')
        return
      }
      const found = queuedIds.find(p => p.patient_id === pid)
      if (found) {
        setActivePatient(found)
      } else {
        setActivePatient({
          patient_id: pid,
          full_name: `Patient ${pid}`,
          age: '—',
          gender: '—',
          blood_group: null,
          chief_complaints: 'Patient token entered directly at terminal',
        })
      }
      setActivePatientId(pid)
    }
    setStage('language')
  }

  // ── Stage 2 (Language) -> Stage 3 (Interrogation): Start Session ──────
  const handleSelectLanguageAndStart = async (lang) => {
    setSelectedLanguage(lang)
    await handleStartSession(activePatientId, lang)
  }

  const handleStartSession = async (targetId, langChoice) => {
    const pid = (targetId || activePatientId || patientIdInput).trim().toUpperCase()
    if (!pid) {
      setErrorMsg('Please enter or select a valid Patient ID')
      return
    }

    const lang = langChoice || selectedLanguage
    setErrorMsg('')
    setIsProcessing(true)
    setActivePatientId(pid)

    try {
      const res = await startKioskSession({
        patient_id: pid,
        language: lang.key,
        tts_engine: ttsEngine,
      })

      const data = res.data
      setSessionId(data.session_id)
      setCurrentQuestion(data.current_question)
      setCurrentIntent(data.question_intent)
      setQuestionsMemory(data.questions_status || [])
      setActiveEngineUsed(data.tts_engine || ttsEngine)

      setConversationHistory([
        {
          role: 'ai',
          text: data.current_question,
          intent: data.question_intent,
          tts_engine: data.tts_engine || ttsEngine,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        }
      ])

      setStage('interrogation')

      if (data.audio_base64) {
        playAudioBase64(data.audio_base64)
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.detail || 'Failed to initialize interrogation session')
    } finally {
      setIsProcessing(false)
    }
  }

  // ── Send Patient Text Answer ──────────────────────────────────────────
  const handleSendText = async () => {
    if (!textAnswer.trim() || isProcessing) return
    const reply = textAnswer.trim()
    setTextAnswer('')
    setErrorMsg('')

    // Update conversation UI immediately
    setConversationHistory(prev => [
      ...prev,
      {
        role: 'patient',
        text: reply,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }
    ])

    setIsProcessing(true)
    try {
      const res = await replyText({
        session_id: sessionId,
        patient_id: activePatientId,
        answer_text: reply,
        tts_engine: ttsEngine,
      })

      handleProcessReplyResponse(res.data)
    } catch (err) {
      setErrorMsg(err.response?.data?.detail || 'Failed to process answer. Please retry.')
    } finally {
      setIsProcessing(false)
    }
  }

  // ── Voice Recording via MediaRecorder ─────────────────────────────────
  const startRecording = async () => {
    try {
      setErrorMsg('')
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      audioChunksRef.current = []

      // Pick supported webm/ogg mime type
      let mimeType = 'audio/webm;codecs=opus'
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : MediaRecorder.isTypeSupported('audio/ogg')
          ? 'audio/ogg'
          : ''
      }
      const options = mimeType ? { mimeType } : {}

      const mediaRecorder = new MediaRecorder(stream, options)
      mediaRecorderRef.current = mediaRecorder

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data)
        }
      }

      mediaRecorder.onstop = async () => {
        // Strip codec parameter (e.g. 'audio/webm;codecs=opus' -> 'audio/webm') so strict APIs accept it
        const rawMime = mediaRecorder.mimeType || 'audio/webm'
        const cleanMime = rawMime.split(';')[0].trim().toLowerCase() || 'audio/webm'
        const audioBlob = new Blob(audioChunksRef.current, { type: cleanMime })
        stream.getTracks().forEach(track => track.stop())
        if (audioBlob.size < 500) {
          setErrorMsg('Audio recording was too brief. Please hold the button while speaking or use text typing.')
          return
        }
        await submitVoiceAnswer(audioBlob)
      }

      // Collect data every 250ms for reliable chunk flushing
      mediaRecorder.start(250)
      setIsRecording(true)
      setRecordingSeconds(0)

      timerRef.current = setInterval(() => {
        setRecordingSeconds(prev => prev + 1)
      }, 1000)
    } catch (err) {
      setErrorMsg('Microphone access denied or unavailable. Please use text typing.')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      clearInterval(timerRef.current)
    }
  }

  const submitVoiceAnswer = async (audioBlob) => {
    setIsProcessing(true)
    setErrorMsg('')

    const formData = new FormData()
    formData.append('session_id', sessionId)
    formData.append('patient_id', activePatientId)
    formData.append('audio_file', audioBlob, 'patient_voice.webm')
    formData.append('tts_engine', ttsEngine)

    try {
      const res = await replyAudio(formData)
      const data = res.data

      // Add transcribed text to conversation
      if (data.transcribed_text) {
        setConversationHistory(prev => [
          ...prev,
          {
            role: 'patient',
            text: data.transcribed_text,
            is_voice: true,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          }
        ])
      }

      handleProcessReplyResponse(data)
    } catch (err) {
      setErrorMsg(err.response?.data?.detail || 'Could not transcribe voice. Please speak louder or type your answer.')
    } finally {
      setIsProcessing(false)
    }
  }

  // ── Handle AI Response Turn ───────────────────────────────────────────
  const handleProcessReplyResponse = (data) => {
    if (data.questions_status) {
      setQuestionsMemory(data.questions_status)
    }
    if (data.tts_engine) {
      setActiveEngineUsed(data.tts_engine)
    }

    const isRxPrompt = data.phase === 'phase_prescription_prompt' || data.is_prescription_prompt === true
    setIsPrescriptionPromptActive(isRxPrompt)

    // Camera opens automatically when backend detects patient said 'yes' to prescription prompt
    if (data.open_camera || data.phase === 'phase_prescription_camera') {
      setIsPrescriptionPromptActive(false)
      setShowCameraModal(true)
    }

    if (data.is_complete) {
      // Completed!
      setCompletionData(data)
      setStage('completed')
      setShowCameraModal(false)
      setIsPrescriptionPromptActive(false)

      setConversationHistory(prev => [
        ...prev,
        {
          role: 'ai',
          text: data.concluding_message,
          is_concluding: true,
          tts_engine: data.tts_engine || ttsEngine,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        }
      ])

      if (data.audio_base64) {
        playAudioBase64(data.audio_base64)
      }
    } else {
      // Next Question (or same question re-asked)
      setCurrentQuestion(data.current_question)
      setCurrentIntent(data.question_intent)

      setConversationHistory(prev => [
        ...prev,
        {
          role: 'ai',
          text: data.current_question,
          intent: data.question_intent,
          tts_engine: data.tts_engine || ttsEngine,
          is_repeat: data.repeat_requested === true,
          is_prescription_prompt: isRxPrompt,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        }
      ])

      if (data.audio_base64) {
        playAudioBase64(data.audio_base64, () => {
          if (isRxPrompt) {
            // Auto voice confirmation mode: agent starts listening
            startRecording()
          }
        })
      } else if (isRxPrompt) {
        setTimeout(() => startRecording(), 600)
      }
    }
  }

  // ── Handle Prescription Quick Confirmation (Voice / Button) ───────────
  const handlePrescriptionConfirmVoiceOrClick = async (hasPrescription) => {
    if (isRecording) {
      stopRecording()
    }
    setErrorMsg('')
    setIsProcessing(true)

    const reply = hasPrescription
      ? (selectedLanguage.key === 'hindi' ? 'हाँ, मेरे पास डॉक्टर का पर्चा है' : selectedLanguage.key === 'odia' ? 'ହଁ, ମୋ ପାଖରେ ପ୍ରେସକ୍ରିପସନ୍ ଅଛି' : 'Yes, I have a doctor prescription to show')
      : (selectedLanguage.key === 'hindi' ? 'नहीं, मेरे पास कोई पर्चा नहीं है' : selectedLanguage.key === 'odia' ? 'ନାହିଁ, କୌଣସି ପ୍ରେସକ୍ରିପସନ୍ ନାହିଁ' : 'No, I do not have any prescription')

    setConversationHistory(prev => [
      ...prev,
      {
        role: 'patient',
        text: reply,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }
    ])

    try {
      const res = await replyText({
        session_id: sessionId,
        patient_id: activePatientId,
        answer_text: reply,
        tts_engine: ttsEngine,
      })
      handleProcessReplyResponse(res.data)
    } catch (err) {
      setErrorMsg(err.response?.data?.detail || 'Failed to submit confirmation. Please retry.')
    } finally {
      setIsProcessing(false)
    }
  }

  // ── Skip Prescription (camera close with no upload) ────────────────────
  // Called when patient closes the camera modal without uploading
  const handleSkipPrescription = async (skipData) => {
    setShowCameraModal(false)
    setIsPrescriptionPromptActive(false)
    if (skipData) {
      // Backend already handled skip → finalize
      handleProcessReplyResponse(skipData)
    } else {
      // Send 'no' reply to backend to trigger final summary
      setIsProcessing(true)
      try {
        const noText = selectedLanguage.key === 'hindi'
          ? 'नहीं, मेरे पास कोई पर्चा नहीं है'
          : selectedLanguage.key === 'odia'
          ? 'ନାହିଁ, ମୋ ପାଖରେ କୌଣସି ପ୍ରେସକ୍ରିପସନ୍ ନାହିଁ'
          : 'No, I do not have any prescription'
        const res = await replyText({
          session_id: sessionId,
          patient_id: activePatientId,
          answer_text: noText,
          tts_engine: ttsEngine,
        })
        handleProcessReplyResponse(res.data)
      } catch (err) {
        setErrorMsg(err.response?.data?.detail || 'Failed to finalize session')
      } finally {
        setIsProcessing(false)
      }
    }
  }

  // ── Reset for Next Patient ────────────────────────────────────────────
  const handleNextPatient = () => {
    setStage('select_patient')
    setActivePatient(null)
    setActivePatientId('')
    setPatientIdInput('')
    setSessionId(null)
    setCurrentQuestion('')
    setQuestionsMemory([])
    setConversationHistory([])
    setCompletionData(null)
    setIsPrescriptionPromptActive(false)
    setShowCameraModal(false)
    setErrorMsg('')
    fetchQueue()
  }

  const handleExitTerminal = async () => {
    try {
      await deviceLogout()
    } catch {}
    localStorage.removeItem('device_token')
    localStorage.removeItem('device_info')
    navigate('/')
  }

  return (
    <div className="terminal-app">
      {/* ── Terminal Header Bar ── */}
      <header className="terminal-header">
        <div className="terminal-header__brand">
          <div className="terminal-logo-mark">A</div>
          <div>
            <h1 className="terminal-logo-title">Astra Endpoint Terminal</h1>
            <span className="terminal-logo-sub">Autonomous AI Clinical Interrogation Kiosk</span>
          </div>
        </div>

        <div className="terminal-header__meta">
          <div className="terminal-meta-pill">
            <Cpu size={13} className="text-blue-400" />
            <span>ID: {deviceInfo.device_id || 'DEV-KIOSK'}</span>
          </div>

          <div className="terminal-meta-pill">
            <Radio size={13} className="text-emerald-400 live-pulse-icon" />
            <span>Terminal Active · Online</span>
          </div>

          <div className="terminal-meta-pill">
            <Globe size={13} className="text-indigo-400" />
            <span>{selectedLanguage.label}</span>
          </div>

          {/* Model Switcher in Header */}
          <div className="terminal-tts-pill">
            <span className="tts-pill-label">Voice Model:</span>
            <div className="tts-pill-buttons">
              <button
                type="button"
                onClick={() => setTtsEngine('local')}
                className={`tts-pill-btn ${ttsEngine === 'local' ? 'active local' : ''}`}
                title="Local Kokoro 82M - Free / Offline"
              >
                <Cpu size={11} />
                <span>Local Kokoro</span>
                <span className="tts-badge-free">Default</span>
              </button>
              <button
                type="button"
                onClick={() => setTtsEngine('sarvam')}
                className={`tts-pill-btn ${ttsEngine === 'sarvam' ? 'active sarvam' : ''}`}
                title="Sarvam Indic Cloud API"
              >
                <Globe size={11} />
                <span>Sarvam Cloud</span>
              </button>
            </div>
          </div>

          <button
            onClick={handleExitTerminal}
            className="terminal-exit-btn"
            title="Exit Kiosk Mode"
          >
            <LogOut size={13} />
            <span>Exit Kiosk</span>
          </button>
        </div>
      </header>

      {/* ── Main Container ── */}
      <main className="terminal-body">
        {/* ── Stage 1: Patient Queue & Next Patient Arrival (First Screen) ── */}
        {stage === 'select_patient' && (
          <div className="terminal-card fade-in">
            <div className="terminal-card__badge bg-blue-subtle">
              <User size={24} color="#0f172a" />
            </div>
            <h2 className="terminal-card__title">Patient Triage Queue &amp; Arrival</h2>
            <p className="terminal-card__desc">
              Patients registered by the Reception desk appear here automatically. Verify the waiting patient's details below and click <strong>Next</strong> when they arrive at the kiosk.
            </p>

            {errorMsg && (
              <div className="terminal-error-banner">
                <AlertCircle size={15} />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Next Patient Highlight Hero Card with ALL Details */}
            {queuedIds.length > 0 ? (
              (() => {
                const nextP = queuedIds[0]
                const initials = (nextP.full_name || nextP.patient_id || 'P')
                  .split(' ')
                  .map(w => w[0])
                  .slice(0, 2)
                  .join('')
                  .toUpperCase()

                return (
                  <>
                    <div className="terminal-patient-profile-card">
                      <div className="patient-hero-header">
                        <span className="patient-hero-status-pill">
                          🟢 Next Patient In Queue
                        </span>
                        {nextP.created_at && (
                          <span className="patient-hero-time">
                            <Clock size={12} style={{ display: 'inline', marginRight: 4 }} />
                            Registered at {new Date(nextP.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>

                      {/* Patient Identity & Demographics */}
                      <div className="patient-hero-identity">
                        <div className="patient-hero-avatar">
                          {initials}
                        </div>
                        <div className="patient-hero-main-info">
                          <h3 className="patient-hero-name">
                            {nextP.full_name || `Patient ${nextP.patient_id}`}
                          </h3>
                          <div className="patient-hero-meta-row">
                            <span className="patient-hero-token-pill">Token: {nextP.patient_id}</span>
                            {(nextP.age || nextP.gender) && (
                              <span className="patient-hero-pill">
                                👤 {nextP.age ? `${nextP.age} Yrs` : ''} {nextP.gender ? `· ${nextP.gender}` : ''}
                              </span>
                            )}
                            {nextP.blood_group && (
                              <span className="patient-hero-pill">
                                🩸 {nextP.blood_group}
                              </span>
                            )}
                            {nextP.contact_number && (
                              <span className="patient-hero-pill">
                                📞 {nextP.contact_number}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Stated Symptoms / Chief Complaints from Reception */}
                      <div className="patient-hero-complaint-box">
                        <span className="patient-hero-complaint-label">
                          🩺 Reported Chief Complaints / Symptoms:
                        </span>
                        <p className="patient-hero-complaint-text">
                          "{nextP.chief_complaints || 'General checkup / Not specified at reception desk — detailed symptoms will be gathered by AI.'}"
                        </p>
                      </div>

                      {/* Physical Vitals (if recorded at reception desk) */}
                      {(nextP.bp_systolic || nextP.temperature_f || nextP.weight_kg || nextP.height_cm) && (
                        <div className="patient-hero-vitals-grid">
                          {nextP.bp_systolic && nextP.bp_diastolic && (
                            <div className="patient-vital-card">
                              <span className="patient-vital-title">Blood Pressure</span>
                              <span className="patient-vital-val">{nextP.bp_systolic}/{nextP.bp_diastolic} mmHg</span>
                            </div>
                          )}
                          {nextP.temperature_f && (
                            <div className="patient-vital-card">
                              <span className="patient-vital-title">Body Temp</span>
                              <span className="patient-vital-val">{nextP.temperature_f} °F</span>
                            </div>
                          )}
                          {nextP.weight_kg && (
                            <div className="patient-vital-card">
                              <span className="patient-vital-title">Weight</span>
                              <span className="patient-vital-val">{nextP.weight_kg} kg</span>
                            </div>
                          )}
                          {nextP.height_cm && (
                            <div className="patient-vital-card">
                              <span className="patient-vital-title">Height</span>
                              <span className="patient-vital-val">{nextP.height_cm} cm</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Proceed to Language Selection Action */}
                      <div className="patient-hero-actions">
                        <button
                          type="button"
                          onClick={() => handleProceedToLanguage(nextP)}
                          className="btn-patient-arrive-next"
                          disabled={isProcessing}
                        >
                          <span>Patient Arrived → Next: Select Language</span>
                          <ArrowRight size={18} />
                        </button>
                        <span className="patient-arrive-hint">
                          Click when the patient arrives at the terminal to pick their communication language
                        </span>
                      </div>
                    </div>

                    {/* Waiting queue tokens if more than 1 patient */}
                    {queuedIds.length > 1 && (
                      <div className="terminal-queue-section">
                        <div className="terminal-queue-header">
                          <span className="terminal-queue-title">All Waiting Patients in Queue ({queuedIds.length})</span>
                          <button onClick={fetchQueue} className="btn-refresh-sm" disabled={loadingQueue}>
                            <RefreshCw size={12} className={loadingQueue ? 'spin' : ''} />
                            <span>Refresh</span>
                          </button>
                        </div>

                        <div className="terminal-queue-grid">
                          {queuedIds.map(p => (
                            <button
                              key={p.patient_id}
                              onClick={() => handleProceedToLanguage(p)}
                              className="terminal-queue-id-card"
                              disabled={isProcessing}
                              style={{ textAlign: 'left' }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span className="queue-id-text">{p.patient_id}</span>
                                {p.blood_group && <span style={{ fontSize: 10, color: '#dc2626', fontWeight: 700 }}>{p.blood_group}</span>}
                              </div>
                              <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                                {p.full_name || `Patient ${p.patient_id}`}
                              </span>
                              {(p.age || p.gender) && (
                                <span style={{ fontSize: 11, color: '#64748b' }}>
                                  {p.age ? `${p.age} Yrs` : ''} {p.gender ? `· ${p.gender}` : ''}
                                </span>
                              )}
                              <span className="queue-id-action">Select &amp; Next →</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )
              })()
            ) : (
              <div className="terminal-queue-empty">
                <Clock size={28} style={{ margin: '0 auto 10px', color: '#64748b' }} />
                <p style={{ fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>
                  {loadingQueue ? 'Checking Reception Queue...' : 'Triage Queue Empty'}
                </p>
                <p style={{ margin: 0 }}>
                  Patients registered at the Reception desk will appear here automatically in real time.
                </p>
              </div>
            )}

            {/* Manual Patient ID entry fallback */}
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 8 }}>
                Or enter Patient ID / Token directly:
              </span>
              <form
                onSubmit={e => { e.preventDefault(); handleProceedToLanguage(patientIdInput) }}
                style={{ display: 'flex', gap: 10 }}
              >
                <input
                  type="text"
                  placeholder="e.g. ASTRA-001 or Patient ID..."
                  value={patientIdInput}
                  onChange={e => setPatientIdInput(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    borderRadius: 8,
                    border: '1.5px solid #cbd5e1',
                    fontSize: 14,
                    fontWeight: 600,
                    letterSpacing: '0.5px'
                  }}
                  disabled={isProcessing}
                />
                <button
                  type="submit"
                  disabled={!patientIdInput.trim() || isProcessing}
                  className="btn-terminal-action"
                  style={{ width: 'auto', padding: '10px 20px', margin: 0 }}
                >
                  <span>Next &rarr;</span>
                  <ArrowRight size={15} />
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ── Stage 2: Language Selection (Second Screen, when patient arrives) ── */}
        {stage === 'language' && (
          <div className="terminal-card fade-in">
            {/* Active Patient Summary Banner */}
            <div className="patient-active-session-banner">
              <div className="patient-active-left">
                <div className="terminal-card__badge" style={{ margin: 0, width: 36, height: 36, borderRadius: '50%' }}>
                  <User size={18} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="patient-active-name">{activePatient?.full_name || `Patient ${activePatientId}`}</span>
                    <span className="patient-active-badge">Token: {activePatientId}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                    {activePatient?.age ? `${activePatient.age} Yrs` : ''} {activePatient?.gender ? `· ${activePatient.gender}` : ''}
                    {activePatient?.blood_group ? ` · 🩸 ${activePatient.blood_group}` : ''}
                    {activePatient?.chief_complaints ? ` · Concern: "${activePatient.chief_complaints}"` : ''}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setStage('select_patient')}
                className="btn-refresh-sm"
                style={{ padding: '6px 12px', fontSize: 12 }}
              >
                &larr; Switch Patient
              </button>
            </div>

            <div className="terminal-card__badge">
              <Globe size={24} />
            </div>
            <h2 className="terminal-card__title">Choose Language / भाषा चुनें / ଭାଷା ବାଛନ୍ତୁ / மொழி தேர்வு</h2>
            <p className="terminal-card__desc">
              Please choose the language the patient is most comfortable speaking and listening to for the clinical triage interview.
            </p>

            <div className="terminal-lang-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))' }}>
              {LANGUAGES.map(lang => (
                <button
                  key={lang.key}
                  onClick={() => handleSelectLanguageAndStart(lang)}
                  className={`terminal-lang-card ${selectedLanguage.key === lang.key ? 'selected' : ''}`}
                  disabled={isProcessing}
                >
                  <span className="terminal-lang-flag">{lang.flag}</span>
                  <div className="terminal-lang-names">
                    <span className="terminal-lang-native" style={{ fontSize: 18, fontWeight: 700 }}>{lang.label}</span>
                    <span className="terminal-lang-en">{lang.sublabel}</span>
                  </div>
                  <span className="terminal-lang-greeting" style={{ fontSize: 11.5, color: '#64748b', lineHeight: 1.4 }}>
                    {lang.greeting}
                  </span>
                  <div style={{ marginTop: 'auto', paddingTop: 6, fontSize: 12, fontWeight: 600, color: '#2563eb' }}>
                    Select &amp; Start &rarr;
                  </div>
                </button>
              ))}
            </div>

            <div className="terminal-card-footer" style={{ marginTop: 24 }}>
              <button onClick={() => setStage('select_patient')} className="btn-terminal-back">
                &larr; Back to Patient Queue
              </button>
            </div>
          </div>
        )}

        {/* ── Stage 3: Live End-to-End Interrogation ── */}
        {stage === 'interrogation' && (
          <div className="terminal-interrogation-grid fade-in">
            
            {/* Left: Chat / Voice Interrogation Panel */}
            <div className="terminal-chat-panel">
              <div className="terminal-chat-panel__header">
                <div className="chat-patient-badge">
                  <User size={14} />
                  <span>
                    Patient: <strong>{activePatient?.full_name ? `${activePatient.full_name} (${activePatientId})` : activePatientId}</strong>
                  </span>
                </div>

                <div className="chat-lang-indicator">
                  <span>Language: <strong>{selectedLanguage.flag} {selectedLanguage.label} ({selectedLanguage.sublabel})</strong></span>
                </div>
              </div>

              {/* TTS Voice Model Switcher Bar on Asking Page */}
              <div className="terminal-asking-tts-bar">
                <div className="asking-tts-meta">
                  <div className="asking-tts-tagline">
                    <Sparkles size={13} className="text-blue-500" />
                    <span className="asking-tts-label">TTS Model Switcher:</span>
                    <span className={`asking-tts-status-pill ${ttsEngine === 'local' ? 'status-local' : 'status-cloud'}`}>
                      {ttsEngine === 'local' ? '⚡ Local Kokoro 82M (Default · Free)' : '☁️ Sarvam Indic Cloud API'}
                    </span>
                  </div>
                  <span className="asking-tts-hint">
                    {ttsEngine === 'local'
                      ? 'Local Kokoro runs directly on-device. Zero API cost & offline speech synthesis.'
                      : 'Sarvam Indic Cloud API converts text using cloud neural models.'}
                  </span>
                </div>

                <div className="asking-tts-controls">
                  <button
                    type="button"
                    onClick={() => setTtsEngine('local')}
                    className={`asking-tts-toggle-btn ${ttsEngine === 'local' ? 'active-local' : ''}`}
                    title="Switch to Local Kokoro 82M (Free/Offline)"
                  >
                    <Cpu size={14} />
                    <span className="asking-btn-text">Local (Kokoro 82M)</span>
                    <span className="asking-badge-free">Default</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTtsEngine('sarvam')}
                    className={`asking-tts-toggle-btn ${ttsEngine === 'sarvam' ? 'active-cloud' : ''}`}
                    title="Switch to Sarvam Indic Cloud API"
                  >
                    <Globe size={14} />
                    <span className="asking-btn-text">Sarvam Cloud API</span>
                    <span className="asking-badge-cloud">Cloud</span>
                  </button>
                </div>
              </div>

              {errorMsg && (
                <div className="terminal-error-banner" style={{ margin: '12px 16px 0' }}>
                  <AlertCircle size={15} />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Chat Thread */}
              <div className="terminal-chat-messages">
                {conversationHistory.map((msg, index) => (
                  <div
                    key={index}
                    className={`terminal-chat-bubble ${msg.role === 'ai' ? 'ai-bubble' : 'patient-bubble'}`}
                  >
                    <div className="bubble-header">
                      <div className="bubble-sender">
                        {msg.role === 'ai' ? <Bot size={14} /> : <User size={14} />}
                        <span>{msg.role === 'ai' ? 'Astra Clinical AI' : `Patient ${activePatientId}`}</span>
                        {msg.role === 'ai' && (
                          <span className={`bubble-engine-tag ${msg.tts_engine === 'sarvam' ? 'tag-sarvam' : 'tag-local'}`}>
                            {msg.tts_engine === 'sarvam' ? '☁️ Sarvam Cloud' : '⚡ Local Kokoro'}
                          </span>
                        )}
                      </div>
                      <span className="bubble-time">{msg.time}</span>
                    </div>

                    <p className="bubble-content">{msg.text}</p>

                    {msg.intent && (
                      <span className="bubble-intent">Clinical Focus: {msg.intent}</span>
                    )}

                    {msg.is_repeat && (
                      <span className="bubble-repeat-badge">
                        <RefreshCw size={11} />
                        Repeating — patient requested re-ask
                      </span>
                    )}

                    {msg.role === 'ai' && (
                      <button
                        onClick={() => playAudioBase64(msg.audio_base64 || null)}
                        className="bubble-listen-btn"
                        title="Replay Audio"
                      >
                        <Volume2 size={12} />
                        <span>Listen Again</span>
                      </button>
                    )}
                  </div>
                ))}

                {isProcessing && (
                  <div className="terminal-chat-bubble ai-bubble processing">
                    <div className="ai-thinking-indicator">
                      <Sparkles size={16} className="spin" />
                      <span>Sarvam Indic AI is reasoning over clinical history...</span>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Prescription Inquiry Accept UI & Agent Voice Confirmation Card ── */}
              {isPrescriptionPromptActive && (
                <div className="terminal-rx-accept-card fade-in">
                  <div className="rx-accept-card-top">
                    <div className="rx-accept-badge">
                      <Camera size={18} color="#2563eb" />
                      <span>
                        {selectedLanguage.key === 'hindi'
                          ? '📄 डॉक्टर का पर्चा / मेडिकल रिपोर्ट सत्यापन'
                          : selectedLanguage.key === 'odia'
                          ? '📄 ଡାକ୍ତରଙ୍କ ପ୍ରେସକ୍ରିପସନ୍ / ମେଡିକାଲ୍ ରିପୋର୍ଟ ଯାଞ୍ଚ'
                          : '📄 Medical Document & Prescription Check'}
                      </span>
                    </div>
                    <span className="rx-agent-confirm-pill">
                      <Sparkles size={12} />
                      {selectedLanguage.key === 'hindi'
                        ? 'एजेंट वॉइस पुष्टिकरण मोड'
                        : selectedLanguage.key === 'odia'
                        ? 'ଏଜେଣ୍ଟ ସ୍ୱର ନିଶ୍ଚିତକରଣ ମୋଡ୍'
                        : 'Agent Voice Confirmation Mode'}
                    </span>
                  </div>

                  <div className="rx-accept-question-box">
                    <p className="rx-accept-question-text">
                      "{currentQuestion}"
                    </p>
                    <div className="rx-accept-voice-status">
                      {isRecording ? (
                        <div className="rx-listening-active">
                          <span className="rx-pulse-dot" />
                          <Mic size={16} />
                          <span>
                            {selectedLanguage.key === 'hindi'
                              ? `🎙️ एजेंट सुन रहा है (${recordingSeconds}s)... 'हाँ' या 'नहीं' बोलें`
                              : selectedLanguage.key === 'odia'
                              ? `🎙️ ଏଜେଣ୍ଟ ଶୁଣୁଛନ୍ତି (${recordingSeconds}s)... 'ହଁ' ବା 'ନାହିଁ' କୁହନ୍ତୁ`
                              : `🎙️ Agent is listening (${recordingSeconds}s)... Say "Yes" or "No"`}
                          </span>
                        </div>
                      ) : (
                        <div className="rx-listening-prompt">
                          <Bot size={15} color="#2563eb" />
                          <span>
                            {selectedLanguage.key === 'hindi'
                              ? 'एजेंट आपकी आवाज से पुष्टि लेगा। माइक दबाकर बोलें या नीचे दिए विकल्प चुनें:'
                              : selectedLanguage.key === 'odia'
                              ? 'ଏଜେଣ୍ଟ ଆପଣଙ୍କ ସ୍ୱରରୁ ନିଶ୍ଚିତ କରିବେ। ମାଇକ୍ ଦବାଇ କୁହନ୍ତୁ ବା ବିକଳ୍ପ ବାଛନ୍ତୁ:'
                              : 'Agent accepts voice confirmation. Speak into the microphone or choose an option below:'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rx-accept-actions-grid">
                    <button
                      type="button"
                      onClick={() => handlePrescriptionConfirmVoiceOrClick(true)}
                      className="rx-btn-accept-yes"
                      disabled={isProcessing}
                    >
                      <CheckCircle2 size={18} />
                      <div className="rx-btn-accept-text">
                        <strong>
                          {selectedLanguage.key === 'hindi'
                            ? 'हाँ, मेरे पास पर्चा / रिपोर्ट है'
                            : selectedLanguage.key === 'odia'
                            ? 'ହଁ, ମୋ ପାଖରେ ପ୍ରେସକ୍ରିପସନ୍ ଅଛି'
                            : 'Yes, I have prescription / report'}
                        </strong>
                        <span>
                          {selectedLanguage.key === 'hindi'
                            ? '📸 कैमरा खोलें और स्कैन करें'
                            : selectedLanguage.key === 'odia'
                            ? '📸 କ୍ୟାମେରା ଖୋଲି ଫଟୋ ଉଠାନ୍ତୁ'
                            : '📸 Open camera & scan document'}
                        </span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => handlePrescriptionConfirmVoiceOrClick(false)}
                      className="rx-btn-accept-no"
                      disabled={isProcessing}
                    >
                      <XCircle size={18} />
                      <div className="rx-btn-accept-text">
                        <strong>
                          {selectedLanguage.key === 'hindi'
                            ? 'नहीं, कोई पर्चा नहीं है'
                            : selectedLanguage.key === 'odia'
                            ? 'ନାହିଁ, କୌଣସି ପ୍ରେସକ୍ରିପସନ୍ ନାହିଁ'
                            : 'No prescription / report'}
                        </strong>
                        <span>
                          {selectedLanguage.key === 'hindi'
                            ? 'बिना पर्चे के आगे बढ़ें →'
                            : selectedLanguage.key === 'odia'
                            ? 'ବିନା ପ୍ରେସକ୍ରିପସନରେ ଆଗକୁ ବଢ଼ନ୍ତୁ →'
                            : 'Continue without document →'}
                        </span>
                      </div>
                    </button>
                  </div>
                </div>
              )}

              {/* Voice & Text Input Controls */}
              <div className="terminal-chat-controls">

                {/* Voice Bar */}
                <div className="voice-control-bar">
                  {!isRecording ? (
                    <button
                      onClick={startRecording}
                      className="btn-mic-record"
                      disabled={isProcessing}
                    >
                      <Mic size={18} />
                      <span>Speak / Record Answer (Voice)</span>
                    </button>
                  ) : (
                    <button
                      onClick={stopRecording}
                      className="btn-mic-recording"
                    >
                      <MicOff size={18} />
                      <span className="recording-pulse-dot" />
                      <span>Recording... ({recordingSeconds}s) · Click when Done</span>
                    </button>
                  )}
                </div>

                {/* Text Fallback Bar */}
                <form
                  onSubmit={e => { e.preventDefault(); handleSendText() }}
                  className="text-input-bar"
                >
                  <input
                    type="text"
                    placeholder={`Type your reply in ${selectedLanguage.label} or English...`}
                    className="text-reply-input"
                    value={textAnswer}
                    onChange={e => setTextAnswer(e.target.value)}
                    disabled={isProcessing || isRecording}
                  />
                  <button
                    type="submit"
                    className="btn-send-reply"
                    disabled={!textAnswer.trim() || isProcessing || isRecording}
                  >
                    <Send size={15} />
                    <span>Send</span>
                  </button>
                </form>
              </div>
            </div>

            {/* Right: Live Session Memory & Decision Tracker */}
            <div className="terminal-memory-panel">
              <div className="terminal-memory-header">
                <ListOrdered size={16} />
                <h3 className="terminal-memory-title">Clinical Memory &amp; Thought Log</h3>
              </div>
              <p className="terminal-memory-sub">
                Temporary memory store (Redis) tracking questions with <code>asked</code> and <code>not_asked</code> status for dynamic clinical decisioning.
              </p>

              <div className="memory-questions-list">
                {questionsMemory.map((q, idx) => (
                  <div
                    key={q.id || idx}
                    className={`memory-question-item ${q.flag === 'asked' ? 'is-asked' : 'is-not-asked'}`}
                  >
                    <div className="memory-q-top">
                      <span className="memory-q-num">Q{q.id || idx + 1}</span>
                      <span className={`memory-q-flag ${q.flag}`}>
                        {q.flag === 'asked' ? 'Asked & Recorded' : 'Planned (Not Asked)'}
                      </span>
                    </div>

                    <div className="memory-q-intent">
                      <strong>Intent:</strong> {q.intent}
                    </div>

                    {q.flag === 'asked' && (
                      <div className="memory-q-status-note">
                        <CheckCircle2 size={11} color="#16a34a" />
                        <span>Included in LLM reasoning memory</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="memory-panel-footer">
                <div className="memory-protocol-note">
                  <Sparkles size={13} color="#2563eb" />
                  <span>
                    Primary questions 1 &amp; 2 initiate symptom discovery. Subsequent questions are formulated autonomously by Sarvam Indic LLM based on disclosed symptoms.
                  </span>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* ── Stage 4: Comprehensive Clinical Summary & Findings ── */}
        {stage === 'completed' && (() => {
          const summary = completionData?.ai_summary || {}
          const symptoms = Array.isArray(summary.symptoms) ? summary.symptoms : []
          const painSens = summary.pain_and_sensitivity || {}
          const ruledOut = Array.isArray(summary.ruled_out) ? summary.ruled_out : []
          const meds = summary.medications_and_history || {}
          const suspected = Array.isArray(summary.suspected_conditions) ? summary.suspected_conditions : []
          const ragCandidates = Array.isArray(completionData?.rag_candidates) ? completionData.rag_candidates : []
          const urgency = summary.triage_urgency || 'Routine'
          const urgencyLower = urgency.toLowerCase()
          const severity = summary.overall_severity || summary.severity || 'Moderate'
          const duration = summary.overall_duration || summary.onset_and_duration || 'Recent onset'
          const chief = summary.chief_complaints || 'Clinical findings gathered via autonomous AI interrogation.'
          const notes = summary.clinical_notes || ''
          const concludingMsg = completionData?.concluding_message || summary.concluding_message || ''

          return (
            <div className="terminal-card terminal-card--wide fade-in">
              <div className="terminal-card__badge bg-emerald-subtle">
                <CheckCircle2 size={32} color="#16a34a" />
              </div>
              <h2 className="terminal-card__title">Clinical Interrogation Complete</h2>
              <p className="terminal-card__desc">
                Patient <strong>{activePatient?.full_name ? `${activePatient.full_name} (${activePatientId})` : activePatientId}</strong> has completed the comprehensive AI diagnostic triage interrogation.
              </p>

              <div className="clinical-summary-container">
                {/* 1. KPI Metrics Grid */}
                <div className="summary-kpi-grid">
                  {/* Urgency */}
                  <div className={`summary-kpi-card urgency-${urgencyLower}`}>
                    <span className="summary-kpi-label">
                      <ShieldAlert size={13} />
                      Triage Urgency
                    </span>
                    <span className="summary-kpi-value">{urgency}</span>
                    <span className="summary-kpi-sub">
                      {summary.urgency_reason || 'Autonomous clinical classification'}
                    </span>
                  </div>

                  {/* Duration */}
                  <div className="summary-kpi-card">
                    <span className="summary-kpi-label">
                      <Clock size={13} />
                      Overall Timeline
                    </span>
                    <span className="summary-kpi-value">{duration}</span>
                    <span className="summary-kpi-sub">Onset to presentation</span>
                  </div>

                  {/* Pain & Sensitivity */}
                  <div className="summary-kpi-card kpi-sensitivity">
                    <span className="summary-kpi-label">
                      <Activity size={13} />
                      Pain &amp; Sensitivity Scale
                    </span>
                    <span className="summary-kpi-value">
                      {painSens.score || 'Profiled'}
                    </span>
                    <span className="summary-kpi-sub">
                      {painSens.intensity ? `${painSens.intensity} intensity` : 'Sensory response evaluated'}
                    </span>
                  </div>

                  {/* Overall Severity */}
                  <div className="summary-kpi-card">
                    <span className="summary-kpi-label">
                      <Flame size={13} />
                      Clinical Severity
                    </span>
                    <span className="summary-kpi-value">{severity}</span>
                    <span className="summary-kpi-sub">Diagnostic burden weight</span>
                  </div>
                </div>

                {/* 2. Chief Complaints & Presentation */}
                <div className="clinical-section-card">
                  <div className="clinical-section-header">
                    <h3 className="clinical-section-title">
                      <Bot size={16} />
                      Chief Complaints &amp; History of Presenting Illness
                    </h3>
                    <span className="clinical-section-badge">Verified by AI</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: '#1e293b' }}>
                    {chief}
                  </p>
                </div>

                {/* 3. Detailed Symptoms & Duration Breakdown Table */}
                <div className="clinical-section-card">
                  <div className="clinical-section-header">
                    <h3 className="clinical-section-title">
                      <Activity size={16} />
                      Symptoms, Duration &amp; Sensitivity Breakdown
                    </h3>
                    <span className="clinical-section-badge">
                      {symptoms.length > 0 ? `${symptoms.length} Symptoms Profiled` : 'Clinical Profile'}
                    </span>
                  </div>

                  <div className="symptoms-table-wrapper">
                    <table className="symptoms-clinical-table">
                      <thead>
                        <tr>
                          <th>Symptom &amp; Location</th>
                          <th>Specific Duration</th>
                          <th>Severity Level</th>
                          <th>Pattern &amp; Progression</th>
                          <th>Sensitivity &amp; Triggers</th>
                        </tr>
                      </thead>
                      <tbody>
                        {symptoms.length > 0 ? (
                          symptoms.map((s, idx) => {
                            const sevClass = (s.severity || '').toLowerCase().includes('sev')
                              ? 'severe'
                              : (s.severity || '').toLowerCase().includes('mod')
                              ? 'moderate'
                              : 'mild'

                            const cleanDuration = (s.duration && !/^(not|none|under|n\/a|unknown)/i.test(s.duration.trim())) ? s.duration.trim() : null
                            const cleanSeverity = (s.severity && !/^(not|none|n\/a|unknown)/i.test(s.severity.trim())) ? s.severity.trim() : null
                            const cleanPattern = (s.pattern && !/^(not|none|n\/a|unknown)/i.test(s.pattern.trim())) ? s.pattern.trim() : null
                            const cleanTriggers = (s.triggers && !/^(not|none|n\/a|unknown)/i.test(s.triggers.trim())) ? s.triggers.trim() : null
                            const correlation = s.report_correlation && !/^(not|none|n\/a)/i.test(s.report_correlation.trim()) ? s.report_correlation.trim() : null

                            return (
                              <tr key={idx}>
                                <td>
                                  <div className="symptom-name-cell">
                                    <span style={{ fontWeight: 600, color: '#0f172a' }}>{s.name || s.symptom || 'Symptom'}</span>
                                    {s.location && (
                                      <span className="symptom-loc-badge">📍 {s.location}</span>
                                    )}
                                    {correlation && (
                                      <div className="symptom-doc-evidence-callout" style={{
                                        marginTop: 6,
                                        padding: '5px 8px',
                                        background: '#eff6ff',
                                        border: '1px solid #bfdbfe',
                                        borderRadius: 6,
                                        fontSize: 11.5,
                                        color: '#1e40af',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 5
                                      }}>
                                        <FileText size={12} color="#2563eb" style={{ flexShrink: 0 }} />
                                        <span><strong>Document Corroboration:</strong> {correlation}</span>
                                      </div>
                                    )}
                                  </div>
                                </td>
                                <td>
                                  {cleanDuration ? (
                                    <span className="duration-pill">
                                      <Clock size={11} />
                                      {cleanDuration}
                                    </span>
                                  ) : (
                                    <span style={{ color: '#94a3b8', fontSize: 13 }}>—</span>
                                  )}
                                </td>
                                <td>
                                  {cleanSeverity ? (
                                    <span className={`severity-pill ${sevClass}`}>
                                      {cleanSeverity}
                                    </span>
                                  ) : (
                                    <span style={{ color: '#94a3b8', fontSize: 13 }}>—</span>
                                  )}
                                </td>
                                <td>
                                  {cleanPattern ? (
                                    <span style={{ fontSize: 12.5, color: '#475569' }}>
                                      {cleanPattern}
                                    </span>
                                  ) : (
                                    <span style={{ color: '#94a3b8', fontSize: 13 }}>—</span>
                                  )}
                                </td>
                                <td>
                                  {cleanTriggers ? (
                                    <span style={{ fontSize: 12.5, color: '#6b21a8', fontWeight: 500 }}>
                                      {cleanTriggers}
                                    </span>
                                  ) : (
                                    <span style={{ color: '#94a3b8', fontSize: 13 }}>—</span>
                                  )}
                                </td>
                              </tr>
                            )
                          })
                        ) : (
                          <tr>
                            <td colSpan={5} style={{ textAlign: 'center', padding: '16px', color: '#64748b' }}>
                              Detailed symptoms captured in narrative notes below.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 4. Sensitivity & Pain Spotlight Card */}
                {(painSens.sensitivity_triggers || painSens.score || painSens.intensity) && (
                  <div className="clinical-section-card">
                    <div className="clinical-section-header">
                      <h3 className="clinical-section-title">
                        <Flame size={16} color="#7e22ce" />
                        Pain Score &amp; Sensory Sensitivity Profile
                      </h3>
                      <span className="clinical-section-badge" style={{ background: '#f3e8ff', color: '#6b21a8' }}>
                        Neuro-Sensory Profile
                      </span>
                    </div>

                    <div className="sensitivity-spotlight">
                      <div className="sensitivity-metric-item">
                        <span className="sensitivity-metric-title">Reported Pain Score</span>
                        <span className="sensitivity-metric-val" style={{ fontSize: 16 }}>
                          {painSens.score ? `Score: ${painSens.score} (Scale 1–10)` : 'Not numerically rated'}
                        </span>
                      </div>

                      <div className="sensitivity-metric-item">
                        <span className="sensitivity-metric-title">Discomfort Intensity</span>
                        <span className="sensitivity-metric-val">
                          {painSens.intensity || severity}
                        </span>
                      </div>

                      <div className="sensitivity-metric-item" style={{ gridColumn: '1 / -1' }}>
                        <span className="sensitivity-metric-title">Hypersensitivity &amp; Trigger Factors</span>
                        <span className="sensitivity-metric-val">
                          {painSens.sensitivity_triggers || 'No specific photophobia, thermal, or kinetic hypersensitivities detected.'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* 5. Ruled-Out / Denied Symptoms */}
                {ruledOut.length > 0 && (
                  <div className="clinical-section-card">
                    <div className="clinical-section-header">
                      <h3 className="clinical-section-title">
                        <XCircle size={16} color="#dc2626" />
                        Ruled-Out Symptoms (Screened Negative by Patient)
                      </h3>
                      <span className="clinical-section-badge" style={{ background: '#fef2f2', color: '#991b1b' }}>
                        Differential Exclusion
                      </span>
                    </div>
                    <div className="ruled-out-container">
                      {ruledOut.map((r, idx) => (
                        <span key={idx} className="ruled-out-tag">
                          <XCircle size={12} className="ruled-out-tag-icon" />
                          <span>{typeof r === 'string' ? r : r.name || JSON.stringify(r)}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* 6. Medical History, Medications & Allergies */}
                {(meds.medications_taken || meds.chronic_conditions || meds.allergies) && (
                  <div className="clinical-section-card">
                    <div className="clinical-section-header">
                      <h3 className="clinical-section-title">
                        <Pill size={16} />
                        Medications Taken &amp; Chronic Medical History
                      </h3>
                    </div>
                    <div className="history-two-col">
                      <div className="history-card-item">
                        <strong>Medications Taken</strong>
                        <p>{meds.medications_taken || 'No medications reported by patient.'}</p>
                      </div>
                      <div className="history-card-item">
                        <strong>Chronic Health Conditions</strong>
                        <p>{meds.chronic_conditions || 'No prior chronic conditions declared.'}</p>
                      </div>
                      {meds.allergies && (
                        <div className="history-card-item" style={{ gridColumn: '1 / -1' }}>
                          <strong>Known Allergies</strong>
                          <p>{meds.allergies}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 7. Suspected Disease Differentials (RAG Vector Matches) */}
                {(suspected.length > 0 || ragCandidates.length > 0) && (
                  <div className="clinical-section-card">
                    <div className="clinical-section-header">
                      <h3 className="clinical-section-title">
                        <Sparkles size={16} color="#2563eb" />
                        Suspected Diagnostic Differentials (Vector Database Matching)
                      </h3>
                      <span className="clinical-section-badge">Pinecone RAG</span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                      {suspected.length > 0 ? (
                        suspected.map((cond, idx) => {
                          const condName = typeof cond === 'string' ? cond : cond.condition || cond.name || 'Condition'
                          const matchSym = typeof cond === 'object' && cond.matching_symptoms ? cond.matching_symptoms : ''
                          const conf = typeof cond === 'object' && cond.confidence ? cond.confidence : ''

                          return (
                            <div
                              key={idx}
                              style={{
                                background: '#f8fafc',
                                border: '1px solid #cbd5e1',
                                borderRadius: 8,
                                padding: '8px 12px',
                                flex: '1 1 240px'
                              }}
                            >
                              <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>
                                {condName}
                                {conf && (
                                  <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 600, color: '#2563eb', background: '#dbeafe', padding: '1px 5px', borderRadius: 4 }}>
                                    {conf}
                                  </span>
                                )}
                              </div>
                              {matchSym && (
                                <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 3 }}>
                                  Matches: {matchSym}
                                </div>
                              )}
                            </div>
                          )
                        })
                      ) : (
                        ragCandidates.slice(0, 4).map((cand, idx) => (
                          <div
                            key={idx}
                            style={{
                              background: '#f8fafc',
                              border: '1px solid #cbd5e1',
                              borderRadius: 8,
                              padding: '8px 12px',
                              flex: '1 1 200px'
                            }}
                          >
                            <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>
                              {cand.disease}
                              {cand.similarity_score && (
                                <span style={{ marginLeft: 6, fontSize: 10.5, color: '#2563eb' }}>
                                  ({Math.round(cand.similarity_score * 100)}% match)
                                </span>
                              )}
                            </div>
                            {cand.characteristic_symptoms && (
                              <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>
                                {cand.characteristic_symptoms}
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* 8. Doctor-Ready Clinical Consultation Notes */}
                {notes && (
                  <div className="clinical-section-card">
                    <div className="clinical-section-header">
                      <h3 className="clinical-section-title">
                        <FileText size={16} />
                        Doctor-Ready Clinical Consultation Notes
                      </h3>
                      <span className="clinical-section-badge">Confidential Medical Summary</span>
                    </div>
                    <div className="doctor-notes-callout">
                      {notes}
                    </div>
                  </div>
                )}

                {/* 8b. Medical Document / Prescription Analysis */}
                {(() => {
                  const rxRecord = completionData?.prescription || completionData?.prescription_record || summary.attached_prescription || summary.prescription_data || null
                  if (!rxRecord) return null
                  const isHandwritten = rxRecord.is_handwritten === true || rxRecord.classification === 'handwritten' || rxRecord.classification_label === 'handwritten'
                  const structured = rxRecord.structured_data || {}
                  const rawImg = rxRecord.image_url || rxRecord.file_url || rxRecord.cloudinary_url || structured.attached_image || structured.cloudinary_url
                  const fullImgSrc = rawImg ? (rawImg.startsWith('http') ? rawImg : `http://localhost:8000${rawImg}`) : null
                  const isCloudinary = fullImgSrc && fullImgSrc.includes('cloudinary.com')

                  const medsList = Array.isArray(structured.medications) ? structured.medications : []
                  const vitalsList = Array.isArray(structured.vitals_and_measurements) ? structured.vitals_and_measurements : []
                  const findingsList = Array.isArray(structured.diagnoses_and_findings) ? structured.diagnoses_and_findings : []

                  return (
                    <div className="clinical-section-card prescription-report-card">
                      <div className="clinical-section-header">
                        <h3 className="clinical-section-title">
                          <Camera size={16} />
                          Medical Document &amp; Prescription Record
                        </h3>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          {isCloudinary && (
                            <span className="clinical-section-badge" style={{ background: '#e0f2fe', color: '#0369a1' }}>
                              ☁️ Cloudinary Storage
                            </span>
                          )}
                          {isHandwritten ? (
                            <span className="clinical-section-badge rx-badge-handwritten">
                              ✍️ Handwritten Prescription (Visual Review)
                            </span>
                          ) : (
                            <span className="clinical-section-badge rx-badge-printed">
                              🖨️ Printed Report (OCR + Mapped)
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="rx-report-content">
                        {/* Image Preview & Classification Details */}
                        <div className="rx-preview-meta-row">
                          {fullImgSrc && (
                            <div className="rx-preview-col">
                              <div
                                onClick={() => setPreviewModalImg(fullImgSrc)}
                                className="rx-preview-thumb-link"
                                style={{ cursor: 'pointer' }}
                                title="Click to view full image in high resolution"
                              >
                                <img
                                  src={fullImgSrc}
                                  alt="Prescription Document"
                                  className="rx-preview-thumb"
                                />
                                <span className="rx-thumb-caption">
                                  <Eye size={12} style={{ display: 'inline', marginRight: 4 }} />
                                  Click to view full image
                                </span>
                              </div>
                            </div>
                          )}

                          <div className="rx-meta-details-col">
                            {isHandwritten ? (
                              <div className="rx-handwritten-alert">
                                <strong>✍️ Handwritten Prescription Attached:</strong>
                                <p>
                                  Handwritten doctor notation detected. To preserve clinical fidelity and avoid transcription errors, OCR was safely bypassed. The high-resolution document is attached for direct visual physician inspection.
                                </p>
                                {fullImgSrc && (
                                  <button
                                    type="button"
                                    onClick={() => setPreviewModalImg(fullImgSrc)}
                                    className="btn-terminal-action"
                                    style={{ width: 'auto', padding: '6px 14px', fontSize: 12.5, marginTop: 8 }}
                                  >
                                    <Eye size={14} />
                                    <span>Inspect Original Document &rarr;</span>
                                  </button>
                                )}
                              </div>
                            ) : (
                              <div className="rx-printed-info">
                                <div className="rx-meta-pill-group">
                                  {structured.report_type && (
                                    <span className="rx-meta-pill"><strong>Type:</strong> {structured.report_type}</span>
                                  )}
                                  {structured.document_date && (
                                    <span className="rx-meta-pill"><strong>Date:</strong> {structured.document_date}</span>
                                  )}
                                  {structured.doctor_name && (
                                    <span className="rx-meta-pill"><strong>Doctor:</strong> {structured.doctor_name}</span>
                                  )}
                                  {structured.facility_name && (
                                    <span className="rx-meta-pill"><strong>Facility:</strong> {structured.facility_name}</span>
                                  )}
                                </div>
                                {structured.clinical_summary && (
                                  <p className="rx-summary-text">{structured.clinical_summary}</p>
                                )}
                                {fullImgSrc && (
                                  <div style={{ marginTop: 8 }}>
                                    <button
                                      type="button"
                                      onClick={() => setPreviewModalImg(fullImgSrc)}
                                      className="btn-refresh-sm"
                                      style={{ padding: '5px 12px', fontSize: 12 }}
                                    >
                                      <Eye size={12} />
                                      <span>View Attached Image</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Medications Table if extracted */}
                        {!isHandwritten && medsList.length > 0 && (
                          <div className="rx-sub-section">
                            <h4 className="rx-sub-title">
                              <Pill size={14} /> Extracted Prescribed Medications
                            </h4>
                            <div className="rx-meds-grid">
                              {medsList.map((m, mIdx) => (
                                <div key={mIdx} className="rx-med-card">
                                  <div className="rx-med-name">{m.name} {m.dosage ? `(${m.dosage})` : ''}</div>
                                  <div className="rx-med-details">
                                    {m.frequency && <span>Freq: {m.frequency}</span>}
                                    {m.duration && <span>Duration: {m.duration}</span>}
                                  </div>
                                  {m.instructions && (
                                    <div className="rx-med-instruct">{m.instructions}</div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Findings / Vitals if extracted */}
                        {!isHandwritten && (vitalsList.length > 0 || findingsList.length > 0) && (
                          <div className="rx-sub-section rx-sub-flex">
                            {vitalsList.length > 0 && (
                              <div className="rx-vitals-block">
                                <h4 className="rx-sub-title"><Activity size={14} /> Extracted Vitals / Measurements</h4>
                                <ul className="rx-findings-list">
                                  {vitalsList.map((v, vIdx) => (
                                    <li key={vIdx}>
                                      <strong>{v.measurement_type}:</strong> {v.value} {v.unit || ''} {v.interpretation ? `(${v.interpretation})` : ''}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {findingsList.length > 0 && (
                              <div className="rx-findings-block">
                                <h4 className="rx-sub-title"><CheckCircle2 size={14} /> Diagnoses &amp; Findings</h4>
                                <ul className="rx-findings-list">
                                  {findingsList.map((f, fIdx) => (
                                    <li key={fIdx}>{typeof f === 'string' ? f : f.finding || JSON.stringify(f)}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })()}

                {/* 9. Concluding Audio Replay */}
                {completionData?.audio_base64 && (
                  <div className="audio-replay-bar">
                    <span style={{ fontSize: 12.5, color: '#475569' }}>
                      🔊 <em>"{concludingMsg}"</em>
                    </span>
                    <button
                      onClick={() => playAudioBase64(completionData.audio_base64)}
                      className="audio-replay-btn"
                    >
                      <Volume2 size={13} />
                      <span>Replay Voice Message</span>
                    </button>
                  </div>
                )}

                {/* 10. Forwarding Confirmation Banner */}
                <div className="completion-handover-banner">
                  <CheckCircle2 size={18} color="#16a34a" style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>
                    <strong>Forwarded to Health Worker Review:</strong> Case filed under <code>pending_verification</code> status. The attending nurse / medical officer has received the full clinical profile for physician consultation.
                  </span>
                </div>
              </div>

              <div className="terminal-card-footer" style={{ marginTop: 20 }}>
                <button
                  onClick={handleNextPatient}
                  className="btn-terminal-action"
                  style={{ margin: '0 auto', maxWidth: 300 }}
                >
                  <span>Ready for Next Patient</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )
        })()}

        {/* Prescription Camera Modal */}
        <PrescriptionCameraModal
          isOpen={showCameraModal}
          sessionId={sessionId}
          patientId={activePatientId}
          language={selectedLanguage}
          playAudio={playAudioBase64}
          onSuccess={(data) => {
            setShowCameraModal(false)
            handleProcessReplyResponse(data)
          }}
          onSkip={handleSkipPrescription}
        />

        {/* Full Document Viewer Modal */}
        {previewModalImg && (
          <div
            className="terminal-image-modal-backdrop"
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(15, 23, 42, 0.85)',
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 20,
              backdropFilter: 'blur(4px)',
            }}
            onClick={() => setPreviewModalImg(null)}
          >
            <div
              className="terminal-image-modal-card"
              style={{
                backgroundColor: '#ffffff',
                borderRadius: 16,
                maxWidth: '90vw',
                maxHeight: '90vh',
                width: 800,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '14px 20px',
                  borderBottom: '1px solid #e2e8f0',
                  background: '#f8fafc',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Camera size={18} color="#2563eb" />
                  <span style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>
                    Attached Medical Prescription / Clinical Report
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewModalImg(null)}
                  style={{
                    border: 'none',
                    background: '#e2e8f0',
                    width: 30,
                    height: 30,
                    borderRadius: '50%',
                    cursor: 'pointer',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  ✕
                </button>
              </div>

              <div
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 20,
                  backgroundColor: '#0f172a',
                }}
              >
                <img
                  src={previewModalImg}
                  alt="High Resolution Medical Document"
                  style={{
                    maxWidth: '100%',
                    maxHeight: '70vh',
                    objectFit: 'contain',
                    borderRadius: 8,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                  }}
                />
              </div>

              <div
                style={{
                  padding: '12px 20px',
                  borderTop: '1px solid #e2e8f0',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: '#f8fafc',
                }}
              >
                <a
                  href={previewModalImg}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    fontSize: 13,
                    color: '#2563eb',
                    textDecoration: 'none',
                    fontWeight: 600,
                  }}
                >
                  Open in Full Resolution Window ↗
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewModalImg(null)}
                  className="btn-terminal-back"
                  style={{ padding: '6px 16px', fontSize: 13 }}
                >
                  Close Viewer
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
