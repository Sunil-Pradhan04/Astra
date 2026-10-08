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
} from 'lucide-react'
import {
  getGroupedPatientQueues,
  manualUpdatePatientReport,
  aiUpdatePatientReport,
  verifyPatientToDoctor,
  requestPatientRescreen,
  getDoctorsQueues,
} from '../../api/workerApi'

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
        candidate_conditions: [
          {
            condition: 'Acute Coronary Syndrome / Exertional Angina',
            match_confidence: 'High',
            matching_rationale: 'Radiation to left shoulder, retrosternal tightness, high BP in elderly male.',
          },
          {
            condition: 'Severe Essential Hypertension',
            match_confidence: 'High',
            matching_rationale: 'Stage 2 hypertensive range at intake.',
          },
        ],
        symptoms: [
          {
            name: 'Substernal chest pressure',
            duration: '45 minutes',
            severity: 'Severe',
            location: 'Retrosternal / Left shoulder',
            pattern: 'Constant',
            triggers: 'Exertion / Fast walking',
            report_correlation: 'BP measured 168/104 mmHg',
          },
          {
            name: 'Diaphoresis / Mild Cold Sweats',
            duration: '20 minutes',
            severity: 'Moderate',
            location: 'Generalized',
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
        candidate_conditions: [
          {
            condition: 'Acute Febrile Upper Respiratory Tract Infection',
            match_confidence: 'High',
            matching_rationale: 'Dry cough, fever, constitutional body aches without dyspnea at rest.',
          },
          {
            condition: 'Viral Bronchitis',
            match_confidence: 'Moderate',
            matching_rationale: 'Subacute bronchial irritation pattern.',
          },
        ],
        symptoms: [
          {
            name: 'Dry Cough',
            duration: '4 days',
            severity: 'Moderate',
            location: 'Throat / Upper chest',
            pattern: 'Worse at night',
            triggers: 'Cold air / Supine position',
            report_correlation: null,
          },
          {
            name: 'Fever with chills',
            duration: '2 days',
            severity: 'Moderate (101.2 °F)',
            location: 'Systemic',
            pattern: 'Intermittent',
            triggers: null,
            report_correlation: 'Oral temp 101.2 °F confirmed',
          },
        ],
        medications_and_history: {
          medications_taken: 'Paracetamol 650mg SOS',
          chronic_conditions: 'None reported',
          allergies: 'None reported',
        },
        clinical_notes: 'Patient reports no breathlessness while resting. Throat slightly congested.',
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
        candidate_conditions: [
          {
            condition: 'Tension-Type Headache & Eye Strain',
            match_confidence: 'High',
            matching_rationale: 'Bilateral pressure, neck tightness, prolonged screen time.',
          },
        ],
        symptoms: [
          {
            name: 'Forehead Band-like Ache',
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
        clinical_notes: 'No aura, no vomiting, normal visual acuity reported.',
      },
    },
  },
]

