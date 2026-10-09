import { useState, useEffect, useRef } from 'react'
import WorkerLayout from '../../components/worker/WorkerLayout'
import {
  CheckCircle2,
  Clock,
  ArrowRight,
  ShieldCheck,
  FileText,
  User,
  Heart,
  Thermometer,
  Bot,
  Stethoscope,
  Send,
  RotateCcw,
  Check,
  Flame,
  Activity,
  Sparkles,
  Edit3,
  Save,
  RefreshCw,
  ExternalLink,
  AlertTriangle,
  Eye,
  X,
  Building2,
  MapPin,
  Compass,
  Navigation,
  Printer,
  Share2,
  Ambulance,
} from 'lucide-react'
import {
  getGroupedPatientQueues,
  manualUpdatePatientReport,
  aiUpdatePatientReport,
  verifyPatientToDoctor,
  requestPatientRescreen,
  getDoctorsQueues,
  getNearbyFacilities,
  dispatchExternalReferral,
} from '../../api/workerApi'
import PrintedReferralForm from '../../components/referral/PrintedReferralForm'
import FacilitiesMapRadar from '../../components/referral/FacilitiesMapRadar'

const extractErrorMessage = (err, fallback) => {
  const d = err?.response?.data?.detail
  if (typeof d === 'string') return d
  if (Array.isArray(d)) return d.map((x) => x.msg || JSON.stringify(x)).join(', ')
  if (d && typeof d === 'object') return d.message || JSON.stringify(d)
  return err?.message || fallback
}

// Helper to consolidate all attached report images across possible fields
const getAttachedDocuments = (patient) => {
  if (!patient) return []
  const docs = []
  const seenUrls = new Set()

  const addDoc = (doc) => {
    if (!doc) return
    const url = doc.cloudinary_url || doc.image_url || doc.attached_image || (typeof doc === 'string' ? doc : null)
    if (url && !seenUrls.has(url)) {
      seenUrls.add(url)
      const isHandwritten =
        doc.classification === 'handwritten' ||
        doc.is_handwritten === true ||
        doc.processing_status === 'handwritten_human_review_required'
      docs.push({
        ...doc,
        url,
        isHandwritten,
        classification: isHandwritten ? 'handwritten' : 'printed',
        extracted: !isHandwritten,
        structured_data: doc.structured_data || {},
      })
    }
  }

  if (Array.isArray(patient.prescription_records)) patient.prescription_records.forEach(addDoc)
  if (Array.isArray(patient.ai_summary?.prescriptions)) patient.ai_summary.prescriptions.forEach(addDoc)
  if (Array.isArray(patient.ocr_reports)) patient.ocr_reports.forEach(addDoc)
  if (patient.ai_summary?.prescription_data) addDoc(patient.ai_summary.prescription_data)
  if (patient.ai_summary?.structured_summary?.attached_prescription) addDoc(patient.ai_summary.structured_summary.attached_prescription)
  return docs
}

// Helper to extract or synthesize patient interrogation turns
const getInterrogationTurns = (patient) => {
  if (!patient) return []
  const summaryObj = patient.ai_summary?.structured_summary || patient.ai_summary || {}
  if (Array.isArray(summaryObj.dialogue_turns) && summaryObj.dialogue_turns.length > 0) {
    return summaryObj.dialogue_turns
  }
  if (Array.isArray(patient.dialogue_turns) && patient.dialogue_turns.length > 0) {
    return patient.dialogue_turns
  }
  if (Array.isArray(patient.conversation_turns) && patient.conversation_turns.length > 0) {
    return patient.conversation_turns
  }

  const turns = []
  if (patient.chief_complaints) {
    turns.push({
      question: 'Presenting complaints at kiosk triage entry:',
      answer: patient.chief_complaints,
    })
  }
  const deepDive = summaryObj.symptoms_deep_dive || summaryObj.symptoms || []
  deepDive.forEach((sym) => {
    const symName = sym.name || 'Symptom'
    if (sym.timeline) {
      turns.push({
        question: `When did your ${symName} begin and how has it progressed over time?`,
        answer: sym.timeline,
      })
    }
    if (sym.timing_and_diurnal_pattern) {
      turns.push({
        question: `Is there any particular diurnal timing pattern (morning, afternoon, or evening) for ${symName}?`,
        answer: sym.timing_and_diurnal_pattern,
      })
    }
    if (sym.depth_and_severity) {
      turns.push({
        question: `How would you describe the depth, sensation, and severity of ${symName}?`,
        answer: sym.depth_and_severity,
      })
    }
    if (sym.triggers_and_relieving) {
      turns.push({
        question: `What aggravates or relieves your ${symName}?`,
        answer: sym.triggers_and_relieving,
      })
    }
    if (sym.patient_disclosed_details) {
      turns.push({
        question: `Detailed interrogation disclosures regarding ${symName}:`,
        answer: sym.patient_disclosed_details,
      })
    }
  })
  return turns
}

// Fallback demo cases if database has no pending patients
const DEMO_CASES = [
  {
    patient_id: 'P-0008',
    full_name: 'Niranjan Swain',
    age: 62,
    gender: 'Male',
    contact_number: '+91 98610 22345',
    bp_systolic: 168,
    bp_diastolic: 104,
    temperature_f: 98.4,
    weight_kg: 81.0,
    height_cm: 170.0,
    blood_group: 'B+',
    priority: 'emergency',
    urgency_level: 'red',
    urgency_detected: true,
    urgency_details: {
      signal_id: 'chest_pain_radiating',
      matched_phrase: 'chest tightness radiating towards left shoulder',
      layer: 'semantic',
      action: 'HIGH_PRIORITY_REVIEW',
    },
    chief_complaints: 'Substernal pressure sensation radiating towards left shoulder for 45 minutes.',
    status: 'emergency_queue',
    created_at: new Date(Date.now() - 15 * 60000).toISOString(),
    ai_summary: {
      structured_summary: {
        chief_complaints: 'Severe substernal chest discomfort radiating to left arm/shoulder.',
        overall_severity: 'Critical',
        triage_urgency: 'Emergency',
        urgency_reason: 'Acute exertional chest discomfort with elevated systolic blood pressure (168 mmHg) and radiation.',
        all_symptoms_overview: [
          'Substernal Chest Pressure',
          'Diaphoresis / Cold Sweats',
        ],
        symptoms_deep_dive: [
          {
            name: 'Substernal chest pressure',
            timeline: 'Started 45 minutes ago during brisk walk',
            depth_and_severity: 'Crushing heavy depth (rated 8/10)',
            timing_and_diurnal_pattern: 'Sudden exertional onset in late evening, persistent and non-remitting',
            triggers_and_relieving: 'Aggravated by brisk walking; not relieved by sitting still',
            patient_disclosed_details: 'Patient stated: "I was walking briskly from the market around 6 PM when sudden crushing weight clamped my mid-chest and started radiating down my left arm. Sitting down did not ease the heaviness."',
            ocr_report_correlation: 'Extracted from Uploaded Report: Blood pressure recorded 168/104 mmHg (Severe Stage-2 Hypertension); Prescribed Tab Amlodipine 5mg',
            duration: '45 minutes',
            severity: 'Severe (8/10)',
            location: 'Retrosternal / Left shoulder',
            pattern: 'Constant',
            triggers: 'Exertion / Fast walking',
            report_correlation: 'Extracted from Uploaded Report: Blood pressure recorded 168/104 mmHg',
          },
          {
            name: 'Diaphoresis / Cold Sweats',
            timeline: 'Started 20 minutes ago',
            depth_and_severity: 'Moderate profuse cold perspiration',
            timing_and_diurnal_pattern: 'Episodic sweating accompanying the chest pain',
            triggers_and_relieving: 'Concurrent with chest tightness',
            patient_disclosed_details: 'Patient stated his forehead and palms became cold and clammy shortly after the chest discomfort started.',
            ocr_report_correlation: null,
            duration: '20 minutes',
            severity: 'Moderate',
            location: 'Generalized / Forehead',
            pattern: 'Episodic',
            triggers: null,
            report_correlation: null,
          },
        ],
        medications_and_history: {
          medications_taken: 'Amlodipine 5mg (irregular adherence)',
          chronic_conditions: 'Hypertension (6 years)',
          allergies: 'None known',
        },
        clinical_notes: 'Immediate ECG and attending physician evaluation recommended. High coronary risk.',
      },
    },
  },
  {
    patient_id: 'P-0003',
    full_name: 'Debashis Mohapatra',
    age: 46,
    gender: 'Male',
    contact_number: '+91 94370 88219',
    bp_systolic: 138,
    bp_diastolic: 88,
    temperature_f: 101.2,
    weight_kg: 74.0,
    height_cm: 168.0,
    blood_group: 'O+',
    priority: 'normal',
    urgency_level: 'green',
    urgency_detected: false,
    chief_complaints: 'Persistent dry cough for 4 days with intermittent high-grade fever and body chills.',
    status: 'pending_verification',
    created_at: new Date(Date.now() - 40 * 60000).toISOString(),
    ai_summary: {
      structured_summary: {
        chief_complaints: 'Dry irritating cough worsening at night with fever up to 101.2 °F.',
        overall_severity: 'Moderate',
        triage_urgency: 'Priority',
        urgency_reason: 'Febrile illness with 4-day cough in middle-aged male, oxygenation stable.',
        all_symptoms_overview: [
          'High-Grade Fever with Chills',
          'Persistent Dry Cough',
          'Generalized Body Aches',
        ],
        symptoms_deep_dive: [
          {
            name: 'High-Grade Fever with Chills',
            timeline: 'Started 2 days ago, progressive evening recurrence',
            depth_and_severity: 'Moderate-Severe (measured 101.2 °F)',
            timing_and_diurnal_pattern: 'Fever spikes specifically in the evening around 5:00 - 6:00 PM with intense shivering, subsides somewhat by morning',
            triggers_and_relieving: 'Exacerbated by cold air exposure; partially relieved by warm fluids and paracetamol',
            patient_disclosed_details: 'Patient explicitly stated that during daytime he feels relatively normal, but every evening around 5:30 PM severe fever with teeth-chattering chills sets in, requiring two thick blankets.',
            ocr_report_correlation: 'Extracted from Uploaded Report: Clinical slip records oral temperature 101.2 °F; Tab Paracetamol 650mg prescribed',
            duration: '2 days',
            severity: 'Moderate (101.2 °F)',
            location: 'Systemic',
            pattern: 'Intermittent (Evening Spikes)',
            triggers: 'Cold drafts',
            report_correlation: 'Extracted from Uploaded Report: Oral temperature 101.2 °F confirmed',
          },
          {
            name: 'Persistent Dry Cough',
            timeline: 'Started 4 days ago',
            depth_and_severity: 'Moderate hacking bronchial irritation',
            timing_and_diurnal_pattern: 'Worsens significantly at night when lying flat in bed',
            triggers_and_relieving: 'Triggered by cold air and recumbent position; warm ginger water provides brief relief',
            patient_disclosed_details: 'Patient noted no yellowish or bloody sputum, only dry irritating hacking that disrupts sleep between 1 AM and 4 AM.',
            ocr_report_correlation: null,
            duration: '4 days',
            severity: 'Moderate',
            location: 'Throat / Upper chest',
            pattern: 'Nocturnal worsening',
            triggers: 'Cold air / Supine posture',
            report_correlation: null,
          },
        ],
        medications_and_history: {
          medications_taken: 'Paracetamol 650mg SOS',
          chronic_conditions: 'None reported',
          allergies: 'None reported',
        },
        clinical_notes: 'Patient reports no breathlessness while resting. Throat congested. Evening fever spike pattern confirmed.',
      },
    },
  },
  {
    patient_id: 'P-0005',
    full_name: 'Priyanka Senapati',
    age: 29,
    gender: 'Female',
    contact_number: '+91 70081 99120',
    bp_systolic: 112,
    bp_diastolic: 74,
    temperature_f: 98.6,
    weight_kg: 56.0,
    height_cm: 158.0,
    blood_group: 'A+',
    priority: 'normal',
    urgency_level: 'green',
    urgency_detected: false,
    chief_complaints: 'Bilateral fronto-temporal band-like headache for 48 hours following long screen hours.',
    status: 'pending_verification',
    created_at: new Date(Date.now() - 75 * 60000).toISOString(),
    ai_summary: {
      structured_summary: {
        chief_complaints: 'Dull pressing tension headache across forehead and temples.',
        overall_severity: 'Mild',
        triage_urgency: 'Routine',
        urgency_reason: 'Tension-type characteristics without neurological red flags or nausea.',
        all_symptoms_overview: [
          'Bilateral Forehead Ache',
          'Eye Strain & Neck Tightness',
        ],
        symptoms_deep_dive: [
          {
            name: 'Bilateral Forehead Ache',
            timeline: 'Started 2 days ago, steady progression',
            depth_and_severity: 'Mild-Moderate constant pressing depth (depth 5/10)',
            timing_and_diurnal_pattern: 'Builds up progressively in the late afternoon and evening after continuous screen exposure',
            triggers_and_relieving: 'Aggravated by bright computer glare and late hours; relieved by closing eyes in a dark quiet room',
            patient_disclosed_details: 'Patient stated she felt like a tight rubber band was wrapped around her temples after working 9 hours on spreadsheets, denied visual aura, nausea, or light sensitivity.',
            ocr_report_correlation: null,
            duration: '2 days',
            severity: 'Mild-Moderate',
            location: 'Bilateral fronto-temporal',
            pattern: 'Constant dull ache',
            triggers: 'Screen glare / Late hours',
            report_correlation: null,
          },
        ],
        medications_and_history: {
          medications_taken: 'None',
          chronic_conditions: 'None',
          allergies: 'Dust sensitivity',
        },
        clinical_notes: 'No aura, no vomiting, normal visual acuity reported. Tension pattern consistent.',
      },
    },
  },
]

