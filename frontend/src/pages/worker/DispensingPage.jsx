import { useState } from 'react'
import WorkerLayout from '../../components/worker/WorkerLayout'
import {
  Pill,
  CheckCircle2,
  AlertCircle,
  FileText,
  Printer,
  PackageCheck,
  User,
  Clock,
  ShieldCheck,
  Stethoscope,
  Building2,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react'

const MOCK_PRESCRIPTIONS = [
  {
    patient_id: 'P-0002',
    full_name: 'Minati Sahoo',
    age: 52,
    gender: 'Female',
    doctor_name: 'Dr. Ashok Panda',
    doctor_reg: 'DOC-00412 · MD (Medicine)',
    diagnosis: 'Primary Essential Hypertension & Dyslipidemia',
    prescribed_date: 'Today, 11:20 AM',
    medications: [
      {
        name: 'Amlodipine 5mg',
        type: 'Tablet',
        dosage: '1 Tab Daily (Morning after food)',
        duration: '30 Days',
        qty: 30,
        batch: 'AML-2026-X04',
        stock_status: 'In Stock',
      },
      {
        name: 'Atorvastatin 10mg',
        type: 'Tablet',
        dosage: '1 Tab at Bedtime',
        duration: '30 Days',
        qty: 30,
        batch: 'ATV-2025-Q19',
        stock_status: 'In Stock',
      },
      {
        name: 'Paracetamol 650mg',
        type: 'Tablet',
        dosage: '1 Tab SOS (as needed for fever/headache)',
        duration: '5 Days',
        qty: 10,
        batch: 'PCM-2026-B81',
        stock_status: 'In Stock',
      },
    ],
    advisory: 'Low-sodium diet recommended. Avoid missed doses. Regular BP monitoring every 2 weeks.',
  },
  {
    patient_id: 'P-0006',
    full_name: 'Santosh Nayak',
    age: 38,
    gender: 'Male',
    doctor_name: 'Dr. Sunita Mishra',
    doctor_reg: 'DOC-00188 · Pulmonology',
    diagnosis: 'Acute Bronchial Spasm with Allergic Rhinitis',
    prescribed_date: 'Today, 10:45 AM',
    medications: [
      {
        name: 'Montelukast 10mg + Levocetirizine 5mg',
        type: 'Tablet',
        dosage: '1 Tab Daily at Night',
        duration: '10 Days',
        qty: 10,
        batch: 'MLT-2025-C11',
        stock_status: 'In Stock',
      },
      {
        name: 'Acebrophylline 100mg',
        type: 'Capsule',
        dosage: '1 Cap Twice Daily (Morning & Evening)',
        duration: '5 Days',
        qty: 10,
        batch: 'ACB-2026-A02',
        stock_status: 'In Stock',
      },
      {
        name: 'Salbutamol 100mcg Inhaler',
        type: 'MDI Inhaler',
        dosage: '2 Puffs as needed for shortness of breath',
        duration: 'As Needed',
        qty: 1,
        batch: 'SAL-2026-INH',
        stock_status: 'In Stock',
      },
    ],
    advisory: 'Rinse mouth after inhaler usage. Keep warm and avoid cold water.',
  },
]

export default function DispensingPage() {
  const [selectedRx, setSelectedRx] = useState(MOCK_PRESCRIPTIONS[0])
  const [dispensedItems, setDispensedItems] = useState({})
  const [actionNotice, setActionNotice] = useState('')

  const handleToggleItem = (index) => {
    setDispensedItems(prev => ({ ...prev, [index]: !prev[index] }))
  }

  const handleDispenseAll = () => {
    setActionNotice(
      `Medications for Patient ${selectedRx.patient_id} (${selectedRx.full_name}) successfully confirmed and marked as DISPENSED!`
    )
    setTimeout(() => setActionNotice(''), 4500)
  }

  const handlePrint = () => {
    window.print()
  }

  return (
    <WorkerLayout
      title="Pharmacy & Medication Dispensing Station"
      subtitle="Fulfill clinical prescriptions authenticated by attending physicians and verify batch dosage allocation."
    >
      {/* ── Architecture Status Notice ── */}
      <div className="preview-pipeline-banner">
        <div className="preview-pipeline-banner__left">
          <Pill size={20} className="text-emerald-600" />
          <div>
            <div className="preview-pipeline-banner__title">
              Pharmacy Dispensation Station (UI Preview)
            </div>
            <p className="preview-pipeline-banner__desc">
              Connected to doctor prescription module. Attending doctor's digital prescriptions automatically sync here for accurate fulfillment and dosage advisory.
            </p>
          </div>
        </div>
        <div className="preview-pipeline-steps">
          <span className="step-tag completed">01 Intake (Live)</span>
          <span className="step-tag arrow">→</span>
          <span className="step-tag in-dev">02 AI Agent</span>
          <span className="step-tag arrow">→</span>
          <span className="step-tag in-dev">03 Verification</span>
          <span className="step-tag arrow">→</span>
          <span className="step-tag in-dev">04 Doctor Prescription</span>
          <span className="step-tag arrow">→</span>
          <span className="step-tag active">05 Pharmacy Dispensing (UI Ready)</span>
        </div>
      </div>

      {actionNotice && (
        <div className="form-success-banner fade-in" style={{ marginBottom: 16 }}>
          <CheckCircle2 size={16} />
          <span>{actionNotice}</span>
        </div>
      )}

      {/* ── Two-Column Dispensing Desk ── */}
      <div className="dispensing-desk-grid">
        
        {/* Left: Pending Prescriptions */}
        <div className="dispensing-queue-column">
          <div className="dispensing-panel-card">
            <div className="dispensing-panel-card__header">
              <h3 className="card-heading">Approved Prescriptions</h3>
              <span className="badge-count">{MOCK_PRESCRIPTIONS.length} pending</span>
            </div>

            <div className="dispensing-cards-list">
              {MOCK_PRESCRIPTIONS.map(rx => {
                const isSelected = selectedRx.patient_id === rx.patient_id
                return (
                  <div
                    key={rx.patient_id}
                    onClick={() => {
                      setSelectedRx(rx)
                      setDispensedItems({})
                    }}
                    className={`dispensing-rx-card ${isSelected ? 'selected' : ''}`}
                  >
                    <div className="rx-card-top">
                      <span className="case-id-badge">{rx.patient_id}</span>
                      <span className="rx-doctor-tag">{rx.doctor_name}</span>
                    </div>

                    <h4 className="rx-patient-name">{rx.full_name}</h4>
                    <span className="rx-patient-meta">
                      {rx.age}y · {rx.gender} · {rx.prescribed_date}
                    </span>

                    <div className="rx-diagnosis-snippet">
                      <span className="label">Diagnosis:</span>
                      <span className="val">{rx.diagnosis}</span>
                    </div>

                    <div className="rx-card-footer">
                      <span className="rx-meds-count">
                        <Pill size={12} />
                        <span>{rx.medications.length} items to dispense</span>
                      </span>
                      <span className="view-link">View Prescription</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Right: Active Prescription Dispensation Workspace */}
        <div className="dispensing-workspace-column">
          <div className="dispensing-panel-card">
            <div className="dispensing-rx-header">
              <div className="rx-identity-left">
                <span className="patient-id-tag">{selectedRx.patient_id}</span>
                <div>
                  <h3 className="rx-patient-title">{selectedRx.full_name}</h3>
                  <span className="rx-patient-sub">
                    {selectedRx.age} years · {selectedRx.gender} · Prescribed: {selectedRx.prescribed_date}
                  </span>
                </div>
              </div>

              <div className="doctor-badge-box">
                <Stethoscope size={15} className="text-blue-600" />
                <div>
                  <strong>{selectedRx.doctor_name}</strong>
                  <span>{selectedRx.doctor_reg}</span>
                </div>
              </div>
            </div>

            {/* Clinical Diagnosis Bar */}
            <div className="diagnosis-banner">
              <span className="label">Clinical Diagnosis:</span>
              <strong className="val">{selectedRx.diagnosis}</strong>
            </div>

            {/* Medication Dispensing Table */}
            <div className="medication-table-wrap">
              <div className="medication-table-header">
                <h4 className="table-title">
                  <Pill size={14} />
                  <span>Prescribed Medication Allocation</span>
                </h4>
                <span className="table-subtitle">Verify package batch number before issuing.</span>
              </div>

              <table className="med-table">
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>Check</th>
                    <th>Pharmaceutical & Dosage</th>
                    <th>Schedule & Frequency</th>
                    <th>Duration</th>
                    <th>Qty</th>
                    <th>Batch #</th>
                    <th>Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedRx.medications.map((med, idx) => {
                    const isChecked = !!dispensedItems[idx]
                    return (
                      <tr key={idx} className={isChecked ? 'row-checked' : ''}>
                        <td>
                          <input
                            type="checkbox"
                            className="med-checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleItem(idx)}
                          />
                        </td>
                        <td>
                          <div className="med-name-cell">
                            <strong>{med.name}</strong>
                            <span className="med-type">{med.type}</span>
                          </div>
                        </td>
                        <td className="med-dosage-cell">{med.dosage}</td>
                        <td>{med.duration}</td>
                        <td>
                          <strong className="med-qty-badge">{med.qty}</strong>
                        </td>
                        <td>
                          <code className="batch-code">{med.batch}</code>
                        </td>
                        <td>
                          <span className="stock-pill in-stock">
                            <PackageCheck size={11} />
                            <span>{med.stock_status}</span>
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Doctor Advisory Notice */}
            <div className="patient-advisory-box">
              <div className="advisory-title">
                <FileText size={14} />
                <span>Doctor's Patient Advisory & Precautions</span>
              </div>
              <p className="advisory-text">{selectedRx.advisory}</p>
            </div>

            {/* Pharmacy Controls Footer */}
            <div className="dispensing-footer-actions">
              <div className="footer-left">
                <button
                  type="button"
                  onClick={handlePrint}
                  className="btn-print-slip"
                >
                  <Printer size={15} />
                  <span>Print Dosage Slip</span>
                </button>
              </div>

              <div className="footer-right">
                <button
                  type="button"
                  onClick={handleDispenseAll}
                  className="btn-confirm-dispense"
                >
                  <PackageCheck size={16} />
                  <span>Confirm & Complete Dispensation</span>
                </button>
              </div>
            </div>
          </div>
        </div>

      </div>
    </WorkerLayout>
  )
}