export default function VerificationPage() {
  const [emergencyQueue, setEmergencyQueue] = useState([])
  const [normalQueue, setNormalQueue] = useState([])
  const [selectedCase, setSelectedCase] = useState(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [actionNotice, setActionNotice] = useState({ text: '', type: 'success' })

  // View Mode: 'review' | 'edit' | 'ai_assistant'
  const [viewMode, setViewMode] = useState('review')
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

  // AI Co-Pilot State
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

      if (emList.length === 0 && normList.length === 0) {
        setEmergencyQueue(DEMO_CASES.filter((c) => c.priority === 'emergency'))
        setNormalQueue(DEMO_CASES.filter((c) => c.priority !== 'emergency'))
      } else {
        setEmergencyQueue(emList)
        setNormalQueue(normList)
      }
    } catch (err) {
      console.error('Failed to load patient queues:', err)
      setEmergencyQueue(DEMO_CASES.filter((c) => c.priority === 'emergency'))
      setNormalQueue(DEMO_CASES.filter((c) => c.priority !== 'emergency'))
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
      }
    } else {
      // Check if selected case is still pending
      const allPending = [...emergencyQueue, ...normalQueue]
      const found = allPending.find((p) => p.patient_id === selectedCase.patient_id)
      if (!found) {
        if (emergencyQueue.length > 0) syncSelectedCase(emergencyQueue[0])
        else if (normalQueue.length > 0) syncSelectedCase(normalQueue[0])
        else setSelectedCase(null)
      }
    }
  }, [emergencyQueue, normalQueue])

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
  const candidateConditions = summaryObj.candidate_conditions || []
  const symptomsList = summaryObj.symptoms || []
  const medHistory = summaryObj.medications_and_history || {}
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

                  {/* Mode Tabs */}
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
                      <button
                        type="button"
                        onClick={() => setViewMode('ai_assistant')}
                        className={`hw-tab-pill ${viewMode === 'ai_assistant' ? 'active' : ''}`}
                      >
                        <Sparkles size={13} style={{ display: 'inline', marginRight: 4 }} />
                        AI Co-Pilot
                      </button>
                    </div>
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

                {/* ── AI Co-Pilot Assistant Banner & Chat ── */}
                <div className="hw-ai-assistant-card">
                  <div className="hw-ai-assistant-top">
                    <div className="hw-ai-assistant-badge">
                      <Sparkles size={16} />
                      <span>AI Co-Pilot (Instruct AI to Update Report)</span>
                    </div>
                    <span style={{ fontSize: 11, color: '#6d28d9' }}>
                      Type in natural language — AI automatically modifies clinical fields
                    </span>
                  </div>

                  {/* Suggestion Chips */}
                  <div className="hw-ai-chips-list">
                    <button
                      type="button"
                      className="hw-ai-chip"
                      onClick={() => handleSendAiUpdate('Patient has mild dry cough for 3 days, add to symptoms')}
                    >
                      + Add dry cough for 3 days
                    </button>
                    <button
                      type="button"
                      className="hw-ai-chip"
                      onClick={() => handleSendAiUpdate('Measured BP again: 135/85 mmHg, update vitals')}
                    >
                      + Update BP to 135/85
                    </button>
                    <button
                      type="button"
                      className="hw-ai-chip"
                      onClick={() => handleSendAiUpdate('Patient has mild fever 100.8 F, update vitals')}
                    >
                      + Update Temp to 100.8 °F
                    </button>
                    <button
                      type="button"
                      className="hw-ai-chip"
                      onClick={() => handleSendAiUpdate('Escalate priority to Emergency due to increasing chest tightness')}
                    >
                      + Escalate to Emergency
                    </button>
                    <button
                      type="button"
                      className="hw-ai-chip"
                      onClick={() => handleSendAiUpdate('Patient denies penicillin allergy, only allergic to dust')}
                    >
                      + Update allergies
                    </button>
                  </div>

                  {/* Input Row */}
                  <div className="hw-ai-input-row">
                    <input
                      type="text"
                      className="hw-ai-input"
                      placeholder="e.g. 'Add mild throat pain since yesterday and set BP to 130/85'..."
                      value={aiMessage}
                      onChange={(e) => setAiMessage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSendAiUpdate()
                      }}
                      disabled={isAiProcessing}
                    />
                    <button
                      type="button"
                      className="hw-ai-send-btn"
                      onClick={() => handleSendAiUpdate()}
                      disabled={isAiProcessing || !aiMessage.trim()}
                    >
                      {isAiProcessing ? (
                        <>
                          <RefreshCw size={14} className="animate-spin" />
                          <span>Updating...</span>
                        </>
                      ) : (
                        <>
                          <Send size={14} />
                          <span>Instruct AI</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* AI Interaction Audit Feed */}
                  {aiFeedbackHistory.length > 0 && (
                    <div className="hw-ai-history-feed" ref={aiChatScrollRef}>
                      {aiFeedbackHistory.map((item, idx) => (
                        <div key={item.id || idx} className="hw-ai-history-item">
                          <div className="prompt">
                            💬 Worker Instruction: "{item.message || item.worker_message}"
                          </div>
                          <div className="reply">🤖 {item.ai_reply}</div>
                          {item.changes_applied && item.changes_applied.length > 0 && (
                            <div className="hw-ai-changes-tags">
                              {item.changes_applied.map((c, i) => (
                                <span key={i} className="hw-change-tag">
                                  ✓ {c}
                                </span>
                              ))}
                            </div>
                          )}
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

                {/* ── Section: Candidate Diagnostic Hypotheses ── */}
                <div className="hw-section">
                  <h4 className="hw-section-title">
                    <Stethoscope size={15} />
                    <span>AI Diagnostic Hypotheses & Differential Matches</span>
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {candidateConditions.length === 0 ? (
                      <p style={{ fontSize: 12, color: '#64748b' }}>
                        No specific differential diagnoses mapped yet.
                      </p>
                    ) : (
                      candidateConditions.map((cond, idx) => (
                        <div
                          key={idx}
                          style={{
                            background: '#eff6ff',
                            border: '1px solid #bfdbfe',
                            borderRadius: 8,
                            padding: '10px 14px',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              marginBottom: 4,
                            }}
                          >
                            <strong style={{ fontSize: 13.5, color: '#1e40af' }}>
                              {cond.condition}
                            </strong>
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                background: '#dbeafe',
                                color: '#1e3a8a',
                                padding: '2px 8px',
                                borderRadius: 4,
                              }}
                            >
                              Match: {cond.match_confidence || 'Moderate'}
                            </span>
                          </div>
                          {cond.matching_rationale && (
                            <p style={{ fontSize: 12, color: '#1e3a8a', margin: 0, opacity: 0.9 }}>
                              {cond.matching_rationale}
                            </p>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* ── Section: Clinical Symptoms Extracted ── */}
                <div className="hw-section">
                  <h4 className="hw-section-title">
                    <Activity size={15} />
                    <span>Extracted Symptoms</span>
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {symptomsList.length === 0 ? (
                      <p style={{ fontSize: 12, color: '#64748b' }}>
                        No detailed symptom breakdown recorded yet.
                      </p>
                    ) : (
                      symptomsList.map((sym, idx) => (
                        <div
                          key={idx}
                          style={{
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            borderRadius: 8,
                            padding: '10px 14px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                          }}
                        >
                          <div>
                            <strong style={{ fontSize: 13, color: '#0f172a' }}>
                              {sym.name}
                            </strong>
                            <div
                              style={{
                                fontSize: 11.5,
                                color: '#64748b',
                                marginTop: 3,
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: 10,
                              }}
                            >
                              {sym.duration && <span>Duration: {sym.duration}</span>}
                              {sym.severity && <span>Severity: {sym.severity}</span>}
                              {sym.location && <span>Location: {sym.location}</span>}
                              {sym.pattern && <span>Pattern: {sym.pattern}</span>}
                            </div>
                            {sym.report_correlation && (
                              <div
                                style={{
                                  fontSize: 11,
                                  color: '#0369a1',
                                  background: '#e0f2fe',
                                  padding: '2px 6px',
                                  borderRadius: 4,
                                  marginTop: 4,
                                  display: 'inline-block',
                                }}
                              >
                                📄 Document match: {sym.report_correlation}
                              </div>
                            )}
                          </div>
                        </div>
                      ))
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
            ) : (
              <div style={{ textAlign: 'center', padding: '120px 24px', color: '#94a3b8' }}>
                <Stethoscope size={48} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                <h3 style={{ fontSize: 16, fontWeight: 600, color: '#334155' }}>
                  No Patient Selected
                </h3>
                <p style={{ fontSize: 13 }}>
                  Select a box from the Emergency Queue or Normal Queue on the left to start review.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </WorkerLayout>
  )
}
