import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Mic,
  MicOff,
  Volume2,
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
  Activity,
  Flame,
  Check,
  CheckCircle2,
  Camera,
  XCircle,
  ChevronDown,
  FileText,
  ListOrdered,
  X,
  Stethoscope,
  Database,
  Search,
  Hourglass,
  Layers,
  Thermometer,
  Heart,
  Scale,
} from 'lucide-react'
import {
  getQueuedPatientIds,
  startKioskSession,
  replyText,
  replyAudio,
  deviceHeartbeat,
  deviceLogout,
  updatePatientVitals,
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
    greeting: 'ನಮಸ್ಕಾರ! ನಿಮ್ಮ ಆರೋಗ್ಯದ ಬಗ್ಗೆ ಮಾತನಾಡಿ.',
    flag: '🌺',
  },
  {
    key: 'punjabi',
    code: 'pa-IN',
    label: 'ਪੰਜਾਬੀ',
    sublabel: 'Punjabi',
    greeting: 'ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ! ਆਪਣੀ ਸਿਹਤ ਬਾਰੇ ਗੱਲ ਕਰੋ।',
    flag: '🌾',
  },
  {
    key: 'odia',
    code: 'or-IN',
    label: 'ଓଡ଼ିଆ',
    sublabel: 'Odia',
    greeting: 'ନମସ୍କାର! ଆପଣଙ୍କ ସ୍ୱାସ୍ଥ୍ୟ ସମସ୍ୟା ବିଷୟରେ କୁହନ୍ତୁ।',
    flag: '🛕',
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
  const [deviceInfo] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('device_info') || '{}')
    } catch {
      return {}
    }
  })

  // Workflow Stages: 'select_patient' | 'language' | 'interrogation' | 'waiting_worker_input' | 'completed'
  const [stage, setStage] = useState('select_patient')
  const [selectedLanguage, setSelectedLanguage] = useState(LANGUAGES[0])

  // Patient Queue & Active Patient
  const [queuedIds, setQueuedIds] = useState([])
  const [activePatient, setActivePatient] = useState(null)
  const [activePatientId, setActivePatientId] = useState('')
  const [patientIdInput, setPatientIdInput] = useState('')

  // Interrogation State (Current Single Question)
  const [sessionId, setSessionId] = useState(null)
  const [currentQuestion, setCurrentQuestion] = useState('')
  const [currentQuestionEn, setCurrentQuestionEn] = useState('')
  const [currentIntent, setCurrentIntent] = useState('')
  const [currentAudioBase64, setCurrentAudioBase64] = useState(null)
  const [currentPhase, setCurrentPhase] = useState('phase_1')
  const [questionsMemory, setQuestionsMemory] = useState([])
  const [conversationHistory, setConversationHistory] = useState([])
  const [textAnswer, setTextAnswer] = useState('')
  const [showTextInput, setShowTextInput] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  // Modals for Transcript History & Question Checklist
  const [showTranscriptModal, setShowTranscriptModal] = useState(false)
  const [showQuestionsModal, setShowQuestionsModal] = useState(false)

  // Micro-Pipeline Progress Tracking
  // 'idle' | 'answering' | 'stt' | 'regex_urgency' | 'nlp_urgency' | 'memory_saved'
  const [microStep, setMicroStep] = useState('idle')

  // Audio Playback & TTS Engine Selection
  const [ttsEngine, setTtsEngine] = useState('local')
  const [isPlayingAudio, setIsPlayingAudio] = useState(false)
  const currentAudioRef = useRef(null)

  // Voice Recording
  const [isRecording, setIsRecording] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const timerRef = useRef(null)

  // Prescription / Document Scanning
  const [showCameraModal, setShowCameraModal] = useState(false)
  const [isPrescriptionPromptActive, setIsPrescriptionPromptActive] = useState(false)

  // Waiting for Health Worker Input (10-Second Timer)
  const [workerCountdown, setWorkerCountdown] = useState(10)
  const [isTimerPaused, setIsTimerPaused] = useState(false)
  const countdownTimerRef = useRef(null)
  const [workerVitals, setWorkerVitals] = useState({
    bp_systolic: '',
    bp_diastolic: '',
    temperature_f: '',
    weight_kg: '',
    height_cm: '',
  })

  // Completion State
  const [completionData, setCompletionData] = useState(null)

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
    try {
      const res = await getQueuedPatientIds()
      setQueuedIds(res.data || [])
    } catch (err) {
      console.error('Failed to load queued IDs:', err)
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

      audio.play().catch((e) => {
        console.warn('Audio play blocked:', e)
        setIsPlayingAudio(false)
        if (typeof onEndedCallback === 'function') onEndedCallback()
      })
    } catch {
      setIsPlayingAudio(false)
      if (typeof onEndedCallback === 'function') onEndedCallback()
    }
  }

  // ── Start Interrogation Session ───────────────────────────────────────
  const handleSelectLanguageAndStart = async (lang) => {
    setSelectedLanguage(lang)
    setIsProcessing(true)
    setErrorMsg('')
    setMicroStep('idle')

    try {
      const res = await startKioskSession({
        patient_id: activePatientId,
        language: lang.key,
        tts_engine: ttsEngine,
      })

      const data = res.data
      setSessionId(data.session_id)
      setCurrentQuestion(data.current_question)
      setCurrentQuestionEn(data.current_question_en || '')
      setCurrentIntent(data.question_intent)
      setCurrentAudioBase64(data.audio_base64)
      setCurrentPhase(data.phase || 'phase_1')
      setQuestionsMemory(data.questions_status || [])

      setConversationHistory([
        {
          role: 'ai',
          text: data.current_question,
          text_en: data.current_question_en,
          intent: data.question_intent,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ])

      setStage('interrogation')

      if (data.audio_base64) {
        playAudioBase64(data.audio_base64)
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.detail || 'Failed to start AI session. Please retry.')
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
        const rawMime = mediaRecorder.mimeType || 'audio/webm'
        const cleanMime = rawMime.split(';')[0].trim().toLowerCase() || 'audio/webm'
        const audioBlob = new Blob(audioChunksRef.current, { type: cleanMime })
        stream.getTracks().forEach((track) => track.stop())
        if (audioBlob.size < 500) {
          setErrorMsg('Audio recording was too short. Please speak clearly or type your reply.')
          return
        }
        await submitVoiceAnswer(audioBlob)
      }

      mediaRecorder.start(250)
      setIsRecording(true)
      setRecordingSeconds(0)

      timerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1)
      }, 1000)
    } catch {
      setErrorMsg('Microphone access unavailable. Please type your reply below.')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      clearInterval(timerRef.current)
    }
  }

  // Simulate micro-pipeline steps visually for transparency
  const runMicroPipelineVisuals = async () => {
    setMicroStep('answering')
    await new Promise((r) => setTimeout(r, 200))
    setMicroStep('stt')
    await new Promise((r) => setTimeout(r, 300))
    setMicroStep('regex_urgency')
    await new Promise((r) => setTimeout(r, 250))
    setMicroStep('nlp_urgency')
    await new Promise((r) => setTimeout(r, 300))
    setMicroStep('memory_saved')
  }

  // Check if patient's response mentions having a physical report or prescription
  const mentionsReportOrPrescription = (text) => {
    if (!text) return false
    const t = text.toLowerCase()
    return (
      t.includes('report') ||
      t.includes('prescription') ||
      t.includes('parcha') ||
      t.includes('parchi') ||
      t.includes('pacha') ||
      t.includes('medical note') ||
      t.includes('doctor note') ||
      t.includes('doctor slip') ||
      t.includes('test result') ||
      t.includes('blood test') ||
      t.includes('xray') ||
      t.includes('x-ray') ||
      t.includes('discharge') ||
      t.includes('पर्चा') ||
      t.includes('रिपोर्ट') ||
      t.includes('कागज़') ||
      t.includes('ପ୍ରେସକ୍ରିପସନ') ||
      t.includes('ରିପୋର୍ଟ')
    )
  }

  const submitVoiceAnswer = async (audioBlob) => {
    setIsProcessing(true)
    setErrorMsg('')
    runMicroPipelineVisuals()

    const formData = new FormData()
    formData.append('session_id', sessionId)
    formData.append('patient_id', activePatientId)
    formData.append('audio_file', audioBlob, 'patient_voice.webm')
    formData.append('tts_engine', ttsEngine)

    try {
      const res = await replyAudio(formData)
      const data = res.data

      if (data.transcribed_text) {
        setConversationHistory((prev) => [
          ...prev,
          {
            role: 'patient',
            text: data.transcribed_text,
            is_voice: true,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ])

        if (mentionsReportOrPrescription(data.transcribed_text)) {
          setShowCameraModal(true)
        }
      }

      handleProcessReplyResponse(data)
    } catch (err) {
      setErrorMsg(err.response?.data?.detail || 'Could not process audio. Please repeat or type your answer.')
      setMicroStep('idle')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleSendText = async () => {
    const reply = textAnswer.trim()
    if (!reply || isProcessing) return

    setTextAnswer('')
    setErrorMsg('')
    setIsProcessing(true)
    runMicroPipelineVisuals()

    if (mentionsReportOrPrescription(reply)) {
      setShowCameraModal(true)
    }

    setConversationHistory((prev) => [
      ...prev,
      {
        role: 'patient',
        text: reply,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
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
      setErrorMsg(err.response?.data?.detail || 'Failed to process answer. Please retry.')
      setMicroStep('idle')
    } finally {
      setIsProcessing(false)
    }
  }

  // ── Handle AI Response Turn ───────────────────────────────────────────
  const handleProcessReplyResponse = (data) => {
    setMicroStep('memory_saved')
    setTimeout(() => setMicroStep('idle'), 1200)

    if (data.questions_status) {
      setQuestionsMemory(data.questions_status)
    }
    if (data.phase) {
      setCurrentPhase(data.phase)
    }

    const isRxPrompt = data.phase === 'phase_prescription_prompt' || data.is_prescription_prompt === true
    setIsPrescriptionPromptActive(isRxPrompt)

    if (data.open_camera || data.phase === 'phase_prescription_camera') {
      setIsPrescriptionPromptActive(false)
      setShowCameraModal(true)
    }

    if (data.is_complete) {
      // Questions finished! Now enter Health Worker Biological Input stage (10s Timer)
      setCompletionData(data)
      setShowCameraModal(false)
      setIsPrescriptionPromptActive(false)

      setConversationHistory((prev) => [
        ...prev,
        {
          role: 'ai',
          text: data.concluding_message,
          is_concluding: true,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ])

      if (data.audio_base64) {
        playAudioBase64(data.audio_base64)
      }

      // Start 10-Second Countdown for Health Worker Vitals Input
      startHealthWorkerCountdown(data)
    } else {
      // Next Question
      setCurrentQuestion(data.current_question)
      setCurrentQuestionEn(data.current_question_en || '')
      setCurrentIntent(data.question_intent)
      setCurrentAudioBase64(data.audio_base64)

      setConversationHistory((prev) => [
        ...prev,
        {
          role: 'ai',
          text: data.current_question,
          text_en: data.current_question_en,
          intent: data.question_intent,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ])

      if (data.audio_base64) {
        playAudioBase64(data.audio_base64)
      }
    }
  }

  // ── Start 10-Second Health Worker Countdown ───────────────────────────
  const startHealthWorkerCountdown = (data) => {
    setStage('waiting_worker_input')
    setWorkerCountdown(10)
    setIsTimerPaused(false)

    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current)

    countdownTimerRef.current = setInterval(() => {
      setWorkerCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownTimerRef.current)
          handleFinalizeDirectly(data)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  // Called when health worker focuses or types into any biological measurement input
  const handlePauseCountdownOnInput = () => {
    if (!isTimerPaused) {
      setIsTimerPaused(true)
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current)
      }
    }
  }

  // Submit Biological Measurements & Proceed
  const handleSubmitWorkerBiologicalData = async () => {
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current)
    setIsProcessing(true)

    try {
      const payload = {}
      if (workerVitals.bp_systolic) payload.bp_systolic = parseInt(workerVitals.bp_systolic)
      if (workerVitals.bp_diastolic) payload.bp_diastolic = parseInt(workerVitals.bp_diastolic)
      if (workerVitals.temperature_f) payload.temperature_f = parseFloat(workerVitals.temperature_f)
      if (workerVitals.weight_kg) payload.weight_kg = parseFloat(workerVitals.weight_kg)
      if (workerVitals.height_cm) payload.height_cm = parseFloat(workerVitals.height_cm)

      if (Object.keys(payload).length > 0) {
        await updatePatientVitals(activePatientId, payload)
      }
    } catch (err) {
      console.warn('Vitals save fallback:', err)
    } finally {
      setIsProcessing(false)
      setStage('completed')
    }
  }

  const handleFinalizeDirectly = () => {
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current)
    setStage('completed')
  }

  // ── Reset for Next Patient ────────────────────────────────────────────
  const handleNextPatient = () => {
    setStage('select_patient')
    setActivePatient(null)
    setActivePatientId('')
    setPatientIdInput('')
    setSessionId(null)
    setCurrentQuestion('')
    setCurrentQuestionEn('')
    setCurrentAudioBase64(null)
    setQuestionsMemory([])
    setConversationHistory([])
    setCompletionData(null)
    setIsPrescriptionPromptActive(false)
    setShowCameraModal(false)
    setIsTimerPaused(false)
    setWorkerCountdown(10)
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

  // Determine active step index for the Bottom Stepper (1 to 7)
  const getMacroStepStatus = (stepIndex) => {
    if (stage === 'completed') return 'completed'
    if (stage === 'waiting_worker_input') {
      if (stepIndex < 6) return 'completed'
      if (stepIndex === 6) return 'active'
      return 'pending'
    }
    // During interrogation
    const askedCount = questionsMemory.filter((q) => q.flag === 'asked').length

    if (stepIndex === 1) {
      return currentPhase === 'phase_1' ? 'active' : 'completed'
    }
    if (stepIndex === 2) {
      if (currentPhase === 'phase_1') return 'pending'
      return currentPhase === 'phase_2' ? 'active' : 'completed'
    }
    if (stepIndex === 3) {
      if (['phase_1'].includes(currentPhase)) return 'pending'
      return currentPhase === 'phase_2' ? 'active' : 'completed'
    }
    if (stepIndex === 4) {
      if (['phase_1', 'phase_2'].includes(currentPhase)) return 'pending'
      return currentPhase === 'phase_3' ? 'active' : 'completed'
    }
    if (stepIndex === 5) {
      if (isPrescriptionPromptActive || showCameraModal) return 'active'
      return ['completed', 'waiting_worker_input'].includes(stage) ? 'completed' : 'pending'
    }
    if (stepIndex === 6) {
      return stage === 'waiting_worker_input' ? 'active' : 'pending'
    }
    if (stepIndex === 7) {
      return stage === 'completed' ? 'completed' : 'pending'
    }
    return 'pending'
  }

  // Determine state for the 6-Step Micro-Turn Pipeline:
  // 1: Asking Question -> 2: Answer Taken -> 3: STT Completed ->
  // 4: Regex Emergency Signal Matches -> 5: NLP Emergency Signal Match ->
  // 6: Save Answer in Temporary Memory
  const getMicroStepState = (stepNumber) => {
    // Step 1: Asking Question (green tick as long as a question is currently displayed)
    if (stepNumber === 1) {
      return currentQuestion ? 'done' : 'active'
    }

    // Step 2: Answer Taken
    if (stepNumber === 2) {
      if (['answering', 'stt', 'regex_urgency', 'nlp_urgency', 'memory_saved'].includes(microStep)) {
        return microStep === 'answering' ? 'active' : 'done'
      }
      return isRecording ? 'active' : 'pending'
    }

    // Step 3: STT Completed
    if (stepNumber === 3) {
      if (['stt', 'regex_urgency', 'nlp_urgency', 'memory_saved'].includes(microStep)) {
        return microStep === 'stt' ? 'active' : 'done'
      }
      return 'pending'
    }

    // Step 4: Regex Emergency Signal Matches
    if (stepNumber === 4) {
      if (['regex_urgency', 'nlp_urgency', 'memory_saved'].includes(microStep)) {
        return microStep === 'regex_urgency' ? 'active' : 'done'
      }
      return 'pending'
    }

    // Step 5: NLP Emergency Signal Match
    if (stepNumber === 5) {
      if (['nlp_urgency', 'memory_saved'].includes(microStep)) {
        return microStep === 'nlp_urgency' ? 'active' : 'done'
      }
      return 'pending'
    }

    // Step 6: Save Answer in Temporary Memory
    if (stepNumber === 6) {
      if (microStep === 'memory_saved') {
        return 'done'
      }
      return 'pending'
    }

    return 'pending'
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
            <span>Online · Active</span>
          </div>

          <div className="terminal-meta-pill">
            <Globe size={13} className="text-indigo-400" />
            <span>{selectedLanguage.label}</span>
          </div>

          {/* Model Switcher */}
          <div className="terminal-tts-pill">
            <span className="tts-pill-label">Voice:</span>
            <div className="tts-pill-buttons">
              <button
                type="button"
                onClick={() => setTtsEngine('local')}
                className={`tts-pill-btn ${ttsEngine === 'local' ? 'active local' : ''}`}
                title="Local Kokoro 82M - Free / On-Device"
              >
                <span>Local Kokoro</span>
              </button>
              <button
                type="button"
                onClick={() => setTtsEngine('sarvam')}
                className={`tts-pill-btn ${ttsEngine === 'sarvam' ? 'active sarvam' : ''}`}
                title="Sarvam Indic Cloud API"
              >
                <span>Sarvam Cloud</span>
              </button>
            </div>
          </div>

          <button onClick={handleExitTerminal} className="terminal-exit-btn">
            <LogOut size={13} />
            <span>Exit</span>
          </button>
        </div>
      </header>

      {/* ── Main Container ── */}
      <main className="terminal-body">
        
        {/* ── STAGE 1: Patient Arrival & Selection ── */}
        {stage === 'select_patient' && (
          <div className="terminal-card fade-in">
            <div className="terminal-card__badge bg-blue-subtle">
              <User size={24} color="#0f172a" />
            </div>
            <h2 className="terminal-card__title">Patient Arrival &amp; Triage Queue</h2>
            <p className="terminal-card__desc">
              Patients registered at the Reception desk appear here automatically. Select the waiting patient to begin conversational screening.
            </p>

            {errorMsg && (
              <div className="terminal-error-banner">
                <AlertCircle size={15} />
                <span>{errorMsg}</span>
              </div>
            )}

            {queuedIds.length > 0 ? (
              (() => {
                const nextP = queuedIds[0]
                return (
                  <div className="terminal-patient-profile-card">
                    <div className="patient-hero-header">
                      <span className="patient-hero-status-pill">
                        🟢 Next Patient In Queue
                      </span>
                      {nextP.created_at && (
                        <span className="patient-hero-time">
                          <Clock size={12} style={{ display: 'inline', marginRight: 4 }} />
                          {new Date(nextP.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>

                    <div className="patient-hero-identity">
                      <div className="patient-hero-avatar">
                        {(nextP.full_name || 'P').charAt(0)}
                      </div>
                      <div className="patient-hero-text">
                        <div className="patient-hero-name-row">
                          <span className="patient-hero-name">{nextP.full_name || `Patient ${nextP.patient_id}`}</span>
                          <span className="patient-hero-id-badge">{nextP.patient_id}</span>
                        </div>
                        <div className="patient-hero-meta-row">
                          <span>{nextP.age} Yrs</span>
                          <span>· {nextP.gender}</span>
                          {nextP.blood_group && <span>· 🩸 {nextP.blood_group}</span>}
                          {nextP.contact_number && <span>· 📞 {nextP.contact_number}</span>}
                        </div>
                      </div>
                    </div>

                    {nextP.chief_complaints && (
                      <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: 8, fontSize: 13, color: '#334155' }}>
                        <strong>Reported Concern:</strong> "{nextP.chief_complaints}"
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setActivePatient(nextP)
                        setActivePatientId(nextP.patient_id)
                        setStage('language')
                      }}
                      className="btn-terminal-action"
                      style={{ marginTop: 8 }}
                    >
                      <span>Begin AI Consultation for {nextP.full_name} &rarr;</span>
                      <ArrowRight size={16} />
                    </button>
                  </div>
                )
              })()
            ) : (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: '#94a3b8' }}>
                <Clock size={36} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
                <h3>No Patients Waiting in Kiosk Queue</h3>
                <p style={{ fontSize: 13 }}>New patients registered at reception will show up automatically.</p>
              </div>
            )}
          </div>
        )}

        {/* ── STAGE 2: Language Selection ── */}
        {stage === 'language' && (
          <div className="terminal-card fade-in">
            <div className="terminal-card__badge">
              <Globe size={24} />
            </div>
            <h2 className="terminal-card__title">Choose Language / भाषा चुनें / ଭାଷା ବାଛନ୍ତୁ</h2>
            <p className="terminal-card__desc">
              Select the preferred language for voice synthesis and conversational triage.
            </p>

            <div className="terminal-lang-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.key}
                  onClick={() => handleSelectLanguageAndStart(lang)}
                  className={`terminal-lang-card ${selectedLanguage.key === lang.key ? 'selected' : ''}`}
                  disabled={isProcessing}
                >
                  <span className="terminal-lang-flag">{lang.flag}</span>
                  <div className="terminal-lang-names">
                    <span className="terminal-lang-native" style={{ fontSize: 17, fontWeight: 700 }}>{lang.label}</span>
                    <span className="terminal-lang-en">{lang.sublabel}</span>
                  </div>
                  <div style={{ marginTop: 'auto', paddingTop: 6, fontSize: 12, fontWeight: 600, color: '#2563eb' }}>
                    Select &amp; Start &rarr;
                  </div>
                </button>
              ))}
            </div>

            <div style={{ marginTop: 24, textAlign: 'center' }}>
              <button onClick={() => setStage('select_patient')} className="btn-terminal-back">
                &larr; Back to Patient Queue
              </button>
            </div>
          </div>
        )}

        {/* ── STAGE 3: Clean AI Interrogation Stage (No Chat Wall, No Questions List) ── */}
        {stage === 'interrogation' && (
          <div className="terminal-asking-stage fade-in">
            
            {/* Top Patient Bar & Discreet Review Tools */}
            <div className="terminal-asking-topbar">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#0f172a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13 }}>
                  {(activePatient?.full_name || 'P').charAt(0)}
                </div>
                <div>
                  <strong style={{ fontSize: 14, color: '#0f172a' }}>
                    {activePatient?.full_name || `Patient ${activePatientId}`}
                  </strong>
                  <span style={{ fontSize: 11, color: '#64748b', marginLeft: 8 }}>
                    Token: {activePatientId} · Language: {selectedLanguage.flag} {selectedLanguage.label}
                  </span>
                </div>
              </div>

              {/* Discreet Modals Access (Transcript & Checklist) */}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setShowTranscriptModal(true)}
                  className="hw-tab-pill"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: '#f8fafc', border: '1px solid #cbd5e1' }}
                >
                  <FileText size={13} />
                  <span>Transcript History ({conversationHistory.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowQuestionsModal(true)}
                  className="hw-tab-pill"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: '#f8fafc', border: '1px solid #cbd5e1' }}
                >
                  <ListOrdered size={13} />
                  <span>Question Checklist</span>
                </button>
              </div>
            </div>

            {errorMsg && (
              <div className="terminal-error-banner">
                <AlertCircle size={15} />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* ── Center Stage: AI Question Card ── */}
            <div className="terminal-asking-card">
              
              {/* AI Avatar with Sound Waves */}
              <div className="terminal-ai-avatar-wrap">
                {isPlayingAudio && <div className="terminal-sound-waves" />}
                <div
                  className={`terminal-ai-avatar-core ${
                    isPlayingAudio ? 'speaking' : isRecording ? 'listening' : ''
                  }`}
                >
                  {isRecording ? <Mic size={32} /> : isPlayingAudio ? <Volume2 size={32} /> : <Bot size={32} />}
                </div>

                <span
                  className={`terminal-ai-status-pill ${
                    isPlayingAudio ? 'speaking' : isRecording ? 'listening' : ''
                  }`}
                >
                  {isPlayingAudio
                    ? '🔊 AI Speaking...'
                    : isRecording
                    ? `🎙️ Listening (${recordingSeconds}s)...`
                    : isProcessing
                    ? '⚡ AI Reasoning & Checking Urgency...'
                    : 'Astra Clinical AI'}
                </span>
              </div>

              {/* Single Question Display in Native Language + English */}
              <div className="terminal-question-box">
                {/* Native Language (Large & Prominent) */}
                <h2 className="terminal-q-native">
                  "{currentQuestion || 'Please describe your symptoms.'}"
                </h2>

                {/* English Sub-text */}
                {currentQuestionEn && currentQuestionEn !== currentQuestion && (
                  <p className="terminal-q-en">
                    English: "{currentQuestionEn}"
                  </p>
                )}

                {/* Clinical Focus & Replay Controls */}
                <div className="terminal-q-actions">
                  {currentIntent && (
                    <span style={{ fontSize: 11.5, background: '#e2e8f0', color: '#334155', padding: '3px 10px', borderRadius: 999, fontWeight: 700 }}>
                      Intent: {currentIntent}
                    </span>
                  )}

                  {/* Replay Audio Button */}
                  <button
                    type="button"
                    onClick={() => playAudioBase64(currentAudioBase64)}
                    className={`terminal-replay-btn ${isPlayingAudio ? 'is-playing' : ''}`}
                    title="Listen to the question again"
                    disabled={isPlayingAudio || isRecording || isProcessing}
                  >
                    <Volume2 size={15} />
                    <span>Listen Again (दोबारा सुनें)</span>
                  </button>

                  {/* Proactive Camera / Report Scan Button */}
                  <button
                    type="button"
                    onClick={() => setShowCameraModal(true)}
                    className="terminal-scan-report-btn"
                    title="I have a doctor's prescription or medical report to scan"
                    disabled={isProcessing}
                  >
                    <Camera size={15} />
                    <span>📷 I Have a Report (पर्चा / रिपोर्ट दिखाएं)</span>
                  </button>
                </div>
              </div>

              {/* ── Prescription Prompt Quick Confirmation (if active) ── */}
              {isPrescriptionPromptActive && (
                <div style={{ width: '100%', marginBottom: 20 }}>
                  <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                    <button
                      type="button"
                      onClick={() => setShowCameraModal(true)}
                      className="rx-btn-accept-yes"
                      style={{ padding: '12px 24px' }}
                    >
                      <Camera size={18} />
                      <span>Yes, Open Camera &amp; Scan Report</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSendText()}
                      className="rx-btn-accept-no"
                      style={{ padding: '12px 20px' }}
                    >
                      <XCircle size={18} />
                      <span>No Prescription, Continue</span>
                    </button>
                  </div>
                </div>
              )}

              {/* ── Answering Zone: Voice Recording or Text ── */}
              <div className="terminal-answering-wrap">
                {!showTextInput ? (
                  <>
                    {!isRecording ? (
                      <button
                        type="button"
                        onClick={startRecording}
                        className="terminal-big-mic-btn"
                        disabled={isProcessing || isPlayingAudio}
                      >
                        <Mic size={22} />
                        <span>Hold / Click to Speak Your Answer</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={stopRecording}
                        className="terminal-big-mic-btn recording"
                      >
                        <MicOff size={22} />
                        <span>Recording ({recordingSeconds}s) · Click when Finished</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setShowTextInput(true)}
                      className="terminal-text-toggle-btn"
                    >
                      Prefer typing instead? Click here to type reply
                    </button>
                  </>
                ) : (
                  <div className="terminal-answering-wrap">
                    <form
                      onSubmit={(e) => {
                        e.preventDefault()
                        handleSendText()
                      }}
                      className="terminal-text-input-wrap"
                    >
                      <input
                        type="text"
                        placeholder={`Type answer in ${selectedLanguage.label} or English...`}
                        value={textAnswer}
                        onChange={(e) => setTextAnswer(e.target.value)}
                        className="terminal-field-input"
                        style={{ flex: 1 }}
                        disabled={isProcessing}
                      />
                      <button
                        type="submit"
                        className="btn-send-reply"
                        disabled={!textAnswer.trim() || isProcessing}
                      >
                        <Send size={15} />
                        <span>Send</span>
                      </button>
                    </form>

                    <button
                      type="button"
                      onClick={() => setShowTextInput(false)}
                      className="terminal-text-toggle-btn"
                    >
                      Switch back to Voice Mic
                    </button>
                  </div>
                )}
              </div>

              {/* ── Micro-Turn Processing Pipeline (Always Visible on Screen) ── */}
              <div style={{ marginTop: 24, width: '100%' }}>
                <div className="terminal-micro-pipeline-strip">
                  {/* Step 1: Asking Question */}
                  <span className={`terminal-micro-step ${getMicroStepState(1)}`}>
                    <span className="terminal-micro-step-tick">
                      {getMicroStepState(1) === 'done' ? '✓' : '1'}
                    </span>
                    <span>Asking Question</span>
                  </span>

                  <span className="terminal-micro-arrow">➔</span>

                  {/* Step 2: Answer Taken */}
                  <span className={`terminal-micro-step ${getMicroStepState(2)}`}>
                    <span className="terminal-micro-step-tick">
                      {getMicroStepState(2) === 'done' ? '✓' : '2'}
                    </span>
                    <span>Answer Taken</span>
                  </span>

                  <span className="terminal-micro-arrow">➔</span>

                  {/* Step 3: STT Completed */}
                  <span className={`terminal-micro-step ${getMicroStepState(3)}`}>
                    <span className="terminal-micro-step-tick">
                      {getMicroStepState(3) === 'done' ? '✓' : '3'}
                    </span>
                    <span>STT Completed</span>
                  </span>

                  <span className="terminal-micro-arrow">➔</span>

                  {/* Step 4: Regex Emergency Signal Matches */}
                  <span className={`terminal-micro-step ${getMicroStepState(4)}`}>
                    <span className="terminal-micro-step-tick">
                      {getMicroStepState(4) === 'done' ? '✓' : '4'}
                    </span>
                    <span>Regex Emergency Signal Matches</span>
                  </span>

                  <span className="terminal-micro-arrow">➔</span>

                  {/* Step 5: NLP Emergency Signal Match */}
                  <span className={`terminal-micro-step ${getMicroStepState(5)}`}>
                    <span className="terminal-micro-step-tick">
                      {getMicroStepState(5) === 'done' ? '✓' : '5'}
                    </span>
                    <span>NLP Emergency Signal Match</span>
                  </span>

                  <span className="terminal-micro-arrow">➔</span>

                  {/* Step 6: Save Answer in Temporary Memory */}
                  <span className={`terminal-micro-step ${getMicroStepState(6)}`}>
                    <span className="terminal-micro-step-tick">
                      {getMicroStepState(6) === 'done' ? '✓' : '6'}
                    </span>
                    <span>Save Answer in Temporary Memory</span>
                  </span>
                </div>
              </div>
            </div>

            {/* ── Bottom Macro Stepper: 7 Connected Working Boxes (Turns Green as Work Progresses) ── */}
            <div className="terminal-macro-stepper-container">
              <div className="terminal-stepper-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Layers size={14} className="text-blue-600" />
                  <span>Clinical Interrogation &amp; Triage Pipeline</span>
                </div>
                <span>Phase Progress (Turns Green on Completion)</span>
              </div>

              <div className="terminal-stepper-boxes-row">
                {/* 1 */}
                <div className={`terminal-step-box ${getMacroStepStatus(1)}`}>
                  <span className="terminal-step-box-num">
                    {getMacroStepStatus(1) === 'completed' ? '✓' : '1'}
                  </span>
                  <span className="terminal-step-box-title">Initial Symptoms (Phase 1)</span>
                </div>

                {/* 2 */}
                <div className={`terminal-step-box ${getMacroStepStatus(2)}`}>
                  <span className="terminal-step-box-num">
                    {getMacroStepStatus(2) === 'completed' ? '✓' : '2'}
                  </span>
                  <span className="terminal-step-box-title">Vector DB Retrieval</span>
                </div>

                {/* 3 */}
                <div className={`terminal-step-box ${getMacroStepStatus(3)}`}>
                  <span className="terminal-step-box-num">
                    {getMacroStepStatus(3) === 'completed' ? '✓' : '3'}
                  </span>
                  <span className="terminal-step-box-title">Differential Questions (Phase 2)</span>
                </div>

                {/* 4 */}
                <div className={`terminal-step-box ${getMacroStepStatus(4)}`}>
                  <span className="terminal-step-box-num">
                    {getMacroStepStatus(4) === 'completed' ? '✓' : '4'}
                  </span>
                  <span className="terminal-step-box-title">Clinical Deep-Dive (Phase 3)</span>
                </div>

                {/* 5 */}
                <div className={`terminal-step-box ${getMacroStepStatus(5)}`}>
                  <span className="terminal-step-box-num">
                    {getMacroStepStatus(5) === 'completed' ? '✓' : '5'}
                  </span>
                  <span className="terminal-step-box-title">Prescription / OCR Check</span>
                </div>

                {/* 6 */}
                <div className={`terminal-step-box ${getMacroStepStatus(6)}`}>
                  <span className="terminal-step-box-num">
                    {getMacroStepStatus(6) === 'completed' ? '✓' : '6'}
                  </span>
                  <span className="terminal-step-box-title">Health Worker Vitals (10s)</span>
                </div>

                {/* 7 */}
                <div className={`terminal-step-box ${getMacroStepStatus(7)}`}>
                  <span className="terminal-step-box-num">
                    {getMacroStepStatus(7) === 'completed' ? '✓' : '7'}
                  </span>
                  <span className="terminal-step-box-title">Route to Doctor Queue</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── STAGE 4: Waiting for Health Worker Biological Input (10-Second Timer) ── */}
        {stage === 'waiting_worker_input' && (
          <div className="terminal-worker-input-card fade-in">
            {/* Header with Countdown Clock */}
            <div className={`terminal-countdown-clock ${isTimerPaused ? 'paused' : ''}`}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Hourglass size={20} className={!isTimerPaused ? 'animate-spin' : ''} />
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800 }}>
                    {isTimerPaused
                      ? '⏸️ Timer Paused — Enter Biological Measurements'
                      : 'Waiting for Health Worker Biological Data Input'}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.85 }}>
                    {isTimerPaused
                      ? 'Take your time to record vitals, then click Submit to add patient to queue.'
                      : 'If no additional data is entered within 10 seconds, patient will be automatically added to the queue.'}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="terminal-countdown-num">
                  {isTimerPaused ? 'PAUSED' : `${workerCountdown}s`}
                </span>
              </div>
            </div>

            {/* Guidance for Health Worker on WHICH biological data to collect */}
            <div className="terminal-vitals-collect-guidance">
              <div className="terminal-guidance-title">
                <Stethoscope size={16} className="text-blue-600" />
                <span>Recommended Biological Data for Health Worker to Collect:</span>
              </div>
              <div className="terminal-guidance-items">
                <span className="terminal-guidance-badge">
                  <Activity size={13} className="text-red-500" />
                  Blood Pressure (Systolic / Diastolic mmHg)
                </span>
                <span className="terminal-guidance-badge">
                  <Thermometer size={13} className="text-amber-500" />
                  Body Temperature (°F)
                </span>
                <span className="terminal-guidance-badge">
                  <Scale size={13} className="text-blue-500" />
                  Body Weight (kg)
                </span>
                <span className="terminal-guidance-badge">
                  <Heart size={13} className="text-emerald-500" />
                  Height (cm)
                </span>
              </div>
            </div>

            {/* Form Fields: Clicking or typing pauses the timer immediately! */}
            <div className="terminal-vitals-form-grid">
              <div className="terminal-field-group">
                <label className="terminal-field-label">BP (Systolic)</label>
                <input
                  type="number"
                  placeholder="e.g. 120"
                  className="terminal-field-input"
                  value={workerVitals.bp_systolic}
                  onFocus={handlePauseCountdownOnInput}
                  onChange={(e) => {
                    handlePauseCountdownOnInput()
                    setWorkerVitals((p) => ({ ...p, bp_systolic: e.target.value }))
                  }}
                />
              </div>

              <div className="terminal-field-group">
                <label className="terminal-field-label">BP (Diastolic)</label>
                <input
                  type="number"
                  placeholder="e.g. 80"
                  className="terminal-field-input"
                  value={workerVitals.bp_diastolic}
                  onFocus={handlePauseCountdownOnInput}
                  onChange={(e) => {
                    handlePauseCountdownOnInput()
                    setWorkerVitals((p) => ({ ...p, bp_diastolic: e.target.value }))
                  }}
                />
              </div>

              <div className="terminal-field-group">
                <label className="terminal-field-label">Temperature (°F)</label>
                <input
                  type="number"
                  step="0.1"
                  placeholder="e.g. 98.6"
                  className="terminal-field-input"
                  value={workerVitals.temperature_f}
                  onFocus={handlePauseCountdownOnInput}
                  onChange={(e) => {
                    handlePauseCountdownOnInput()
                    setWorkerVitals((p) => ({ ...p, temperature_f: e.target.value }))
                  }}
                />
              </div>

              <div className="terminal-field-group">
                <label className="terminal-field-label">Weight (kg)</label>
                <input
                  type="number"
                  step="0.5"
                  placeholder="e.g. 65"
                  className="terminal-field-input"
                  value={workerVitals.weight_kg}
                  onFocus={handlePauseCountdownOnInput}
                  onChange={(e) => {
                    handlePauseCountdownOnInput()
                    setWorkerVitals((p) => ({ ...p, weight_kg: e.target.value }))
                  }}
                />
              </div>
            </div>

            {/* Action Bar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
              <button
                type="button"
                onClick={handleFinalizeDirectly}
                className="btn-terminal-back"
              >
                Skip &amp; Add to Queue Directly &rarr;
              </button>

              <button
                type="button"
                onClick={handleSubmitWorkerBiologicalData}
                className="btn-terminal-action"
                style={{ width: 'auto', padding: '12px 28px', margin: 0 }}
                disabled={isProcessing}
              >
                <Check size={16} />
                <span>Save Biological Data &amp; Add in Queue</span>
              </button>
            </div>
          </div>
        )}

        {/* ── STAGE 5: Completed Summary & Queue Routing ── */}
        {stage === 'completed' && (
          <div className="terminal-card fade-in">
            <div className={`terminal-card__badge ${completionData?.is_emergency ? 'bg-red-subtle' : 'bg-emerald-subtle'}`}>
              {completionData?.is_emergency ? <Flame size={28} color="#dc2626" /> : <CheckCircle2 size={28} color="#16a34a" />}
            </div>

            <h2 className="terminal-card__title">
              {completionData?.is_emergency
                ? '🚨 Immediate Emergency Medical Attention Required'
                : 'Clinical Interrogation Completed'}
            </h2>

            <div
              style={{
                background: completionData?.is_emergency ? '#fef2f2' : '#f0fdf4',
                border: `1.5px solid ${completionData?.is_emergency ? '#ef4444' : '#22c55e'}`,
                borderRadius: 12,
                padding: '16px 20px',
                margin: '16px 0 24px',
                textAlign: 'left',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: completionData?.is_emergency ? '#991b1b' : '#15803d' }}>
                  {completionData?.is_emergency ? 'Assigned to Red Emergency Queue' : 'Assigned to Normal Queue (Pending Verification)'}
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, background: completionData?.is_emergency ? '#dc2626' : '#16a34a', color: '#fff', padding: '3px 8px', borderRadius: 6 }}>
                  {completionData?.is_emergency ? 'HIGH PRIORITY' : 'ROUTINE'}
                </span>
              </div>

              <p style={{ fontSize: 13.5, color: '#1e293b', margin: 0, lineHeight: 1.5 }}>
                {completionData?.concluding_message ||
                  'Your clinical triage summary has been saved and routed to the Mid-Level Health Worker and Doctor.'}
              </p>
            </div>

            <button
              type="button"
              onClick={handleNextPatient}
              className="btn-terminal-action"
              style={{ width: '100%', padding: '14px', fontSize: 15 }}
            >
              <span>Next Patient Arrival &rarr;</span>
            </button>
          </div>
        )}

      </main>

      {/* ── MODAL 1: Full Conversation Transcript ── */}
      {showTranscriptModal && (
        <div className="terminal-modal-overlay fade-in">
          <div className="terminal-modal-card">
            <div className="terminal-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileText size={16} className="text-blue-600" />
                <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: '#0f172a' }}>
                  Full Consultation Transcript — {activePatientId}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowTranscriptModal(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="terminal-modal-body">
              {conversationHistory.map((msg, idx) => (
                <div
                  key={idx}
                  style={{
                    background: msg.role === 'ai' ? '#f5f3ff' : '#f8fafc',
                    border: `1px solid ${msg.role === 'ai' ? '#ddd6fe' : '#e2e8f0'}`,
                    borderRadius: 8,
                    padding: '10px 12px',
                    fontSize: 12.5,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontWeight: 700, color: msg.role === 'ai' ? '#6d28d9' : '#0f172a' }}>
                    <span>{msg.role === 'ai' ? '🤖 Astra Clinical AI' : `👤 Patient (${activePatientId})`}</span>
                    <span style={{ fontSize: 11, color: '#64748b' }}>{msg.time}</span>
                  </div>
                  <p style={{ margin: 0, color: '#1e293b' }}>{msg.text}</p>
                  {msg.text_en && msg.text_en !== msg.text && (
                    <p style={{ margin: '4px 0 0', fontSize: 11.5, color: '#64748b', fontStyle: 'italic' }}>
                      English: {msg.text_en}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 2: Question Checklist ── */}
      {showQuestionsModal && (
        <div className="terminal-modal-overlay fade-in">
          <div className="terminal-modal-card">
            <div className="terminal-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ListOrdered size={16} className="text-indigo-600" />
                <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: '#0f172a' }}>
                  Clinical Memory Checklist ({questionsMemory.length} Questions)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowQuestionsModal(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="terminal-modal-body">
              {questionsMemory.map((q, idx) => (
                <div
                  key={idx}
                  style={{
                    background: q.flag === 'asked' ? '#f0fdf4' : '#f8fafc',
                    border: `1px solid ${q.flag === 'asked' ? '#86efac' : '#e2e8f0'}`,
                    borderRadius: 8,
                    padding: '8px 12px',
                    fontSize: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 700, color: '#0f172a', marginRight: 6 }}>Q{idx + 1}:</span>
                    <span style={{ color: '#334155' }}>{q.intent || q.question_text_en || 'Clinical Query'}</span>
                  </div>
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 800,
                      padding: '2px 6px',
                      borderRadius: 4,
                      background: q.flag === 'asked' ? '#22c55e' : '#cbd5e1',
                      color: '#fff',
                    }}
                  >
                    {q.flag === 'asked' ? 'ASKED' : 'PENDING'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Prescription Camera Modal ── */}
      {showCameraModal && (
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
          onSkip={(skipData) => {
            setShowCameraModal(false)
            if (skipData) {
              handleProcessReplyResponse(skipData)
            }
          }}
          onClose={() => setShowCameraModal(false)}
        />
      )}
    </div>
  )
}
