import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Stethoscope,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  LogOut,
  Mail,
  User,
  Heart,
  Thermometer,
  ShieldAlert,
  FileText,
  Plus,
  Trash2,
  Printer,
  Send,
  RefreshCw,
  Search,
  ExternalLink,
  Pill,
  Eye,
  X,
  Maximize2,
  Sparkles,
  Bot,
  Share2,
  Building2,
  MapPin,
  ArrowRight,
  ShieldCheck,
  Compass,
} from 'lucide-react'
import {
  getDoctorDeskQueue,
  submitDoctorPrescription,
  doctorHeartbeat,
  doctorLogout,
  getInternalDoctors,
  referPatientInternal,
  generateAiReferralNote,
  referPatientExternal,
  getNearbyFacilities,
} from '../../api/doctorApi'
import PrintedReferralForm from '../../components/referral/PrintedReferralForm'
import FacilitiesMapRadar from '../../components/referral/FacilitiesMapRadar'
import './DoctorDeskPage.css'

const extractErrorMessage = (err, fallback) => {
  const d = err?.response?.data?.detail
  if (typeof d === 'string') return d
  if (Array.isArray(d)) return d.map((x) => x.msg || JSON.stringify(x)).join(', ')
  if (d && typeof d === 'object') return d.message || JSON.stringify(d)
  return err?.message || fallback
}

const DEFAULT_MEDICINE = {
  name: '',
  form: 'Tablet',
  dosage: '500mg',
  frequency: '1-0-1',
  duration: '5 Days',
  route: 'Oral',
  instructions: 'After meals',
}

const COMMON_PRESETS = [
  { name: 'Paracetamol', form: 'Tablet', dosage: '650mg', frequency: '1-0-1', duration: '3 Days', route: 'Oral', instructions: 'After meals' },
  { name: 'Amoxicillin', form: 'Capsule', dosage: '500mg', frequency: '1-1-1', duration: '5 Days', route: 'Oral', instructions: 'After meals' },
  { name: 'Pantoprazole', form: 'Tablet', dosage: '40mg', frequency: '1-0-0', duration: '5 Days', route: 'Oral', instructions: 'Before breakfast' },
  { name: 'Cetirizine', form: 'Tablet', dosage: '10mg', frequency: '0-0-1', duration: '3 Days', route: 'Oral', instructions: 'At bedtime' },
  { name: 'Azithromycin', form: 'Tablet', dosage: '500mg', frequency: '1-0-0', duration: '3 Days', route: 'Oral', instructions: 'After meals' },
  { name: 'ORS Sachet', form: 'Syrup', dosage: '1 Sachet', frequency: 'SOS', duration: '2 Days', route: 'Oral', instructions: 'Mix in 1L clean water' },
]

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

