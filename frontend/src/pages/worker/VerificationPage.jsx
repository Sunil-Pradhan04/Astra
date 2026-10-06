import { useState } from 'react'
import WorkerLayout from '../../components/worker/WorkerLayout'
import {
  CheckCircle2,
  AlertCircle,
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
  AlertTriangle,
  Info,
} from 'lucide-react'

const MOCK_AI_CASES = [
  {
    patient_id: 'P-0003',
    full_name: 'Debashis Mohapatra',
    age: 46,
    gender: 'Male',
    vitals: { bp: '138/88 mmHg', temp: '100.8 °F', weight: '74 kg', hr: '84 bpm' },
    ai_confidence: '95%',
    risk_level: 'Moderate',
    suspected_condition: 'Acute Febrile Illness / Possible Upper Respiratory Infection',
    key_findings: [
      'Persistent dry cough for 4 days, worsening at night',
      'Intermittent high-grade fever with mild rigors',
      'No history of chronic asthma or COPD',
      'Bilateral vesicular breath sounds reported',
    ],
    transcript_sample: [
      { speaker: 'AI Agent', text: 'Hello Debashis. Can you tell me when this cough began?' },
      { speaker: 'Patient', text: 'It started on Thursday evening, and I started having body chills yesterday.' },
      { speaker: 'AI Agent', text: 'Are you feeling any breathlessness when sitting or lying down?' },
      { speaker: 'Patient', text: 'No shortness of breath while resting, only when I walk quickly.' },
    ],
  },
  {
    patient_id: 'P-0005',
    full_name: 'Priyanka Senapati',
    age: 29,
    gender: 'Female',
    vitals: { bp: '112/74 mmHg', temp: '98.6 °F', weight: '56 kg', hr: '72 bpm' },
    ai_confidence: '98%',
    risk_level: 'Low',
    suspected_condition: 'Acute Tension Headache & Visual Fatigue',
    key_findings: [
      'Bilateral fronto-temporal aching pain for 48 hours',
      'No nausea, vomiting, or aura',
      'Associated with prolonged near-work and screen exposure',
      'Neurological red flags absent in screening',
    ],
    transcript_sample: [
      { speaker: 'AI Agent', text: 'Is the headache throbbing, or more like a tight band around your head?' },
      { speaker: 'Patient', text: 'It feels like a heavy tight band across my forehead and temples.' },
    ],
  },
  {
    patient_id: 'P-0008',
    full_name: 'Niranjan Swain',
    age: 62,
    gender: 'Male',
    vitals: { bp: '162/98 mmHg', temp: '98.4 °F', weight: '81 kg', hr: '90 bpm' },
    ai_confidence: '91%',
    risk_level: 'High',
    suspected_condition: 'Stage 2 Hypertension with Exertional Angina Risk',
    key_findings: [
      'Substernal pressure sensation during morning walks',
      'Elevated resting systolic BP (162 mmHg)',
      'History of irregular antihypertensive medication adherence',
      'Immediate physician triage recommended',
    ],
    transcript_sample: [
      { speaker: 'AI Agent', text: 'Does the chest pressure radiate towards your left arm or jaw?' },
      { speaker: 'Patient', text: 'Sometimes towards my left shoulder, lasts for about 5 minutes.' },
    ],
  },
]

