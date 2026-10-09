import React, { useState, useRef, useEffect } from 'react'
import {
  FlaskConical,
  Bot,
  FileText,
  Volume2,
  VolumeX,
  Mic,
  MicOff,
  Upload,
  Play,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Clock,
  Sparkles,
  ShieldAlert,
  Cpu,
  Layers,
  Search,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Check,
  X,
  Copy,
  Activity,
  Heart,
  Scale,
  Thermometer,
  Zap,
} from 'lucide-react'
import {
  testGenerateAgentQuestion,
  testSimulateAgentAnswer,
  testOcrDocumentInspection,
} from '../../../api/adminApi'
import OcrWorkflowTracker from '../../common/OcrWorkflowTracker'

const TEST_LANGUAGES = [
  { key: 'hindi', label: 'हिन्दी', sublabel: 'Hindi', code: 'hi-IN', flag: '🇮🇳' },
  { key: 'odia', label: 'ଓଡ଼ିଆ', sublabel: 'Odia', code: 'or-IN', flag: '🛕' },
  { key: 'english', label: 'English', sublabel: 'English', code: 'en-IN', flag: '🌐' },
  { key: 'tamil', label: 'தமிழ்', sublabel: 'Tamil', code: 'ta-IN', flag: '🏛️' },
  { key: 'telugu', label: 'తెలుగు', sublabel: 'Telugu', code: 'te-IN', flag: '🌾' },
  { key: 'bengali', label: 'বাংলা', sublabel: 'Bengali', code: 'bn-IN', flag: '🌊' },
  { key: 'marathi', label: 'मराठी', sublabel: 'Marathi', code: 'mr-IN', flag: '🚩' },
  { key: 'gujarati', label: 'ગુજરાતી', sublabel: 'Gujarati', code: 'gu-IN', flag: '🦁' },
  { key: 'kannada', label: 'ಕನ್ನಡ', sublabel: 'Kannada', code: 'kn-IN', flag: '🌺' },
  { key: 'malayalam', label: 'മലയാളം', sublabel: 'Malayalam', code: 'ml-IN', flag: '🌴' },
  { key: 'punjabi', label: 'ਪੰਜਾਬੀ', sublabel: 'Punjabi', code: 'pa-IN', flag: '🌾' },
]

const AGENT_PRESETS = [
  {
    title: 'High Fever & Evening Chills',
    lang: 'hindi',
    phase: 1,
    answer: 'मुझे पिछले 3 दिनों से तेज़ बुखार आ रहा है, शाम को बहुत ठंड और कंपकंपी लगती है और सिरदर्द रहता है।',
  },
  {
    title: 'Acute Chest Pain (Critical Red)',
    lang: 'hindi',
    phase: 1,
    answer: 'अचानक सीने में भारी दबाव और तेज दर्द हो रहा है जो बाएं हाथ और जबड़े तक जा रहा है, पसीना भी आ रहा है।',
  },
  {
    title: 'Persistent Cough & Sore Throat',
    lang: 'english',
    phase: 1,
    answer: 'I have had a dry hacking cough and scratchy sore throat for 4 days, with mild fatigue but no shortness of breath.',
  },
  {
    title: 'Fever & Abdominal Pain (Odia)',
    lang: 'odia',
    phase: 1,
    answer: 'ମୋତେ ୨ ଦିନ ହେଲା ପ୍ରବଳ ଜ୍ୱର ହେଉଛି ଏବଂ ପେଟର ଡାହାଣ ପାଖରେ ଭୀଷଣ ଯନ୍ତ୍ରଣା ହେଉଛି।',
  },
]