export default function DoctorDeskPage() {
  const navigate = useNavigate()

  // Doctor session state
  const [doctorInfo, setDoctorInfo] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('doctor_info') || '{}')
    } catch {
      return {}
    }
  })

  // Queue state
  const [activeQueueTab, setActiveQueueTab] = useState('emergency') // 'emergency' | 'normal' | 'completed'
  const [emergencyQueue, setEmergencyQueue] = useState([])
  const [normalQueue, setNormalQueue] = useState([])
  const [completedQueue, setCompletedQueue] = useState([])
  const [selectedPatient, setSelectedPatient] = useState(null)
  const [loadingQueue, setLoadingQueue] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  // Prescription Form state
  const [diagnosis, setDiagnosis] = useState('')
  const [clinicalNotes, setClinicalNotes] = useState('')
  const [doctorAdvice, setDoctorAdvice] = useState('')
  const [followUpDate, setFollowUpDate] = useState('5 Days')
  const [medicines, setMedicines] = useState([{ ...DEFAULT_MEDICINE }])
  const [submitting, setSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(null)
  const [previewModal, setPreviewModal] = useState(false)
  const [viewingDocModal, setViewingDocModal] = useState(null)

  // ── Clinical Referral State (Inside Hospital & Hospital-to-Another) ──
  const [isReferralModalOpen, setIsReferralModalOpen] = useState(false)
  const [isSlipViewerOpen, setIsSlipViewerOpen] = useState(false)
  const [referralTab, setReferralTab] = useState('inside') // 'inside' | 'external'
  const [referralActionMsg, setReferralActionMsg] = useState(null)

  // Inside Hospital Transfer State
  const [internalDoctors, setInternalDoctors] = useState([])
  const [loadingInternalDocs, setLoadingInternalDocs] = useState(false)
  const [selectedTargetDoctorId, setSelectedTargetDoctorId] = useState('')
  const [internalReason, setInternalReason] = useState('')
  const [internalNotes, setInternalNotes] = useState('')
  const [internalPriority, setInternalPriority] = useState('normal')
  const [submittingInternal, setSubmittingInternal] = useState(false)

  // External Referral State
  const [externalReason, setExternalReason] = useState('')
  const [externalDiagnosis, setExternalDiagnosis] = useState('')
  const [externalUrgency, setExternalUrgency] = useState('Urgent')
  const [externalNotes, setExternalNotes] = useState('')
  const [aiReferralNote, setAiReferralNote] = useState('')
  const [generatingAiNote, setGeneratingAiNote] = useState(false)
  const [submittingExternal, setSubmittingExternal] = useState(false)
  const [showDocFacilityMap, setShowDocFacilityMap] = useState(false)
  const [docNearbyFacilities, setDocNearbyFacilities] = useState([])
  const [docFacilityRadius, setDocFacilityRadius] = useState(20)
  const [docFacilityType, setDocFacilityType] = useState('all')
  const [docFacilitySearch, setDocFacilitySearch] = useState('')
  const [selectedTargetFacilityId, setSelectedTargetFacilityId] = useState('')

  const fetchDocNearbyFacilities = async (targetRadius = docFacilityRadius, targetType = docFacilityType, searchQ = docFacilitySearch) => {
    try {
      const params = {}
      if (targetRadius && targetRadius > 0) params.radius_km = targetRadius
      if (targetType && targetType !== 'all') params.facility_type = targetType
      if (searchQ && searchQ.trim()) params.search = searchQ.trim()
      const res = await getNearbyFacilities(params)
      setDocNearbyFacilities(res.data?.facilities || [])
    } catch (err) {
      console.warn('Failed to load nearby facilities for doctor:', err)
    }
  }

  const fetchInternalDoctorsList = async () => {
    setLoadingInternalDocs(true)
    try {
      const res = await getInternalDoctors()
      const docs = res.data?.doctors || []
      setInternalDoctors(docs)
      const otherDocs = docs.filter((d) => !d.is_self)
      if (otherDocs.length > 0) {
        setSelectedTargetDoctorId(otherDocs[0].doctor_id)
      }
    } catch (err) {
      console.warn('Failed to load internal doctors:', err)
    } finally {
      setLoadingInternalDocs(false)
    }
  }

  const handleOpenReferralModal = () => {
    setIsReferralModalOpen(true)
    fetchInternalDoctorsList()
    if (!externalDiagnosis && diagnosis) {
      setExternalDiagnosis(diagnosis)
    }
    if (selectedPatient?.external_referral) {
      const ext = selectedPatient.external_referral
      if (ext.reason_for_referral) setExternalReason(ext.reason_for_referral)
      if (ext.possible_diagnosis) setExternalDiagnosis(ext.possible_diagnosis)
      if (ext.urgency) setExternalUrgency(ext.urgency)
      const note = ext.final_referral_note || ext.updated_referral_note || ext.ai_referral_note
      if (note) setAiReferralNote(note)
    }
  }

  const handleTransferInternal = async (e) => {
    e.preventDefault()
    if (!selectedPatient || !selectedTargetDoctorId) return
    if (!internalReason.trim()) {
      alert('Please enter a clinical reason for the internal referral.')
      return
    }
    setSubmittingInternal(true)
    try {
      const res = await referPatientInternal(selectedPatient.patient_id, {
        target_doctor_id: selectedTargetDoctorId,
        reason: internalReason.trim(),
        notes: internalNotes.trim() || undefined,
        priority: internalPriority || selectedPatient.priority,
      })
      setReferralActionMsg({
        text: `Patient ${selectedPatient.full_name} (${selectedPatient.patient_id}) was transferred to Dr. ${res.data?.patient?.assigned_doctor_name || 'selected specialist'}!`,
        type: 'success',
      })
      setIsReferralModalOpen(false)
      setInternalReason('')
      setInternalNotes('')
      fetchQueue()
    } catch (err) {
      alert(extractErrorMessage(err, 'Failed to complete internal transfer.'))
    } finally {
      setSubmittingInternal(false)
    }
  }

  const handleGenerateAiReferralNote = async () => {
    if (!selectedPatient) return
    if (!externalReason.trim() || !externalDiagnosis.trim()) {
      alert('Please provide both the Reason for Referral and Working Diagnosis to generate the AI referral note.')
      return
    }
    setGeneratingAiNote(true)
    try {
      const res = await generateAiReferralNote(selectedPatient.patient_id, {
        reason_for_referral: externalReason.trim(),
        possible_diagnosis: externalDiagnosis.trim(),
        urgency: externalUrgency || 'Urgent',
        clinical_notes: externalNotes.trim() || undefined,
      })
      setAiReferralNote(res.data?.ai_referral_note || '')
    } catch (err) {
      alert(extractErrorMessage(err, 'Failed to generate AI referral note.'))
    } finally {
      setGeneratingAiNote(false)
    }
  }

  const handleSubmitExternalReferral = async (e) => {
    e.preventDefault()
    if (!selectedPatient) return
    if (!externalReason.trim()) {
      alert('Please provide the Reason for Referral.')
      return
    }
    if (!externalDiagnosis.trim()) {
      alert('Please provide the Working / Possible Diagnosis.')
      return
    }
    if (!aiReferralNote.trim()) {
      alert('Please generate or review the AI Referral Note before submitting.')
      return
    }
    setSubmittingExternal(true)
    try {
      await referPatientExternal(selectedPatient.patient_id, {
        reason_for_referral: externalReason.trim(),
        possible_diagnosis: externalDiagnosis.trim(),
        urgency: externalUrgency || 'Urgent',
        ai_referral_note: aiReferralNote.trim(),
        clinical_notes: externalNotes.trim() || undefined,
      })
      setReferralActionMsg({
        text: `External referral note finalized! Patient sent to Mid-Level Health Worker review queue for facility radius radar & dispatch.`,
        type: 'success',
      })
      setIsReferralModalOpen(false)
      setExternalReason('')
      setExternalDiagnosis('')
      setAiReferralNote('')
      fetchQueue()
    } catch (err) {
      alert(extractErrorMessage(err, 'Failed to submit external referral.'))
    } finally {
      setSubmittingExternal(false)
    }
  }

  // AI Interrogation Drawer state
  const [isAiDrawerOpen, setIsAiDrawerOpen] = useState(false)

  // Fetch queues from backend
  const fetchQueue = async () => {
    try {
      const res = await getDoctorDeskQueue()
      const data = res.data
      setEmergencyQueue(data.emergency_queue || [])
      setNormalQueue(data.normal_queue || [])
      setCompletedQueue(data.completed_queue || [])
      if (data.doctor) {
        setDoctorInfo(data.doctor)
      }

      // If no active patient selected, auto-select first available
      if (!selectedPatient) {
        if ((data.emergency_queue || []).length > 0) {
          selectPatient(data.emergency_queue[0])
          setActiveQueueTab('emergency')
        } else if ((data.normal_queue || []).length > 0) {
          selectPatient(data.normal_queue[0])
          setActiveQueueTab('normal')
        }
      }
    } catch (err) {
      console.error('Failed to fetch doctor desk queue:', err)
      if (err.response?.status === 401 || err.response?.status === 403) {
        navigate('/login/doctor')
      }
    } finally {
      setLoadingQueue(false)
    }
  }

  useEffect(() => {
    fetchQueue()
    const interval = setInterval(fetchQueue, 15000)
    const hb = setInterval(doctorHeartbeat, 60000)
    return () => {
      clearInterval(interval)
      clearInterval(hb)
    }
  }, [])

  const selectPatient = (patient) => {
    setSelectedPatient(patient)
    setSubmitSuccess(null)

    // Pre-populate if already prescribed or leave clean for doctor evaluation
    if (patient.doctor_prescription) {
      const rx = patient.doctor_prescription
      setDiagnosis(rx.diagnosis || '')
      setClinicalNotes(rx.clinical_notes || '')
      setDoctorAdvice(rx.doctor_advice || '')
      setFollowUpDate(rx.follow_up_date || '5 Days')
      setMedicines(rx.medicines?.length ? rx.medicines : [{ ...DEFAULT_MEDICINE }])
    } else {
      // Doctor establishes clinical diagnosis directly from objective symptoms
      setDiagnosis('')
      setClinicalNotes('')
      setDoctorAdvice('Adequate hydration and rest recommended.')
      setFollowUpDate('5 Days')
      setMedicines([{ ...DEFAULT_MEDICINE }])
    }
  }

  // Handle Medicine rows
  const handleMedChange = (index, field, value) => {
    const updated = [...medicines]
    updated[index] = { ...updated[index], [field]: value }
    setMedicines(updated)
  }

  const addMedRow = () => {
    setMedicines([...medicines, { ...DEFAULT_MEDICINE }])
  }

  const removeMedRow = (index) => {
    if (medicines.length === 1) return
    setMedicines(medicines.filter((_, i) => i !== index))
  }

  const applyPreset = (preset) => {
    if (medicines.length === 1 && !medicines[0].name.trim()) {
      setMedicines([{ ...preset }])
    } else {
      setMedicines([...medicines, { ...preset }])
    }
  }

  // Submit Prescription
  const handleSubmitPrescription = async (e) => {
    e.preventDefault()
    if (!selectedPatient) return

    if (!diagnosis.trim()) {
      alert('Please enter a clinical diagnosis.')
      return
    }

    const validMeds = medicines.filter((m) => m.name.trim())
    if (validMeds.length === 0) {
      alert('Please add at least one medication to the prescription.')
      return
    }

    setSubmitting(true)
    setSubmitSuccess(null)

    try {
      const payload = {
        diagnosis: diagnosis.trim(),
        clinical_notes: clinicalNotes.trim() || undefined,
        medicines: validMeds,
        doctor_advice: doctorAdvice.trim() || undefined,
        follow_up_date: followUpDate || undefined,
      }

      const res = await submitDoctorPrescription(selectedPatient.patient_id, payload)
      setSubmitSuccess({
        prescriptionId: res.data.prescription_id,
        emailSent: res.data.email_sent,
        patientEmail: res.data.patient_email,
        patientName: selectedPatient.full_name,
      })

      fetchQueue()
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to submit prescription.')
    } finally {
      setSubmitting(false)
    }
  }

  // Active queue list filtering
  const currentList =
    activeQueueTab === 'emergency'
      ? emergencyQueue
      : activeQueueTab === 'normal'
        ? normalQueue
        : completedQueue

  const filteredList = currentList.filter(
    (p) =>
      p.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.patient_id?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const isCompletedCase = selectedPatient?.status === 'prescription_dispensing' || selectedPatient?.status === 'completed'

  return (
    <div className="doc-desk-container">
      {/* ── Topbar (Black & White Editorial Header) ── */}
      <header className="doc-topbar">
        <div className="doc-topbar__brand">
          <div className="doc-logo-mark">A</div>
          <div>
            <div className="doc-brand-title">Astra Doctor Consultation Desk</div>
            <div className="doc-brand-subtitle">Connected Hospital Management Station</div>
          </div>
        </div>

        <div className="doc-topbar__center">
          <div className="doc-status-chip">
            <span className="doc-online-dot" />
            <span>Consultation Live</span>
          </div>
          <button
            onClick={fetchQueue}
            className="btn-doc-logout"
            title="Refresh Queues"
          >
            <RefreshCw size={13} className={loadingQueue ? 'spin' : ''} />
            <span>Sync</span>
          </button>
        </div>

        <div className="doc-topbar__profile">
          <div className="doc-profile-card">
            <Stethoscope size={18} color="#0f172a" />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                {doctorInfo.full_name || 'Dr. Medical Officer'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <span className="doc-role-badge medicine_specialist">
                  {doctorInfo.role === 'intern_doctor'
                    ? 'Intern Doctor'
                    : doctorInfo.role === 'specialist'
                      ? 'Specialist'
                      : 'Medicine Specialist'}
                </span>
                <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{doctorInfo.doctor_id}</span>
              </div>
            </div>
          </div>

          <button onClick={doctorLogout} className="btn-doc-logout">
            <LogOut size={13} />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* ── Main Split View ── */}
      <div className="doc-desk-body">
        {/* ── Left Sidebar: Segmented Queues ── */}
        <aside className="doc-queue-panel">
          <div className="doc-queue-header">
            <div className="doc-queue-tabs">
              <button
                className={`doc-queue-tab ${activeQueueTab === 'emergency' ? 'active emergency' : ''}`}
                onClick={() => setActiveQueueTab('emergency')}
              >
                <span>🔴 Emergency</span>
                <span className="doc-queue-badge" style={activeQueueTab === 'emergency' ? { background: '#ffffff', color: '#dc2626' } : { background: '#fee2e2', color: '#dc2626' }}>
                  {emergencyQueue.length}
                </span>
              </button>

              <button
                className={`doc-queue-tab ${activeQueueTab === 'normal' ? 'active' : ''}`}
                onClick={() => setActiveQueueTab('normal')}
              >
                <span>Routine</span>
                <span
                  className="doc-queue-badge"
                  style={activeQueueTab === 'normal' ? { background: '#ffffff', color: '#0f172a' } : { background: '#e2e8f0', color: '#475569' }}
                >
                  {normalQueue.length}
                </span>
              </button>

              <button
                className={`doc-queue-tab ${activeQueueTab === 'completed' ? 'active' : ''}`}
                onClick={() => setActiveQueueTab('completed')}
              >
                <span>Dispensed</span>
                <span
                  className="doc-queue-badge"
                  style={activeQueueTab === 'completed' ? { background: '#ffffff', color: '#0f172a' } : { background: '#e2e8f0', color: '#475569' }}
                >
                  {completedQueue.length}
                </span>
              </button>
            </div>

            <div style={{ position: 'relative', marginTop: 12 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: '#94a3b8' }} />
              <input
                type="text"
                className="doc-text-input"
                style={{ width: '100%', fontSize: 12, padding: '8px 12px 8px 32px' }}
                placeholder="Search patient ID or name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Patient Cards List */}
          <div className="doc-queue-list">
            {filteredList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 16px', color: '#94a3b8', fontSize: 13 }}>
                No patients in this queue.
              </div>
            ) : (
              filteredList.map((p) => {
                const isSelected = selectedPatient?.patient_id === p.patient_id
                const isEmerg = p.priority === 'emergency' || p.urgency_detected
                const isDisp = p.status === 'prescription_dispensing' || p.status === 'completed'

                return (
                  <div
                    key={p.patient_id}
                    className={`doc-patient-card ${isSelected ? 'selected' : ''} ${isEmerg ? 'is-emergency' : isDisp ? 'is-completed' : ''
                      }`}
                    onClick={() => selectPatient(p)}
                  >
                    <div className="doc-patient-card__header">
                      <span className="doc-patient-card__id">{p.patient_id}</span>
                      {isEmerg && (
                        <span style={{ fontSize: 10, fontWeight: 800, color: '#dc2626', background: '#fee2e2', padding: '2px 6px', borderRadius: 4 }}>
                          CRITICAL RED
                        </span>
                      )}
                      {p.internal_referral && (
                        <span style={{ fontSize: 10, fontWeight: 800, color: '#4338ca', background: '#e0e7ff', padding: '2px 6px', borderRadius: 4 }}>
                          DOC REFERRED
                        </span>
                      )}
                      {p.external_referral && (
                        <span style={{ fontSize: 10, fontWeight: 800, color: '#d97706', background: '#fef3c7', padding: '2px 6px', borderRadius: 4 }}>
                          EXT REFERRAL
                        </span>
                      )}
                      {isDisp && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#047857', background: '#ecfdf5', padding: '2px 6px', borderRadius: 4 }}>
                          PRESCRIBED
                        </span>
                      )}
                    </div>
                    <div className="doc-patient-card__name">{p.full_name}</div>
                    <div className="doc-patient-card__meta">
                      <span>{p.age} yrs</span>
                      <span>·</span>
                      <span>{p.gender}</span>
                      {p.blood_group && <span>· 🩸 {p.blood_group}</span>}
                      {p.email && <span>· 📧</span>}
                    </div>
                    <div className="doc-patient-card__complaint">
                      {p.chief_complaints || 'No complaints recorded'}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </aside>

        {/* ── Center/Right Workspace (Consultation Canvas) ── */}
        <main className="doc-workspace">
          {!selectedPatient ? (
            <div className="doc-empty-workspace">
              <Stethoscope size={64} style={{ opacity: 0.15, marginBottom: 16, color: '#0f172a' }} />
              <h2 style={{ fontSize: 20, color: '#0f172a', fontWeight: 800, marginBottom: 6 }}>No Patient Selected</h2>
              <p style={{ fontSize: 13, color: '#64748b' }}>
                Select a case from the queue on the left to review triage data and prescribe medicines.
              </p>
            </div>
          ) : (
            <div>
              {/* Submission Success Alert */}
              {submitSuccess && (
                <div
                  style={{
                    background: '#ecfdf5',
                    border: '1.5px solid #10b981',
                    borderRadius: 10,
                    padding: '16px 20px',
                    marginBottom: 20,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <CheckCircle2 size={24} color="#059669" />
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: '#065f46' }}>
                        Prescription #{submitSuccess.prescriptionId} Successfully Issued!
                      </div>
                      <div style={{ fontSize: 13, color: '#047857', marginTop: 2 }}>
                        {submitSuccess.emailSent ? (
                          <span>
                            📬 Digital Prescription and clinical report dispatched to{' '}
                            <strong>{submitSuccess.patientEmail}</strong>.
                          </span>
                        ) : (
                          <span>
                            ⚠️ Case routed to Pharmacist Dispensing Queue. (No patient email was available for digital dispatch).
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setPreviewModal(true)}
                    className="btn-doc-logout"
                    style={{ background: '#ffffff', color: '#0f172a', borderColor: '#0f172a' }}
                  >
                    <Printer size={14} />
                    <span>View / Print Rx</span>
                  </button>
                </div>
              )}

              {/* Referral Action Alert */}
              {referralActionMsg && (
                <div
                  style={{
                    background: referralActionMsg.type === 'success' ? '#eff6ff' : '#fef2f2',
                    border: `1.5px solid ${referralActionMsg.type === 'success' ? '#3b82f6' : '#ef4444'}`,
                    borderRadius: 10,
                    padding: '14px 18px',
                    marginBottom: 16,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <CheckCircle2 size={20} color={referralActionMsg.type === 'success' ? '#2563eb' : '#dc2626'} />
                    <span style={{ fontSize: 14, fontWeight: 700, color: referralActionMsg.type === 'success' ? '#1e40af' : '#991b1b' }}>
                      {referralActionMsg.text}
                    </span>
                  </div>
                  <button
                    onClick={() => setReferralActionMsg(null)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
                  >
                    <X size={16} />
                  </button>
                </div>
              )}

              {/* Patient Banner */}
              <div
                className={`doc-patient-banner ${selectedPatient.priority === 'emergency' || selectedPatient.urgency_detected
                  ? 'emergency'
                  : ''
                  }`}
              >
                <div className="doc-patient-info-group">
                  <div className="doc-patient-banner__title">
                    <span>{selectedPatient.full_name}</span>
                    <span style={{ fontSize: 14, color: '#0f172a', fontWeight: 700 }}>
                      ({selectedPatient.patient_id})
                    </span>
                    {(selectedPatient.priority === 'emergency' || selectedPatient.urgency_detected) && (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 800,
                          background: '#ef4444',
                          color: '#ffffff',
                          padding: '3px 8px',
                          borderRadius: 4,
                          letterSpacing: 0.5,
                        }}
                      >
                        🚨 EMERGENCY TRIAGE
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, color: '#475569', fontWeight: 500 }}>
                    <span>Age: <strong style={{ color: '#0f172a' }}>{selectedPatient.age} yrs</strong></span>
                    <span>·</span>
                    <span>Gender: <strong style={{ color: '#0f172a' }}>{selectedPatient.gender}</strong></span>
                    {selectedPatient.blood_group && (
                      <>
                        <span>·</span>
                        <span>Blood: <strong style={{ color: '#0f172a' }}>{selectedPatient.blood_group}</strong></span>
                      </>
                    )}
                    {selectedPatient.contact_number && (
                      <>
                        <span>·</span>
                        <span>Phone: <strong style={{ color: '#0f172a' }}>{selectedPatient.contact_number}</strong></span>
                      </>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {selectedPatient.email ? (
                    <div className="doc-patient-email-badge">
                      <Mail size={14} />
                      <span>{selectedPatient.email} (Email Enabled)</span>
                    </div>
                  ) : (
                    <div className="doc-patient-noemail-badge">
                      <AlertTriangle size={14} />
                      <span>No Email (Pharmacy Dispensing)</span>
                    </div>
                  )}

                  {/* Refer Patient Button */}
                  <button
                    type="button"
                    onClick={handleOpenReferralModal}
                    className="btn-doc-logout"
                    style={{ background: '#4338ca', color: '#ffffff', borderColor: '#4338ca', fontWeight: 700 }}
                    title="Refer this patient to another doctor in this hospital or to an external hospital facility"
                  >
                    <Share2 size={13} />
                    <span>Refer Patient</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsAiDrawerOpen(true)}
                    className="btn-doc-logout"
                    style={{ background: '#0f172a', color: '#ffffff', borderColor: '#0f172a' }}
                    title="Inspect patient interrogation dialogue transcript"
                  >
                    <FileText size={13} />
                    <span>View Kiosk Transcript</span>
                  </button>
                </div>
              </div>

              {/* Internal Referral Banner if patient was referred by another doctor */}
              {selectedPatient.internal_referral && (
                <div
                  style={{
                    background: '#eef2ff',
                    border: '1.5px solid #6366f1',
                    borderRadius: 10,
                    padding: '12px 18px',
                    marginBottom: 16,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <div style={{ background: '#4f46e5', color: '#fff', borderRadius: '50%', padding: 7, display: 'flex' }}>
                    <Share2 size={16} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#3730a3' }}>
                      Internally Referred from Dr. {selectedPatient.internal_referral.from_doctor_name}
                    </div>
                    <div style={{ fontSize: 12.5, color: '#4338ca', marginTop: 2 }}>
                      <strong>Reason for Referral:</strong> {selectedPatient.internal_referral.reason}
                      {selectedPatient.internal_referral.notes && (
                        <span style={{ marginLeft: 8, color: '#6366f1' }}>
                          · <strong>Clinical Notes:</strong> {selectedPatient.internal_referral.notes}
                        </span>
                      )}
                    </div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 800, background: '#c7d2fe', color: '#312e81', padding: '3px 8px', borderRadius: 4 }}>
                    {selectedPatient.internal_referral.priority?.toUpperCase() || 'NORMAL PRIORITY'}
                  </span>
                </div>
              )}

              {/* External Referral Status Banner if already initiated */}
              {selectedPatient.external_referral && (
                <div
                  style={{
                    background: '#fffbeb',
                    border: '1.5px solid #f59e0b',
                    borderRadius: 10,
                    padding: '12px 18px',
                    marginBottom: 16,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <div style={{ background: '#d97706', color: '#fff', borderRadius: '50%', padding: 7, display: 'flex' }}>
                    <Building2 size={16} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#92400e' }}>
                      Hospital Transfer Note Initiated ({selectedPatient.external_referral.status === 'dispatched' ? 'Dispatched to External Facility' : 'Awaiting Mid-Level Health Worker Review & Radar Dispatch'})
                    </div>
                    <div style={{ fontSize: 12.5, color: '#b45309', marginTop: 2 }}>
                      <strong>Working Diagnosis:</strong> {selectedPatient.external_referral.possible_diagnosis} · <strong>Reason:</strong> {selectedPatient.external_referral.reason_for_referral}
                      {selectedPatient.external_referral.target_care_hub_name && (
                        <span style={{ marginLeft: 8, color: '#78350f', fontWeight: 700 }}>
                          → Target Facility: {selectedPatient.external_referral.target_care_hub_name} ({selectedPatient.external_referral.target_care_hub_distance_km || '—'} km)
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsSlipViewerOpen(true)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      background: '#92400e',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: 6,
                      padding: '5px 12px',
                      fontSize: 11.5,
                      fontWeight: 800,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <FileText size={13} />
                    <span>View Printed Slip</span>
                  </button>
                  <span style={{ fontSize: 11, fontWeight: 800, background: '#fef3c7', color: '#92400e', padding: '3px 8px', borderRadius: 4 }}>
                    {selectedPatient.external_referral.urgency?.toUpperCase() || 'URGENT'}
                  </span>
                </div>
              )}

              {/* Biomarkers / Vitals Grid */}
              <div className="doc-vitals-grid">
                <div
                  className={`doc-vital-card ${
                    selectedPatient.bp_systolic && (selectedPatient.bp_systolic >= 140 || selectedPatient.bp_diastolic >= 90)
                      ? 'warning'
                      : ''
                  }`}
                >
                  <div className="doc-vital-label">Blood Pressure</div>
                  <div className="doc-vital-val">
                    {selectedPatient.bp_systolic && selectedPatient.bp_diastolic
                      ? `${selectedPatient.bp_systolic}/${selectedPatient.bp_diastolic}`
                      : '—'}
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginLeft: 4 }}>mmHg</span>
                  </div>
                </div>

                <div
                  className={`doc-vital-card ${
                    selectedPatient.temperature_f && selectedPatient.temperature_f >= 100.4 ? 'warning' : ''
                  }`}
                >
                  <div className="doc-vital-label">Temperature</div>
                  <div className="doc-vital-val">
                    {selectedPatient.temperature_f || '—'}
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginLeft: 4 }}>°F</span>
                  </div>
                </div>

                <div className="doc-vital-card">
                  <div className="doc-vital-label">Weight</div>
                  <div className="doc-vital-val">
                    {selectedPatient.weight_kg || '—'}
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginLeft: 4 }}>kg</span>
                  </div>
                </div>

                <div className="doc-vital-card">
                  <div className="doc-vital-label">Height</div>
                  <div className="doc-vital-val">
                    {selectedPatient.height_cm || '—'}
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginLeft: 4 }}>cm</span>
                  </div>
                </div>
              </div>

              {/* Consolidate documents & clinical fields */}
              {(() => {
                const attachedDocs = getAttachedDocuments(selectedPatient)
                const summaryObj = selectedPatient.ai_summary?.structured_summary || {}
                const allSymptoms = summaryObj.all_symptoms_overview?.length
                  ? summaryObj.all_symptoms_overview
                  : (summaryObj.symptoms_deep_dive || summaryObj.symptoms || []).map((s) => (typeof s === 'string' ? s : s?.name)).filter(Boolean)
                const symptomsDeepDive = summaryObj.symptoms_deep_dive || summaryObj.symptoms || []
                const medHistory = summaryObj.medications_and_history || {}

                return (
                  <>
                    {/* ── ATTACHED DOCUMENTS & OCR PRESCRIPTIONS GALLERY (AT THE VERY TOP) ── */}
                    <div className="doc-section-card" style={{ border: '1px solid #cbd5e1' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                        <div className="doc-section-card__title" style={{ margin: 0 }}>
                          <FileText size={16} />
                          <span>Attached Medical Reports & Prescription Documents ({attachedDocs.length})</span>
                        </div>
                        <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>
                          Astra OCR extracts printed text only · Handwritten documents safely preserved for visual review
                        </span>
                      </div>

                      {attachedDocs.length === 0 ? (
                        <div style={{ padding: '12px 16px', background: '#f8fafc', borderRadius: 8, fontSize: 12.5, color: '#64748b', display: 'flex', alignItems: 'center', gap: 8, border: '1px dashed #cbd5e1' }}>
                          <FileText size={15} color="#94a3b8" />
                          <span>No external diagnostic reports or doctor prescriptions were attached during this session.</span>
                        </div>
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
                          {attachedDocs.map((doc, idx) => (
                            <div
                              key={idx}
                              style={{
                                background: '#ffffff',
                                border: doc.isHandwritten ? '1.5px dashed #f59e0b' : '1.5px solid #10b981',
                                borderRadius: 8,
                                padding: 12,
                                display: 'flex',
                                gap: 12,
                                alignItems: 'center',
                              }}
                            >
                              {/* Thumbnail preview */}
                              <div
                                onClick={() => setViewingDocModal(doc)}
                                style={{
                                  width: 80,
                                  height: 80,
                                  flexShrink: 0,
                                  borderRadius: 6,
                                  overflow: 'hidden',
                                  cursor: 'pointer',
                                  border: '1px solid #cbd5e1',
                                  position: 'relative',
                                  background: '#0f172a',
                                }}
                                title="Click to view high-resolution image"
                              >
                                <img
                                  src={doc.url}
                                  alt="Report document"
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
                                    fontSize: 9.5,
                                    textAlign: 'center',
                                    padding: '2px 0',
                                    fontWeight: 700,
                                  }}
                                >
                                  Zoom
                                </div>
                              </div>

                              {/* Document Meta & Extraction Status */}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                {doc.isHandwritten ? (
                                  <div>
                                    <span
                                      style={{
                                        fontSize: 10.5,
                                        fontWeight: 800,
                                        background: '#fffbeb',
                                        color: '#b45309',
                                        border: '1px solid #fde68a',
                                        padding: '2px 8px',
                                        borderRadius: 4,
                                        display: 'inline-block',
                                        marginBottom: 4,
                                      }}
                                    >
                                      ⚠️ Not Extracted — Handwritten Document
                                    </span>
                                    <p style={{ margin: 0, fontSize: 11, color: '#78350f', lineHeight: 1.35 }}>
                                      Astra OCR extracts printed text only. Preserved for direct visual examination by doctor.
                                    </p>
                                  </div>
                                ) : (
                                  <div>
                                    <span
                                      style={{
                                        fontSize: 10.5,
                                        fontWeight: 800,
                                        background: '#ecfdf5',
                                        color: '#047857',
                                        border: '1px solid #a7f3d0',
                                        padding: '2px 8px',
                                        borderRadius: 4,
                                        display: 'inline-block',
                                        marginBottom: 4,
                                      }}
                                    >
                                      ✓ Printed Text Extracted by Astra OCR
                                    </span>
                                    <p style={{ margin: 0, fontSize: 11, color: '#065f46', lineHeight: 1.35 }}>
                                      {doc.structured_data?.report_type || 'Printed Medical Report'} parsed and mapped directly into symptom dossier.
                                    </p>
                                  </div>
                                )}

                                <button
                                  type="button"
                                  onClick={() => setViewingDocModal(doc)}
                                  style={{
                                    marginTop: 6,
                                    background: '#f8fafc',
                                    border: '1px solid #cbd5e1',
                                    borderRadius: 4,
                                    padding: '3px 9px',
                                    fontSize: 11,
                                    fontWeight: 600,
                                    color: '#0f172a',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 5,
                                  }}
                                >
                                  <ExternalLink size={11} />
                                  <span>Inspect Original Report</span>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* ── PRESENTING PATIENT SYMPTOMS (PURE SYMPTOM ROSTER) ── */}
                    <div className="doc-section-card" style={{ background: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 22, marginBottom: 20 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#f1f5f9', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Activity size={17} color="#0f172a" />
                          </div>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.2px' }}>
                                Presenting Patient Symptoms
                              </h3>
                              <span style={{ fontSize: 11, fontWeight: 700, background: '#0f172a', color: '#ffffff', padding: '2px 8px', borderRadius: 12 }}>
                                {allSymptoms.length} Reported
                              </span>
                            </div>
                            <div style={{ fontSize: 11.5, color: '#64748b', fontWeight: 500, marginTop: 2 }}>
                              Validated symptom roster directly cataloged from patient consultation
                            </div>
                          </div>
                        </div>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: '#047857', background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '4px 10px', borderRadius: 16 }}>
                          <CheckCircle2 size={13} color="#047857" /> Active Symptoms
                        </span>
                      </div>

                      {allSymptoms.length === 0 ? (
                        <div style={{ padding: '14px 16px', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 8, fontSize: 13, color: '#64748b', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Activity size={15} color="#94a3b8" />
                          <span>{selectedPatient.chief_complaints || 'No specific presenting symptoms cataloged yet.'}</span>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                          {allSymptoms.map((symName, i) => (
                            <div
                              key={i}
                              style={{
                                background: '#ffffff',
                                border: '1.5px solid #0f172a',
                                color: '#0f172a',
                                padding: '8px 14px',
                                borderRadius: 8,
                                fontSize: 13.5,
                                fontWeight: 700,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 9,
                                boxShadow: '0 1px 3px rgba(15,23,42,0.06)',
                              }}
                            >
                              <span
                                style={{
                                  background: '#0f172a',
                                  color: '#ffffff',
                                  fontSize: 10.5,
                                  fontWeight: 800,
                                  padding: '2px 6px',
                                  borderRadius: 4,
                                  letterSpacing: '-0.2px',
                                }}
                              >
                                #{i + 1}
                              </span>
                              <span>{symName}</span>
                              <span
                                style={{
                                  width: 7,
                                  height: 7,
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
                    <div className="doc-section-card">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                        <div className="doc-section-card__title" style={{ margin: 0 }}>
                          <Clock size={17} />
                          <span>Symptom Clinical Deep-Dive & Timeline Dossier</span>
                        </div>
                        <span style={{ fontSize: 11.5, color: '#64748b', fontWeight: 600 }}>
                          Timeline · Severity · Diurnal Variations (Evening Fever) · OCR Corroboration · Full Patient Disclosures
                        </span>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        {symptomsDeepDive.length === 0 ? (
                          <div style={{ padding: '14px', background: '#f8fafc', borderRadius: 8, fontSize: 13, color: '#64748b' }}>
                            Patient chief presentation: {selectedPatient.chief_complaints || 'Detailed interrogation recorded in session memory.'}
                          </div>
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
                                  background: '#ffffff',
                                  border: '1.5px solid #e2e8f0',
                                  borderRadius: 10,
                                  padding: '16px 18px',
                                  boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                                }}
                              >
                                {/* Symptom Title & Badges */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, borderBottom: '1px solid #f1f5f9', paddingBottom: 10 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <span style={{ fontSize: 12, fontWeight: 800, background: '#f1f5f9', color: '#0f172a', padding: '2px 8px', borderRadius: 4 }}>
                                      #{idx + 1}
                                    </span>
                                    <span style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>
                                      {name}
                                    </span>
                                  </div>
                                  {depth && (
                                    <span style={{ fontSize: 11.5, fontWeight: 700, background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', padding: '3px 10px', borderRadius: 6 }}>
                                      Depth / Severity: {depth}
                                    </span>
                                  )}
                                </div>

                                {/* Deep-Dive Grid: Timeline, Diurnal, Triggers, Location */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginBottom: 12 }}>
                                  <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: 6, border: '1px solid #edf2f7' }}>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 3 }}>
                                      ⏱️ Timeline & Progression
                                    </div>
                                    <div style={{ fontSize: 13, color: '#0f172a', fontWeight: 600 }}>
                                      {timeline || 'Recorded during kiosk interrogation'}
                                    </div>
                                  </div>

                                  <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: 6, border: '1px solid #edf2f7' }}>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 3 }}>
                                      🌗 Diurnal Timing & Pattern
                                    </div>
                                    <div style={{ fontSize: 13, color: '#0f172a', fontWeight: 600 }}>
                                      {diurnal || 'Present intermittently during daily routine'}
                                    </div>
                                  </div>

                                  <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: 6, border: '1px solid #edf2f7' }}>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 3 }}>
                                      ⚡ Aggravating & Relieving Factors
                                    </div>
                                    <div style={{ fontSize: 13, color: '#0f172a', fontWeight: 500 }}>
                                      {triggers || 'No specific triggers reported'}
                                    </div>
                                  </div>

                                  {sym.location && (
                                    <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: 6, border: '1px solid #edf2f7' }}>
                                      <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 3 }}>
                                        📍 Anatomical Location
                                      </div>
                                      <div style={{ fontSize: 13, color: '#0f172a', fontWeight: 600 }}>
                                        {sym.location}
                                      </div>
                                    </div>
                                  )}
                                </div>

                                {/* Comprehensive Patient Disclosed Details */}
                                {verbatim && (
                                  <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderLeft: '4px solid #0f172a', borderRadius: 6, padding: '10px 14px', marginBottom: 10 }}>
                                    <div style={{ fontSize: 11, fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', marginBottom: 4, letterSpacing: '0.4px' }}>
                                      🗣️ Everything Patient Disclosed During Interrogation:
                                    </div>
                                    <div style={{ fontSize: 12.5, color: '#1e293b', lineHeight: 1.5, fontStyle: 'italic' }}>
                                      "{verbatim}"
                                    </div>
                                  </div>
                                )}

                                {/* Corroborating OCR Evidence from Uploaded Report */}
                                {ocrMatch && (
                                  <div style={{ background: '#f0fdf4', border: '1.5px solid #86efac', borderLeft: '5px solid #16a34a', borderRadius: 6, padding: '10px 14px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 800, color: '#166534', textTransform: 'uppercase', marginBottom: 3 }}>
                                      <CheckCircle2 size={14} color="#16a34a" />
                                      <span>Extracted from Uploaded Report (OCR Corroboration)</span>
                                    </div>
                                    <div style={{ fontSize: 12.5, color: '#14532d', fontWeight: 600 }}>
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

                    {/* ── Medical History & Health Worker Verification Notes ── */}
                    <div className="doc-section-card">
                      <div className="doc-section-card__title">
                        <Heart size={16} />
                        <span>Patient Medical History & Mid-Level Verification Notes</span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <div
                          style={{
                            background: '#f8fafc',
                            padding: '12px 14px',
                            borderRadius: 8,
                            fontSize: 12.5,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 8,
                            border: '1px solid #e2e8f0',
                          }}
                        >
                          <div>
                            <strong style={{ color: '#475569' }}>Existing Meds: </strong>
                            <span style={{ color: '#0f172a' }}>
                              {medHistory.medications_taken || 'None reported'}
                            </span>
                          </div>
                          <div>
                            <strong style={{ color: '#475569' }}>Chronic Conditions: </strong>
                            <span style={{ color: '#0f172a' }}>
                              {medHistory.chronic_conditions || 'None reported'}
                            </span>
                          </div>
                          <div>
                            <strong style={{ color: '#475569' }}>Allergies: </strong>
                            <span style={{ color: '#dc2626', fontWeight: 600 }}>
                              {medHistory.allergies || 'None reported'}
                            </span>
                          </div>
                        </div>

                        <div>
                          {selectedPatient.verification_notes ? (
                            <div
                              style={{
                                background: '#f8fafc',
                                border: '1px dashed #94a3b8',
                                padding: '12px 14px',
                                borderRadius: 8,
                                fontSize: 12.5,
                                color: '#334155',
                              }}
                            >
                              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>
                                Health Worker Notes ({selectedPatient.verified_worker_name || 'Verification Desk'})
                              </div>
                              <div>{selectedPatient.verification_notes}</div>
                            </div>
                          ) : (
                            <div style={{ padding: '12px 14px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12, color: '#64748b' }}>
                              No additional verification notes logged.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </>
                )
              })()}

              {/* ── Doctor Prescription Form ── */}
              <div className="doc-section-card" style={{ border: '1.5px solid #0f172a' }}>
                <div className="doc-section-card__title">
                  <Pill size={16} />
                  <span>Clinical Prescription & Pharmacist Order Station</span>
                </div>

                <form onSubmit={handleSubmitPrescription}>
                  <div className="doc-form-row">
                    <div className="doc-input-group">
                      <label className="doc-label">Primary Clinical Diagnosis *</label>
                      <input
                        type="text"
                        className="doc-text-input"
                        placeholder="e.g. Acute Viral Bronchitis, Essential Hypertension"
                        value={diagnosis}
                        onChange={(e) => setDiagnosis(e.target.value)}
                        required
                        disabled={isCompletedCase}
                      />
                    </div>

                    <div className="doc-input-group">
                      <label className="doc-label">Follow-up Recommendation</label>
                      <select
                        className="doc-text-input"
                        value={followUpDate}
                        onChange={(e) => setFollowUpDate(e.target.value)}
                        disabled={isCompletedCase}
                      >
                        <option value="3 Days">After 3 Days</option>
                        <option value="5 Days">After 5 Days</option>
                        <option value="1 Week">After 1 Week</option>
                        <option value="2 Weeks">After 2 Weeks</option>
                        <option value="1 Month">After 1 Month</option>
                        <option value="SOS">SOS / As Needed</option>
                      </select>
                    </div>
                  </div>

                  {/* Quick Medicine Presets */}
                  {!isCompletedCase && (
                    <div style={{ marginBottom: 12 }}>
                      <span style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
                        Quick Medicine Presets:
                      </span>
                      <div className="doc-chip-wrap">
                        {COMMON_PRESETS.map((p, i) => (
                          <button
                            key={i}
                            type="button"
                            className="doc-chip"
                            onClick={() => applyPreset(p)}
                          >
                            + {p.name} {p.dosage}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Medicines Table */}
                  <table className="doc-med-table">
                    <thead>
                      <tr>
                        <th style={{ width: '25%' }}>Medicine Name *</th>
                        <th style={{ width: '13%' }}>Form</th>
                        <th style={{ width: '12%' }}>Dosage</th>
                        <th style={{ width: '14%' }}>Frequency</th>
                        <th style={{ width: '12%' }}>Duration</th>
                        <th style={{ width: '18%' }}>Instructions</th>
                        <th style={{ width: '6%' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {medicines.map((m, idx) => (
                        <tr key={idx}>
                          <td>
                            <input
                              type="text"
                              className="doc-med-input"
                              placeholder="e.g. Paracetamol 650"
                              value={m.name}
                              onChange={(e) => handleMedChange(idx, 'name', e.target.value)}
                              required
                              disabled={isCompletedCase}
                            />
                          </td>
                          <td>
                            <select
                              className="doc-med-input"
                              value={m.form}
                              onChange={(e) => handleMedChange(idx, 'form', e.target.value)}
                              disabled={isCompletedCase}
                            >
                              <option value="Tablet">Tablet</option>
                              <option value="Capsule">Capsule</option>
                              <option value="Syrup">Syrup</option>
                              <option value="Injection">Injection</option>
                              <option value="Drops">Drops</option>
                              <option value="Inhaler">Inhaler</option>
                              <option value="Ointment">Ointment</option>
                            </select>
                          </td>
                          <td>
                            <input
                              type="text"
                              className="doc-med-input"
                              placeholder="500mg"
                              value={m.dosage}
                              onChange={(e) => handleMedChange(idx, 'dosage', e.target.value)}
                              disabled={isCompletedCase}
                            />
                          </td>
                          <td>
                            <select
                              className="doc-med-input"
                              value={m.frequency}
                              onChange={(e) => handleMedChange(idx, 'frequency', e.target.value)}
                              disabled={isCompletedCase}
                            >
                              <option value="1-0-1">1-0-1 (M-N)</option>
                              <option value="1-0-0">1-0-0 (Morning)</option>
                              <option value="0-0-1">0-0-1 (Night)</option>
                              <option value="1-1-1">1-1-1 (Thrice)</option>
                              <option value="1-1-1-1">1-1-1-1 (4 Times)</option>
                              <option value="SOS">SOS (As Needed)</option>
                            </select>
                          </td>
                          <td>
                            <input
                              type="text"
                              className="doc-med-input"
                              placeholder="5 Days"
                              value={m.duration}
                              onChange={(e) => handleMedChange(idx, 'duration', e.target.value)}
                              disabled={isCompletedCase}
                            />
                          </td>
                          <td>
                            <input
                              type="text"
                              className="doc-med-input"
                              placeholder="After meals"
                              value={m.instructions}
                              onChange={(e) => handleMedChange(idx, 'instructions', e.target.value)}
                              disabled={isCompletedCase}
                            />
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {!isCompletedCase && medicines.length > 1 && (
                              <button
                                type="button"
                                className="btn-remove-med"
                                onClick={() => removeMedRow(idx)}
                                title="Remove medication"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {!isCompletedCase && (
                    <button type="button" className="btn-add-med" onClick={addMedRow}>
                      <Plus size={14} />
                      <span>Add Medication Row</span>
                    </button>
                  )}

                  {/* Doctor's advice and diet */}
                  <div className="doc-form-row" style={{ marginTop: 20 }}>
                    <div className="doc-input-group">
                      <label className="doc-label">Dietary Advice & Clinical Guidance</label>
                      <textarea
                        rows={2}
                        className="doc-text-input"
                        placeholder="e.g. Drink warm fluids, avoid cold exposure, avoid heavy lifting..."
                        value={doctorAdvice}
                        onChange={(e) => setDoctorAdvice(e.target.value)}
                        disabled={isCompletedCase}
                      />
                    </div>
                  </div>

                  {/* Submit Actions */}
                  <div className="doc-submit-footer">
                    <div>
                      <button
                        type="button"
                        onClick={() => setPreviewModal(true)}
                        className="btn-doc-logout"
                      >
                        <Printer size={15} />
                        <span>Preview / Print Rx</span>
                      </button>
                    </div>

                    {!isCompletedCase ? (
                      <button
                        type="submit"
                        className="btn-submit-prescription"
                        disabled={submitting}
                      >
                        <Send size={15} />
                        <span>
                          {submitting ? 'Signing & Dispatching...' : 'Sign & Submit Prescription'}
                        </span>
                      </button>
                    ) : (
                      <div style={{ color: '#047857', background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '6px 14px', borderRadius: 6, fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <CheckCircle2 size={16} />
                        <span>Prescription Completed & Routed to Pharmacy</span>
                      </div>
                    )}
                  </div>
                </form>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ── Prescription Print Preview Modal ── */}
      {previewModal && selectedPatient && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: 20,
          }}
          onClick={() => setPreviewModal(false)}
        >
          <div
            style={{
              background: '#ffffff',
              color: '#0f172a',
              width: '750px',
              maxWidth: '95vw',
              maxHeight: '90vh',
              overflowY: 'auto',
              borderRadius: 12,
              padding: '36px 44px',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.25)',
              border: '2px solid #0f172a',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ borderBottom: '2px solid #0f172a', paddingBottom: 16, marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.5px' }}>ASTRA CARE HUB</h2>
                <div style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>Smart Clinical Consultation & Triage Network</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>{doctorInfo.full_name || 'Dr. Medical Officer'}</div>
                <div style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>{doctorInfo.specialization || 'Consultant Physician'}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>Reg: {doctorInfo.doctor_id}</div>
              </div>
            </div>

            {/* Patient Meta */}
            <div style={{ background: '#f8fafc', padding: 14, borderRadius: 8, marginBottom: 20, fontSize: 13, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, border: '1px solid #e2e8f0' }}>
              <div><strong>Patient:</strong> {selectedPatient.full_name}</div>
              <div><strong>ID:</strong> {selectedPatient.patient_id}</div>
              <div><strong>Age/Sex:</strong> {selectedPatient.age}y / {selectedPatient.gender}</div>
              <div><strong>Date:</strong> {new Date().toLocaleDateString()}</div>
              <div><strong>Blood Group:</strong> {selectedPatient.blood_group || '—'}</div>
              <div><strong>BP:</strong> {selectedPatient.bp_systolic ? `${selectedPatient.bp_systolic}/${selectedPatient.bp_diastolic} mmHg` : '—'}</div>
              <div style={{ gridColumn: 'span 2' }}><strong>Email:</strong> {selectedPatient.email || 'None'}</div>
            </div>

            {/* Diagnosis */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>Diagnosis:</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#0f172a', marginTop: 2 }}>
                {diagnosis || 'Clinical evaluation'}
              </div>
            </div>

            {/* Rx Symbol */}
            <div style={{ fontSize: 32, fontWeight: 900, color: '#0f172a', marginBottom: 10, fontFamily: 'serif' }}>℞</div>

            {/* Medicines List */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 24, fontSize: 13, border: '1px solid #e2e8f0' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #0f172a', textAlign: 'left', background: '#f8fafc' }}>
                  <th style={{ padding: 10 }}>#</th>
                  <th style={{ padding: 10 }}>Medicine Name</th>
                  <th style={{ padding: 10 }}>Dosage</th>
                  <th style={{ padding: 10 }}>Frequency</th>
                  <th style={{ padding: 10 }}>Duration</th>
                  <th style={{ padding: 10 }}>Instructions</th>
                </tr>
              </thead>
              <tbody>
                {medicines.map((m, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: 10 }}>{i + 1}</td>
                    <td style={{ padding: 10, fontWeight: 700, color: '#0f172a' }}>{m.name} ({m.form})</td>
                    <td style={{ padding: 10 }}>{m.dosage}</td>
                    <td style={{ padding: 10 }}>{m.frequency}</td>
                    <td style={{ padding: 10 }}>{m.duration}</td>
                    <td style={{ padding: 10 }}>{m.instructions}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Advice */}
            {doctorAdvice && (
              <div style={{ marginBottom: 24, fontSize: 13, background: '#f8fafc', padding: 12, borderRadius: 6, border: '1px solid #e2e8f0' }}>
                <strong style={{ color: '#0f172a' }}>Advice / Diet: </strong>
                <span>{doctorAdvice}</span>
              </div>
            )}

            {/* Follow up & Sign */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 40, borderTop: '1px solid #e2e8f0', paddingTop: 16 }}>
              <div style={{ fontSize: 13 }}>
                <strong>Follow Up: </strong> {followUpDate}
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ height: 40 }}></div>
                <div style={{ borderTop: '2px solid #0f172a', width: 180, paddingTop: 6, fontSize: 12, fontWeight: 800 }}>
                  Doctor's Signature
                </div>
              </div>
            </div>

            {/* Buttons */}
            <div style={{ marginTop: 28, textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                onClick={() => setPreviewModal(false)}
                className="btn-doc-logout"
                style={{ background: '#ffffff', color: '#0f172a' }}
              >
                Close
              </button>
              <button
                onClick={() => window.print()}
                className="btn-submit-prescription"
                style={{ padding: '8px 20px' }}
              >
                <Printer size={14} />
                <span>Print Official Slip</span>
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
              width: '820px',
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
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>
                  Medical Document Inspection & OCR Audit
                </h3>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                  Patient: {selectedPatient?.full_name} ({selectedPatient?.patient_id})
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

            {/* Status Callout */}
            <div style={{ marginBottom: 16 }}>
              {viewingDocModal.isHandwritten ? (
                <div style={{ background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 8, padding: '12px 14px' }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#b45309', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <AlertTriangle size={15} color="#b45309" />
                    <span>⚠️ Handwritten Document — Text Extraction Safely Bypassed</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#78350f', marginTop: 4, lineHeight: 1.4 }}>
                    Astra OCR is specialized strictly for printed clinical reports, lab printouts, and typed prescription slips. Handwritten prescriptions are preserved in high-resolution for direct visual inspection by the physician to avoid artificial transcription errors.
                  </div>
                </div>
              ) : (
                <div style={{ background: '#ecfdf5', border: '1.5px solid #a7f3d0', borderRadius: 8, padding: '12px 14px' }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#047857', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <CheckCircle2 size={15} color="#059669" />
                    <span>✓ Printed Text Successfully Extracted by Astra OCR</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#065f46', marginTop: 4, lineHeight: 1.4 }}>
                    PaddleOCR successfully parsed this printed report. Corroborating blood pressure, body temperature, lab biomarkers, and existing prescriptions have been cross-mapped into the patient's symptom dossier.
                  </div>
                </div>
              )}
            </div>

            {/* Document Image in dark canvas */}
            <div style={{ textAlign: 'center', background: '#0f172a', borderRadius: 8, padding: 14, marginBottom: 16 }}>
              <img
                src={viewingDocModal.url}
                alt="Document preview"
                style={{ maxWidth: '100%', maxHeight: '55vh', objectFit: 'contain', borderRadius: 4 }}
              />
            </div>

            {/* Structured Findings if any */}
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
                className="btn-doc-logout"
                style={{ background: '#ffffff', color: '#0f172a', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <ExternalLink size={13} />
                <span>Open in New Tab</span>
              </a>
              <button
                onClick={() => setViewingDocModal(null)}
                className="btn-submit-prescription"
                style={{ padding: '8px 20px' }}
              >
                Close Viewer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Clinical Referral Management Modal (Inside Hospital & Hospital-to-Another) ── */}
      {isReferralModalOpen && selectedPatient && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.82)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 110,
            padding: 20,
            backdropFilter: 'blur(4px)',
          }}
          onClick={() => setIsReferralModalOpen(false)}
        >
          <div
            style={{
              background: '#ffffff',
              color: '#0f172a',
              width: '860px',
              maxWidth: '96vw',
              maxHeight: '92vh',
              overflowY: 'auto',
              borderRadius: 14,
              padding: '26px 30px',
              boxShadow: '0 25px 60px rgba(0, 0, 0, 0.35)',
              border: '2px solid #334155',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, borderBottom: '1.5px solid #e2e8f0', paddingBottom: 14 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ background: '#4338ca', color: '#fff', borderRadius: 8, padding: 6, display: 'flex' }}>
                    <Share2 size={18} />
                  </div>
                  <h3 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: '#0f172a' }}>
                    Clinical Referral & Patient Transfer
                  </h3>
                </div>
                <div style={{ fontSize: 12.5, color: '#64748b', marginTop: 4 }}>
                  Case: <strong>{selectedPatient.full_name}</strong> ({selectedPatient.patient_id}) · Age: {selectedPatient.age}y · Complaints: "{selectedPatient.chief_complaints || 'Triage registered'}"
                </div>
              </div>
              <button
                onClick={() => setIsReferralModalOpen(false)}
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

            {/* Referral Type Tabs */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
              <button
                type="button"
                onClick={() => setReferralTab('inside')}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  padding: '12px 16px',
                  borderRadius: 10,
                  fontSize: 13.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: referralTab === 'inside' ? '2px solid #4338ca' : '1.5px solid #cbd5e1',
                  background: referralTab === 'inside' ? '#eef2ff' : '#f8fafc',
                  color: referralTab === 'inside' ? '#3730a3' : '#475569',
                  transition: 'all 0.15s ease',
                }}
              >
                <Share2 size={16} />
                <span>1. Inside Hospital (Doctor-to-Doctor Transfer)</span>
              </button>

              <button
                type="button"
                onClick={() => setReferralTab('external')}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  padding: '12px 16px',
                  borderRadius: 10,
                  fontSize: 13.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: referralTab === 'external' ? '2px solid #4338ca' : '1.5px solid #cbd5e1',
                  background: referralTab === 'external' ? '#eef2ff' : '#f8fafc',
                  color: referralTab === 'external' ? '#3730a3' : '#475569',
                  transition: 'all 0.15s ease',
                }}
              >
                <Building2 size={16} />
                <span>2. Hospital to Another Facility (AI Note & Radius Radar)</span>
              </button>
            </div>

            {/* TAB 1: INSIDE HOSPITAL */}
            {referralTab === 'inside' && (
              <form onSubmit={handleTransferInternal}>
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 18px', marginBottom: 20 }}>
                  <div style={{ fontSize: 13, color: '#334155', fontWeight: 600 }}>
                    Select an attending doctor or specialist in this hospital. The patient will be immediately placed into their consultation queue with your handover instructions.
                  </div>
                </div>

                {/* Target Doctor Selection Grid */}
                <div style={{ marginBottom: 18 }}>
                  <label style={{ display: 'block', fontSize: 12.5, fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', marginBottom: 8 }}>
                    Doctors Working in Hospital & Queue Load:
                  </label>
                  {loadingInternalDocs ? (
                    <div style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                      <RefreshCw size={20} className="animate-spin" style={{ margin: '0 auto 8px' }} />
                      <div>Loading hospital physicians...</div>
                    </div>
                  ) : internalDoctors.filter((d) => !d.is_self).length === 0 ? (
                    <div style={{ padding: '20px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, color: '#92400e', fontSize: 13 }}>
                      No other doctors are currently registered in this hospital facility.
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
                      {internalDoctors
                        .filter((d) => !d.is_self)
                        .map((doc) => {
                          const isPicked = selectedTargetDoctorId === doc.doctor_id
                          return (
                            <div
                              key={doc.doctor_id}
                              onClick={() => setSelectedTargetDoctorId(doc.doctor_id)}
                              style={{
                                border: isPicked ? '2px solid #4338ca' : '1.5px solid #e2e8f0',
                                background: isPicked ? '#f5f3ff' : '#ffffff',
                                borderRadius: 10,
                                padding: '12px 14px',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                                <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>
                                  {doc.full_name}
                                </div>
                                <span
                                  style={{
                                    fontSize: 10,
                                    fontWeight: 700,
                                    padding: '2px 6px',
                                    borderRadius: 4,
                                    background: doc.is_online ? '#dcfce7' : '#f1f5f9',
                                    color: doc.is_online ? '#15803d' : '#64748b',
                                  }}
                                >
                                  {doc.is_online ? '● Online' : '○ Offline'}
                                </span>
                              </div>
                              <div style={{ fontSize: 12, color: '#475569', marginBottom: 8 }}>
                                <span style={{ fontWeight: 600 }}>{doc.role_label}</span> · {doc.specialization}
                              </div>
                              <div style={{ fontSize: 11.5, fontWeight: 700, color: '#4338ca', background: '#ede9fe', padding: '3px 8px', borderRadius: 5, display: 'inline-block' }}>
                                {doc.waiting_patients} patients in queue
                              </div>
                            </div>
                          )
                        })}
                    </div>
                  )}
                </div>

                {/* Priority Selection */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 12.5, fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', marginBottom: 6 }}>
                    Referral Priority:
                  </label>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="priority"
                        value="normal"
                        checked={internalPriority === 'normal'}
                        onChange={() => setInternalPriority('normal')}
                      />
                      <span>Normal Priority</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#dc2626' }}>
                      <input
                        type="radio"
                        name="priority"
                        value="emergency"
                        checked={internalPriority === 'emergency'}
                        onChange={() => setInternalPriority('emergency')}
                      />
                      <span>🚨 Emergency Escalate</span>
                    </label>
                  </div>
                </div>

                {/* Transfer Reason */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 12.5, fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', marginBottom: 6 }}>
                    Reason for Internal Referral <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    className="doc-field-input"
                    placeholder="e.g. Requires specialized cardiology consultation for irregular tachycardia"
                    value={internalReason}
                    onChange={(e) => setInternalReason(e.target.value)}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1.5px solid #cbd5e1', fontSize: 13 }}
                  />
                </div>

                {/* Clinical Notes */}
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: 'block', fontSize: 12.5, fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', marginBottom: 6 }}>
                    Handover Notes & Observations (Optional)
                  </label>
                  <textarea
                    rows={2}
                    className="doc-field-input"
                    placeholder="Provide any stabilization findings, diagnostic interpretations, or specific test orders..."
                    value={internalNotes}
                    onChange={(e) => setInternalNotes(e.target.value)}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1.5px solid #cbd5e1', fontSize: 13 }}
                  />
                </div>

                {/* Modal Footer Actions */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, borderTop: '1px solid #e2e8f0', paddingTop: 16 }}>
                  <button
                    type="button"
                    onClick={() => setIsReferralModalOpen(false)}
                    className="btn-doc-logout"
                    style={{ background: '#ffffff', color: '#0f172a' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingInternal || !selectedTargetDoctorId}
                    className="btn-submit-prescription"
                    style={{ background: '#4338ca', borderColor: '#4338ca', padding: '10px 22px' }}
                  >
                    {submittingInternal ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" />
                        <span>Transferring...</span>
                      </>
                    ) : (
                      <>
                        <ArrowRight size={14} />
                        <span>Add Patient to Doctor's Queue</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* TAB 2: HOSPITAL TO ANOTHER FACILITY */}
            {referralTab === 'external' && (
              <form onSubmit={handleSubmitExternalReferral}>
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 18px', marginBottom: 18 }}>
                  <div style={{ fontSize: 13, color: '#334155', fontWeight: 600 }}>
                    Provide the reason for external transfer and provisional diagnosis. Astra AI will automatically synthesize the official <strong>Clinical Referral Memorandum</strong>, which is then routed to the Mid-Level Health Worker desk for facility radius radar selection & dispatch.
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12.5, fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', marginBottom: 6 }}>
                      Reason for External Referral <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Higher-level tertiary care required; advanced ICU bed unavailable"
                      value={externalReason}
                      onChange={(e) => setExternalReason(e.target.value)}
                      style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1.5px solid #cbd5e1', fontSize: 13 }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 12.5, fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', marginBottom: 6 }}>
                      Possible / Working Diagnosis <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Acute Coronary Syndrome / Suspected NSTEMI"
                      value={externalDiagnosis}
                      onChange={(e) => setExternalDiagnosis(e.target.value)}
                      style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1.5px solid #cbd5e1', fontSize: 13 }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 14, marginBottom: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12.5, fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', marginBottom: 6 }}>
                      Transfer Urgency:
                    </label>
                    <select
                      value={externalUrgency}
                      onChange={(e) => setExternalUrgency(e.target.value)}
                      style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1.5px solid #cbd5e1', fontSize: 13, background: '#ffffff' }}
                    >
                      <option value="Routine">Routine Elective</option>
                      <option value="Urgent">Urgent Transfer</option>
                      <option value="Critical Emergency">🚨 Critical Emergency Transfer</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 12.5, fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', marginBottom: 6 }}>
                      Pre-Transfer Stabilization Notes (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. IV access 18G secured, O2 via nasal prongs at 4L/min, sublingual nitrates administered"
                      value={externalNotes}
                      onChange={(e) => setExternalNotes(e.target.value)}
                      style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1.5px solid #cbd5e1', fontSize: 13 }}
                    />
                  </div>
                </div>

                {/* Optional Healthcare Facilities Map Radar */}
                <div style={{ marginBottom: 18 }}>
                  <button
                    type="button"
                    onClick={() => {
                      const next = !showDocFacilityMap
                      setShowDocFacilityMap(next)
                      if (next && docNearbyFacilities.length === 0) {
                        fetchDocNearbyFacilities(docFacilityRadius, docFacilityType, docFacilitySearch)
                      }
                    }}
                    style={{
                      background: showDocFacilityMap ? '#4338ca' : '#f8fafc',
                      color: showDocFacilityMap ? '#ffffff' : '#4338ca',
                      border: '1.5px solid #c7d2fe',
                      borderRadius: 8,
                      padding: '8px 14px',
                      fontSize: 12.5,
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 7,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <Compass size={15} />
                    <span>{showDocFacilityMap ? 'Hide Healthcare Facilities Map' : '🗺️ View Healthcare Facilities Map Radar (Radius & Pins)'}</span>
                  </button>

                  {showDocFacilityMap && (
                    <div style={{ marginTop: 12 }}>
                      <FacilitiesMapRadar
                        origin={{
                          latitude: 20.2961,
                          longitude: 85.8245,
                          name: doctorInfo?.care_hub_name || 'Government Hospital (Referring Hub)',
                        }}
                        facilities={docNearbyFacilities}
                        selectedFacilityId={selectedTargetFacilityId}
                        onSelectFacility={(id) => {
                          setSelectedTargetFacilityId(id)
                          const f = docNearbyFacilities.find((fac) => fac.id === id)
                          if (f) {
                            setExternalReason((prev) => prev ? prev : `Referral to ${f.name} for specialized care`)
                          }
                        }}
                        radiusKm={docFacilityRadius}
                        facilityType={docFacilityType}
                        onRadiusChange={(r) => {
                          setDocFacilityRadius(r)
                          fetchDocNearbyFacilities(r, docFacilityType, docFacilitySearch)
                        }}
                        onTypeChange={(t) => {
                          setDocFacilityType(t)
                          fetchDocNearbyFacilities(docFacilityRadius, t, docFacilitySearch)
                        }}
                        searchQuery={docFacilitySearch}
                        onSearchChange={(q) => {
                          setDocFacilitySearch(q)
                          fetchDocNearbyFacilities(docFacilityRadius, docFacilityType, q)
                        }}
                      />
                    </div>
                  )}
                </div>

                {/* AI Referral Note Generator Trigger */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <label style={{ fontSize: 12.5, fontWeight: 800, color: '#0f172a', textTransform: 'uppercase' }}>
                    Official Referral Memorandum Note:
                  </label>
                  <button
                    type="button"
                    onClick={handleGenerateAiReferralNote}
                    disabled={generatingAiNote || !externalReason.trim() || !externalDiagnosis.trim()}
                    style={{
                      background: '#0f172a',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: 8,
                      padding: '7px 14px',
                      fontSize: 12.5,
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    {generatingAiNote ? (
                      <>
                        <RefreshCw size={13} className="animate-spin" />
                        <span>Synthesizing with Sarvam AI...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles size={13} />
                        <span>✨ Generate AI Referral Note</span>
                      </>
                    )}
                  </button>
                </div>

                {/* AI Generated Note - Official Printed Form View */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <FileText size={14} color="#4338ca" />
                    <span>Official Medical Referral Memorandum Slip (Printed Form UI):</span>
                  </div>

                  <PrintedReferralForm
                    patient={selectedPatient}
                    referralData={{
                      reason_for_referral: externalReason,
                      possible_diagnosis: externalDiagnosis,
                      urgency: externalUrgency,
                      referring_doctor_name: doctorInfo?.full_name || 'Attending Physician',
                      referring_doctor_role: doctorInfo?.role || 'Specialist',
                      referring_facility_name: doctorInfo?.care_hub_name || 'Government Hospital',
                    }}
                    rawNote={aiReferralNote}
                    onNoteChange={setAiReferralNote}
                    editable={true}
                    showPrintButton={true}
                  />

                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <ShieldCheck size={14} color="#059669" />
                    <span>
                      Tip: You can switch to "Edit Raw Text" above to refine details, or click "Print Official Slip" to generate an authentic paper transfer form.
                    </span>
                  </div>
                </div>

                {/* Footer Buttons */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, borderTop: '1px solid #e2e8f0', paddingTop: 16 }}>
                  <button
                    type="button"
                    onClick={() => setIsReferralModalOpen(false)}
                    className="btn-doc-logout"
                    style={{ background: '#ffffff', color: '#0f172a' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingExternal || !aiReferralNote.trim()}
                    className="btn-submit-prescription"
                    style={{ background: '#059669', borderColor: '#059669', padding: '10px 22px' }}
                  >
                    {submittingExternal ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" />
                        <span>Submitting Referral...</span>
                      </>
                    ) : (
                      <>
                        <Send size={14} />
                        <span>Submit to Health Worker Review Queue</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ── Standalone Official Referral Slip Viewer Modal ── */}
      {isSlipViewerOpen && selectedPatient && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 125,
            padding: 20,
            backdropFilter: 'blur(4px)',
          }}
          onClick={() => setIsSlipViewerOpen(false)}
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
                <div style={{ background: '#0f172a', color: '#fff', borderRadius: 8, padding: 6, display: 'flex' }}>
                  <FileText size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>
                    Official Medical Referral Memorandum Slip
                  </h3>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                    Patient: <strong>{selectedPatient?.full_name || 'Patient'}</strong> ({selectedPatient?.patient_id || 'ID'})
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSlipViewerOpen(false)}
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

            <PrintedReferralForm
              patient={selectedPatient || {}}
              referralData={{
                ...(selectedPatient?.external_referral || {}),
                reason_for_referral: selectedPatient?.external_referral?.reason_for_referral || externalReason,
                possible_diagnosis: selectedPatient?.external_referral?.possible_diagnosis || externalDiagnosis,
                urgency: selectedPatient?.external_referral?.urgency || externalUrgency,
                referring_doctor_name: selectedPatient?.external_referral?.referring_doctor_name || doctorInfo?.full_name,
                referring_facility_name: selectedPatient?.external_referral?.referring_care_hub_name || doctorInfo?.care_hub_name,
              }}
              rawNote={
                selectedPatient?.external_referral?.final_referral_note ||
                selectedPatient?.external_referral?.updated_referral_note ||
                selectedPatient?.external_referral?.ai_referral_note ||
                aiReferralNote
              }
              onNoteChange={setAiReferralNote}
              editable={true}
              showPrintButton={true}
            />
          </div>
        </div>
      )}

      {/* ── Slide-Over AI Case Interrogation & Q&A Drawer ── */}
      {isAiDrawerOpen && selectedPatient && (
        <div
          className="hw-ai-drawer-overlay"
          onClick={() => setIsAiDrawerOpen(false)}
        >
          <div
            className="hw-ai-drawer"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="hw-ai-drawer-header">
              <div className="hw-ai-drawer-title">
                <div style={{ width: 34, height: 34, borderRadius: 8, background: '#0f172a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <FileText size={17} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Patient Interrogation Transcript</h3>
                  <div style={{ fontSize: 11.5, color: '#64748b', fontWeight: 600 }}>
                    {selectedPatient.full_name} ({selectedPatient.patient_id})
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

            {/* Body: Verbatim Interrogation Transcript */}
            <div className="hw-ai-drawer-body">
              <div className="hw-ai-drawer-hint">
                🗣️ <strong>Patient Kiosk Interrogation Dialogue:</strong> Exact questions asked and verbatim disclosures given by {selectedPatient.full_name} during automated triage.
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(() => {
                  const turns = getInterrogationTurns(selectedPatient)
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
          </div>
        </div>
      )}
    </div>
  )
}
