import { useState, useEffect, useRef } from 'react'
import {
  Languages,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  ArrowRightLeft,
  Copy,
  Check,
  Sparkles,
  Send,
  Trash2,
  X,
  FileText,
  HelpCircle,
  Stethoscope,
  ChevronRight,
  PlusCircle,
  MessageSquare,
  CornerDownLeft,
} from 'lucide-react'
import {
  getSupportedLanguages,
  getClinicalPresets,
  translateMedicalText,
  speakTranslatedText,
  FALLBACK_LANGUAGES,
} from '../../api/translationApi'

export default function MedicalTranslationMachine({
  isOpen = false,
  onClose = () => {},
  defaultSourceLang = 'en-IN',
  defaultTargetLang = 'hi-IN',
  patientName = 'Patient',
  onInsertText = null, // Callback to insert translated text into consultation notes or remark fields
}) {
  const [languages, setLanguages] = useState(FALLBACK_LANGUAGES)
  const [sourceLang, setSourceLang] = useState(defaultSourceLang)
  const [targetLang, setTargetLang] = useState(defaultTargetLang)
  const [inputText, setInputText] = useState('')
  const [translatedText, setTranslatedText] = useState('')
  const [isTranslating, setIsTranslating] = useState(false)
  const [isPlayingAudio, setIsPlayingAudio] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [presets, setPresets] = useState([])
  const [selectedCategory, setSelectedCategory] = useState(0)
  const [activeTab, setActiveTab] = useState('translator') // 'translator' | 'presets' | 'history'
  const [dialogueHistory, setDialogueHistory] = useState([])
  const [copiedField, setCopiedField] = useState(null)
  const [errorNotice, setErrorNotice] = useState('')

  const recognitionRef = useRef(null)
  const currentAudioRef = useRef(null)

  // Load languages and presets on mount
  useEffect(() => {
    let isMounted = true
    const initData = async () => {
      try {
        const [langs, presetList] = await Promise.all([
          getSupportedLanguages(),
          getClinicalPresets(),
        ])
        if (isMounted) {
          if (langs && langs.length > 0) setLanguages(langs)
          if (presetList && presetList.length > 0) setPresets(presetList)
        }
      } catch (e) {
        console.warn('Could not load translation initial data:', e)
      }
    }
    initData()
    return () => {
      isMounted = false
      if (currentAudioRef.current) {
        currentAudioRef.current.pause()
      }
    }
  }, [])

  // Update target language if default changes
  useEffect(() => {
    if (defaultTargetLang) {
      setTargetLang(defaultTargetLang)
    }
  }, [defaultTargetLang])

  // Get language metadata helper
  const getLangMeta = (code) => {
    return languages.find((l) => l.code === code) || { name: code, native: code }
  }

  // Swap Languages
  const handleSwapLanguages = () => {
    const prevSrc = sourceLang
    const prevTgt = targetLang
    const prevInp = inputText
    const prevOut = translatedText

    setSourceLang(prevTgt)
    setTargetLang(prevSrc)
    setInputText(prevOut || '')
    setTranslatedText(prevInp || '')
  }

  // Execute Translation
  const handleTranslate = async (customText = null, customSrc = null, customTgt = null) => {
    const textToTranslate = customText !== null ? customText : inputText
    const sLang = customSrc || sourceLang
    const tLang = customTgt || targetLang

    if (!textToTranslate || !textToTranslate.trim()) {
      return
    }

    setIsTranslating(true)
    setErrorNotice('')
    try {
      const res = await translateMedicalText({
        text: textToTranslate.trim(),
        source_lang: sLang,
        target_lang: tLang,
        context: 'clinical',
      })

      const output = res.translated_text || ''
      setTranslatedText(output)

      // Add to dialogue session history
      const historyItem = {
        id: Date.now(),
        sourceText: textToTranslate.trim(),
        translatedText: output,
        sourceLang: sLang,
        targetLang: tLang,
        sourceLangName: getLangMeta(sLang).name,
        targetLangName: getLangMeta(tLang).name,
        targetNative: getLangMeta(tLang).native,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }

      setDialogueHistory((prev) => [historyItem, ...prev.slice(0, 19)])
    } catch (err) {
      console.error('Translation error:', err)
      setErrorNotice(err?.response?.data?.detail || 'Translation service temporarily unavailable.')
    } finally {
      setIsTranslating(false)
    }
  }

  // Handle Preset Click
  const handleSelectPreset = (questionText) => {
    setInputText(questionText)
    setActiveTab('translator')
    handleTranslate(questionText, sourceLang, targetLang)
  }

  // Neural Speech Output (Audio)
  const handleSpeakAloud = async (textToSpeak = null, langCode = null) => {
    const text = textToSpeak || translatedText
    const code = langCode || targetLang

    if (!text || !text.trim()) return

    if (isPlayingAudio && currentAudioRef.current) {
      currentAudioRef.current.pause()
      setIsPlayingAudio(false)
      return
    }

    setIsPlayingAudio(true)
    try {
      // Try backend neural TTS endpoint
      const res = await speakTranslatedText({
        text: text.trim(),
        lang_code: code,
      })

      if (res?.audio_base64) {
        const audio = new Audio(`data:audio/wav;base64,${res.audio_base64}`)
        currentAudioRef.current = audio
        audio.onended = () => setIsPlayingAudio(false)
        audio.onerror = () => {
          fallbackBrowserTTS(text, code)
        }
        await audio.play()
      } else {
        fallbackBrowserTTS(text, code)
      }
    } catch (err) {
      console.warn('Backend TTS failed, using browser speech synthesis:', err)
      fallbackBrowserTTS(text, code)
    }
  }

  // Browser Web Speech API Fallback for TTS
  const fallbackBrowserTTS = (text, code) => {
    if (!('speechSynthesis' in window)) {
      setIsPlayingAudio(false)
      return
    }
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = code
    utterance.rate = 0.95
    utterance.onend = () => setIsPlayingAudio(false)
    utterance.onerror = () => setIsPlayingAudio(false)
    window.speechSynthesis.speak(utterance)
  }

  // Speech-to-Text (Mic Input)
  const toggleSpeechRecognition = () => {
    if (isRecording) {
      if (recognitionRef.current) {
        recognitionRef.current.stop()
      }
      setIsRecording(false)
      return
    }

    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRec) {
      alert('Voice dictation is not supported in this browser. Please use Chrome, Edge, or enter text manually.')
      return
    }

    try {
      const recognition = new SpeechRec()
      recognition.lang = sourceLang
      recognition.interimResults = false
      recognition.continuous = false

      recognition.onstart = () => {
        setIsRecording(true)
      }

      recognition.onresult = (e) => {
        const transcript = e.results[0][0].transcript
        if (transcript) {
          setInputText((prev) => (prev ? `${prev} ${transcript}` : transcript))
          handleTranslate(transcript, sourceLang, targetLang)
        }
      }

      recognition.onerror = (e) => {
        console.warn('Speech recognition error:', e)
        setIsRecording(false)
      }

      recognition.onend = () => {
        setIsRecording(false)
      }

      recognitionRef.current = recognition
      recognition.start()
    } catch (err) {
      console.error('Failed to start speech recognition:', err)
      setIsRecording(false)
    }
  }

  // Copy to clipboard
  const handleCopy = (text, fieldKey) => {
    if (!text) return
    navigator.clipboard.writeText(text)
    setCopiedField(fieldKey)
    setTimeout(() => setCopiedField(null), 2000)
  }

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 920,
          maxHeight: '92vh',
          background: '#ffffff',
          borderRadius: 16,
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: '1px solid #e2e8f0',
        }}
      >
        {/* ── Modal Header ── */}
        <div
          style={{
            padding: '16px 22px',
            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #334155',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.35)',
              }}
            >
              <Languages size={22} color="#ffffff" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, letterSpacing: -0.2 }}>
                  11-Language Medical Translation Machine
                </h3>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    background: '#065f46',
                    color: '#6ee7b7',
                    padding: '2px 8px',
                    borderRadius: 12,
                    border: '1px solid #047857',
                  }}
                >
                  Neural Indic AI
                </span>
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                Patient: <strong style={{ color: '#f1f5f9' }}>{patientName}</strong> · Real-time two-way dialogue translation with audio voice output
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Tab navigation pills */}
            <div
              style={{
                display: 'flex',
                background: 'rgba(255, 255, 255, 0.08)',
                borderRadius: 8,
                padding: 3,
                gap: 2,
              }}
            >
              <button
                type="button"
                onClick={() => setActiveTab('translator')}
                style={{
                  padding: '6px 12px',
                  borderRadius: 6,
                  border: 'none',
                  background: activeTab === 'translator' ? '#2563eb' : 'transparent',
                  color: '#ffffff',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                Translate
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('presets')}
                style={{
                  padding: '6px 12px',
                  borderRadius: 6,
                  border: 'none',
                  background: activeTab === 'presets' ? '#2563eb' : 'transparent',
                  color: '#ffffff',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                Presets
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('history')}
                style={{
                  padding: '6px 12px',
                  borderRadius: 6,
                  border: 'none',
                  background: activeTab === 'history' ? '#2563eb' : 'transparent',
                  color: '#ffffff',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                History ({dialogueHistory.length})
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                border: '1px solid rgba(255, 255, 255, 0.15)',
                background: 'rgba(255, 255, 255, 0.05)',
                color: '#cbd5e1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
              title="Close Modal"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ── 11 Indian Languages Quick Switch Bar ── */}
        <div
          style={{
            padding: '10px 20px',
            background: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            overflowX: 'auto',
          }}
        >
          <span style={{ fontSize: 11.5, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, flexShrink: 0 }}>
            Patient Language:
          </span>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
            {languages.map((lang) => {
              const isSelected = targetLang === lang.code
              return (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => {
                    setTargetLang(lang.code)
                    if (inputText.trim()) {
                      handleTranslate(inputText, sourceLang, lang.code)
                    }
                  }}
                  style={{
                    padding: '5px 11px',
                    borderRadius: 20,
                    fontSize: 12,
                    fontWeight: 700,
                    border: isSelected ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                    background: isSelected ? '#eff6ff' : '#ffffff',
                    color: isSelected ? '#1d4ed8' : '#334155',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span>{lang.name}</span>
                  <span style={{ fontSize: 10, opacity: 0.8 }}>({lang.native})</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Main Body Content ── */}
        <div style={{ padding: 22, overflowY: 'auto', flex: 1 }}>
          {errorNotice && (
            <div
              style={{
                marginBottom: 16,
                padding: '10px 14px',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: 8,
                color: '#991b1b',
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span>{errorNotice}</span>
              <button
                type="button"
                onClick={() => setErrorNotice('')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b' }}
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* TAB 1: Translation Machine */}
          {activeTab === 'translator' && (
            <div>
              {/* Language Selector Bar & Swap Button */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto 1fr',
                  gap: 12,
                  alignItems: 'center',
                  marginBottom: 16,
                }}
              >
                {/* Source Lang Picker */}
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: 4 }}>
                    From (Clinician / Speaker)
                  </label>
                  <select
                    value={sourceLang}
                    onChange={(e) => setSourceLang(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: '1.5px solid #cbd5e1',
                      fontSize: 13,
                      fontWeight: 700,
                      background: '#f8fafc',
                      color: '#0f172a',
                    }}
                  >
                    {languages.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.name} — {l.native} ({l.code})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Swap Button */}
                <button
                  type="button"
                  onClick={handleSwapLanguages}
                  style={{
                    width: 38,
                    height: 38,
                    marginTop: 18,
                    borderRadius: 10,
                    border: '1.5px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#0f172a',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                    transition: 'all 0.15s ease',
                  }}
                  title="Swap source and target languages"
                >
                  <ArrowRightLeft size={16} />
                </button>

                {/* Target Lang Picker */}
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: 4 }}>
                    To (Patient / Listener)
                  </label>
                  <select
                    value={targetLang}
                    onChange={(e) => {
                      setTargetLang(e.target.value)
                      if (inputText.trim()) {
                        handleTranslate(inputText, sourceLang, e.target.value)
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: '1.5px solid #2563eb',
                      fontSize: 13,
                      fontWeight: 700,
                      background: '#eff6ff',
                      color: '#1d4ed8',
                    }}
                  >
                    {languages.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.name} — {l.native} ({l.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Two-Card Translation Layout */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 16,
                  marginBottom: 16,
                }}
              >
                {/* ── Input Card ── */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    border: '1.5px solid #cbd5e1',
                    borderRadius: 12,
                    background: '#ffffff',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      padding: '10px 14px',
                      background: '#f8fafc',
                      borderBottom: '1px solid #e2e8f0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>
                      {getLangMeta(sourceLang).name} ({getLangMeta(sourceLang).native})
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {inputText && (
                        <button
                          type="button"
                          onClick={() => setInputText('')}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#94a3b8',
                            cursor: 'pointer',
                            fontSize: 11,
                          }}
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>

                  <textarea
                    rows={5}
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault()
                        handleTranslate()
                      }
                    }}
                    placeholder={`Type question or instruction in ${getLangMeta(sourceLang).name}... (Ctrl+Enter to translate)`}
                    style={{
                      flex: 1,
                      padding: '12px 14px',
                      border: 'none',
                      outline: 'none',
                      resize: 'none',
                      fontSize: 14,
                      color: '#0f172a',
                      fontFamily: 'inherit',
                      lineHeight: 1.5,
                    }}
                  />

                  {/* Input Card Footer / Actions */}
                  <div
                    style={{
                      padding: '8px 12px',
                      borderTop: '1px solid #f1f5f9',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: '#ffffff',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        type="button"
                        onClick={toggleSpeechRecognition}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '6px 12px',
                          borderRadius: 8,
                          border: isRecording ? '1.5px solid #ef4444' : '1px solid #cbd5e1',
                          background: isRecording ? '#fef2f2' : '#f8fafc',
                          color: isRecording ? '#dc2626' : '#334155',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                        title="Speak via Microphone"
                      >
                        {isRecording ? <MicOff size={14} className="animate-pulse" /> : <Mic size={14} />}
                        <span>{isRecording ? 'Listening...' : 'Voice Input'}</span>
                      </button>

                      {inputText && (
                        <button
                          type="button"
                          onClick={() => handleSpeakAloud(inputText, sourceLang)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '6px 10px',
                            borderRadius: 8,
                            border: '1px solid #cbd5e1',
                            background: '#f8fafc',
                            color: '#334155',
                            fontSize: 12,
                            cursor: 'pointer',
                          }}
                          title="Listen to input"
                        >
                          <Volume2 size={13} />
                        </button>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleTranslate()}
                      disabled={isTranslating || !inputText.trim()}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '7px 16px',
                        borderRadius: 8,
                        border: 'none',
                        background: '#2563eb',
                        color: '#ffffff',
                        fontSize: 12.5,
                        fontWeight: 700,
                        cursor: isTranslating || !inputText.trim() ? 'not-allowed' : 'pointer',
                        opacity: isTranslating || !inputText.trim() ? 0.6 : 1,
                        boxShadow: '0 2px 4px rgba(37, 99, 235, 0.25)',
                      }}
                    >
                      {isTranslating ? (
                        <>
                          <Sparkles size={14} className="animate-spin" />
                          <span>Translating...</span>
                        </>
                      ) : (
                        <>
                          <Send size={13} />
                          <span>Translate</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* ── Output Translation Card ── */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    border: '1.5px solid #93c5fd',
                    borderRadius: 12,
                    background: '#f8fafc',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      padding: '10px 14px',
                      background: '#eff6ff',
                      borderBottom: '1px solid #dbeafe',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: '#1d4ed8' }}>
                        {getLangMeta(targetLang).name} ({getLangMeta(targetLang).native})
                      </span>
                      <span style={{ fontSize: 10, background: '#dbeafe', color: '#1e40af', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>
                        {getLangMeta(targetLang).script} Script
                      </span>
                    </div>

                    {translatedText && (
                      <button
                        type="button"
                        onClick={() => handleCopy(translatedText, 'main_output')}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          background: 'none',
                          border: 'none',
                          color: copiedField === 'main_output' ? '#059669' : '#1d4ed8',
                          fontSize: 11.5,
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        {copiedField === 'main_output' ? <Check size={12} /> : <Copy size={12} />}
                        <span>{copiedField === 'main_output' ? 'Copied!' : 'Copy'}</span>
                      </button>
                    )}
                  </div>

                  <div
                    style={{
                      flex: 1,
                      padding: '14px',
                      fontSize: 15,
                      color: '#0f172a',
                      lineHeight: 1.6,
                      minHeight: 120,
                      fontWeight: 600,
                      whiteSpace: 'pre-wrap',
                      background: '#ffffff',
                    }}
                  >
                    {translatedText ? (
                      translatedText
                    ) : (
                      <span style={{ color: '#94a3b8', fontWeight: 400, fontSize: 13 }}>
                        {isTranslating
                          ? 'Neural model translating medical phrasing...'
                          : `Translation in ${getLangMeta(targetLang).name} (${getLangMeta(targetLang).native}) will appear here.`}
                      </span>
                    )}
                  </div>

                  {/* Output Card Footer / Actions */}
                  <div
                    style={{
                      padding: '8px 12px',
                      borderTop: '1px solid #e2e8f0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: '#f8fafc',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => handleSpeakAloud()}
                        disabled={!translatedText}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '6px 14px',
                          borderRadius: 8,
                          border: '1.5px solid #059669',
                          background: isPlayingAudio ? '#ecfdf5' : '#059669',
                          color: isPlayingAudio ? '#065f46' : '#ffffff',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: !translatedText ? 'not-allowed' : 'pointer',
                          opacity: !translatedText ? 0.5 : 1,
                          boxShadow: '0 2px 4px rgba(5, 150, 105, 0.2)',
                        }}
                        title={`Speak translated text in ${getLangMeta(targetLang).name}`}
                      >
                        {isPlayingAudio ? <VolumeX size={14} className="animate-pulse" /> : <Volume2 size={14} />}
                        <span>{isPlayingAudio ? 'Speaking...' : '🔊 Speak Aloud to Patient'}</span>
                      </button>
                    </div>

                    {onInsertText && (
                      <button
                        type="button"
                        onClick={() => {
                          if (translatedText) {
                            onInsertText(translatedText)
                          }
                        }}
                        disabled={!translatedText}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 5,
                          padding: '6px 12px',
                          borderRadius: 8,
                          border: '1px solid #cbd5e1',
                          background: '#ffffff',
                          color: '#0f172a',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: !translatedText ? 'not-allowed' : 'pointer',
                          opacity: !translatedText ? 0.5 : 1,
                        }}
                        title="Insert translation into clinical notes"
                      >
                        <CornerDownLeft size={12} />
                        <span>Insert in Notes</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Quick Presets Snippet Bar ── */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 10,
                  padding: '12px 14px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 800, color: '#334155' }}>
                    <Sparkles size={14} color="#2563eb" />
                    <span>Frequently Asked Medical Questions:</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('presets')}
                    style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}
                  >
                    View All Presets →
                  </button>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {[
                    'Where does it hurt the most?',
                    'How many days have you had this fever?',
                    'Take this medicine twice a day after meals.',
                    'Do you have any diabetes or high blood pressure?',
                    'Please sit down and rest for a minute.',
                  ].map((presetQ, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleSelectPreset(presetQ)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 6,
                        background: '#ffffff',
                        border: '1px solid #cbd5e1',
                        fontSize: 11.5,
                        color: '#334155',
                        fontWeight: 600,
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.1s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = '#2563eb'
                        e.currentTarget.style.color = '#1d4ed8'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = '#cbd5e1'
                        e.currentTarget.style.color = '#334155'
                      }}
                    >
                      + {presetQ}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Full Clinical Presets Library */}
          {activeTab === 'presets' && (
            <div>
              {/* Category Pills */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
                {presets.map((cat, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedCategory(idx)}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 8,
                      border: selectedCategory === idx ? '1.5px solid #2563eb' : '1px solid #e2e8f0',
                      background: selectedCategory === idx ? '#eff6ff' : '#ffffff',
                      color: selectedCategory === idx ? '#1d4ed8' : '#475569',
                      fontWeight: 700,
                      fontSize: 12.5,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {cat.category}
                  </button>
                ))}
              </div>

              {/* Questions List */}
              {presets[selectedCategory] && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {presets[selectedCategory].questions.map((qText, qIdx) => (
                    <div
                      key={qIdx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 16px',
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: 10,
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ fontSize: 13.5, color: '#0f172a', fontWeight: 600, flex: 1, paddingRight: 12 }}>
                        {qText}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleSelectPreset(qText)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '6px 14px',
                          borderRadius: 6,
                          background: '#2563eb',
                          color: '#ffffff',
                          border: 'none',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <span>Translate to {getLangMeta(targetLang).name}</span>
                        <ChevronRight size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Dialogue History Log */}
          {activeTab === 'history' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <span style={{ fontSize: 13, color: '#64748b' }}>
                  Showing last {dialogueHistory.length} translated dialogue interactions for this session.
                </span>
                {dialogueHistory.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setDialogueHistory([])}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      background: 'none',
                      border: 'none',
                      color: '#ef4444',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    <Trash2 size={13} />
                    <span>Clear History</span>
                  </button>
                )}
              </div>

              {dialogueHistory.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8', fontSize: 13 }}>
                  <MessageSquare size={32} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                  <div>No translation history yet.</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>Ask or translate questions to build the consultation log.</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {dialogueHistory.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        padding: '12px 16px',
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: 10,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <div style={{ fontSize: 11.5, fontWeight: 700, color: '#64748b' }}>
                          <span>{item.sourceLangName}</span> → <strong style={{ color: '#2563eb' }}>{item.targetLangName} ({item.targetNative})</strong> · {item.timestamp}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <button
                            type="button"
                            onClick={() => handleSpeakAloud(item.translatedText, item.targetLang)}
                            style={{ background: 'none', border: 'none', color: '#059669', cursor: 'pointer' }}
                            title="Play Audio"
                          >
                            <Volume2 size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCopy(item.translatedText, `hist_${item.id}`)}
                            style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}
                            title="Copy Translation"
                          >
                            {copiedField === `hist_${item.id}` ? <Check size={13} color="#059669" /> : <Copy size={13} />}
                          </button>
                          {onInsertText && (
                            <button
                              type="button"
                              onClick={() => onInsertText(item.translatedText)}
                              style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: 11.5, fontWeight: 700 }}
                              title="Insert in Notes"
                            >
                              Insert
                            </button>
                          )}
                        </div>
                      </div>

                      <div style={{ fontSize: 13, color: '#475569', marginBottom: 4 }}>
                        {item.sourceText}
                      </div>
                      <div style={{ fontSize: 14, color: '#0f172a', fontWeight: 700 }}>
                        {item.translatedText}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Modal Footer ── */}
        <div
          style={{
            padding: '12px 20px',
            background: '#f8fafc',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 12,
            color: '#64748b',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} />
            <span>11 Indic Languages Active: Hindi, Odia, Bengali, Telugu, Tamil, Marathi, Gujarati, Kannada, Malayalam, Punjabi, English</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '6px 16px',
              borderRadius: 6,
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#334155',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
