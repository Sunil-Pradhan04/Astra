import axiosInstance from './axios'

/**
 * 11 Supported Official Languages
 */
export const FALLBACK_LANGUAGES = [
  { code: 'en-IN', name: 'English', native: 'English', script: 'Latin', voice: 'English' },
  { code: 'hi-IN', name: 'Hindi', native: 'हिन्दी', script: 'Devanagari', voice: 'Hindi' },
  { code: 'od-IN', name: 'Odia', native: 'ଓଡ଼ିଆ', script: 'Odia', voice: 'Odia' },
  { code: 'bn-IN', name: 'Bengali', native: 'বাংলা', script: 'Bengali', voice: 'Bengali' },
  { code: 'te-IN', name: 'Telugu', native: 'తెలుగు', script: 'Telugu', voice: 'Telugu' },
  { code: 'ta-IN', name: 'Tamil', native: 'தமிழ்', script: 'Tamil', voice: 'Tamil' },
  { code: 'mr-IN', name: 'Marathi', native: 'मराठी', script: 'Devanagari', voice: 'Marathi' },
  { code: 'gu-IN', name: 'Gujarati', native: 'ગુજરાતી', script: 'Gujarati', voice: 'Gujarati' },
  { code: 'kn-IN', name: 'Kannada', native: 'ಕನ್ನಡ', script: 'Kannada', voice: 'Kannada' },
  { code: 'ml-IN', name: 'Malayalam', native: 'മലയാളം', script: 'Malayalam', voice: 'Malayalam' },
  { code: 'pa-IN', name: 'Punjabi', native: 'ਪੰਜਾਬੀ', script: 'Gurmukhi', voice: 'Punjabi' },
]

/**
 * Get all supported 11 Indian languages
 */
export const getSupportedLanguages = async () => {
  try {
    const res = await axiosInstance.get('/translation/languages')
    return res.data?.languages || FALLBACK_LANGUAGES
  } catch (err) {
    console.warn('Failed to load server languages, using local fallback:', err)
    return FALLBACK_LANGUAGES
  }
}

/**
 * Get curated clinical preset questions
 */
export const getClinicalPresets = async () => {
  try {
    const res = await axiosInstance.get('/translation/presets')
    return res.data?.presets || []
  } catch (err) {
    console.warn('Failed to load clinical presets:', err)
    return []
  }
}

/**
 * Translate text between any of the 11 languages
 */
export const translateMedicalText = async ({ text, source_lang = 'en-IN', target_lang = 'hi-IN', context = 'clinical' }) => {
  const res = await axiosInstance.post('/translation/translate', {
    text,
    source_lang,
    target_lang,
    context,
  })
  return res.data
}

/**
 * Text-to-speech for translated text
 */
export const speakTranslatedText = async ({ text, lang_code = 'hi-IN', speaker = 'priya', engine = 'auto' }) => {
  const res = await axiosInstance.post('/translation/speak', {
    text,
    lang_code,
    speaker,
    engine,
  })
  return res.data
}

/**
 * Speech-to-text transcription
 */
export const transcribeMedicalAudio = async (audioBlob, langCode = 'hi-IN') => {
  const formData = new FormData()
  formData.append('file', audioBlob, 'audio_recording.webm')
  formData.append('lang_code', langCode)

  const res = await axiosInstance.post('/translation/transcribe', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })
  return res.data
}
