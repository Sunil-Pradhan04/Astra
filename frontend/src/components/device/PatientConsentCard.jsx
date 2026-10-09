import React, { useState, useEffect, useRef } from 'react'
import {
  ShieldCheck,
  Volume2,
  VolumeX,
  Mic,
  FileText,
  Stethoscope,
  Lock,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  CheckSquare,
  Square,
  Sparkles,
  RefreshCw,
  Globe,
  User,
} from 'lucide-react'
import { getConsentAudio } from '../../api/deviceApi'

const CONSENT_LOCALES = {
  hindi: {
    badge: 'अनिवार्य रोगी सहमति',
    title: 'मरीज़ सहमति एवं डेटा साझाकरण प्राधिकरण',
    subtitle: 'एआई पूछताछ और परामर्श शुरू करने से पहले, कृपया पुष्टि करें कि आप अपनी स्वास्थ्य जानकारी, लक्षण और आवाज़ डॉक्टरों और एस्ट्रा एआई के साथ साझा करने की अनुमति देते हैं।',
    listenBtn: 'सहमति सुनें (Audio)',
    stopAudioBtn: 'आवाज़ रोकें',
    speakingLabel: 'सहमति बोली जा रही है...',
    patientBanner: 'पंजीकृत मरीज़ प्रोफ़ाइल',
    point1Title: 'आवाज़ रिकॉर्डिंग एवं एआई संवाद (Voice Recording)',
    point1Desc: 'मैं इस पूछताछ सत्र के दौरान एस्ट्रा एआई द्वारा अपने उत्तरों को माइक्रोफ़ोन से रिकॉर्ड करने और टेक्स्ट में बदलने की अनुमति देता/देती हूँ।',
    point2Title: 'चिकित्सा लक्षण एवं पर्चा साझाकरण (Clinical Symptoms & Reports)',
    point2Desc: 'मैं अपने मुख्य रोग के लक्षणों, अवधि, शारीरिक मापों और पुराने पर्चे/टेस्ट रिपोर्ट को एकत्र व विश्लेषित करने की अनुमति देता/देती हूँ।',
    point3Title: 'डॉक्टरों एवं अस्पताल टीम को प्रेषण (Physician & Hospital Access)',
    point3Desc: 'मैं इस सत्र से तैयार ट्राइएज रिपोर्ट, गंभीरता स्तर और संवाद रिकॉर्ड को अस्पताल के डॉक्टरों और विशेषज्ञ टीम के साथ साझा करने की अनुमति देता/देती हूँ।',
    point4Title: 'डेटा गोपनीयता एवं सुरक्षा गारंटी (ABDM / Digital Health Protection)',
    point4Desc: 'सभी स्वास्थ्य डेटा एन्क्रिप्टेड और सुरक्षित हैं। इसका उपयोग केवल मेरे चिकित्सा उपचार और परामर्श के लिए किया जाएगा, किसी तीसरे पक्ष को नहीं बेचा जाएगा।',
    selectAll: 'सभी शर्तों से सहमत हैं (Select All)',
    agreeButton: 'हाँ, मैं सहमत हूँ और डेटा साझा करने की अनुमति देता हूँ — परामर्श शुरू करें',
    backButton: 'भाषा बदलें / वापस जाएँ',
    requiredNotice: 'परामर्श शुरू करने के लिए कृपया ऊपर दिए गए सभी सहमति बिंदुओं को स्वीकार करें।',
    audioText: 'नमस्ते। एआई पूछताछ शुरू करने से पहले, कृपया पुष्टि करें कि आप अपनी आवाज़ रिकॉर्ड करने, अपने लक्षणों का विश्लेषण करने और उपस्थित डॉक्टरों के साथ अपनी स्वास्थ्य जानकारी साझा करने की अनुमति देते हैं।',
  },
  odia: {
    badge: 'ବାଧ୍ୟତାମୂଳକ ରୋଗୀ ସମ୍ମତି',
    title: 'ରୋଗୀ ସମ୍ମତି ଏବଂ ଡାଟା ଅଂଶୀଦାର ପ୍ରାଧିକରଣ',
    subtitle: 'ଏଆଇ ପରାମର୍ଶ ଆରମ୍ଭ କରିବା ପୂର୍ବରୁ, ଦୟାକରି ନିଶ୍ଚିତ କରନ୍ତୁ ଯେ ଆପଣ ଆପଣଙ୍କର ସ୍ୱାସ୍ଥ୍ୟ ତଥ୍ୟ, ଲକ୍ଷଣ ଏବଂ ସ୍ୱର ଡାକ୍ତର ଏବଂ ଏଷ୍ଟ୍ରା ଏଆଇ ସହିତ ଅଂଶୀଦାର କରିବାକୁ ଅନୁମତି ଦେଉଛନ୍ତି।',
    listenBtn: 'ସମ୍ମତି ଶୁଣନ୍ତୁ (Audio)',
    stopAudioBtn: 'ଅଡିଓ ବନ୍ଦ କରନ୍ତୁ',
    speakingLabel: 'ସମ୍ମତି ପଢ଼ାଯାଉଛି...',
    patientBanner: 'ପଞ୍ଜୀକୃତ ରୋଗୀ ପ୍ରୋଫାଇଲ୍',
    point1Title: 'ସ୍ୱର ରେକର୍ଡିଂ ଏବଂ ଏଆଇ ସଂଳାପ (Voice Recording)',
    point1Desc: 'ମୁଁ ଏହି ଅଧିବେଶନରେ ମୋର ଉତ୍ତରକୁ ମାଇକ୍ରୋଫୋନରେ ରେକର୍ଡ କରିବା ଏବଂ ଟେକ୍ସଟରେ ପରିଣତ କରିବାକୁ ଏଷ୍ଟ୍ରା ଏଆଇ କୁ ଅନୁମତି ଦେଉଛି।',
    point2Title: 'ଚିକିତ୍ସା ଲକ୍ଷଣ ଏବଂ ପୂର୍ବ ରିପୋର୍ଟ (Clinical Symptoms & Reports)',
    point2Desc: 'ମୁଁ ମୋର ରୋଗର ଲକ୍ଷଣ, ସମୟସୀମା ଏବଂ ପୂର୍ବ ପ୍ରେସକ୍ରିପସନ୍ ତଥ୍ୟ ଏଆଇ ସହିତ ଅଂଶୀଦାର କରିବାକୁ ଅନୁମତି ଦେଉଛି।',
    point3Title: 'ଡାକ୍ତର ଏବଂ ଡାକ୍ତରଖାନା କର୍ମଚାରୀଙ୍କୁ ପ୍ରେରଣ (Doctor & Hospital Access)',
    point3Desc: 'ମୁଁ ମୋର ଟ୍ରାଏଜ୍ ରିପୋର୍ଟ ଏବଂ ଜରୁରୀ ସ୍ଥିତି ଡାକ୍ତରଙ୍କ ସହିତ ସୁରକ୍ଷିତ ଭାବେ ଅଂଶୀଦାର କରିବାକୁ ଅନୁମୋଦନ କରୁଛି।',
    point4Title: 'ଡାଟା ଗୋପନୀୟତା ଏବଂ ସୁରକ୍ଷା (Data Privacy & Security)',
    point4Desc: 'ମୋର ସମସ୍ତ ତଥ୍ୟ ସୁରକ୍ଷିତ ଏବଂ ଏନକ୍ରିପ୍ଟ ହୋଇ ରହିବ, କେବଳ ଚିକିତ୍ସା ପାଇଁ ବ୍ୟବହୃତ ହେବ।',
    selectAll: 'ସମସ୍ତ ସର୍ତ୍ତରେ ସହମତ (Select All)',
    agreeButton: 'ମୁଁ ସହମତ ଏବଂ ଡାଟା ଅଂଶୀଦାର କରିବାକୁ ଅନୁମତି ଦେଉଛି — ପରାମର୍ଶ ଆରମ୍ଭ କରନ୍ତୁ',
    backButton: 'ଭାଷା ବଦଳାନ୍ତୁ / ଫେରନ୍ତୁ',
    requiredNotice: 'ପରାମର୍ଶ ଆରମ୍ଭ କରିବା ପାଇଁ ଦୟାକରି ଉପରୋକ୍ତ ସମସ୍ତ ସମ୍ମତି ବିନ୍ଦୁ ଗ୍ରହଣ କରନ୍ତୁ।',
    audioText: 'ନମସ୍କାର। ଏଆଇ ପରାମର୍ଶ ଆରମ୍ଭ କରିବା ପୂର୍ବରୁ, ଦୟାକରି ନିଶ୍ଚିତ କରନ୍ତୁ ଯେ ଆପଣ ଆପଣଙ୍କ ସ୍ୱର ରେକର୍ଡିଂ ଏବଂ ଡାକ୍ତରଙ୍କ ସହିତ ସ୍ୱାସ୍ଥ୍ୟ ତଥ୍ୟ ଅଂଶୀଦାର କରିବାକୁ ଅନୁମତି ଦେଉଛନ୍ତି।',
  },
  english: {
    badge: 'Mandatory Patient Informed Consent',
    title: 'Patient Informed Consent & Health Data Authorization',
    subtitle: 'Before initiating the conversational AI consultation, please confirm that you authorize Astra AI to record your voice, analyze your symptoms, and share your records with attending hospital physicians.',
    listenBtn: 'Listen to Consent (Audio)',
    stopAudioBtn: 'Stop Audio',
    speakingLabel: 'Playing spoken consent...',
    patientBanner: 'Registered Patient Profile',
    point1Title: 'Voice Recording & Speech Recognition (Voice Recording)',
    point1Desc: 'I authorize Astra AI to record my vocal answers via microphone and transcribe them into clinical text for symptom interrogation.',
    point2Title: 'Clinical Symptoms, Vitals & Reports (Clinical Symptoms & Reports)',
    point2Desc: 'I permit the collection and processing of my chief complaints, duration of illness, vital measurements, and scanned medical prescriptions.',
    point3Title: 'Doctor & Hospital Clinical Access (Physician & Hospital Access)',
    point3Desc: 'I authorize the generated clinical triage assessment, transcript, and urgency classification to be shared with hospital doctors and verification staff.',
    point4Title: 'ABDM & Digital Health Confidentiality (Data Privacy & Security)',
    point4Desc: 'All health data is encrypted in transit and at rest, stored securely, and used strictly for medical diagnosis and care, never sold to third parties.',
    selectAll: 'I Consent to All Items (Select All)',
    agreeButton: 'I Agree & Authorize Data Sharing — Start Consultation',
    backButton: 'Change Language / Back',
    requiredNotice: 'Please accept all required consent items above to proceed with the consultation.',
    audioText: 'Welcome to Astra Healthcare. Before beginning your AI consultation, please confirm that you authorize Astra AI to record your voice, analyze your symptoms, and share your clinical consultation records with attending doctors and healthcare staff.',
  },
  tamil: {
    badge: 'கட்டாய நோயாளி ஒப்புதல்',
    title: 'நோயாளி ஒப்புதல் மற்றும் தரவு பகிர்வு அங்கீகாரம்',
    subtitle: 'AI ஆலோசனையைத் தொடங்குவதற்கு முன், உங்கள் குரலைப் பதிவு செய்வதற்கும், அறிகுறிகளைப் பகுப்பாய்வு செய்வதற்கும், மருத்துவர்களுடன் தகவல்களைப் பகிர்வதற்கும் நீங்கள் ஒப்புதல் அளிக்கிறீர்கள் என்பதை உறுதிப்படுத்தவும்.',
    listenBtn: 'ஒப்புதலைக் கேளுங்கள் (Audio)',
    stopAudioBtn: 'ஆடியோவை நிறுத்துங்கள்',
    speakingLabel: 'ஒப்புதல் பேசப்படுகிறது...',
    patientBanner: 'பதிவுசெய்யப்பட்ட நோயாளி சுயவிவரம்',
    point1Title: 'குரல் பதிவு மற்றும் உரை மாற்றம் (Voice Recording)',
    point1Desc: 'இந்த ஆலோசனையின் போது எனது குரலைப் பதிவு செய்வதற்கும் உரையாக மாற்றுவதற்கும் அஸ்ட்ரா AI-க்கு நான் ஒப்புதல் அளிக்கிறேன்.',
    point2Title: 'மருத்துவ அறிகுறிகள் மற்றும் அறிக்கைகள் (Clinical Symptoms & Reports)',
    point2Desc: 'எனது முக்கிய அறிகுறிகள், கால அளவு மற்றும் மருத்துவச் சீட்டுகளைப் பகுப்பாய்வு செய்ய நான் அனுமதிக்கிறேன்.',
    point3Title: 'மருத்துவர்கள் மற்றும் மருத்துவமனை அணுகல் (Doctor & Hospital Access)',
    point3Desc: 'எனது ட்ரையேஜ் அறிக்கை மற்றும் உரையாடலை மருத்துவமனை மருத்துவர்களுடன் பகிர நான் ஒப்புக்கொள்கிறேன்.',
    point4Title: 'தரவு தனியுரிமை மற்றும் பாதுகாப்பு (Data Privacy & Security)',
    point4Desc: 'அனைத்து தரவுகளும் குறியாக்கம் செய்யப்பட்டு பாதுகாப்பாக வைக்கப்படும், சிகிச்சைக்கு மட்டுமே பயன்படுத்தப்படும்.',
    selectAll: 'அனைத்து நிபந்தனைகளையும் ஏற்கிறேன் (Select All)',
    agreeButton: 'நான் ஒப்புக்கொள்கிறேன் & பகிர அனுமதிக்கிறேன் — தொடங்குங்கள்',
    backButton: 'மொழி மாற்று / பின் செல்',
    requiredNotice: 'தொடர மேலே உள்ள அனைத்து ஒப்புதல் கூறுகளையும் ஏற்கவும்.',
    audioText: 'வணக்கம். AI ஆலோசனையைத் தொடங்குவதற்கு முன், உங்கள் குரலைப் பதிவு செய்யவும் மருத்துவர்களுடன் சுகாதாரத் தகவல்களைப் பகிரவும் நீங்கள் ஒப்புதல் அளிக்கிறீர்கள் என்பதை உறுதிப்படுத்தவும்.',
  },
  telugu: {
    badge: 'తప్పనిసరి రోగి సమ్మతి',
    title: 'రోగి సమ్మతి మరియు డేటా భాగస్వామ్య అనుమతి',
    subtitle: 'AI విచారణ ప్రారంభించే ముందు, మీ వాయిస్ రికార్డ్ చేయడానికి, లక్షణాలను విశ్లేషించడానికి మరియు వైద్యులతో సమాచారాన్ని పంచుకోవడానికి మీరు అనుమతిస్తున్నారని ధృవీకరించండి.',
    listenBtn: 'సమ్మతిని వినండి (Audio)',
    stopAudioBtn: 'ఆడియోను ఆపండి',
    speakingLabel: 'సమ్మతి చదవబడుతోంది...',
    patientBanner: 'నమోదైన రోగి ప్రొఫైల్',
    point1Title: 'వాయిస్ రికార్డింగ్ మరియు సంభాషణ (Voice Recording)',
    point1Desc: 'ఈ సంప్రదింపు సమయంలో నా వాయిస్ రికార్డ్ చేయడానికి మరియు టెక్స్ట్‌గా మార్చడానికి అస్ట్రా AIకి నేను అనుమతి ఇస్తున్నాను.',
    point2Title: 'వైద్య లక్షణాలు మరియు నివేదికలు (Clinical Symptoms & Reports)',
    point2Desc: 'నా రోగ లక్షణాలు, కాలపరిమితి మరియు ప్రిస్క్రిప్షన్‌లను సేకరించి విశ్లేషించడానికి నేను అనుమతిస్తున్నాను.',
    point3Title: 'వైద్యులు మరియు ఆసుపత్రి సిబ్బందికి బదిలీ (Doctor & Hospital Access)',
    point3Desc: 'నా ట్రయాజ్ నివేదికను ఆసుపత్రి వైద్యులతో సురక్షితంగా పంచుకోవడానికి నేను ఆమోదిస్తున్నాను.',
    point4Title: 'డేటా గోప్యత మరియు రక్షణ (Data Privacy & Security)',
    point4Desc: 'నా ఆరోగ్య డేటా పూర్తిగా గుప్తీకరించబడింది మరియు సురక్షితమైనది, చికిత్స కోసం మాత్రమే ఉపయోగించబడుతుంది.',
    selectAll: 'అన్నింటికీ అంగీకరిస్తున్నాను (Select All)',
    agreeButton: 'నేను అంగీకరిస్తున్నాను & డేటాను పంచుకోవడానికి అనుమతిస్తున్నాను — ప్రారంభించండి',
    backButton: 'భాష మార్చండి / వెనక్కి వెళ్ళండి',
    requiredNotice: 'కొనసాగడానికి దయచేసి పై అన్ని సమ్మతి అంశాలను అంగీకరించండి.',
    audioText: 'నమస్కారం. AI సంప్రదింపులను ప్రారంభించే ముందు, మీ వాయిస్‌ని రికార్డ్ చేయడానికి మరియు వైద్యులతో ఆరోగ్య సమాచారాన్ని పంచుకోవడానికి మీరు అనుమతిస్తున్నారని దయచేసి ధృవీకరించండి.',
  },
  bengali: {
    badge: 'বাধ্যতামূলক রোগীর সম্মতি',
    title: 'রোগীর সম্মতি ও ডেটা শেয়ারিং অনুমোদন',
    subtitle: 'এআই আলোচনা শুরু করার আগে, অনুগ্রহ করে নিশ্চিত করুন যে আপনি আপনার ভয়েস রেকর্ড করতে, লক্ষণ বিশ্লেষণ করতে এবং ডাক্তারদের সাথে স্বাস্থ্য তথ্য শেয়ার করতে সম্মতি দিচ্ছেন।',
    listenBtn: 'সম্মতি শুনুন (Audio)',
    stopAudioBtn: 'অডিও বন্ধ করুন',
    speakingLabel: 'সম্মতি বাজানো হচ্ছে...',
    patientBanner: 'নিবন্ধিত রোগীর প্রোফাইল',
    point1Title: 'ভয়েস রেকর্ডিং ও সংলাপ (Voice Recording)',
    point1Desc: 'আমি এই সেশনের সময় আমার ভয়েস রেকর্ড করতে এবং টেক্সটে রূপান্তর করতে অস্ট্রা এআই-কে অনুমতি দিচ্ছি।',
    point2Title: 'চিকিৎসা লক্ষণ ও রিপোর্ট (Clinical Symptoms & Reports)',
    point2Desc: 'আমি আমার প্রধান লক্ষণসমূহ, সময়কাল এবং প্রেসক্রিপশন রিপোর্ট সংগ্রহ ও বিশ্লেষণ করতে সম্মতি দিচ্ছি।',
    point3Title: 'ডাক্তার ও হাসপাতাল দলের কাছে প্রেরণ (Doctor & Hospital Access)',
    point3Desc: 'আমি আমার ট্রায়াজ রিপোর্ট ও ট্রান্সক্রিপ্ট হাসপাতালের ডাক্তারদের সাথে শেয়ার করার অনুমতি দিচ্ছি।',
    point4Title: 'তথ্য গোপনীয়তা ও সুরক্ষা (Data Privacy & Security)',
    point4Desc: 'আমার সমস্ত ডেটা এনক্রিপ্ট করা ও সুরক্ষিত থাকবে, শুধুমাত্র চিকিৎসার জন্যই ব্যবহৃত হবে।',
    selectAll: 'সমস্ত শর্তে সম্মত (Select All)',
    agreeButton: 'আমি সম্মত ও ডেটা শেয়ার করতে অনুমতি দিচ্ছি — পরামর্শ শুরু করুন',
    backButton: 'ভাষা পরিবর্তন / ফিরে যান',
    requiredNotice: 'এগিয়ে যেতে দয়া করে উপরের সমস্ত শর্তে সম্মতি দিন।',
    audioText: 'নমস্কার। এআই পরামর্শ শুরু করার আগে, অনুগ্রহ করে নিশ্চিত করুন যে আপনি আপনার ভয়েস রেকর্ড করতে এবং ডাক্তারদের সাথে স্বাস্থ্য তথ্য ভাগ করতে সম্মতি দিচ্ছেন।',
  },
}