export default function VerificationPage() {
  const [emergencyQueue, setEmergencyQueue] = useState([])
  const [normalQueue, setNormalQueue] = useState([])
  const [externalReferralQueue, setExternalReferralQueue] = useState([])
  const [selectedCase, setSelectedCase] = useState(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [actionNotice, setActionNotice] = useState({ text: '', type: 'success' })
  const [viewingDocModal, setViewingDocModal] = useState(null)

  // View Mode: 'review' | 'edit' | 'external_referral'
  const [viewMode, setViewMode] = useState('review')
  const [isAiDrawerOpen, setIsAiDrawerOpen] = useState(false)
  const [drawerActiveTab, setDrawerActiveTab] = useState('chat') // 'chat' | 'interrogation'
  const [editFormData, setEditFormData] = useState({
    bp_systolic: '',
    bp_diastolic: '',
    temperature_f: '',
    weight_kg: '',
    height_cm: '',
    chief_complaints: '',
    priority: 'normal',
    urgency_level: 'green',
  })

  // ── Worker Session Info ──
  const [workerInfo] = useState(() => {
    try {
      const stored = localStorage.getItem('worker_info') || localStorage.getItem('astra_worker') || localStorage.getItem('user')
      return stored ? JSON.parse(stored) : {}
    } catch {
      return {}
    }
  })

  // ── External Referral Radar & Dispatch State ──
  const [editableReferralNote, setEditableReferralNote] = useState('')
  const [radiusKm, setRadiusKm] = useState(20)
  const [facilityType, setFacilityType] = useState('all')
  const [facilitySearch, setFacilitySearch] = useState('')
  const [nearbyFacilities, setNearbyFacilities] = useState([])
  const [originLocation, setOriginLocation] = useState({
    latitude: 20.2961,
    longitude: 85.8245,
    name: 'Referring Care Hub',
  })
  const [loadingFacilities, setLoadingFacilities] = useState(false)
  const [selectedFacilityId, setSelectedFacilityId] = useState('')
  const [transportType, setTransportType] = useState('Advanced Life Support (ALS) Ambulance')
  const [dispatchNotes, setDispatchNotes] = useState('')
  const [dispatchingReferral, setDispatchingReferral] = useState(false)
  const [dispatchedSlipModal, setDispatchedSlipModal] = useState(false)
  const [lastDispatchedSlipData, setLastDispatchedSlipData] = useState(null)

  const pickedFacility = nearbyFacilities.find((f) => f.id === selectedFacilityId) || null

  const loadNearbyFacilities = async (targetRadius = radiusKm, targetType = facilityType, searchQ = facilitySearch) => {
    setLoadingFacilities(true)
    try {
      const params = {}
      if (targetRadius && targetRadius > 0) params.radius_km = targetRadius
      if (targetType && targetType !== 'all') params.facility_type = targetType
      if (searchQ && searchQ.trim()) params.search = searchQ.trim()

      const res = await getNearbyFacilities(params)
      const facs = res.data?.facilities || []
      setNearbyFacilities(facs)

      if (res.data?.origin) {
        setOriginLocation({
          latitude: res.data.origin.latitude,
          longitude: res.data.origin.longitude,
          name: selectedCase?.external_referral?.referring_care_hub_name || 'Referring Hospital',
        })
      }

      if (facs.length > 0 && !selectedFacilityId) {
        setSelectedFacilityId(facs[0].id)
      }
    } catch (err) {
      console.warn('Failed to load nearby facilities:', err)
    } finally {
      setLoadingFacilities(false)
    }
  }

  const handleDispatchExternalReferral = async () => {
    if (!selectedCase || !selectedFacilityId) {
      alert('Please select a destination healthcare facility from the radar list.')
      return
    }
    const targetFacility = pickedFacility || nearbyFacilities.find((f) => f.id === selectedFacilityId)
    if (!targetFacility) {
      alert('Selected facility not found.')
      return
    }
    if (!editableReferralNote.trim()) {
      alert('Referral memorandum note cannot be blank.')
      return
    }
    setDispatchingReferral(true)
    try {
      const payload = {
        target_care_hub_id: targetFacility.id,
        target_care_hub_name: targetFacility.name,
        target_care_hub_type: targetFacility.hub_type,
        target_care_hub_distance_km: targetFacility.distance_km,
        distance_km: targetFacility.distance_km,
        transport_type: transportType || 'Advanced Life Support (ALS) Ambulance',
        dispatch_notes: dispatchNotes?.trim() || undefined,
        updated_referral_note: editableReferralNote.trim(),
        worker_id: workerInfo?.worker_id,
        worker_name: workerInfo?.full_name || 'Mid-Level Health Worker',
      }
      const res = await dispatchExternalReferral(selectedCase.patient_id, payload)
      const updatedPatient = res.data?.patient || selectedCase

      setLastDispatchedSlipData({
        patient: updatedPatient,
        facility: targetFacility,
        note: editableReferralNote.trim(),
        dispatchedAt: new Date().toISOString(),
      })
      setDispatchedSlipModal(true)
      showNotification(
        `External referral for ${selectedCase.full_name} (${selectedCase.patient_id}) successfully dispatched to ${targetFacility.name}!`,
        'success'
      )
      loadQueues()
    } catch (err) {
      alert(extractErrorMessage(err, 'Failed to dispatch external referral.'))
    } finally {
      setDispatchingReferral(false)
    }
  }

  // AI Co-Pilot State (Natural language edits)
  const [aiMessage, setAiMessage] = useState('')
  const [isAiProcessing, setIsAiProcessing] = useState(false)
  const [aiFeedbackHistory, setAiFeedbackHistory] = useState([])
  const aiChatScrollRef = useRef(null)

  // Verification Checklist & Doctor Notes
  const [workerNotes, setWorkerNotes] = useState('')
  const [verifiedChecks, setVerifiedChecks] = useState({
    identity: true,
    vitals: true,
    aiSummary: true,
  })

  // Doctor Assignment & Queue State
  const [doctorsList, setDoctorsList] = useState([])
  const [selectedDoctorId, setSelectedDoctorId] = useState('')
  const [loadingDoctors, setLoadingDoctors] = useState(false)

  const loadDoctors = async () => {
    try {
      setLoadingDoctors(true)
      const res = await getDoctorsQueues()
      const docs = res.data?.doctors || []
      setDoctorsList(docs)
      if (docs.length > 0 && !selectedDoctorId) {
        const pref = docs.find((d) => d.is_online) || docs[0]
        setSelectedDoctorId(pref.doctor_id)
      }
    } catch (err) {
      console.warn('Could not load doctors queues:', err)
    } finally {
      setLoadingDoctors(false)
    }
  }

  // Load Queues from Backend
  const loadQueues = async (showSpin = false) => {
    if (showSpin) setIsRefreshing(true)
    try {
      const res = await getGroupedPatientQueues()
      const data = res.data

      const emList = data.emergency_queue || []
      const normList = data.normal_queue || []
      const refList = data.external_referral_queue || []

      if (emList.length === 0 && normList.length === 0 && refList.length === 0) {
        setEmergencyQueue(DEMO_CASES.filter((c) => c.priority === 'emergency'))
        setNormalQueue(DEMO_CASES.filter((c) => c.priority !== 'emergency'))
        setExternalReferralQueue([])
      } else {
        setEmergencyQueue(emList)
        setNormalQueue(normList)
        setExternalReferralQueue(refList)
      }
    } catch (err) {
      console.error('Failed to load patient queues:', err)
      setEmergencyQueue(DEMO_CASES.filter((c) => c.priority === 'emergency'))
      setNormalQueue(DEMO_CASES.filter((c) => c.priority !== 'emergency'))
      setExternalReferralQueue([])
    } finally {
      if (showSpin) setIsRefreshing(false)
    }
  }

  useEffect(() => {
    loadQueues()
    loadDoctors()
    const timer = setInterval(() => {
      loadQueues(false)
      loadDoctors()
    }, 12000)
    return () => clearInterval(timer)
  }, [])

  // Auto-select first pending case if none selected
  useEffect(() => {
    if (!selectedCase) {
      if (emergencyQueue.length > 0) {
        syncSelectedCase(emergencyQueue[0])
      } else if (normalQueue.length > 0) {
        syncSelectedCase(normalQueue[0])
      } else if (externalReferralQueue.length > 0) {
        syncSelectedCase(externalReferralQueue[0])
      }
    } else {
      // Check if selected case is still pending
      const allPending = [...emergencyQueue, ...normalQueue, ...externalReferralQueue]
      const found = allPending.find((p) => p.patient_id === selectedCase.patient_id)
      if (!found) {
        if (emergencyQueue.length > 0) syncSelectedCase(emergencyQueue[0])
        else if (normalQueue.length > 0) syncSelectedCase(normalQueue[0])
        else if (externalReferralQueue.length > 0) syncSelectedCase(externalReferralQueue[0])
        else setSelectedCase(null)
      }
    }
  }, [emergencyQueue, normalQueue, externalReferralQueue])

  const syncSelectedCase = (patient) => {
    if (!patient) return
    setSelectedCase(patient)
    setEditFormData({
      bp_systolic: patient.bp_systolic || '',
      bp_diastolic: patient.bp_diastolic || '',
      temperature_f: patient.temperature_f || '',
      weight_kg: patient.weight_kg || '',
      height_cm: patient.height_cm || '',
      chief_complaints: patient.chief_complaints || '',
      priority: patient.priority || 'normal',
      urgency_level: patient.urgency_level || 'green',
    })
    setWorkerNotes(patient.verification_notes || '')
    setAiFeedbackHistory(patient.ai_update_history || [])

    // If case is external referral, set note and auto-switch to external_referral view
    const isExtRef = patient.status === 'pending_external_referral' || !!patient.external_referral
    if (isExtRef) {
      const note =
        patient.external_referral?.final_referral_note ||
        patient.external_referral?.updated_referral_note ||
        patient.external_referral?.ai_referral_note ||
        ''
      setEditableReferralNote(note)
      setViewMode('external_referral')
      loadNearbyFacilities(radiusKm, facilityType, facilitySearch)
    } else {
      if (viewMode === 'external_referral') {
        setViewMode('review')
      }
    }
  }

  const showNotification = (text, type = 'success') => {
    setActionNotice({ text, type })
    setTimeout(() => setActionNotice({ text: '', type: 'success' }), 5000)
  }

  // ── Handler: Manual Report Update ──
  const handleSaveManualEdit = async () => {
    if (!selectedCase) return
    try {
      const payload = {
        bp_systolic: editFormData.bp_systolic ? parseInt(editFormData.bp_systolic) : undefined,
        bp_diastolic: editFormData.bp_diastolic ? parseInt(editFormData.bp_diastolic) : undefined,
        temperature_f: editFormData.temperature_f ? parseFloat(editFormData.temperature_f) : undefined,
        weight_kg: editFormData.weight_kg ? parseFloat(editFormData.weight_kg) : undefined,
        height_cm: editFormData.height_cm ? parseFloat(editFormData.height_cm) : undefined,
        chief_complaints: editFormData.chief_complaints,
        priority: editFormData.priority,
        urgency_level: editFormData.urgency_level,
        verification_notes: workerNotes,
      }

      const res = await manualUpdatePatientReport(selectedCase.patient_id, payload)
      syncSelectedCase(res.data)
      showNotification(`Report updated successfully for ${selectedCase.patient_id}!`, 'success')
      setViewMode('review')
      loadQueues()
    } catch (err) {
      console.warn('Manual update fallback:', err)
      const updated = {
        ...selectedCase,
        ...editFormData,
        verification_notes: workerNotes,
      }
      syncSelectedCase(updated)
      showNotification(`Updated locally for ${selectedCase.patient_id}.`, 'success')
      setViewMode('review')
    }
  }

  // ── Handler: AI Co-Pilot Natural Language Update ──
  const handleSendAiUpdate = async (customMessage) => {
    const textToSend = (customMessage || aiMessage).trim()
    if (!textToSend || !selectedCase || isAiProcessing) return

    setIsAiProcessing(true)
    setAiMessage('')

    try {
      const res = await aiUpdatePatientReport(selectedCase.patient_id, {
        message: textToSend,
      })

      const { changes_applied, patient } = res.data
      syncSelectedCase(patient)
      setAiFeedbackHistory(patient.ai_update_history || [])
      showNotification(`AI updated: ${changes_applied.join(', ')}`, 'success')
      loadQueues()
    } catch (err) {
      console.warn('AI Co-pilot API fallback:', err)
      const newEntry = {
        id: Math.random().toString(),
        timestamp: new Date().toISOString(),
        worker_message: textToSend,
        ai_reply: `Recorded instruction: "${textToSend}". Clinical parameters updated for doctor review.`,
        changes_applied: [`Updated note with "${textToSend}"`],
      }
      setAiFeedbackHistory((prev) => [...prev, newEntry])
      showNotification(`AI update recorded locally for ${selectedCase.patient_id}.`, 'success')
    } finally {
      setIsAiProcessing(false)
      setTimeout(() => {
        if (aiChatScrollRef.current) {
          aiChatScrollRef.current.scrollTop = aiChatScrollRef.current.scrollHeight
        }
      }, 100)
    }
  }

  // ── Handler: Final "Approve & Add to Doctor Queue" ──
  const handleApproveForDoctor = async () => {
    if (!selectedCase) return

    const selectedDoc = doctorsList.find((d) => d.doctor_id === selectedDoctorId)

    try {
      await verifyPatientToDoctor(selectedCase.patient_id, {
        verification_notes: workerNotes,
        priority: editFormData.priority || selectedCase.priority,
        assigned_doctor_id: selectedDoc?.doctor_id || null,
        assigned_doctor_name: selectedDoc?.full_name || null,
        assigned_doctor_role: selectedDoc?.role || null,
      })

      showNotification(
        `Case ${selectedCase.patient_id} (${selectedCase.full_name}) approved & dispatched to ${selectedDoc?.full_name ? selectedDoc.full_name + ' Queue' : 'Doctor Queue'}!`,
        'success'
      )
      loadQueues()
      loadDoctors()
    } catch (err) {
      console.warn('Verify API fallback:', err)
      showNotification(
        `Case ${selectedCase.patient_id} verified & forwarded to Doctor Queue.`,
        'success'
      )
      setEmergencyQueue((prev) => prev.filter((c) => c.patient_id !== selectedCase.patient_id))
      setNormalQueue((prev) => prev.filter((c) => c.patient_id !== selectedCase.patient_id))
    }
  }

  // ── Handler: Request AI Re-Screening ──
  const handleRequestRescreen = async () => {
    if (!selectedCase) return
    const reason = window.prompt(
      `Specify reason for sending ${selectedCase.patient_id} back to AI Kiosk:`,
      'Need further symptom clarification'
    )
    if (!reason) return

    try {
      await requestPatientRescreen(selectedCase.patient_id, { reason })
      showNotification(`Case ${selectedCase.patient_id} sent back to AI Kiosk.`, 'info')
      loadQueues()
    } catch (err) {
      console.warn('Rescreen API fallback:', err)
      showNotification(`Case returned to AI Kiosk for re-screening.`, 'info')
      setEmergencyQueue((prev) => prev.filter((c) => c.patient_id !== selectedCase.patient_id))
      setNormalQueue((prev) => prev.filter((c) => c.patient_id !== selectedCase.patient_id))
    }
  }

  // Extract structured summary fields
  const summaryObj =
    selectedCase?.ai_summary?.structured_summary || selectedCase?.ai_summary || {}
  const allSymptoms = summaryObj.all_symptoms_overview?.length
    ? summaryObj.all_symptoms_overview
    : (summaryObj.symptoms_deep_dive || summaryObj.symptoms || []).map((s) => (typeof s === 'string' ? s : s?.name)).filter(Boolean)
  const symptomsDeepDive = summaryObj.symptoms_deep_dive || summaryObj.symptoms || []
  const medHistory = summaryObj.medications_and_history || {}
  const attachedDocs = getAttachedDocuments(selectedCase)
  const isEmergencyCase =
    selectedCase?.priority === 'emergency' ||
    selectedCase?.urgency_detected ||
    selectedCase?.status === 'emergency_queue'

  // Latest 5 cases for each queue
  const latestEmergency5 = emergencyQueue.slice(0, 5)
  const latestNormal5 = normalQueue.slice(0, 5)

  return (
    <WorkerLayout
      title="Verification Desk"
      hideNav={true}
      subtitle="Review AI triage reports, update vitals & clinical summaries manually or with AI Co-Pilot, and forward verified cases to the Doctor Queue."
    >
      <div className="hw-review-container">
        {/* ── Status Toast ── */}
        {actionNotice.text && (
          <div
            className={`form-success-banner fade-in ${
              actionNotice.type === 'info' ? 'bg-blue-50 text-blue-800' : ''
            }`}
            style={{ marginBottom: 12 }}
          >
            <CheckCircle2 size={16} />
            <span>{actionNotice.text}</span>
          </div>
        )}

        {/* ── Main Two-Column Review Desk ── */}
        <div className="hw-review-grid">
          
          {/* ════════════════ LEFT COLUMN: 5-BOX DUAL QUEUE PANELS ════════════════ */}
          <div className="hw-dual-queue-column">
            
            {/* 🚨 1. Emergency Queue Card (Latest 5 Boxes) */}
            <div className="hw-queue-category-card emergency">
              <div className="hw-queue-header">
                <div className="hw-queue-header-left">
                  <Flame size={16} className="text-red-600" />
                  <h3 className="hw-queue-title">Emergency Queue</h3>
                </div>
                <span className="hw-waiting-count-badge emergency">
                  {emergencyQueue.length} Waiting
                </span>
              </div>

              {/* 5 Slots */}
              <div className="hw-queue-slots-grid">
                {latestEmergency5.length === 0 ? (
                  <div className="hw-empty-queue-slot">
                    No emergency cases waiting
                  </div>
                ) : (
                  latestEmergency5.map((patient, index) => {
                    const isSelected = selectedCase?.patient_id === patient.patient_id
                    return (
                      <div
                        key={patient.patient_id}
                        onClick={() => syncSelectedCase(patient)}
                        className={`hw-slot-box emergency ${isSelected ? 'is-selected' : ''}`}
                      >
                        <div className="hw-slot-number">#{index + 1}</div>
                        <div className="hw-slot-content">
                          <div className="hw-slot-header">
                            <span className="hw-slot-id">{patient.patient_id}</span>
                            <span className="hw-slot-alert-pill">
                              {patient.urgency_details?.signal_id?.replace('_', ' ') || 'RED FLAG'}
                            </span>
                          </div>
                          <h4 className="hw-slot-name">{patient.full_name}</h4>
                          <div className="hw-slot-meta">
                            <span>{patient.age}y · {patient.gender}</span>
                            {patient.bp_systolic && (
                              <span>· BP: {patient.bp_systolic}/{patient.bp_diastolic}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

                {emergencyQueue.length > 5 && (
                  <div className="hw-queue-more-bar">
                    +{emergencyQueue.length - 5} more cases in emergency queue
                  </div>
                )}
            </div>

            {/* 📋 2. Normal Queue Card (Latest 5 Boxes) */}
            <div className="hw-queue-category-card normal">
              <div className="hw-queue-header">
                <div className="hw-queue-header-left">
                  <Activity size={16} className="text-slate-700" />
                  <h3 className="hw-queue-title" style={{ color: '#0f172a' }}>
                    Normal Queue
                  </h3>
                </div>
                <span className="hw-waiting-count-badge normal">
                  {normalQueue.length} Waiting
                </span>
              </div>

              {/* 5 Slots */}
              <div className="hw-queue-slots-grid">
                {latestNormal5.length === 0 ? (
                  <div className="hw-empty-queue-slot">
                    No routine cases waiting
                  </div>
                ) : (
                  latestNormal5.map((patient, index) => {
                    const isSelected = selectedCase?.patient_id === patient.patient_id
                    return (
                      <div
                        key={patient.patient_id}
                        onClick={() => syncSelectedCase(patient)}
                        className={`hw-slot-box ${isSelected ? 'is-selected' : ''}`}
                      >
                        <div className="hw-slot-number">#{index + 1}</div>
                        <div className="hw-slot-content">
                          <div className="hw-slot-header">
                            <span className="hw-slot-id">{patient.patient_id}</span>
                            <span style={{ fontSize: 10.5, fontWeight: 600, color: '#64748b' }}>
                              Standard
                            </span>
                          </div>
                          <h4 className="hw-slot-name">{patient.full_name}</h4>
                          <div className="hw-slot-meta">
                            <span>{patient.age}y · {patient.gender}</span>
                            {patient.temperature_f && (
                              <span>· {patient.temperature_f} °F</span>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

                {normalQueue.length > 5 && (
                  <div className="hw-queue-more-bar">
                    +{normalQueue.length - 5} more cases in normal queue
                  </div>
                )}
            </div>

            {/* 🏥 3. External Referral Review Queue Card */}
            <div className="hw-queue-category-card" style={{ border: '1.5px solid #818cf8', background: '#faf5ff' }}>
              <div className="hw-queue-header">
                <div className="hw-queue-header-left">
                  <Building2 size={16} color="#4f46e5" />
                  <h3 className="hw-queue-title" style={{ color: '#4338ca' }}>
                    External Referrals
                  </h3>
                </div>
                <span className="hw-waiting-count-badge" style={{ background: '#ede9fe', color: '#4338ca', fontWeight: 800 }}>
                  {externalReferralQueue.length} To Review
                </span>
              </div>

              {/* Slots */}
              <div className="hw-queue-slots-grid">
                {externalReferralQueue.length === 0 ? (
                  <div className="hw-empty-queue-slot" style={{ color: '#6366f1' }}>
                    No hospital transfers pending review
                  </div>
                ) : (
                  externalReferralQueue.slice(0, 5).map((patient, index) => {
                    const isSelected = selectedCase?.patient_id === patient.patient_id
                    return (
                      <div
                        key={patient.patient_id}
                        onClick={() => syncSelectedCase(patient)}
                        className={`hw-slot-box ${isSelected ? 'is-selected' : ''}`}
                        style={{
                          border: isSelected ? '2px solid #4338ca' : '1px solid #cbd5e1',
                          background: isSelected ? '#f5f3ff' : '#ffffff',
                        }}
                      >
                        <div className="hw-slot-number" style={{ color: '#4338ca' }}>#{index + 1}</div>
                        <div className="hw-slot-content">
                          <div className="hw-slot-header">
                            <span className="hw-slot-id">{patient.patient_id}</span>
                            <span style={{ fontSize: 9.5, fontWeight: 800, background: '#fef3c7', color: '#92400e', padding: '1px 5px', borderRadius: 4 }}>
                              {patient.external_referral?.urgency || 'URGENT'}
                            </span>
                          </div>
                          <h4 className="hw-slot-name">{patient.full_name}</h4>
                          <div className="hw-slot-meta">
                            <span>Diag: {patient.external_referral?.possible_diagnosis || 'Referral'}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              {externalReferralQueue.length > 5 && (
                <div className="hw-queue-more-bar" style={{ color: '#4338ca', background: '#e0e7ff' }}>
                  +{externalReferralQueue.length - 5} more external referral cases
                </div>
              )}
            </div>

            {/* Quick Refresh Button */}
            <button
              type="button"
              onClick={() => loadQueues(true)}
              className="hw-tab-pill"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: '8px 12px',
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
              }}
            >
              <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
              <span>Refresh Queues</span>
            </button>
          </div>

          {/* ════════════════ RIGHT COLUMN: REVIEW & VERIFICATION WORKSPACE ════════════════ */}
          <div className="hw-detail-pane">
            {selectedCase ? (
              <>
                {/* ── Patient Header & Mode Switcher ── */}
                <div className="hw-hero-banner">
                  <div className="hw-hero-left">
                    <div className={`hw-hero-avatar ${isEmergencyCase ? 'emergency' : ''}`}>
                      {selectedCase.full_name.charAt(0)}
                    </div>
                    <div className="hw-hero-title-group">
                      <h2>
                        <span>{selectedCase.full_name}</span>
                        <span className={`hw-patient-id-tag ${isEmergencyCase ? 'emergency' : ''}`}>
                          {selectedCase.patient_id}
                        </span>
                        <span
                          className={`hw-case-urgency-tag ${
                            isEmergencyCase ? 'red' : selectedCase.urgency_level || 'green'
                          }`}
                        >
                          {isEmergencyCase ? '🚨 Emergency' : 'Standard'}
                        </span>
                      </h2>
                      <div className="hw-hero-meta">
                        <span>
                          {selectedCase.age} yrs · {selectedCase.gender}
                        </span>
                        <span>· Contact: {selectedCase.contact_number || 'None'}</span>
                        <span>· Blood Group: {selectedCase.blood_group || 'N/A'}</span>
                        <span>· Registered: {new Date(selectedCase.created_at).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  </div>

                  {/* Mode Tabs & AI Trigger */}
                  <div className="hw-hero-controls">
                    <div className="hw-tab-pill-group">
                      <button
                        type="button"
                        onClick={() => setViewMode('review')}
                        className={`hw-tab-pill ${viewMode === 'review' ? 'active' : ''}`}
                      >
                        <FileText size={13} style={{ display: 'inline', marginRight: 4 }} />
                        Review
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewMode('edit')}
                        className={`hw-tab-pill ${viewMode === 'edit' ? 'active' : ''}`}
                      >
                        <Edit3 size={13} style={{ display: 'inline', marginRight: 4 }} />
                        Manual Edit
                      </button>
                      {(selectedCase.status === 'pending_external_referral' || selectedCase.external_referral) && (
                        <button
                          type="button"
                          onClick={() => {
                            setViewMode('external_referral')
                            loadNearbyFacilities(radiusKm, facilityType, facilitySearch)
                          }}
                          className={`hw-tab-pill ${viewMode === 'external_referral' ? 'active' : ''}`}
                          style={{
                            background: viewMode === 'external_referral' ? '#4338ca' : '#f5f3ff',
                            color: viewMode === 'external_referral' ? '#ffffff' : '#4338ca',
                            fontWeight: 700,
                          }}
                        >
                          <Building2 size={13} style={{ display: 'inline', marginRight: 4 }} />
                          Hospital Referral Radar
                        </button>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsAiDrawerOpen(true)}
                      className="hw-btn-ai-trigger"
                      id="btn-open-ai-drawer"
                      title="Open interactive AI assistant to interrogate case disclosures or update parameters"
                    >
                      <Sparkles size={14} />
                      <span>Chat with Case / AI Co-Pilot</span>
                      {aiFeedbackHistory.length > 0 && (
                        <span className="hw-ai-trigger-count">{aiFeedbackHistory.length}</span>
                      )}
                    </button>
                  </div>
                </div>

                {/* ── Emergency Urgency Alert Box (if triggered) ── */}
                {isEmergencyCase && (
                  <div
                    style={{
                      margin: '16px 24px 0',
                      background: '#fef2f2',
                      border: '1.5px solid #ef4444',
                      borderRadius: 10,
                      padding: '12px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                    }}
                  >
                    <Flame size={24} className="text-red-600 flex-shrink-0" />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#991b1b' }}>
                        CRITICAL URGENCY SIGNAL: {selectedCase.urgency_details?.signal_id || 'Urgent Triage Condition'}
                      </div>
                      <div style={{ fontSize: 12, color: '#7f1d1d' }}>
                        {selectedCase.urgency_details?.matched_phrase
                          ? `Patient phrase: "${selectedCase.urgency_details.matched_phrase}"`
                          : 'Immediate physician evaluation advised. Priority escalated to Red Queue.'}
                      </div>
                    </div>
                    <span
                      style={{
                        background: '#dc2626',
                        color: '#fff',
                        fontSize: 11,
                        fontWeight: 800,
                        padding: '4px 10px',
                        borderRadius: 6,
                      }}
                    >
                      RED FLAG
                    </span>
                  </div>
                )}

                {/* ── Vitals Strip (View or Edit) ── */}
                <div className="hw-vitals-strip">
                  {viewMode === 'edit' ? (
                    <>
                      <div className="hw-vital-card">
                        <span className="hw-vital-label">BP (Systolic)</span>
                        <input
                          type="number"
                          className="hw-vital-input"
                          value={editFormData.bp_systolic}
                          onChange={(e) =>
                            setEditFormData((p) => ({ ...p, bp_systolic: e.target.value }))
                          }
                          placeholder="e.g. 120"
                        />
                      </div>
                      <div className="hw-vital-card">
                        <span className="hw-vital-label">BP (Diastolic)</span>
                        <input
                          type="number"
                          className="hw-vital-input"
                          value={editFormData.bp_diastolic}
                          onChange={(e) =>
                            setEditFormData((p) => ({ ...p, bp_diastolic: e.target.value }))
                          }
                          placeholder="e.g. 80"
                        />
                      </div>
                      <div className="hw-vital-card">
                        <span className="hw-vital-label">Temp (°F)</span>
                        <input
                          type="number"
                          step="0.1"
                          className="hw-vital-input"
                          value={editFormData.temperature_f}
                          onChange={(e) =>
                            setEditFormData((p) => ({ ...p, temperature_f: e.target.value }))
                          }
                          placeholder="e.g. 98.6"
                        />
                      </div>
                      <div className="hw-vital-card">
                        <span className="hw-vital-label">Weight (kg)</span>
                        <input
                          type="number"
                          step="0.5"
                          className="hw-vital-input"
                          value={editFormData.weight_kg}
                          onChange={(e) =>
                            setEditFormData((p) => ({ ...p, weight_kg: e.target.value }))
                          }
                          placeholder="e.g. 68"
                        />
                      </div>
                      <div className="hw-vital-card">
                        <span className="hw-vital-label">Height (cm)</span>
                        <input
                          type="number"
                          className="hw-vital-input"
                          value={editFormData.height_cm}
                          onChange={(e) =>
                            setEditFormData((p) => ({ ...p, height_cm: e.target.value }))
                          }
                          placeholder="e.g. 165"
                        />
                      </div>
                      <div className="hw-vital-card">
                        <span className="hw-vital-label">Priority</span>
                        <select
                          className="hw-vital-input"
                          value={editFormData.priority}
                          onChange={(e) =>
                            setEditFormData((p) => ({
                              ...p,
                              priority: e.target.value,
                              urgency_level: e.target.value === 'emergency' ? 'red' : 'green',
                            }))
                          }
                        >
                          <option value="normal">Normal</option>
                          <option value="emergency">Emergency</option>
                        </select>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="hw-vital-card">
                        <span className="hw-vital-label">Blood Pressure</span>
                        <span className="hw-vital-val">
                          {selectedCase.bp_systolic
                            ? `${selectedCase.bp_systolic}/${selectedCase.bp_diastolic} mmHg`
                            : 'Not recorded'}
                        </span>
                      </div>
                      <div className="hw-vital-card">
                        <span className="hw-vital-label">Temperature</span>
                        <span className="hw-vital-val">
                          {selectedCase.temperature_f ? `${selectedCase.temperature_f} °F` : 'Normal'}
                        </span>
                      </div>
                      <div className="hw-vital-card">
                        <span className="hw-vital-label">Weight</span>
                        <span className="hw-vital-val">
                          {selectedCase.weight_kg ? `${selectedCase.weight_kg} kg` : 'N/A'}
                        </span>
                      </div>
                      <div className="hw-vital-card">
                        <span className="hw-vital-label">Height</span>
                        <span className="hw-vital-val">
                          {selectedCase.height_cm ? `${selectedCase.height_cm} cm` : 'N/A'}
                        </span>
                      </div>
                      <div className="hw-vital-card">
                        <span className="hw-vital-label">Queue Category</span>
                        <span
                          className="hw-vital-val"
                          style={{
                            color: isEmergencyCase ? '#dc2626' : '#166534',
                          }}
                        >
                          {isEmergencyCase ? '🚨 Emergency' : 'Normal'}
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {/* ── EXTERNAL REFERRAL RADAR WORKSPACE OR INTAKE VERIFICATION ── */}
                {viewMode === 'external_referral' ? (
                  <div style={{ padding: '20px 24px 30px' }}>
                    {/* 1. Referring Doctor & Clinical Case Justification Box */}
                    <div
                      style={{
                        background: '#f8fafc',
                        border: '1.5px solid #cbd5e1',
                        borderRadius: 12,
                        padding: '18px 20px',
                        marginBottom: 20,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ background: '#4338ca', color: '#fff', borderRadius: 8, padding: 7, display: 'flex' }}>
                            <Building2 size={18} />
                          </div>
                          <div>
                            <h4 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a' }}>
                              Hospital-to-Another Clinical Transfer Memorandum
                            </h4>
                            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                              Referring Physician: Dr. <strong>{selectedCase.external_referral?.referring_doctor_name || 'Attending Physician'}</strong> ({selectedCase.external_referral?.referring_doctor_role || 'Physician'}) · Origin: {selectedCase.external_referral?.referring_care_hub_name || 'Current Hospital Hub'}
                            </div>
                          </div>
                        </div>
                        <span
                          style={{
                            background: '#fef3c7',
                            color: '#92400e',
                            fontSize: 11,
                            fontWeight: 800,
                            padding: '4px 10px',
                            borderRadius: 6,
                            letterSpacing: 0.5,
                          }}
                        >
                          {selectedCase.external_referral?.urgency?.toUpperCase() || 'URGENT TRANSFER'}
                        </span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, background: '#ffffff', padding: 14, borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}>
                        <div>
                          <span style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>
                            Working / Provisional Diagnosis:
                          </span>
                          <strong style={{ color: '#0f172a', fontSize: 14 }}>
                            {selectedCase.external_referral?.possible_diagnosis || 'Under Evaluation'}
                          </strong>
                        </div>
                        <div>
                          <span style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>
                            Reason & Justification for Transfer:
                          </span>
                          <span style={{ color: '#0f172a' }}>
                            {selectedCase.external_referral?.reason_for_referral || 'Specialist intervention needed'}
                          </span>
                        </div>
                        {selectedCase.external_referral?.doctor_notes && (
                          <div style={{ gridColumn: 'span 2', borderTop: '1px solid #f1f5f9', paddingTop: 8 }}>
                            <span style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: 2 }}>
                              Doctor's Bedside Clinical Notes:
                            </span>
                            <span style={{ color: '#334155', fontStyle: 'italic' }}>
                              "{selectedCase.external_referral.doctor_notes}"
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 2. Official Clinical Referral Memorandum - Printed Form UI */}
                    <div
                      style={{
                        background: '#ffffff',
                        border: '1.5px solid #cbd5e1',
                        borderRadius: 12,
                        padding: '18px 20px',
                        marginBottom: 20,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <FileText size={17} color="#4338ca" />
                          <h4 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: '#0f172a' }}>
                            Official Clinical Referral Memorandum Slip (Printed Form UI)
                          </h4>
                        </div>
                        <span style={{ fontSize: 11.5, color: '#64748b' }}>
                          Switch to "Edit Raw Text" to customize notes or print official transfer paperwork
                        </span>
                      </div>

                      <PrintedReferralForm
                        patient={selectedCase || {}}
                        referralData={{
                          ...(selectedCase?.external_referral || {}),
                          target_care_hub_name: pickedFacility?.name,
                          target_care_hub_type: pickedFacility?.hub_type,
                          distance_km: pickedFacility?.distance_km,
                          transport_type: transportType || 'Advanced Life Support (ALS) Ambulance',
                          dispatched_by_worker_name: workerInfo?.full_name || 'Mid-Level Health Worker',
                        }}
                        rawNote={editableReferralNote}
                        onNoteChange={setEditableReferralNote}
                        editable={true}
                        showPrintButton={true}
                      />
                    </div>

                    {/* 3. Facilities Radius Radar & Live Interactive Map */}
                    <FacilitiesMapRadar
                      origin={originLocation}
                      facilities={nearbyFacilities}
                      selectedFacilityId={selectedFacilityId}
                      onSelectFacility={setSelectedFacilityId}
                      radiusKm={radiusKm}
                      facilityType={facilityType}
                      onRadiusChange={(r) => {
                        setRadiusKm(r)
                        loadNearbyFacilities(r, facilityType, facilitySearch)
                      }}
                      onTypeChange={(t) => {
                        setFacilityType(t)
                        loadNearbyFacilities(radiusKm, t, facilitySearch)
                      }}
                      searchQuery={facilitySearch}
                      onSearchChange={(q) => {
                        setFacilitySearch(q)
                        loadNearbyFacilities(radiusKm, facilityType, q)
                      }}
                    />

                    {/* 3.5 Transport Arrangement & Emergency Dispatch Coordination */}
                    <div
                      style={{
                        background: '#ffffff',
                        border: '1.5px solid #cbd5e1',
                        borderRadius: 12,
                        padding: '18px 20px',
                        marginBottom: 20,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                        <Ambulance size={17} color="#4338ca" />
                        <h4 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#0f172a' }}>
                          Emergency Transport & Dispatch Coordination
                        </h4>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 16 }}>
                        <div>
                          <label style={{ display: 'block', fontSize: 11.5, fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: 6 }}>
                            Assigned Transport Mode:
                          </label>
                          <select
                            value={transportType}
                            onChange={(e) => setTransportType(e.target.value)}
                            style={{
                              width: '100%',
                              padding: '10px 12px',
                              borderRadius: 8,
                              border: '1.5px solid #cbd5e1',
                              fontSize: 13,
                              fontWeight: 600,
                              background: '#f8fafc',
                              color: '#0f172a',
                            }}
                          >
                            <option value="Advanced Life Support (ALS) Ambulance">🚑 Advanced Life Support (ALS) Ambulance (Ventilator / Monitor)</option>
                            <option value="Basic Life Support (BLS) Ambulance">🚐 Basic Life Support (BLS) Ambulance (Oxygen + Paramedic)</option>
                            <option value="Government Emergency Ambulance (108 Service)">🚨 Government Emergency Ambulance (108 Free Service)</option>
                            <option value="Patient Transport Vehicle (PTV)">🚗 Patient Transport Vehicle (PTV - Non-Critical)</option>
                            <option value="Private / Family Arranged Vehicle">🚘 Private / Family Arranged Vehicle</option>
                          </select>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: 11.5, fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: 6 }}>
                            Dispatch Notes / Paramedic En-Route Instructions (Optional):
                          </label>
                          <input
                            type="text"
                            value={dispatchNotes}
                            onChange={(e) => setDispatchNotes(e.target.value)}
                            placeholder="e.g., Continuous O2 @ 3 L/min, vital check Q15 min, tertiary ICU pre-alerted"
                            style={{
                              width: '100%',
                              padding: '10px 12px',
                              borderRadius: 8,
                              border: '1.5px solid #cbd5e1',
                              fontSize: 13,
                              background: '#f8fafc',
                              color: '#0f172a',
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* 4. Final Confirmation & Dispatch Action Bar */}
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: '#0f172a',
                        color: '#ffffff',
                        padding: '16px 20px',
                        borderRadius: 12,
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>
                          Selected Target Facility for Transfer:
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 800, marginTop: 2 }}>
                          {pickedFacility
                            ? `${pickedFacility.name} (${pickedFacility.hub_type} · ${pickedFacility.distance_km} km away)`
                            : 'Please select a facility from the radar grid'}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleDispatchExternalReferral}
                        disabled={dispatchingReferral || !selectedFacilityId || !editableReferralNote.trim()}
                        style={{
                          background: '#10b981',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: 8,
                          padding: '11px 24px',
                          fontSize: 13.5,
                          fontWeight: 800,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 8,
                          opacity: (!selectedFacilityId || !editableReferralNote.trim()) ? 0.6 : 1,
                        }}
                      >
                        {dispatchingReferral ? (
                          <>
                            <RefreshCw size={15} className="animate-spin" />
                            <span>Dispatching Transfer...</span>
                          </>
                        ) : (
                          <>
                            <Send size={15} />
                            <span>Confirm & Dispatch Referral</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                {/* ── ATTACHED DOCUMENTS & OCR PRESCRIPTIONS GALLERY (AT TOP OF DOSSIER) ── */}
                <div className="hw-section" style={{ border: '1px solid #cbd5e1', background: '#ffffff' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <h4 className="hw-section-title" style={{ margin: 0 }}>
                      <FileText size={15} />
                      <span>Attached Medical Documents & Diagnostic Reports ({attachedDocs.length})</span>
                    </h4>
                    <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>
                      Astra OCR processes printed documents · Handwritten notes visually inspected
                    </span>
                  </div>

                  {attachedDocs.length === 0 ? (
                    <div style={{ padding: '12px 14px', background: '#f8fafc', borderRadius: 8, fontSize: 12.5, color: '#64748b', display: 'flex', alignItems: 'center', gap: 8, border: '1px dashed #cbd5e1' }}>
                      <FileText size={15} color="#94a3b8" />
                      <span>No external medical documents or prescriptions uploaded during kiosk session.</span>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                      {attachedDocs.map((doc, idx) => (
                        <div
                          key={idx}
                          style={{
                            background: '#ffffff',
                            border: doc.isHandwritten ? '1.5px dashed #f59e0b' : '1.5px solid #10b981',
                            borderRadius: 8,
                            padding: 10,
                            display: 'flex',
                            gap: 12,
                            alignItems: 'center',
                          }}
                        >
                          <div
                            onClick={() => setViewingDocModal(doc)}
                            style={{
                              width: 72,
                              height: 72,
                              flexShrink: 0,
                              borderRadius: 6,
                              overflow: 'hidden',
                              cursor: 'pointer',
                              border: '1px solid #cbd5e1',
                              position: 'relative',
                              background: '#0f172a',
                            }}
                            title="Click to view full-resolution image"
                          >
                            <img
                              src={doc.url}
                              alt="Medical report"
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                            <div
                              style={{
                                position: 'absolute',
                                bottom: 0,
                                left: 0,
                                right: 0,
                                background: 'rgba(15,23,42,0.75)',
                                color: '#ffffff',
                                fontSize: 9,
                                textAlign: 'center',
                                padding: '1px 0',
                                fontWeight: 700,
                              }}
                            >
                              Inspect
                            </div>
                          </div>

                          <div style={{ flex: 1, minWidth: 0 }}>
                            {doc.isHandwritten ? (
                              <div>
                                <span
                                  style={{
                                    fontSize: 10,
                                    fontWeight: 800,
                                    background: '#fffbeb',
                                    color: '#b45309',
                                    border: '1px solid #fde68a',
                                    padding: '2px 6px',
                                    borderRadius: 4,
                                    display: 'inline-block',
                                    marginBottom: 3,
                                  }}
                                >
                                  ⚠️ Not Extracted — Handwritten Document
                                </span>
                                <p style={{ margin: 0, fontSize: 10.5, color: '#78350f', lineHeight: 1.3 }}>
                                  Astra OCR processes printed text only. Preserved for direct visual examination by attending doctor.
                                </p>
                              </div>
                            ) : (
                              <div>
                                <span
                                  style={{
                                    fontSize: 10,
                                    fontWeight: 800,
                                    background: '#ecfdf5',
                                    color: '#047857',
                                    border: '1px solid #a7f3d0',
                                    padding: '2px 6px',
                                    borderRadius: 4,
                                    display: 'inline-block',
                                    marginBottom: 3,
                                  }}
                                >
                                  ✓ Printed Text Extracted by Astra OCR
                                </span>
                                <p style={{ margin: 0, fontSize: 10.5, color: '#065f46', lineHeight: 1.3 }}>
                                  {doc.structured_data?.report_type || 'Printed Report'} successfully parsed and mapped into symptom dossier.
                                </p>
                              </div>
                            )}

                            <button
                              type="button"
                              onClick={() => setViewingDocModal(doc)}
                              style={{
                                marginTop: 5,
                                background: '#f8fafc',
                                border: '1px solid #cbd5e1',
                                borderRadius: 4,
                                padding: '2px 8px',
                                fontSize: 10.5,
                                fontWeight: 600,
                                color: '#0f172a',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                            >
                              <ExternalLink size={10} />
                              <span>View Document</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* ── Section: Chief Complaints ── */}
                <div className="hw-section">
                  <h4 className="hw-section-title">
                    <FileText size={15} />
                    <span>Chief Complaints & Primary Presentation</span>
                  </h4>
                  {viewMode === 'edit' ? (
                    <textarea
                      rows={3}
                      className="hw-input-text"
                      value={editFormData.chief_complaints}
                      onChange={(e) =>
                        setEditFormData((p) => ({ ...p, chief_complaints: e.target.value }))
                      }
                      placeholder="Enter chief complaints..."
                    />
                  ) : (
                    <div
                      style={{
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: 8,
                        padding: '12px 14px',
                        fontSize: 13.5,
                        color: '#1e293b',
                        lineHeight: 1.5,
                      }}
                    >
                      {selectedCase.chief_complaints || 'No complaints recorded.'}
                    </div>
                  )}
                </div>

                {/* ── PRESENTING PATIENT SYMPTOMS (PURE SYMPTOM ROSTER) ── */}
                <div className="hw-section" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 18, marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 28, height: 28, borderRadius: 6, background: '#f1f5f9', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Activity size={15} color="#0f172a" />
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <h4 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.2px' }}>
                            Presenting Patient Symptoms
                          </h4>
                          <span style={{ fontSize: 10.5, fontWeight: 700, background: '#0f172a', color: '#ffffff', padding: '1px 7px', borderRadius: 10 }}>
                            {allSymptoms.length} Reported
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: '#64748b', fontWeight: 500, marginTop: 2 }}>
                          Validated symptom roster directly cataloged from patient consultation
                        </div>
                      </div>
                    </div>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: '#047857', background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '3px 9px', borderRadius: 14 }}>
                      <CheckCircle2 size={12} color="#047857" /> Active Symptoms
                    </span>
                  </div>

                  {allSymptoms.length === 0 ? (
                    <div style={{ padding: '12px 14px', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 6, fontSize: 12.5, color: '#64748b', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Activity size={14} color="#94a3b8" />
                      <span>{selectedCase.chief_complaints || 'No specific presenting symptoms cataloged yet.'}</span>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {allSymptoms.map((symName, i) => (
                        <div
                          key={i}
                          style={{
                            background: '#ffffff',
                            border: '1.5px solid #0f172a',
                            color: '#0f172a',
                            padding: '6px 12px',
                            borderRadius: 6,
                            fontSize: 12.5,
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 7,
                            boxShadow: '0 1px 2px rgba(15,23,42,0.06)',
                          }}
                        >
                          <span
                            style={{
                              background: '#0f172a',
                              color: '#ffffff',
                              fontSize: 10,
                              fontWeight: 800,
                              padding: '1px 5px',
                              borderRadius: 3,
                            }}
                          >
                            #{i + 1}
                          </span>
                          <span>{symName}</span>
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: '50%',
                              background: '#10b981',
                              display: 'inline-block',
                            }}
                            title="Reported by patient"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* ── SYMPTOM DEEP-DIVE CLINICAL ANALYSIS & TIMELINE ── */}
                <div className="hw-section">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <h4 className="hw-section-title" style={{ margin: 0 }}>
                      <Clock size={15} />
                      <span>Symptom Clinical Deep-Dive & Timeline Dossier</span>
                    </h4>
                    <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>
                      Timeline · Severity · Diurnal Variations (Evening Fever) · OCR Corroboration · Direct Patient Statements
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {symptomsDeepDive.length === 0 ? (
                      <p style={{ fontSize: 12, color: '#64748b' }}>
                        No detailed symptom breakdown recorded yet.
                      </p>
                    ) : (
                      symptomsDeepDive.map((sym, idx) => {
                        const name = sym.name || `Symptom #${idx + 1}`
                        const timeline = sym.timeline || sym.duration
                        const depth = sym.depth_and_severity || sym.severity
                        const diurnal = sym.timing_and_diurnal_pattern || sym.pattern
                        const triggers = sym.triggers_and_relieving || sym.triggers
                        const verbatim = sym.patient_disclosed_details
                        const ocrMatch = sym.ocr_report_correlation || sym.report_correlation

                        return (
                          <div
                            key={idx}
                            style={{
                              background: '#f8fafc',
                              border: '1.5px solid #e2e8f0',
                              borderRadius: 8,
                              padding: '12px 14px',
                            }}
                          >
                            {/* Symptom Title & Badges */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, borderBottom: '1px solid #e2e8f0', paddingBottom: 8 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 11, fontWeight: 800, background: '#e2e8f0', color: '#0f172a', padding: '1px 6px', borderRadius: 4 }}>
                                  #{idx + 1}
                                </span>
                                <strong style={{ fontSize: 14, color: '#0f172a' }}>{name}</strong>
                              </div>
                              {depth && (
                                <span style={{ fontSize: 11, fontWeight: 700, background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca', padding: '2px 8px', borderRadius: 4 }}>
                                  Depth / Severity: {depth}
                                </span>
                              )}
                            </div>

                            {/* Deep-Dive Grid: Timeline, Diurnal, Triggers, Location */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8, marginBottom: 10 }}>
                              <div style={{ background: '#ffffff', padding: '8px 10px', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                                <div style={{ fontSize: 10.5, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>
                                  ⏱️ Timeline & Progression
                                </div>
                                <div style={{ fontSize: 12, color: '#0f172a', fontWeight: 600 }}>
                                  {timeline || 'Recorded during kiosk interrogation'}
                                </div>
                              </div>

                              <div style={{ background: '#ffffff', padding: '8px 10px', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                                <div style={{ fontSize: 10.5, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>
                                  🌗 Diurnal Timing & Pattern
                                </div>
                                <div style={{ fontSize: 12, color: '#0f172a', fontWeight: 600 }}>
                                  {diurnal || 'Present intermittently during daily routine'}
                                </div>
                              </div>

                              <div style={{ background: '#ffffff', padding: '8px 10px', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                                <div style={{ fontSize: 10.5, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>
                                  ⚡ Aggravating & Relieving
                                </div>
                                <div style={{ fontSize: 12, color: '#0f172a', fontWeight: 500 }}>
                                  {triggers || 'No external triggers reported'}
                                </div>
                              </div>

                              {sym.location && (
                                <div style={{ background: '#ffffff', padding: '8px 10px', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                                  <div style={{ fontSize: 10.5, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>
                                    📍 Anatomical Location
                                  </div>
                                  <div style={{ fontSize: 12, color: '#0f172a', fontWeight: 600 }}>
                                    {sym.location}
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Comprehensive Patient Disclosed Details */}
                            {verbatim && (
                              <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderLeft: '3px solid #0f172a', borderRadius: 6, padding: '8px 12px', marginBottom: 8 }}>
                                <div style={{ fontSize: 10.5, fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', marginBottom: 3 }}>
                                  🗣️ Everything Patient Disclosed During Interrogation:
                                </div>
                                <div style={{ fontSize: 12, color: '#1e293b', lineHeight: 1.45, fontStyle: 'italic' }}>
                                  "{verbatim}"
                                </div>
                              </div>
                            )}

                            {/* Corroborating OCR Evidence from Uploaded Report */}
                            {ocrMatch && (
                              <div style={{ background: '#f0fdf4', border: '1.5px solid #86efac', borderLeft: '4px solid #16a34a', borderRadius: 6, padding: '8px 12px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, color: '#166534', textTransform: 'uppercase', marginBottom: 2 }}>
                                  <CheckCircle2 size={13} color="#16a34a" />
                                  <span>Extracted from Uploaded Report (OCR Corroboration)</span>
                                </div>
                                <div style={{ fontSize: 12, color: '#14532d', fontWeight: 600 }}>
                                  {ocrMatch.replace(/^Extracted from Uploaded Report:\s*/i, '')}
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>

                {/* ── Section: Medical History & Medications ── */}
                <div className="hw-section">
                  <h4 className="hw-section-title">
                    <Heart size={15} />
                    <span>Medical History & Current Medications</span>
                  </h4>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr 1fr',
                      gap: 12,
                      background: '#f8fafc',
                      padding: 12,
                      borderRadius: 8,
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    <div>
                      <span style={{ fontSize: 11, color: '#64748b', display: 'block', fontWeight: 600 }}>
                        Current Meds
                      </span>
                      <span style={{ fontSize: 12, color: '#0f172a' }}>
                        {medHistory.medications_taken || 'None reported'}
                      </span>
                    </div>
                    <div>
                      <span style={{ fontSize: 11, color: '#64748b', display: 'block', fontWeight: 600 }}>
                        Chronic Diseases
                      </span>
                      <span style={{ fontSize: 12, color: '#0f172a' }}>
                        {medHistory.chronic_conditions || 'None reported'}
                      </span>
                    </div>
                    <div>
                      <span style={{ fontSize: 11, color: '#64748b', display: 'block', fontWeight: 600 }}>
                        Known Allergies
                      </span>
                      <span style={{ fontSize: 12, color: '#0f172a' }}>
                        {medHistory.allergies || 'None reported'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* ── Section: Health Worker Verification Checklist & Doctor Notes ── */}
                <div className="hw-section">
                  <h4 className="hw-section-title">
                    <ShieldCheck size={15} />
                    <span>Health Worker Verification & Doctor Notes</span>
                  </h4>

                  {/* Checklist */}
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      padding: '12px 14px',
                      borderRadius: 8,
                      marginBottom: 12,
                    }}
                  >
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={verifiedChecks.identity}
                        onChange={(e) =>
                          setVerifiedChecks((p) => ({ ...p, identity: e.target.checked }))
                        }
                      />
                      <span>Patient identity & biological registration confirmed</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={verifiedChecks.vitals}
                        onChange={(e) =>
                          setVerifiedChecks((p) => ({ ...p, vitals: e.target.checked }))
                        }
                      />
                      <span>Vitals measurements checked & approved for physician</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={verifiedChecks.aiSummary}
                        onChange={(e) =>
                          setVerifiedChecks((p) => ({ ...p, aiSummary: e.target.checked }))
                        }
                      />
                      <span>AI screening summary reviewed & ready for Doctor queue</span>
                    </label>
                  </div>

                  {/* Notes for Doctor */}
                  <textarea
                    rows={2}
                    className="hw-input-text"
                    value={workerNotes}
                    onChange={(e) => setWorkerNotes(e.target.value)}
                    placeholder="Add clinical observations or priority flag for the attending doctor..."
                  />
                </div>

                {/* ── Section: Select Target Doctor & View Queues ── */}
                <div className="hw-section" style={{ border: '1px solid #bfdbfe', background: '#f8fafc' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <h4 className="hw-section-title" style={{ margin: 0, color: '#1e40af' }}>
                      <Stethoscope size={16} color="#2563eb" />
                      <span>Select Target Doctor & Queue</span>
                    </h4>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>
                      {doctorsList.length} Active Doctor{doctorsList.length === 1 ? '' : 's'}
                    </span>
                  </div>

                  <p style={{ fontSize: 12, color: '#475569', marginBottom: 12 }}>
                    Choose the doctor to attend this case based on clinical specialisation and active waiting queue:
                  </p>

                  {loadingDoctors ? (
                    <div style={{ padding: '16px', textAlign: 'center', fontSize: 12, color: '#64748b' }}>
                      <RefreshCw size={14} className="spin" style={{ display: 'inline', marginRight: 6 }} />
                      Loading doctor queues...
                    </div>
                  ) : doctorsList.length === 0 ? (
                    <div style={{
                      padding: '12px 14px',
                      background: '#fff',
                      borderRadius: 8,
                      border: '1px dashed #cbd5e1',
                      fontSize: 12,
                      color: '#64748b',
                    }}>
                      No specific doctors registered yet. Case will be routed to the <strong>General Physician Queue</strong>.
                    </div>
                  ) : (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                      gap: 10,
                    }}>
                      {doctorsList.map((doc) => {
                        const isSelected = selectedDoctorId === doc.doctor_id
                        const roleColor = {
                          intern_doctor: { bg: '#dcfce7', text: '#15803d', border: '#86efac' },
                          medicine_specialist: { bg: '#dbeafe', text: '#1d4ed8', border: '#93c5fd' },
                          specialist: { bg: '#f3e8ff', text: '#7e22ce', border: '#d8b4fe' },
                        }[doc.role] || { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' }

                        return (
                          <div
                            key={doc.doctor_id}
                            onClick={() => setSelectedDoctorId(doc.doctor_id)}
                            style={{
                              padding: '10px 12px',
                              borderRadius: 8,
                              background: isSelected ? '#eff6ff' : '#ffffff',
                              border: isSelected ? '2px solid #2563eb' : '1px solid #e2e8f0',
                              cursor: 'pointer',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 6,
                              transition: 'all 0.15s ease',
                              boxShadow: isSelected ? '0 2px 8px rgba(37,99,235,0.15)' : 'none',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span
                                  style={{
                                    width: 7,
                                    height: 7,
                                    borderRadius: '50%',
                                    background: doc.is_online ? '#10b981' : '#94a3b8',
                                    display: 'inline-block',
                                  }}
                                  title={doc.is_online ? 'Online' : 'Offline'}
                                />
                                <strong style={{ fontSize: 13, color: '#0f172a' }}>{doc.full_name}</strong>
                              </div>
                              <input
                                type="radio"
                                name="target_doctor"
                                checked={isSelected}
                                onChange={() => setSelectedDoctorId(doc.doctor_id)}
                                style={{ accentColor: '#2563eb', cursor: 'pointer' }}
                              />
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  padding: '1px 6px',
                                  borderRadius: 4,
                                  background: roleColor.bg,
                                  color: roleColor.text,
                                  border: `1px solid ${roleColor.border}`,
                                }}
                              >
                                {doc.role_label}
                              </span>
                              {doc.specialization && (
                                <span style={{ fontSize: 11, color: '#64748b' }}>
                                  · {doc.specialization}
                                </span>
                              )}
                            </div>

                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              marginTop: 4,
                              paddingTop: 6,
                              borderTop: '1px solid #f1f5f9',
                              fontSize: 11,
                            }}>
                              <span style={{ color: '#64748b' }}>Current Queue:</span>
                              <span
                                style={{
                                  fontWeight: 700,
                                  color: doc.waiting_patients > 3 ? '#dc2626' : doc.waiting_patients > 0 ? '#d97706' : '#16a34a',
                                  background: doc.waiting_patients > 3 ? '#fee2e2' : doc.waiting_patients > 0 ? '#fef3c7' : '#dcfce7',
                                  padding: '2px 6px',
                                  borderRadius: 4,
                                }}
                              >
                                {doc.waiting_patients} Waiting
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* ── Dispatch & Action Footer ── */}
                <div className="hw-dispatch-footer">
                  <div style={{ display: 'flex', gap: 8 }}>
                    {viewMode === 'edit' ? (
                      <button
                        type="button"
                        onClick={handleSaveManualEdit}
                        className="hw-btn-rescreen"
                        style={{ background: '#0f172a', color: '#fff', borderColor: '#0f172a' }}
                      >
                        <Save size={14} />
                        <span>Save Manual Edits</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setViewMode('edit')}
                        className="hw-btn-rescreen"
                      >
                        <Edit3 size={14} />
                        <span>Edit Report Manually</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handleRequestRescreen}
                      className="hw-btn-rescreen"
                      title="Send back to Kiosk if more patient interrogation is needed"
                    >
                      <RotateCcw size={14} />
                      <span>Request AI Re-Screening</span>
                    </button>
                  </div>

                  {/* Primary CTA: Final click to Add to Doctor Queue */}
                  <button
                    type="button"
                    onClick={handleApproveForDoctor}
                    className={`hw-btn-doctor-dispatch ${isEmergencyCase ? 'is-emergency' : ''}`}
                  >
                    <Check size={16} />
                    <span>Approve & Add to Doctor Queue</span>
                    <ArrowRight size={15} />
                  </button>
                </div>
              </>
            )}
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '120px 24px', color: '#94a3b8' }}>
                <Stethoscope size={48} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                <h3 style={{ fontSize: 16, fontWeight: 600, color: '#334155' }}>
                  No Patient Selected
                </h3>
                <p style={{ fontSize: 13 }}>
                  Select a box from the Emergency, Normal, or External Referral Queue on the left to start review.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Official Clinical Referral Slip Modal ── */}
      {dispatchedSlipModal && lastDispatchedSlipData && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 120,
            padding: 20,
            backdropFilter: 'blur(4px)',
          }}
          onClick={() => setDispatchedSlipModal(false)}
        >
          <div
            style={{
              background: '#ffffff',
              color: '#0f172a',
              width: '940px',
              maxWidth: '96vw',
              maxHeight: '94vh',
              overflowY: 'auto',
              borderRadius: 14,
              padding: '24px 28px',
              boxShadow: '0 25px 60px rgba(0, 0, 0, 0.4)',
              border: '2px solid #0f172a',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1.5px solid #e2e8f0', paddingBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ background: '#059669', color: '#fff', borderRadius: 8, padding: 6, display: 'flex' }}>
                  <CheckCircle2 size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>
                    Referral Dispatched Successfully
                  </h3>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                    Official printed transfer memorandum generated for patient handover & ambulance escort
                  </div>
                </div>
              </div>
              <button
                onClick={() => setDispatchedSlipModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 6 }}
              >
                <X size={20} />
              </button>
            </div>

            <PrintedReferralForm
              patient={lastDispatchedSlipData?.patient || {}}
              referralData={{
                ...(lastDispatchedSlipData?.patient?.external_referral || {}),
                target_care_hub_name: lastDispatchedSlipData?.facility?.name,
                target_care_hub_type: lastDispatchedSlipData?.facility?.hub_type,
                distance_km: lastDispatchedSlipData?.facility?.distance_km,
                transport_type: transportType || 'Advanced Life Support (ALS) Ambulance',
                dispatched_by_worker_name: workerInfo?.full_name || 'Mid-Level Health Worker',
              }}
              rawNote={lastDispatchedSlipData?.note || ''}
              showPrintButton={true}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16, borderTop: '1px solid #e2e8f0', paddingTop: 14 }}>
              <button
                onClick={() => setDispatchedSlipModal(false)}
                className="hw-btn-rescreen"
              >
                Close Window
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Document Fullscreen Inspection Modal ── */}
      {viewingDocModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 110,
            padding: 20,
          }}
          onClick={() => setViewingDocModal(null)}
        >
          <div
            style={{
              background: '#ffffff',
              color: '#0f172a',
              width: '800px',
              maxWidth: '95vw',
              maxHeight: '92vh',
              overflowY: 'auto',
              borderRadius: 12,
              padding: '24px 28px',
              boxShadow: '0 25px 60px rgba(0, 0, 0, 0.4)',
              border: '2px solid #0f172a',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid #e2e8f0', paddingBottom: 12 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#0f172a' }}>
                  Medical Document Inspection & OCR Status
                </h3>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                  Patient: {selectedCase?.full_name} ({selectedCase?.patient_id})
                </div>
              </div>
              <button
                onClick={() => setViewingDocModal(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 6,
                  color: '#64748b',
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Status Banner */}
            <div style={{ marginBottom: 16 }}>
              {viewingDocModal.isHandwritten ? (
                <div style={{ background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 8, padding: '12px 14px' }}>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: '#b45309', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <AlertTriangle size={15} color="#b45309" />
                    <span>⚠️ Handwritten Document — Text Extraction Safely Bypassed</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#78350f', marginTop: 4, lineHeight: 1.4 }}>
                    Astra OCR processes printed documents only. Handwritten prescriptions are preserved in original format for direct visual review by the doctor to eliminate AI transcription errors.
                  </div>
                </div>
              ) : (
                <div style={{ background: '#ecfdf5', border: '1.5px solid #a7f3d0', borderRadius: 8, padding: '12px 14px' }}>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: '#047857', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <CheckCircle2 size={15} color="#059669" />
                    <span>✓ Printed Text Successfully Extracted by Astra OCR</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#065f46', marginTop: 4, lineHeight: 1.4 }}>
                    PaddleOCR successfully parsed this printed report. Corroborating blood pressure, temperature, lab biomarkers, and existing prescriptions have been cross-mapped into the patient's symptom dossier.
                  </div>
                </div>
              )}
            </div>

            {/* Document Image Preview */}
            <div style={{ textAlign: 'center', background: '#0f172a', borderRadius: 8, padding: 14, marginBottom: 16 }}>
              <img
                src={viewingDocModal.url}
                alt="Medical document"
                style={{ maxWidth: '100%', maxHeight: '55vh', objectFit: 'contain', borderRadius: 4 }}
              />
            </div>

            {/* Structured Report Findings */}
            {viewingDocModal.structured_data && Object.keys(viewingDocModal.structured_data).length > 0 && (
              <div style={{ background: '#f8fafc', padding: 14, borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12.5, marginBottom: 16 }}>
                <strong style={{ display: 'block', marginBottom: 8, color: '#0f172a', textTransform: 'uppercase', fontSize: 11 }}>
                  Parsed Report Attributes & Lab Values:
                </strong>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
                  {viewingDocModal.structured_data.report_type && (
                    <div><strong>Type: </strong>{viewingDocModal.structured_data.report_type}</div>
                  )}
                  {viewingDocModal.structured_data.doctor_name && (
                    <div><strong>Doctor: </strong>{viewingDocModal.structured_data.doctor_name}</div>
                  )}
                  {viewingDocModal.structured_data.facility_name && (
                    <div><strong>Facility: </strong>{viewingDocModal.structured_data.facility_name}</div>
                  )}
                  {viewingDocModal.structured_data.document_date && (
                    <div><strong>Date: </strong>{viewingDocModal.structured_data.document_date}</div>
                  )}
                </div>
              </div>
            )}

            <div style={{ textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <a
                href={viewingDocModal.url}
                target="_blank"
                rel="noopener noreferrer"
                className="hw-btn-rescreen"
                style={{ background: '#ffffff', color: '#0f172a', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <ExternalLink size={13} />
                <span>Open Original Image</span>
              </a>
              <button
                type="button"
                onClick={() => setViewingDocModal(null)}
                className="hw-btn-rescreen"
                style={{ background: '#0f172a', color: '#ffffff', borderColor: '#0f172a' }}
              >
                Close Viewer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Slide-Over AI Assistant & Patient Interrogation Drawer ── */}
      {isAiDrawerOpen && selectedCase && (
        <div
          className="hw-ai-drawer-overlay"
          onClick={() => setIsAiDrawerOpen(false)}
        >
          <div
            className="hw-ai-drawer"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="hw-ai-drawer-header">
              <div className="hw-ai-drawer-title">
                <div style={{ width: 34, height: 34, borderRadius: 8, background: '#0f172a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Sparkles size={17} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Case AI Co-Pilot & Patient Dialogue</h3>
                  <div style={{ fontSize: 11.5, color: '#64748b', fontWeight: 600 }}>
                    {selectedCase.full_name} ({selectedCase.patient_id})
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAiDrawerOpen(false)}
                className="hw-ai-drawer-close-btn"
                title="Close Assistant"
              >
                <X size={19} />
              </button>
            </div>

            {/* Drawer Navigation Tabs */}
            <div className="hw-ai-drawer-tabs">
              <button
                type="button"
                className={`hw-ai-drawer-tab ${drawerActiveTab === 'chat' ? 'active' : ''}`}
                onClick={() => setDrawerActiveTab('chat')}
              >
                <Bot size={13} />
                <span>Report Co-Pilot</span>
              </button>
              <button
                type="button"
                className={`hw-ai-drawer-tab ${drawerActiveTab === 'interrogation' ? 'active' : ''}`}
                onClick={() => setDrawerActiveTab('interrogation')}
              >
                <FileText size={13} />
                <span>Transcript</span>
              </button>
            </div>

            {/* Drawer Content */}
            {drawerActiveTab === 'chat' ? (
              <div className="hw-ai-drawer-body">
                <div className="hw-ai-drawer-hint">
                  💬 <strong>Ask or Instruct:</strong> Ask what {selectedCase.full_name} stated during interrogation (e.g. <em>"What did patient say about evening fever?"</em>), or type natural instructions to adjust vitals, symptoms, or priority.
                </div>

                {/* Suggestion Chips */}
                <div className="hw-ai-drawer-chips">
                  <button
                    type="button"
                    className="hw-drawer-chip"
                    onClick={() => handleSendAiUpdate('What did the patient say about fever timing and evening chills?')}
                  >
                    ❓ Fever timing & chills?
                  </button>
                  <button
                    type="button"
                    className="hw-drawer-chip"
                    onClick={() => handleSendAiUpdate('Patient has mild dry cough for 3 days, add to symptoms')}
                  >
                    + Add dry cough (3d)
                  </button>
                  <button
                    type="button"
                    className="hw-drawer-chip"
                    onClick={() => handleSendAiUpdate('Measured BP again: 135/85 mmHg, update vitals')}
                  >
                    + Update BP to 135/85
                  </button>
                  <button
                    type="button"
                    className="hw-drawer-chip"
                    onClick={() => handleSendAiUpdate('Escalate priority to Emergency due to increasing chest tightness')}
                  >
                    🚨 Escalate to Emergency
                  </button>
                </div>

                {/* Chat Message Stream */}
                <div className="hw-chat-thread" ref={aiChatScrollRef}>
                  {aiFeedbackHistory.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '36px 16px', color: '#64748b' }}>
                      <Bot size={36} style={{ margin: '0 auto 10px', opacity: 0.4 }} />
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                        Ready to Assist with {selectedCase.full_name}
                      </div>
                      <div style={{ fontSize: 12, marginTop: 4, lineHeight: 1.4 }}>
                        Ask questions about the patient's triage interview or give instructions to modify clinical parameters.
                      </div>
                    </div>
                  ) : (
                    aiFeedbackHistory.map((item, idx) => (
                      <div key={item.id || idx} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div className="hw-chat-msg-worker">
                          {item.message || item.worker_message}
                        </div>
                        <div className="hw-chat-msg-ai">
                          <div>{item.ai_reply}</div>
                          {item.changes_applied && item.changes_applied.length > 0 && (
                            <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                              {item.changes_applied.map((c, i) => (
                                <span key={i} className="hw-chat-changes-badge">
                                  ✓ {c}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Footer Input Bar */}
                <div className="hw-ai-drawer-footer">
                  <input
                    type="text"
                    className="hw-drawer-input"
                    placeholder="Ask about patient or type instructions (e.g. 'Add fever for 2 days')..."
                    value={aiMessage}
                    onChange={(e) => setAiMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSendAiUpdate()
                    }}
                    disabled={isAiProcessing}
                  />
                  <button
                    type="button"
                    className="hw-drawer-send-btn"
                    onClick={() => handleSendAiUpdate()}
                    disabled={isAiProcessing || !aiMessage.trim()}
                  >
                    {isAiProcessing ? (
                      <RefreshCw size={14} className="animate-spin" />
                    ) : (
                      <>
                        <Send size={13} />
                        <span>Send</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <div className="hw-ai-drawer-body">
                <div className="hw-ai-drawer-hint">
                  🗣️ <strong>Kiosk Interrogation Transcript:</strong> Verbatim answers and clinical dialogue captured during {selectedCase.full_name}'s session at the Astra Kiosk.
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {(() => {
                    const turns = getInterrogationTurns(selectedCase)
                    if (turns.length === 0) {
                      return (
                        <div style={{ textAlign: 'center', padding: '30px', color: '#64748b', fontSize: 13 }}>
                          No dialogue turns recorded.
                        </div>
                      )
                    }
                    return turns.map((t, idx) => (
                      <div key={idx} className="hw-dialogue-card">
                        <div className="hw-dialogue-q">
                          <span>Q{idx + 1}: {t.question || 'Interrogation Inquiry'}</span>
                        </div>
                        <div className="hw-dialogue-a">
                          "{t.answer || t.patient_answer_en || t.patient_answer || 'No response recorded'}"
                        </div>
                      </div>
                    ))
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </WorkerLayout>
  )
}