export default function VerificationPage() {
  const [selectedCase, setSelectedCase] = useState(MOCK_AI_CASES[0])
  const [notes, setNotes] = useState('')
  const [verifiedChecks, setVerifiedChecks] = useState({
    identity: true,
    vitals: true,
    aiSummary: true,
  })
  const [actionNotice, setActionNotice] = useState('')

  const handleAction = (msg) => {
    setActionNotice(msg)
    setTimeout(() => setActionNotice(''), 4500)
  }

  return (
    <WorkerLayout
      title="AI Summary Clinical Verification Station"
      subtitle="Verify AI screening transcripts and diagnostic hypotheses before forwarding cases to the attending physician."
    >
      {/* ── Architecture Status Notice ── */}
      <div className="preview-pipeline-banner">
        <div className="preview-pipeline-banner__left">
          <Bot size={20} className="text-purple-600" />
          <div>
            <div className="preview-pipeline-banner__title">
              Verification Workspace (UI Preview)
            </div>
            <p className="preview-pipeline-banner__desc">
              Connected to downstream pipeline. Once the conversational AI Agent is deployed, verified summaries here will route directly to the Doctor's consultation queue.
            </p>
          </div>
        </div>
        <div className="preview-pipeline-steps">
          <span className="step-tag completed">01 Intake (Live)</span>
          <span className="step-tag arrow">→</span>
          <span className="step-tag in-dev">02 AI Agent (Architecture in Dev)</span>
          <span className="step-tag arrow">→</span>
          <span className="step-tag active">03 Verification (UI Ready)</span>
          <span className="step-tag arrow">→</span>
          <span className="step-tag next">04 Doctor Review</span>
        </div>
      </div>

      {actionNotice && (
        <div className="form-success-banner fade-in" style={{ marginBottom: 16 }}>
          <CheckCircle2 size={16} />
          <span>{actionNotice}</span>
        </div>
      )}

      {/* ── Two-Column Verification Desk ── */}
      <div className="verification-desk-grid">
        
        {/* Left Column: Cases Awaiting Verification */}
        <div className="verification-cases-list">
          <div className="verification-panel-card">
            <div className="verification-panel-card__header">
              <h3 className="card-heading">Awaiting Clinical Verification</h3>
              <span className="badge-count">{MOCK_AI_CASES.length} cases</span>
            </div>

            <div className="verification-queue-items">
              {MOCK_AI_CASES.map(item => {
                const isSelected = selectedCase.patient_id === item.patient_id
                const isHighRisk = item.risk_level === 'High'
                const isModRisk = item.risk_level === 'Moderate'

                return (
                  <div
                    key={item.patient_id}
                    onClick={() => setSelectedCase(item)}
                    className={`verification-case-card ${isSelected ? 'selected' : ''}`}
                  >
                    <div className="case-card-header">
                      <span className="case-id-badge">{item.patient_id}</span>
                      <span
                        className={`risk-badge ${
                          isHighRisk ? 'risk-high' : isModRisk ? 'risk-mod' : 'risk-low'
                        }`}
                      >
                        {item.risk_level} Risk
                      </span>
                    </div>

                    <h4 className="case-patient-name">{item.full_name}</h4>
                    <p className="case-patient-meta">
                      {item.age}y · {item.gender} · BP: {item.vitals.bp}
                    </p>

                    <div className="case-condition-snippet">
                      <span className="label">Suspected:</span>
                      <span className="val">{item.suspected_condition}</span>
                    </div>

                    <div className="case-card-footer">
                      <div className="ai-confidence-pill">
                        <Bot size={11} />
                        <span>AI Confidence: {item.ai_confidence}</span>
                      </div>
                      <span className="view-link">Inspect Summary</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Case Deep-Dive & Action Controls */}
        <div className="verification-inspect-pane">
          <div className="verification-panel-card">
            <div className="inspect-header">
              <div className="inspect-patient-info">
                <span className="inspect-id-badge">{selectedCase.patient_id}</span>
                <div>
                  <h3 className="inspect-name">{selectedCase.full_name}</h3>
                  <span className="inspect-meta">
                    {selectedCase.age} years · {selectedCase.gender} · Vitals: BP {selectedCase.vitals.bp}, Temp {selectedCase.vitals.temp}, Weight {selectedCase.vitals.weight}
                  </span>
                </div>
              </div>
              <div className="inspect-ai-score">
                <span className="inspect-ai-score__label">AI Diagnostic Match</span>
                <span className="inspect-ai-score__val">{selectedCase.ai_confidence}</span>
              </div>
            </div>

            {/* Suspected Condition Box */}
            <div className="suspected-condition-card">
              <div className="suspected-condition-card__top">
                <Stethoscope size={16} className="text-blue-600" />
                <span className="suspected-condition-card__title">
                  Preliminary AI Diagnostic Hypothesis
                </span>
                <span className={`risk-tag risk-${selectedCase.risk_level.toLowerCase()}`}>
                  {selectedCase.risk_level} Priority
                </span>
              </div>
              <p className="suspected-condition-card__body">
                {selectedCase.suspected_condition}
              </p>
            </div>

            {/* Key Clinical Findings */}
            <div className="inspect-section">
              <h4 className="inspect-section-title">
                <FileText size={14} />
                <span>Extracted Key Clinical Findings</span>
              </h4>
              <ul className="key-findings-list">
                {selectedCase.key_findings.map((f, i) => (
                  <li key={i} className="key-finding-item">
                    <span className="bullet">·</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Conversation Transcript Sample */}
            <div className="inspect-section">
              <h4 className="inspect-section-title">
                <Bot size={14} />
                <span>AI Screening Dialogue Transcript Excerpt</span>
              </h4>
              <div className="transcript-box">
                {selectedCase.transcript_sample.map((msg, i) => (
                  <div
                    key={i}
                    className={`transcript-msg ${msg.speaker === 'AI Agent' ? 'ai' : 'patient'}`}
                  >
                    <span className="transcript-speaker">{msg.speaker}:</span>
                    <span className="transcript-text">{msg.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Verification Checklist */}
            <div className="inspect-section">
              <h4 className="inspect-section-title">
                <ShieldCheck size={14} />
                <span>Health Worker Verification Criteria</span>
              </h4>
              <div className="verification-checklist">
                <label className="checkbox-item">
                  <input
                    type="checkbox"
                    checked={verifiedChecks.identity}
                    onChange={e => setVerifiedChecks(p => ({ ...p, identity: e.target.checked }))}
                  />
                  <span>Patient identity and biological data confirmed</span>
                </label>
                <label className="checkbox-item">
                  <input
                    type="checkbox"
                    checked={verifiedChecks.vitals}
                    onChange={e => setVerifiedChecks(p => ({ ...p, vitals: e.target.checked }))}
                  />
                  <span>Biological vitals plausibility checked & approved</span>
                </label>
                <label className="checkbox-item">
                  <input
                    type="checkbox"
                    checked={verifiedChecks.aiSummary}
                    onChange={e => setVerifiedChecks(p => ({ ...p, aiSummary: e.target.checked }))}
                  />
                  <span>AI diagnostic summary approved for Doctor review</span>
                </label>
              </div>
            </div>

            {/* Clinical Annotation Box */}
            <div className="inspect-section">
              <label className="inspect-section-title" htmlFor="worker_notes">
                <FileText size={14} />
                <span>Verification Specialist Notes (Optional)</span>
              </label>
              <textarea
                id="worker_notes"
                className="form-input form-textarea"
                rows="2"
                placeholder="Add observations or clinical flags for the attending doctor..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </div>

            {/* Action Bar */}
            <div className="inspect-action-bar">
              <button
                type="button"
                onClick={() =>
                  handleAction(
                    `Case ${selectedCase.patient_id} (${selectedCase.full_name}) successfully verified and prioritized for Doctor consultation!`
                  )
                }
                className="btn-approve-doctor"
              >
                <Check size={16} />
                <span>Approve & Dispatch to Doctor</span>
                <ArrowRight size={14} />
              </button>

              <button
                type="button"
                onClick={() =>
                  handleAction(
                    `Re-interrogation request logged for ${selectedCase.patient_id}. AI Agent will repeat conversational screening.`
                  )
                }
                className="btn-reinterrogate"
              >
                <RotateCcw size={14} />
                <span>Request Re-screening</span>
              </button>
            </div>
          </div>
        </div>

      </div>
    </WorkerLayout>
  )
}