export default function PatientConsentCard({
  patient,
  patientId,
  selectedLanguage,
  ttsEngine,
  onConfirmConsent,
  onBack,
  languages = [],
  onLanguageChange,
}) {
  const langKey = selectedLanguage?.key?.toLowerCase() || 'hindi'
  const locale = CONSENT_LOCALES[langKey] || CONSENT_LOCALES['english']

  // Consent Toggles
  const [consentVoice, setConsentVoice] = useState(true)
  const [consentClinical, setConsentClinical] = useState(true)
  const [consentDoctor, setConsentDoctor] = useState(true)

  // Audio Playback State
  const [isPlayingAudio, setIsPlayingAudio] = useState(false)
  const [isLoadingAudio, setIsLoadingAudio] = useState(false)
  const audioInstanceRef = useRef(null)

  const isAllChecked = consentVoice && consentClinical && consentDoctor

  const handleToggleAll = () => {
    if (isAllChecked) {
      setConsentVoice(false)
      setConsentClinical(false)
      setConsentDoctor(false)
    } else {
      setConsentVoice(true)
      setConsentClinical(true)
      setConsentDoctor(true)
    }
  }

  // Audio Playback of Spoken Consent
  const handlePlayConsentAudio = async () => {
    if (isPlayingAudio) {
      if (audioInstanceRef.current) {
        audioInstanceRef.current.pause()
        audioInstanceRef.current = null
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel()
      }
      setIsPlayingAudio(false)
      return
    }

    setIsLoadingAudio(true)

    try {
      // 1. Try backend Kokoro / Sarvam TTS
      const res = await getConsentAudio({
        language: selectedLanguage?.key || 'hindi',
        tts_engine: ttsEngine || 'local',
      })

      if (res.data?.audio_base64) {
        const audioUrl = `data:audio/wav;base64,${res.data.audio_base64}`
        const audio = new Audio(audioUrl)
        audioInstanceRef.current = audio

        audio.onended = () => {
          setIsPlayingAudio(false)
          audioInstanceRef.current = null
        }
        audio.onerror = () => {
          setIsPlayingAudio(false)
          audioInstanceRef.current = null
          fallbackBrowserSpeech()
        }

        setIsPlayingAudio(true)
        await audio.play()
        setIsLoadingAudio(false)
        return
      }
    } catch (err) {
      console.warn('Backend consent audio failed, falling back to browser speech:', err)
    } finally {
      setIsLoadingAudio(false)
    }

    fallbackBrowserSpeech()
  }

  const fallbackBrowserSpeech = () => {
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()

    const textToSpeak = locale.audioText || locale.subtitle
    const utterance = new SpeechSynthesisUtterance(textToSpeak)
    utterance.lang = selectedLanguage?.code || 'hi-IN'
    utterance.rate = 0.95

    utterance.onstart = () => setIsPlayingAudio(true)
    utterance.onend = () => setIsPlayingAudio(false)
    utterance.onerror = () => setIsPlayingAudio(false)

    window.speechSynthesis.speak(utterance)
  }

  // Cleanup audio on unmount or language change
  useEffect(() => {
    return () => {
      if (audioInstanceRef.current) {
        audioInstanceRef.current.pause()
        audioInstanceRef.current = null
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel()
      }
    }
  }, [selectedLanguage])

  const handleAgreeAndProceed = () => {
    if (!isAllChecked) return

    const consentDetails = {
      voice_recording_consent: consentVoice,
      clinical_data_sharing_consent: consentClinical,
      doctor_access_consent: consentDoctor,
      consent_timestamp: new Date().toISOString(),
      consent_language: selectedLanguage?.key || 'hindi',
      consent_language_code: selectedLanguage?.code || 'hi-IN',
      patient_id: patientId,
      full_name: patient?.full_name || '',
      verified_by: 'patient_direct_kiosk_input',
    }

    if (audioInstanceRef.current) {
      audioInstanceRef.current.pause()
      audioInstanceRef.current = null
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }

    onConfirmConsent(consentDetails)
  }

  return (
    <div className="terminal-card fade-in" style={{ maxWidth: 840, textAlign: 'left', padding: '32px 36px' }}>
      
      {/* ── Top Header Bar with Badge & Audio Button ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 20 }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, marginBottom: 8, letterSpacing: 0.3 }}>
            <ShieldCheck size={14} />
            <span>{locale.badge}</span>
          </div>
          <h2 style={{ fontSize: 23, fontWeight: 800, color: '#0f172a', margin: '0 0 6px 0', letterSpacing: -0.4 }}>
            {locale.title}
          </h2>
          <p style={{ fontSize: 13.5, color: '#475569', margin: 0, lineHeight: 1.55, maxWidth: 640 }}>
            {locale.subtitle}
          </p>
        </div>

        {/* Audio Spoken Consent Button */}
        <button
          type="button"
          onClick={handlePlayConsentAudio}
          disabled={isLoadingAudio}
          className="hw-tab-pill"
          style={{
            background: isPlayingAudio ? '#fef2f2' : '#f0fdf4',
            border: `1.5px solid ${isPlayingAudio ? '#f87171' : '#86efac'}`,
            color: isPlayingAudio ? '#b91c1c' : '#15803d',
            padding: '8px 14px',
            borderRadius: 10,
            cursor: 'pointer',
            fontWeight: 700,
            fontSize: 12.5,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            whiteSpace: 'nowrap',
            flexShrink: 0,
            transition: 'all 0.15s ease',
          }}
          title="Click to hear consent read aloud in your language"
        >
          {isLoadingAudio ? (
            <RefreshCw size={14} className="animate-spin" />
          ) : isPlayingAudio ? (
            <>
              <VolumeX size={15} />
              <span>{locale.stopAudioBtn}</span>
            </>
          ) : (
            <>
              <Volume2 size={15} />
              <span>{locale.listenBtn}</span>
            </>
          )}
        </button>
      </div>

      {/* ── Patient Identity Card ── */}
      <div style={{
        background: '#f8fafc',
        border: '1.5px solid #e2e8f0',
        borderRadius: 12,
        padding: '14px 18px',
        marginBottom: 22,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            background: '#0f172a',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            fontSize: 18,
          }}>
            {(patient?.full_name || 'P').charAt(0)}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>
                {patient?.full_name || `Patient ${patientId}`}
              </span>
              <span style={{
                background: '#e2e8f0',
                color: '#334155',
                fontSize: 11,
                fontWeight: 700,
                padding: '2px 7px',
                borderRadius: 5,
              }}>
                {patientId}
              </span>
            </div>
            <div style={{ fontSize: 12.5, color: '#64748b', marginTop: 2, display: 'flex', gap: 10 }}>
              <span>Age: <strong>{patient?.age || '—'} Yrs</strong></span>
              <span>·</span>
              <span>Gender: <strong>{patient?.gender || '—'}</strong></span>
              {patient?.blood_group && (
                <>
                  <span>·</span>
                  <span>Blood: <strong>🩸 {patient.blood_group}</strong></span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Selected Language Indicator with quick switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: 8,
            padding: '5px 10px',
            fontSize: 12.5,
            fontWeight: 700,
            color: '#1e293b',
          }}>
            <span style={{ fontSize: 16 }}>{selectedLanguage?.flag || '🌐'}</span>
            <span>{selectedLanguage?.label || 'Hindi'}</span>
            <span style={{ fontSize: 11, color: '#64748b' }}>({selectedLanguage?.sublabel})</span>
          </div>

          {languages.length > 0 && typeof onLanguageChange === 'function' && (
            <select
              value={selectedLanguage?.key || 'hindi'}
              onChange={(e) => {
                const found = languages.find((l) => l.key === e.target.value)
                if (found) onLanguageChange(found)
              }}
              style={{
                fontSize: 12,
                padding: '5px 8px',
                borderRadius: 8,
                border: '1px solid #cbd5e1',
                background: '#fff',
                color: '#334155',
                cursor: 'pointer',
                fontWeight: 600,
              }}
              title="Switch language"
            >
              {languages.map((l) => (
                <option key={l.key} value={l.key}>
                  {l.flag} {l.label} ({l.sublabel})
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* ── Consent Clauses Grid ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
        
        {/* Clause 1: Voice Recording */}
        <div
          onClick={() => setConsentVoice(!consentVoice)}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 14,
            padding: '14px 16px',
            borderRadius: 12,
            border: `1.5px solid ${consentVoice ? '#3b82f6' : '#e2e8f0'}`,
            background: consentVoice ? '#f8faff' : '#ffffff',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <div style={{ color: consentVoice ? '#2563eb' : '#94a3b8', marginTop: 2 }}>
            {consentVoice ? <CheckSquare size={20} /> : <Square size={20} />}
          </div>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: '#eff6ff', color: '#1d4ed8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Mic size={17} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 2 }}>
              {locale.point1Title}
            </div>
            <div style={{ fontSize: 12.5, color: '#475569', lineHeight: 1.45 }}>
              {locale.point1Desc}
            </div>
          </div>
        </div>

        {/* Clause 2: Clinical Symptoms & Prescription Reports */}
        <div
          onClick={() => setConsentClinical(!consentClinical)}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 14,
            padding: '14px 16px',
            borderRadius: 12,
            border: `1.5px solid ${consentClinical ? '#3b82f6' : '#e2e8f0'}`,
            background: consentClinical ? '#f8faff' : '#ffffff',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <div style={{ color: consentClinical ? '#2563eb' : '#94a3b8', marginTop: 2 }}>
            {consentClinical ? <CheckSquare size={20} /> : <Square size={20} />}
          </div>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: '#ecfdf5', color: '#047857', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <FileText size={17} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 2 }}>
              {locale.point2Title}
            </div>
            <div style={{ fontSize: 12.5, color: '#475569', lineHeight: 1.45 }}>
              {locale.point2Desc}
            </div>
          </div>
        </div>

        {/* Clause 3: Doctor & Hospital Team Sharing */}
        <div
          onClick={() => setConsentDoctor(!consentDoctor)}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 14,
            padding: '14px 16px',
            borderRadius: 12,
            border: `1.5px solid ${consentDoctor ? '#3b82f6' : '#e2e8f0'}`,
            background: consentDoctor ? '#f8faff' : '#ffffff',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <div style={{ color: consentDoctor ? '#2563eb' : '#94a3b8', marginTop: 2 }}>
            {consentDoctor ? <CheckSquare size={20} /> : <Square size={20} />}
          </div>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: '#f5f3ff', color: '#6d28d9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Stethoscope size={17} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 2 }}>
              {locale.point3Title}
            </div>
            <div style={{ fontSize: 12.5, color: '#475569', lineHeight: 1.45 }}>
              {locale.point3Desc}
            </div>
          </div>
        </div>

        {/* Clause 4: Data Security & ABDM Standards (Always Enforced Notice) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 14,
            padding: '12px 16px',
            borderRadius: 12,
            border: '1.5px solid #cbd5e1',
            background: '#f8fafc',
          }}
        >
          <div style={{ color: '#059669', marginTop: 2 }}>
            <CheckCircle2 size={20} />
          </div>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: '#f1f5f9', color: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Lock size={17} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0f172a', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>{locale.point4Title}</span>
              <span style={{ fontSize: 10, background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', padding: '1px 6px', borderRadius: 4, fontWeight: 800 }}>
                PROTECTED
              </span>
            </div>
            <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.45 }}>
              {locale.point4Desc}
            </div>
          </div>
        </div>

      </div>

      {/* ── Select All Master Toggle ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 14px',
        background: '#f1f5f9',
        borderRadius: 8,
        marginBottom: 24,
      }}>
        <button
          type="button"
          onClick={handleToggleAll}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 13,
            fontWeight: 700,
            color: '#1e293b',
          }}
        >
          {isAllChecked ? (
            <CheckSquare size={17} color="#2563eb" />
          ) : (
            <Square size={17} color="#64748b" />
          )}
          <span>{locale.selectAll}</span>
        </button>

        <span style={{ fontSize: 11.5, color: '#64748b', fontWeight: 600 }}>
          {isAllChecked ? '✓ 3 of 3 items selected' : '⚠️ All items required to proceed'}
        </span>
      </div>

      {/* ── Action Buttons ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={onBack}
          className="btn-terminal-back"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '12px 20px',
            borderRadius: 10,
            fontSize: 13.5,
            fontWeight: 700,
            cursor: 'pointer',
            border: '1.5px solid #cbd5e1',
            background: '#ffffff',
            color: '#334155',
          }}
        >
          <ArrowLeft size={16} />
          <span>{locale.backButton}</span>
        </button>

        <button
          type="button"
          onClick={handleAgreeAndProceed}
          disabled={!isAllChecked}
          className="btn-terminal-action"
          style={{
            padding: '14px 28px',
            fontSize: 15,
            fontWeight: 800,
            borderRadius: 12,
            background: isAllChecked ? '#0f172a' : '#94a3b8',
            color: '#ffffff',
            border: 'none',
            cursor: isAllChecked ? 'pointer' : 'not-allowed',
            boxShadow: isAllChecked ? '0 4px 14px rgba(15, 23, 42, 0.25)' : 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            transition: 'all 0.2s ease',
          }}
        >
          <CheckCircle2 size={18} />
          <span>{locale.agreeButton}</span>
          <ArrowRight size={17} />
        </button>
      </div>

      {!isAllChecked && (
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#dc2626', fontWeight: 600 }}>
          <AlertCircle size={14} />
          <span>{locale.requiredNotice}</span>
        </div>
      )}

    </div>
  )
}