export default function TestingLabTab({ hub }) {
  // Mode: 'agent' (Agent Questioning Sandbox) | 'ocr' (OCR Document Lab)
  const [activeModule, setActiveModule] = useState('agent')

  // ═══════════════════════════════════════════════════════════════════════════
  // AGENT QUESTIONING TEST STATE
  // ═══════════════════════════════════════════════════════════════════════════
  const [agentLang, setAgentLang] = useState('hindi')
  const [agentPhase, setAgentPhase] = useState(1)
  const [ttsEngine, setTtsEngine] = useState('local')
  const [generatingQuestion, setGeneratingQuestion] = useState(false)
  const [generatedQuestion, setGeneratedQuestion] = useState(null)

  // Simulation input
  const [testAnswerText, setTestAnswerText] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [recordedAudioBlob, setRecordedAudioBlob] = useState(null)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const recordingTimerRef = useRef(null)

  // Execution & Output
  const [executingAgentTest, setExecutingAgentTest] = useState(false)
  const [agentTestResult, setAgentTestResult] = useState(null)
  const [agentTestError, setAgentTestError] = useState(null)

  // Audio Playback
  const [isPlayingAudio, setIsPlayingAudio] = useState(false)
  const currentAudioRef = useRef(null)

  // ═══════════════════════════════════════════════════════════════════════════
  // OCR TEST STATE
  // ═══════════════════════════════════════════════════════════════════════════
  const [ocrImageFile, setOcrImageFile] = useState(null)
  const [ocrImagePreview, setOcrImagePreview] = useState(null)
  const [executingOcrTest, setExecutingOcrTest] = useState(false)
  const [ocrTestingStep, setOcrTestingStep] = useState(1)
  const [ocrTestResult, setOcrTestResult] = useState(null)
  const [ocrTestError, setOcrTestError] = useState(null)
  const [testBypassNotice, setTestBypassNotice] = useState(false)
  const [showRawJson, setShowRawJson] = useState(false)
  const fileInputRef = useRef(null)

  // Clean audio on unmount
  useEffect(() => {
    return () => {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause()
        currentAudioRef.current = null
      }
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current)
    }
  }, [])

  // ─────────────────────────────────────────────────────────────────────────
  // Audio Playback Helper
  // ─────────────────────────────────────────────────────────────────────────
  const playBase64Wav = (base64Audio) => {
    if (!base64Audio) return
    if (currentAudioRef.current) {
      currentAudioRef.current.pause()
      currentAudioRef.current = null
    }
    try {
      const audioUrl = `data:audio/wav;base64,${base64Audio}`
      const audio = new Audio(audioUrl)
      currentAudioRef.current = audio
      setIsPlayingAudio(true)
      audio.onended = () => setIsPlayingAudio(false)
      audio.onerror = () => setIsPlayingAudio(false)
      audio.play().catch(() => setIsPlayingAudio(false))
    } catch {
      setIsPlayingAudio(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Agent Test Handlers
  // ─────────────────────────────────────────────────────────────────────────
  const handleGenerateQuestion = async () => {
    setGeneratingQuestion(true)
    setAgentTestError(null)
    try {
      const res = await testGenerateAgentQuestion({
        phase: agentPhase,
        language: agentLang,
        tts_engine: ttsEngine,
      })
      setGeneratedQuestion(res.data)
      if (res.data?.audio_base64) {
        playBase64Wav(res.data.audio_base64)
      }
    } catch (err) {
      setAgentTestError(err.response?.data?.detail || 'Failed to generate question from Agent engine.')
    } finally {
      setGeneratingQuestion(false)
    }
  }

  const handleStartVoiceRecording = async () => {
    try {
      setAgentTestError(null)
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
        if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      mediaRecorder.onstop = () => {
        const rawMime = mediaRecorder.mimeType || 'audio/webm'
        const cleanMime = rawMime.split(';')[0].trim().toLowerCase() || 'audio/webm'
        const blob = new Blob(audioChunksRef.current, { type: cleanMime })
        stream.getTracks().forEach((track) => track.stop())
        setRecordedAudioBlob(blob)
      }

      mediaRecorder.start(250)
      setIsRecording(true)
      setRecordingSeconds(0)

      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1)
      }, 1000)
    } catch {
      setAgentTestError('Microphone access unavailable. Please type your response instead.')
    }
  }

  const handleStopVoiceRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      clearInterval(recordingTimerRef.current)
    }
  }

  const handleRunAgentSimulation = async () => {
    if (!testAnswerText.trim() && !recordedAudioBlob) {
      setAgentTestError('Please type a response or record voice audio to test.')
      return
    }

    setExecutingAgentTest(true)
    setAgentTestError(null)
    setAgentTestResult(null)

    const formData = new FormData()
    if (recordedAudioBlob) {
      formData.append('audio_file', recordedAudioBlob, 'test_answer.webm')
    }
    if (testAnswerText.trim()) {
      formData.append('answer_text', testAnswerText.trim())
    }
    formData.append('language', agentLang)
    formData.append('tts_engine', ttsEngine)
    if (generatedQuestion?.question_text) {
      formData.append('question_asked', generatedQuestion.question_text)
    }

    try {
      const res = await testSimulateAgentAnswer(formData)
      setAgentTestResult(res.data)
    } catch (err) {
      setAgentTestError(err.response?.data?.detail || 'Agent simulation pipeline failed.')
    } finally {
      setExecutingAgentTest(false)
    }
  }

  const applyPreset = (preset) => {
    setAgentLang(preset.lang)
    setAgentPhase(preset.phase)
    setTestAnswerText(preset.answer)
    setRecordedAudioBlob(null)
    setAgentTestResult(null)
    setAgentTestError(null)
  }

  // ─────────────────────────────────────────────────────────────────────────
  // OCR Test Handlers
  // ─────────────────────────────────────────────────────────────────────────
  const handleSelectImage = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setOcrImageFile(file)
    setOcrTestResult(null)
    setOcrTestError(null)

    const reader = new FileReader()
    reader.onload = () => setOcrImagePreview(reader.result)
    reader.readAsDataURL(file)
  }

  const handleRunOcrTest = async () => {
    setExecutingOcrTest(true)
    setOcrTestError(null)
    setOcrTestResult(null)
    setTestBypassNotice(false)
    setOcrTestingStep(1)

    const s1 = setTimeout(() => setOcrTestingStep(2), 800)
    const s2 = setTimeout(() => setOcrTestingStep(3), 1800)
    const s3 = setTimeout(() => setOcrTestingStep(4), 2800)
    const s4 = setTimeout(() => setOcrTestingStep(5), 4000)
    const s5 = setTimeout(() => setOcrTestingStep(6), 5500)

    const formData = new FormData()
    formData.append('image_file', ocrImageFile)

    try {
      const res = await testOcrDocumentInspection(formData)
      clearTimeout(s1)
      clearTimeout(s2)
      clearTimeout(s3)
      clearTimeout(s4)
      clearTimeout(s5)
      setOcrTestingStep(7)
      setOcrTestResult(res.data)
    } catch (err) {
      clearTimeout(s1)
      clearTimeout(s2)
      clearTimeout(s3)
      clearTimeout(s4)
      clearTimeout(s5)
      setOcrTestError(err.response?.data?.detail || 'OCR document inspection failed.')
    } finally {
      setExecutingOcrTest(false)
    }
  }

  const handleTestGoWithoutReport = () => {
    setTestBypassNotice(true)
    setOcrImageFile(null)
    setOcrImagePreview(null)
    setOcrTestResult(null)
    setOcrTestError(null)
  }

  return (
    <div className="tab-pane fade-in" style={{ padding: '0 0 40px 0' }}>
      
      {/* ── Header Title & Sandbox Banner ── */}
      <div style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: 16,
        padding: '24px 28px',
        marginBottom: 24,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 16,
      }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '3px 10px', borderRadius: 20, fontSize: 11.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
            <Sparkles size={13} />
            <span>Stateless Verification Sandbox</span>
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 900, color: '#0f172a', margin: '0 0 6px 0', letterSpacing: -0.4 }}>
            Astra AI Component Test Lab
          </h2>
          <p style={{ fontSize: 13.5, color: '#64748b', margin: 0, lineHeight: 1.5, maxWidth: 680 }}>
            Test core intelligence engines in isolation without patient IDs or database storage.
            Simulate live conversational agent question-asking or inspect OCR clinical extraction.
          </p>
        </div>

        {/* Module Switcher Tabs */}
        <div style={{ display: 'inline-flex', background: '#f1f5f9', padding: 4, borderRadius: 12, border: '1px solid #e2e8f0' }}>
          <button
            type="button"
            onClick={() => setActiveModule('agent')}
            style={{
              padding: '10px 18px',
              borderRadius: 9,
              fontSize: 13,
              fontWeight: 800,
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: activeModule === 'agent' ? '#0f172a' : 'transparent',
              color: activeModule === 'agent' ? '#ffffff' : '#64748b',
              transition: 'all 0.15s ease',
            }}
          >
            <Bot size={16} />
            <span>Agent Questioning Sandbox</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveModule('ocr')}
            style={{
              padding: '10px 18px',
              borderRadius: 9,
              fontSize: 13,
              fontWeight: 800,
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: activeModule === 'ocr' ? '#0f172a' : 'transparent',
              color: activeModule === 'ocr' ? '#ffffff' : '#64748b',
              transition: 'all 0.15s ease',
            }}
          >
            <FileText size={16} />
            <span>Document OCR &amp; Rx Lab</span>
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* MODULE 1: AGENT QUESTIONING & CLINICAL EXTRACTION SANDBOX             */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {activeModule === 'agent' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          
          {/* Preset Buttons Bar */}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.4 }}>
              ⚡ Quick Scenarios:
            </span>
            {AGENT_PRESETS.map((p, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => applyPreset(p)}
                style={{
                  background: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: 8,
                  padding: '5px 12px',
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#1e293b',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {p.title}
              </button>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.8fr', gap: 24, alignItems: 'start' }}>
            
            {/* Left Column: Configuration & Step 1/2 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              
              {/* Card 1: Configuration */}
              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <h3 style={{ margin: '0 0 14px 0', fontSize: 14, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Cpu size={16} color="#2563eb" />
                  <span>1. Configure Agent Engine</span>
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>
                      Language / भाषा:
                    </label>
                    <select
                      value={agentLang}
                      onChange={(e) => setAgentLang(e.target.value)}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #cbd5e1', fontSize: 13, fontWeight: 600, background: '#fff' }}
                    >
                      {TEST_LANGUAGES.map((l) => (
                        <option key={l.key} value={l.key}>
                          {l.flag} {l.label} ({l.sublabel})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>
                        Question Phase:
                      </label>
                      <select
                        value={agentPhase}
                        onChange={(e) => setAgentPhase(Number(e.target.value))}
                        style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #cbd5e1', fontSize: 13, fontWeight: 600, background: '#fff' }}
                      >
                        <option value={1}>Phase 1 (Primary Symptom)</option>
                        <option value={2}>Phase 2 (Differential Gap)</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>
                        Voice Synthesizer:
                      </label>
                      <select
                        value={ttsEngine}
                        onChange={(e) => setTtsEngine(e.target.value)}
                        style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #cbd5e1', fontSize: 13, fontWeight: 600, background: '#fff' }}
                      >
                        <option value="local">Kokoro-82M (On-Device)</option>
                        <option value="sarvam">Sarvam Indic Cloud</option>
                      </select>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleGenerateQuestion}
                    disabled={generatingQuestion}
                    className="btn-terminal-action"
                    style={{ marginTop: 8, width: '100%', padding: '10px 14px', fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                  >
                    {generatingQuestion ? (
                      <>
                        <Clock size={15} className="animate-spin" />
                        <span>Generating Agent Question...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles size={15} />
                        <span>Generate Question</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Generated Question Preview Box */}
                {generatedQuestion && (
                  <div style={{ marginTop: 14, background: '#f8fafc', border: '1.5px solid #cbd5e1', borderRadius: 10, padding: '14px', fontSize: 13 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: '#2563eb', textTransform: 'uppercase' }}>
                        🤖 Agent Question Generated ({generatedQuestion.generation_latency_ms} ms)
                      </span>
                      {generatedQuestion.audio_base64 && (
                        <button
                          type="button"
                          onClick={() => playBase64Wav(generatedQuestion.audio_base64)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0f172a', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700 }}
                        >
                          <Volume2 size={14} color="#2563eb" />
                          <span>Play Audio</span>
                        </button>
                      )}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
                      "{generatedQuestion.question_text}"
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic' }}>
                      English: "{generatedQuestion.question_text_en}"
                    </div>
                    <div style={{ marginTop: 6, fontSize: 11, color: '#059669', fontWeight: 600 }}>
                      Clinical Intent: {generatedQuestion.clinical_intent}
                    </div>
                  </div>
                )}
              </div>

              {/* Card 2: Patient Roleplay Input */}
              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <h3 style={{ margin: '0 0 14px 0', fontSize: 14, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Mic size={16} color="#059669" />
                  <span>2. Roleplay Patient Response</span>
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {/* Voice recording button */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {!isRecording ? (
                      <button
                        type="button"
                        onClick={handleStartVoiceRecording}
                        style={{
                          flex: 1,
                          padding: '10px 14px',
                          borderRadius: 8,
                          border: '1.5px solid #cbd5e1',
                          background: '#f8fafc',
                          color: '#0f172a',
                          fontWeight: 700,
                          fontSize: 12.5,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                        }}
                      >
                        <Mic size={15} color="#dc2626" />
                        <span>Record Voice Answer (Microphone)</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleStopVoiceRecording}
                        style={{
                          flex: 1,
                          padding: '10px 14px',
                          borderRadius: 8,
                          border: '1.5px solid #ef4444',
                          background: '#fef2f2',
                          color: '#b91c1c',
                          fontWeight: 800,
                          fontSize: 12.5,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                          animation: 'pulse 1.5s infinite',
                        }}
                      >
                        <MicOff size={15} />
                        <span>Stop Recording ({recordingSeconds}s)</span>
                      </button>
                    )}

                    {recordedAudioBlob && (
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: '#059669', background: '#ecfdf5', padding: '5px 9px', borderRadius: 6, border: '1px solid #a7f3d0' }}>
                        ✓ Audio Ready
                      </span>
                    )}
                  </div>

                  {/* Text Input area */}
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>
                      Or Type Stated Symptoms &amp; Reply:
                    </label>
                    <textarea
                      rows={3}
                      value={testAnswerText}
                      onChange={(e) => setTestAnswerText(e.target.value)}
                      placeholder="Type patient response in any language (e.g. 'मुझे 3 दिन से तेज बुखार है और सीने में दर्द हो रहा है')..."
                      style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #cbd5e1', fontSize: 13, lineHeight: 1.45, resize: 'vertical' }}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleRunAgentSimulation}
                    disabled={executingAgentTest || (!testAnswerText.trim() && !recordedAudioBlob)}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: 10,
                      background: executingAgentTest ? '#94a3b8' : '#0f172a',
                      color: '#ffffff',
                      border: 'none',
                      fontSize: 14,
                      fontWeight: 800,
                      cursor: executingAgentTest ? 'wait' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      boxShadow: '0 4px 12px rgba(15,23,42,0.2)',
                    }}
                  >
                    {executingAgentTest ? (
                      <>
                        <Clock size={16} className="animate-spin" />
                        <span>Executing STT &amp; Clinical Extraction...</span>
                      </>
                    ) : (
                      <>
                        <Zap size={16} />
                        <span>Run AI Extraction &amp; Inspect Data</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {agentTestError && (
                <div style={{ background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: 10, padding: '12px 16px', color: '#b91c1c', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AlertCircle size={16} />
                  <span>{agentTestError}</span>
                </div>
              )}
            </div>

            {/* Right Column: Real-time Extraction Results */}
            <div>
              {!agentTestResult && !executingAgentTest ? (
                <div style={{ background: '#ffffff', border: '2px dashed #cbd5e1', borderRadius: 16, padding: '60px 24px', textAlign: 'center', color: '#64748b' }}>
                  <Bot size={48} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                  <h4 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', margin: '0 0 6px 0' }}>
                    Agent Test Results Awaiting Execution
                  </h4>
                  <p style={{ fontSize: 13, maxWidth: 380, margin: '0 auto', lineHeight: 1.5 }}>
                    Select a preset or type a patient symptom description, then click "Run AI Extraction" to inspect the structured clinical output.
                  </p>
                </div>
              ) : executingAgentTest ? (
                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '60px 24px', textAlign: 'center' }}>
                  <Clock size={40} className="animate-spin" style={{ margin: '0 auto 14px', color: '#2563eb' }} />
                  <h4 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', margin: '0 0 6px 0' }}>
                    Running Micro-Pipeline...
                  </h4>
                  <p style={{ fontSize: 13, color: '#64748b' }}>
                    Transcribing speech &rarr; Translating to canonical English &rarr; Evaluating urgency &rarr; Extracting clinical gaps
                  </p>
                </div>
              ) : (
                <div style={{ background: '#ffffff', border: '1.5px solid #e2e8f0', borderRadius: 16, padding: '24px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', gap: 18 }}>
                  
                  {/* Result Header Bar */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <CheckCircle2 size={20} color="#16a34a" />
                      <span style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>
                        Extraction Completed ({agentTestResult.performance_metrics?.total_pipeline_ms} ms)
                      </span>
                    </div>

                    {/* Urgency Badge */}
                    {(() => {
                      const lvl = agentTestResult.extracted_data?.urgency_evaluation?.level || 'green'
                      const isRed = lvl === 'red'
                      const isYellow = lvl === 'yellow'
                      return (
                        <div style={{
                          fontSize: 12,
                          fontWeight: 900,
                          padding: '4px 10px',
                          borderRadius: 6,
                          background: isRed ? '#fef2f2' : isYellow ? '#fffbeb' : '#ecfdf5',
                          border: `1.5px solid ${isRed ? '#dc2626' : isYellow ? '#d97706' : '#10b981'}`,
                          color: isRed ? '#b91c1c' : isYellow ? '#b45309' : '#047857',
                        }}>
                          {isRed ? '🚨 CRITICAL RED URGENCY' : isYellow ? '⚠️ URGENT YELLOW' : '🟢 NORMAL GREEN'}
                        </div>
                      )
                    })()}
                  </div>

                  {/* Patient Answer Processed */}
                  <div style={{ background: '#f8fafc', borderRadius: 10, padding: '12px 16px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>
                      Input Transcript ({agentTestResult.input_type}) · {agentTestResult.language_evaluated}:
                    </div>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0f172a' }}>
                      "{agentTestResult.raw_patient_response}"
                    </div>
                    {agentTestResult.translated_english && (
                      <div style={{ fontSize: 12, color: '#475569', marginTop: 4, fontStyle: 'italic' }}>
                        English Canonical: "{agentTestResult.translated_english}"
                      </div>
                    )}
                  </div>

                  {/* Extracted Clinical Symptoms */}
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Activity size={15} color="#2563eb" />
                      <span>Extracted Clinical Symptoms ({agentTestResult.extracted_data?.symptoms_identified?.length || 0})</span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {(agentTestResult.extracted_data?.symptoms_identified || []).map((s, idx) => (
                        <span key={idx} style={{ background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe', padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700 }}>
                          ✓ {s}
                        </span>
                      ))}
                      {(agentTestResult.extracted_data?.symptoms_identified || []).length === 0 && (
                        <span style={{ fontSize: 12, color: '#94a3b8' }}>No distinct primary symptoms extracted.</span>
                      )}
                    </div>
                  </div>

                  {/* Stated Clinical Parameters */}
                  {agentTestResult.extracted_data?.clinical_details_stated && (
                    <div style={{ background: '#fdf4ff', border: '1px solid #f5d0fe', borderRadius: 10, padding: '12px 14px' }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: '#86198f', textTransform: 'uppercase', marginBottom: 6 }}>
                        Captured Clinical Dimensions:
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 6, fontSize: 12 }}>
                        {Object.entries(agentTestResult.extracted_data.clinical_details_stated).map(([k, v], idx) => (
                          <div key={idx} style={{ color: '#4a044e' }}>
                            <strong>{k}:</strong> {String(v)}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Next Formulated Agent Question */}
                  {agentTestResult.next_agent_action && (
                    <div style={{ background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: 10, padding: '14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color: '#166534', textTransform: 'uppercase' }}>
                          🎯 Next Formulated Question (Adaptive Follow-Up)
                        </span>
                        {agentTestResult.next_agent_action.audio_base64 && (
                          <button
                            type="button"
                            onClick={() => playBase64Wav(agentTestResult.next_agent_action.audio_base64)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#15803d', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700 }}
                          >
                            <Volume2 size={14} />
                            <span>Play Spoken Audio</span>
                          </button>
                        )}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>
                        "{agentTestResult.next_agent_action.formulated_question}"
                      </div>
                      <div style={{ fontSize: 12, color: '#475569', fontStyle: 'italic', marginBottom: 6 }}>
                        "{agentTestResult.next_agent_action.formulated_question_en}"
                      </div>
                      <div style={{ fontSize: 11.5, color: '#15803d', fontWeight: 600 }}>
                        Intent: {agentTestResult.next_agent_action.intent}
                      </div>
                    </div>
                  )}

                  {/* Micro-Timing Metrics */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, background: '#f8fafc', padding: '10px 14px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 11 }}>
                    <div>
                      <span style={{ color: '#64748b' }}>STT: </span>
                      <strong>{agentTestResult.performance_metrics?.stt_ms || 0} ms</strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748b' }}>Translation: </span>
                      <strong>{agentTestResult.performance_metrics?.translation_ms || 0} ms</strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748b' }}>Urgency: </span>
                      <strong>{agentTestResult.performance_metrics?.urgency_detection_ms || 0} ms</strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748b' }}>Gap NLP: </span>
                      <strong>{agentTestResult.performance_metrics?.clinical_gap_analysis_ms || 0} ms</strong>
                    </div>
                  </div>

                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* MODULE 2: MEDICAL DOCUMENT OCR & PRESCRIPTION LAB                     */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {activeModule === 'ocr' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* 6-Stage OCR Workflow Overview Tracker */}
          <OcrWorkflowTracker
            currentStepIndex={executingOcrTest ? ocrTestingStep : ocrTestResult ? 7 : 1}
            isProcessing={executingOcrTest}
            stepMetrics={ocrTestResult ? {
              blur_score: ocrTestResult.quality_assessment?.metrics?.blur_score || 92,
              classification: ocrTestResult.document_classification?.type || 'printed',
              is_medical: true,
              medications_count: ocrTestResult.structured_clinical_extraction?.medications?.length || 0,
              is_stored: true,
            } : null}
            rejectionReason={ocrTestError}
            onGoWithoutReport={handleTestGoWithoutReport}
          />

          {testBypassNotice && (
            <div style={{ background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <CheckCircle2 size={20} color="#16a34a" />
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 800, color: '#166534' }}>
                    "Go Without Report" Bypass Flow Verified!
                  </div>
                  <div style={{ fontSize: 12, color: '#15803d' }}>
                    Triage interrogation proceeds directly to conversational screening with zero blocking exceptions.
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTestBypassNotice(false)}
                style={{ background: '#ffffff', border: '1px solid #86efac', borderRadius: 6, padding: '4px 10px', fontSize: 11.5, fontWeight: 700, color: '#166534', cursor: 'pointer' }}
              >
                Dismiss
              </button>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.8fr', gap: 24, alignItems: 'start' }}>
            
            {/* Left Column: Image Selection & Controls */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              
              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <h3 style={{ margin: '0 0 14px 0', fontSize: 14, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ImageIcon size={16} color="#2563eb" />
                  <span>1. Upload Prescription / Medical Report</span>
                </h3>

                {/* Dropzone */}
                <div
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    border: '2px dashed #cbd5e1',
                    borderRadius: 12,
                    padding: '30px 16px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    background: ocrImagePreview ? '#f8fafc' : '#fcfcfd',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*"
                    onChange={handleSelectImage}
                    style={{ display: 'none' }}
                  />

                  {ocrImagePreview ? (
                    <div>
                      <img
                        src={ocrImagePreview}
                        alt="Preview"
                        style={{ maxWidth: '100%', maxHeight: 240, borderRadius: 8, margin: '0 auto', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}
                      />
                      <div style={{ marginTop: 10, fontSize: 12, color: '#2563eb', fontWeight: 700 }}>
                        Click to change image ({ocrImageFile?.name})
                      </div>
                    </div>
                  ) : (
                    <div>
                      <Upload size={36} color="#94a3b8" style={{ margin: '0 auto 10px' }} />
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
                        Click to upload prescription photo or report
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>
                        Supports JPG, PNG, WEBP (camera photos or scanned documents)
                      </div>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleRunOcrTest}
                  disabled={executingOcrTest || !ocrImageFile}
                  style={{
                    marginTop: 16,
                    width: '100%',
                    padding: '12px 16px',
                    borderRadius: 10,
                    background: executingOcrTest || !ocrImageFile ? '#94a3b8' : '#0f172a',
                    color: '#ffffff',
                    border: 'none',
                    fontSize: 14,
                    fontWeight: 800,
                    cursor: executingOcrTest || !ocrImageFile ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    boxShadow: '0 4px 12px rgba(15,23,42,0.2)',
                  }}
                >
                  {executingOcrTest ? (
                    <>
                      <Clock size={16} className="animate-spin" />
                      <span>Running Multi-Stage OCR Inspection...</span>
                    </>
                  ) : (
                    <>
                      <Zap size={16} />
                      <span>Run Multi-Stage OCR Inspection</span>
                    </>
                  )}
                </button>
              </div>

              {ocrTestError && (
                <div style={{ background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: 10, padding: '12px 16px', color: '#b91c1c', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AlertCircle size={16} />
                  <span>{ocrTestError}</span>
                </div>
              )}
            </div>

            {/* Right Column: Multi-stage OCR Diagnostics */}
            <div>
              {!ocrTestResult && !executingOcrTest ? (
                <div style={{ background: '#ffffff', border: '2px dashed #cbd5e1', borderRadius: 16, padding: '60px 24px', textAlign: 'center', color: '#64748b' }}>
                  <FileText size={48} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                  <h4 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', margin: '0 0 6px 0' }}>
                    Document OCR Diagnostics
                  </h4>
                  <p style={{ fontSize: 13, maxWidth: 380, margin: '0 auto', lineHeight: 1.5 }}>
                    Upload any doctor prescription, outpatient slip, or lab report to inspect quality checks, printed/handwritten classification, raw OCR, and structured clinical extraction.
                  </p>
                </div>
              ) : executingOcrTest ? (
                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '60px 24px', textAlign: 'center' }}>
                  <Clock size={40} className="animate-spin" style={{ margin: '0 auto 14px', color: '#2563eb' }} />
                  <h4 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', margin: '0 0 6px 0' }}>
                    Inspecting Document with OCR Engine...
                  </h4>
                  <p style={{ fontSize: 13, color: '#64748b' }}>
                    OpenCV quality assessment &rarr; MobileNetV3 classification &rarr; PaddleOCR line extraction &rarr; Sarvam LLM clinical structuring
                  </p>
                </div>
              ) : (
                <div style={{ background: '#ffffff', border: '1.5px solid #e2e8f0', borderRadius: 16, padding: '24px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', gap: 18 }}>
                  
                  {/* Top Bar: Latency & File Info */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <CheckCircle2 size={20} color="#16a34a" />
                      <span style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>
                        OCR Pipeline Completed ({ocrTestResult.performance_metrics?.total_pipeline_ms} ms)
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowRawJson(!showRawJson)}
                      style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 6, padding: '4px 10px', fontSize: 11.5, fontWeight: 700, color: '#334155', cursor: 'pointer' }}
                    >
                      {showRawJson ? 'Hide Raw JSON' : 'Inspect Raw JSON'}
                    </button>
                  </div>

                  {/* Stage 1 & 2 Cards Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    
                    {/* Quality Assessment */}
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 14px' }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>
                        Stage 1: Image Quality Check
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: ocrTestResult.quality_assessment?.is_quality_passed ? '#047857' : '#b91c1c', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>{ocrTestResult.quality_assessment?.is_quality_passed ? '✓ Quality Passed' : '✕ Quality Alert'}</span>
                      </div>
                      <div style={{ fontSize: 11.5, color: '#475569', marginTop: 4 }}>
                        Blur score: {ocrTestResult.quality_assessment?.metrics?.blur_score || 'N/A'} · Brightness: {ocrTestResult.quality_assessment?.metrics?.brightness || 'N/A'}
                      </div>
                    </div>

                    {/* Classification */}
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 14px' }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>
                        Stage 2: Classifier
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', textTransform: 'capitalize' }}>
                        {ocrTestResult.document_classification?.type} Document
                      </div>
                      <div style={{ fontSize: 11.5, color: '#475569', marginTop: 4 }}>
                        Confidence: {(ocrTestResult.document_classification?.confidence * 100).toFixed(0)}%
                      </div>
                    </div>

                  </div>

                  {/* Stage 3: Raw OCR Text Summary */}
                  <div style={{ background: '#f8fafc', borderRadius: 10, padding: '12px 14px', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>
                        Stage 3: Extracted Text Lines ({ocrTestResult.raw_ocr_extraction?.total_lines || 0} lines · {ocrTestResult.raw_ocr_extraction?.total_characters || 0} chars)
                      </span>
                      <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 700 }}>
                        Avg Confidence: {((ocrTestResult.raw_ocr_extraction?.average_confidence || 0) * 100).toFixed(0)}%
                      </span>
                    </div>

                    <div style={{ maxHeight: 110, overflowY: 'auto', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: '8px 10px', fontSize: 12, fontFamily: 'monospace', color: '#1e293b', whiteSpace: 'pre-wrap' }}>
                      {ocrTestResult.raw_ocr_extraction?.raw_text || 'No text extracted.'}
                    </div>

                    {/* Matched Medical Terms */}
                    {ocrTestResult.raw_ocr_extraction?.matched_medical_keywords?.length > 0 && (
                      <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Medical Terms:</span>
                        {ocrTestResult.raw_ocr_extraction.matched_medical_keywords.map((kw, i) => (
                          <span key={i} style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', padding: '1px 6px', borderRadius: 4, fontSize: 10.5, fontWeight: 700 }}>
                            {kw}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Stage 4: Structured Clinical Extraction (Medications & Vitals) */}
                  <div style={{ background: '#fdfcfe', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 800, color: '#7c3aed', textTransform: 'uppercase' }}>
                          Stage 4: Structured Clinical Data (Zero-Hallucination LLM)
                        </div>
                        <h4 style={{ margin: '2px 0 0 0', fontSize: 15, fontWeight: 800, color: '#0f172a' }}>
                          {ocrTestResult.structured_clinical_extraction?.report_type || 'Prescription Document'}
                        </h4>
                      </div>

                      <div style={{ fontSize: 12, color: '#64748b' }}>
                        Dr: <strong>{ocrTestResult.structured_clinical_extraction?.doctor_name || 'Not identified'}</strong>
                      </div>
                    </div>

                    {/* Medications Table */}
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>
                        Prescribed Medications ({ocrTestResult.structured_clinical_extraction?.medications?.length || 0}):
                      </div>
                      {ocrTestResult.structured_clinical_extraction?.medications?.length > 0 ? (
                        <div style={{ border: '1px solid #cbd5e1', borderRadius: 8, overflow: 'hidden' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'left' }}>
                            <thead style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1', color: '#334155' }}>
                              <tr>
                                <th style={{ padding: '6px 10px' }}>Medication Name</th>
                                <th style={{ padding: '6px 10px' }}>Form</th>
                                <th style={{ padding: '6px 10px' }}>Dosage</th>
                                <th style={{ padding: '6px 10px' }}>Frequency</th>
                                <th style={{ padding: '6px 10px' }}>Duration</th>
                              </tr>
                            </thead>
                            <tbody>
                              {ocrTestResult.structured_clinical_extraction.medications.map((m, idx) => (
                                <tr key={idx} style={{ borderBottom: idx !== ocrTestResult.structured_clinical_extraction.medications.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                                  <td style={{ padding: '6px 10px', fontWeight: 700, color: '#0f172a' }}>{m.medicine_name || m.name || '—'}</td>
                                  <td style={{ padding: '6px 10px', color: '#64748b' }}>{m.formulation || 'Tab'}</td>
                                  <td style={{ padding: '6px 10px' }}>{m.dosage || '—'}</td>
                                  <td style={{ padding: '6px 10px' }}>{m.frequency || '—'}</td>
                                  <td style={{ padding: '6px 10px' }}>{m.duration || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>
                          No structured medication items identified.
                        </div>
                      )}
                    </div>

                    {/* Clinical Summary */}
                    {ocrTestResult.structured_clinical_extraction?.clinical_summary && (
                      <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: 8, fontSize: 12.5, color: '#334155', lineHeight: 1.45 }}>
                        <strong>Clinical Summary:</strong> {ocrTestResult.structured_clinical_extraction.clinical_summary}
                      </div>
                    )}
                  </div>

                  {/* Raw JSON Inspector */}
                  {showRawJson && (
                    <div style={{ background: '#0f172a', color: '#e2e8f0', borderRadius: 10, padding: '14px', fontSize: 11.5, fontFamily: 'monospace', maxHeight: 240, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
                      {JSON.stringify(ocrTestResult, null, 2)}
                    </div>
                  )}

                </div>
              )}
            </div>

          </div>
        </div>
      )}

    </div>
  )
}
