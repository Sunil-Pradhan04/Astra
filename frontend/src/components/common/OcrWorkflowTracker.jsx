import React from 'react'
import {
  Sparkles,
  Search,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Database,
  ShieldCheck,
  Cpu,
  Layers,
  Check,
  Eye,
  ArrowRight,
  Zap,
} from 'lucide-react'

export const OCR_WORKFLOW_STEPS = [
  {
    step: 1,
    id: 'cleaning',
    title: 'Cleaning Image',
    subtitle: 'Adaptive contrast, binarization & noise reduction',
    icon: Sparkles,
  },
  {
    step: 2,
    id: 'blur_check',
    title: 'Detecting Blur & Readability',
    subtitle: 'Laplacian variance & lighting exposure analysis',
    icon: Eye,
  },
  {
    step: 3,
    id: 'classification',
    title: 'Printed Text vs Handwritten',
    subtitle: 'Orthogonal stroke & texture classification',
    icon: Layers,
  },
  {
    step: 4,
    id: 'report_check',
    title: 'Medical Report Validation',
    subtitle: 'Prescription & clinical keyword layout check',
    icon: ShieldCheck,
  },
  {
    step: 5,
    id: 'extraction',
    title: 'Extracting Clinical Data',
    subtitle: 'PaddleOCR reading & Sarvam AI structuring',
    icon: Cpu,
  },
  {
    step: 6,
    id: 'database_store',
    title: 'Store in Database',
    subtitle: 'MongoDB prescription sync & patient case linking',
    icon: Database,
  },
]

export default function OcrWorkflowTracker({
  currentStepIndex = 1, // 1 to 6, or 0 for idle, 7 for completed
  isProcessing = false,
  stepMetrics = null, // e.g. { blur_score: 145, classification: 'printed', is_medical: true, etc. }
  errorStep = null, // Step number that encountered rejection
  rejectionReason = '',
  onGoWithoutReport = null, // Direct callback to proceed without report
  compact = false,
}) {
  return (
    <div
      style={{
        background: '#ffffff',
        border: '1.5px solid #e2e8f0',
        borderRadius: 14,
        padding: compact ? '14px 16px' : '18px 22px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.04)',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      {/* ── Workflow Header ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #f1f5f9',
          paddingBottom: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: '#eff6ff',
              color: '#2563eb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Zap size={16} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>
              6-Stage OCR Processing Pipeline
            </div>
            <div style={{ fontSize: 11, color: '#64748b' }}>
              Autonomous validation, classification, and structured extraction
            </div>
          </div>
        </div>

        {isProcessing && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: '#eff6ff',
              color: '#1d4ed8',
              padding: '4px 10px',
              borderRadius: 20,
              fontSize: 11.5,
              fontWeight: 700,
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: '#2563eb',
                animation: 'pulse 1.5s infinite',
              }}
            />
            <span>Executing Step {currentStepIndex}/6</span>
          </div>
        )}
      </div>

      {/* ── 6-Step Visual Pipeline Cards ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: compact ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)',
          gap: 10,
        }}
      >
        {OCR_WORKFLOW_STEPS.map((s) => {
          const StepIcon = s.icon
          const isDone = currentStepIndex > s.step || currentStepIndex >= 7
          const isActive = isProcessing && currentStepIndex === s.step
          const isFailed = errorStep === s.step

          let borderColor = '#e2e8f0'
          let bgColor = '#f8fafc'
          let iconColor = '#94a3b8'
          let textColor = '#334155'

          if (isDone) {
            borderColor = '#86efac'
            bgColor = '#f0fdf4'
            iconColor = '#16a34a'
            textColor = '#166534'
          } else if (isActive) {
            borderColor = '#3b82f6'
            bgColor = '#eff6ff'
            iconColor = '#2563eb'
            textColor = '#1d4ed8'
          } else if (isFailed) {
            borderColor = '#fca5a5'
            bgColor = '#fef2f2'
            iconColor = '#dc2626'
            textColor = '#991b1b'
          }

          return (
            <div
              key={s.step}
              style={{
                padding: '10px 12px',
                borderRadius: 10,
                border: `1.5px solid ${borderColor}`,
                background: bgColor,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                transition: 'all 0.2s ease',
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: isDone ? '#dcfce7' : isActive ? '#dbeafe' : isFailed ? '#fee2e2' : '#f1f5f9',
                  color: iconColor,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  marginTop: 2,
                }}
              >
                {isDone ? (
                  <Check size={16} strokeWidth={3} />
                ) : isFailed ? (
                  <AlertTriangle size={15} />
                ) : (
                  <StepIcon size={15} />
                )}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: textColor }}>
                    {s.step}. {s.title}
                  </span>
                  {isDone && (
                    <span style={{ fontSize: 9.5, fontWeight: 800, color: '#16a34a', background: '#dcfce7', padding: '1px 5px', borderRadius: 4 }}>
                      PASSED
                    </span>
                  )}
                  {isActive && (
                    <span style={{ fontSize: 9.5, fontWeight: 800, color: '#2563eb', background: '#dbeafe', padding: '1px 5px', borderRadius: 4 }}>
                      ACTIVE
                    </span>
                  )}
                  {isFailed && (
                    <span style={{ fontSize: 9.5, fontWeight: 800, color: '#dc2626', background: '#fee2e2', padding: '1px 5px', borderRadius: 4 }}>
                      CHECK
                    </span>
                  )}
                </div>

                <div style={{ fontSize: 10, color: '#64748b', marginTop: 2, lineHeight: 1.3 }}>
                  {s.subtitle}
                </div>

                {/* Live Step-Specific Metric Highlights */}
                {stepMetrics && (
                  <div style={{ marginTop: 4, fontSize: 10, fontWeight: 700 }}>
                    {s.step === 2 && stepMetrics.blur_score !== undefined && (
                      <span style={{ color: stepMetrics.blur_score >= 20 ? '#16a34a' : '#dc2626' }}>
                        Sharpness: {stepMetrics.blur_score} (Min: 20)
                      </span>
                    )}
                    {s.step === 3 && stepMetrics.classification && (
                      <span style={{ color: '#2563eb' }}>
                        Type: {stepMetrics.classification === 'printed' ? '🖨️ Printed' : '✍️ Handwritten'}
                      </span>
                    )}
                    {s.step === 4 && stepMetrics.is_medical !== undefined && (
                      <span style={{ color: stepMetrics.is_medical ? '#16a34a' : '#d97706' }}>
                        {stepMetrics.is_medical ? '✓ Medical Report Verified' : 'Checking Content'}
                      </span>
                    )}
                    {s.step === 5 && stepMetrics.medications_count !== undefined && (
                      <span style={{ color: '#059669' }}>
                        Extracted: {stepMetrics.medications_count} medicines
                      </span>
                    )}
                    {s.step === 6 && stepMetrics.is_stored && (
                      <span style={{ color: '#059669' }}>
                        ✓ Saved to MongoDB & Linked
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Rejection / Warning Notice ── */}
      {rejectionReason && (
        <div
          style={{
            padding: '10px 14px',
            background: '#fef2f2',
            border: '1.5px solid #fecaca',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            color: '#991b1b',
            fontSize: 12.5,
          }}
        >
          <AlertTriangle size={18} color="#dc2626" className="flex-shrink-0" />
          <div style={{ flex: 1 }}>
            <strong>Inspection Notice:</strong> {rejectionReason}
          </div>
        </div>
      )}

      {/* ── Go Without Report Action Strip ── */}
      {onGoWithoutReport && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            padding: '10px 14px',
            borderRadius: 10,
          }}
        >
          <div style={{ fontSize: 12, color: '#64748b' }}>
            Patient doesn't have an old prescription or report with them?
          </div>

          <button
            type="button"
            onClick={onGoWithoutReport}
            id="btn-go-without-report"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '7px 16px',
              borderRadius: 8,
              background: '#0f172a',
              color: '#ffffff',
              border: 'none',
              fontSize: 12.5,
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              boxShadow: '0 2px 4px rgba(15, 23, 42, 0.2)',
            }}
          >
            <span>Go Without Report</span>
            <ArrowRight size={13} />
          </button>
        </div>
      )}
    </div>
  )
}
