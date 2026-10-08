import aiosmtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from app.core.config import settings


async def send_email(to_email: str, subject: str, body_html: str) -> bool:
    """
    Send an email via SMTP.
    Returns True if sent, False if SMTP not configured or failed.
    In demo mode (no SMTP creds), credentials are shown on screen instead.
    """
    if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        # Demo mode: email not sent but credentials shown on UI
        print(f"[DEMO EMAIL] To: {to_email} | Subject: {subject}")
        return False

    try:
        msg = MIMEMultipart("alternative")
        msg["From"]    = f"{settings.FROM_NAME} <{settings.FROM_EMAIL}>"
        msg["To"]      = to_email
        msg["Subject"] = subject
        msg.attach(MIMEText(body_html, "html"))

        await aiosmtplib.send(
            msg,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USER,
            password=settings.SMTP_PASSWORD,
            start_tls=True,
        )
        return True
    except Exception as e:
        print(f"[EMAIL ERROR] {e}")
        return False


def staff_credentials_email(
    full_name: str,
    staff_id: str,
    plain_password: str,
    role: str,
    hub_name: str,
) -> str:
    """HTML email body for new staff credentials."""
    return f"""
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;border:1px solid #e5e5e5;border-radius:8px;overflow:hidden;">
      <div style="background:#0a0a0a;padding:24px 32px;">
        <h1 style="color:#fff;font-size:22px;margin:0;letter-spacing:-0.5px;">Astra Healthcare</h1>
        <p style="color:rgba(255,255,255,0.5);font-size:13px;margin:6px 0 0;">Your Login Credentials</p>
      </div>
      <div style="padding:32px;">
        <p style="color:#404040;font-size:14px;">Hello <strong>{full_name}</strong>,</p>
        <p style="color:#404040;font-size:14px;">
          You have been added as a <strong>{role}</strong> at <strong>{hub_name}</strong>.
          Use the credentials below to log in to the Astra portal.
        </p>
        <div style="background:#f9f9f9;border:1px solid #e5e5e5;border-radius:8px;padding:20px 24px;margin:20px 0;">
          <p style="margin:0 0 10px;font-size:13px;color:#737373;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Your Credentials</p>
          <p style="margin:6px 0;font-size:15px;color:#0a0a0a;"><strong>ID:</strong> {staff_id}</p>
          <p style="margin:6px 0;font-size:15px;color:#0a0a0a;"><strong>Password:</strong> {plain_password}</p>
        </div>
        <p style="color:#737373;font-size:12px;">Please change your password after first login. Keep these credentials secure.</p>
      </div>
    </div>
    """


def patient_prescription_email(
    patient_name: str,
    patient_id: str,
    doctor_name: str,
    doctor_role: str,
    specialization: str,
    diagnosis: str,
    clinical_notes: str,
    medicines: list,
    doctor_advice: str,
    follow_up_date: str,
    hub_name: str,
    attached_reports: list = None,
) -> str:
    """HTML email template for official Digital Prescription sent to patient."""
    med_rows = ""
    for idx, med in enumerate(medicines, 1):
        name = med.get("name", "Medicine")
        form = med.get("form", "Tablet")
        dosage = med.get("dosage", "")
        freq = med.get("frequency", "1-0-1")
        duration = med.get("duration", "5 Days")
        instructions = med.get("instructions", "After meals")
        med_rows += f"""
        <tr style="border-bottom:1px solid #f1f5f9;">
          <td style="padding:10px 12px;font-weight:600;color:#0f172a;font-size:14px;">{idx}. {name}</td>
          <td style="padding:10px 12px;color:#475569;font-size:13px;">{form} ({dosage})</td>
          <td style="padding:10px 12px;color:#0284c7;font-weight:600;font-size:13px;">{freq}</td>
          <td style="padding:10px 12px;color:#475569;font-size:13px;">{duration}</td>
          <td style="padding:10px 12px;color:#334155;font-size:13px;font-style:italic;">{instructions}</td>
        </tr>
        """

    reports_html = ""
    if attached_reports:
        reports_html = "<div style='margin-top:20px;padding:16px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;'><h4 style='margin:0 0 8px;font-size:13px;color:#475569;text-transform:uppercase;'>Attached Medical Reports</h4>"
        for rep in attached_reports:
            url = rep.get("image_url") or rep.get("cloudinary_url")
            rep_type = rep.get("classification") or rep.get("report_type") or "Medical Document"
            if url:
                reports_html += f"<p style='margin:4px 0;'><a href='{url}' target='_blank' style='color:#0284c7;font-weight:600;text-decoration:none;'>📎 View {rep_type} &rarr;</a></p>"
        reports_html += "</div>"

    role_badge = doctor_role.replace("_", " ").title()
    spec_label = f" · {specialization}" if specialization else ""

    return f"""
    <div style="font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:640px;margin:auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;background:#ffffff;box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
      <!-- Header -->
      <div style="background:linear-gradient(135deg,#0284c7 0%,#0369a1 100%);padding:28px 32px;color:#ffffff;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <h1 style="margin:0;font-size:24px;font-weight:700;letter-spacing:-0.5px;">Astra Healthcare</h1>
            <p style="margin:4px 0 0;font-size:13px;color:rgba(255,255,255,0.85);">{hub_name} · Smart Digital Prescription</p>
          </div>
        </div>
      </div>

      <div style="padding:32px;">
        <!-- Patient & Doctor Info Grid -->
        <table style="width:100%;margin-bottom:24px;border-collapse:collapse;">
          <tr>
            <td style="width:50%;vertical-align:top;padding-right:12px;">
              <div style="background:#f8fafc;padding:14px;border-radius:8px;border:1px solid #e2e8f0;">
                <p style="margin:0 0 4px;font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase;">Patient Details</p>
                <p style="margin:0;font-size:15px;font-weight:700;color:#0f172a;">{patient_name}</p>
                <p style="margin:3px 0 0;font-size:12px;color:#475569;">Patient ID: <strong>{patient_id}</strong></p>
              </div>
            </td>
            <td style="width:50%;vertical-align:top;padding-left:12px;">
              <div style="background:#f0f9ff;padding:14px;border-radius:8px;border:1px solid #bae6fd;">
                <p style="margin:0 0 4px;font-size:11px;color:#0284c7;font-weight:700;text-transform:uppercase;">Prescribing Doctor</p>
                <p style="margin:0;font-size:15px;font-weight:700;color:#0369a1;">{doctor_name}</p>
                <p style="margin:3px 0 0;font-size:12px;color:#0284c7;">{role_badge}{spec_label}</p>
              </div>
            </td>
          </tr>
        </table>

        <!-- Diagnosis Banner -->
        <div style="background:#f1f5f9;border-left:4px solid #0284c7;padding:14px 18px;margin-bottom:24px;border-radius:0 8px 8px 0;">
          <p style="margin:0 0 2px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;">Clinical Diagnosis</p>
          <p style="margin:0;font-size:16px;font-weight:600;color:#0f172a;">{diagnosis}</p>
          {f"<p style='margin:6px 0 0;font-size:13px;color:#475569;'>Notes: {clinical_notes}</p>" if clinical_notes else ""}
        </div>

        <!-- Prescribed Medicines Table -->
        <h3 style="margin:0 0 12px;font-size:15px;color:#0f172a;font-weight:700;">Rx · Prescribed Medicines</h3>
        <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:24px;">
          <thead>
            <tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0;text-align:left;">
              <th style="padding:10px 12px;font-size:12px;font-weight:700;color:#475569;text-transform:uppercase;">Medicine</th>
              <th style="padding:10px 12px;font-size:12px;font-weight:700;color:#475569;text-transform:uppercase;">Form</th>
              <th style="padding:10px 12px;font-size:12px;font-weight:700;color:#475569;text-transform:uppercase;">Timing</th>
              <th style="padding:10px 12px;font-size:12px;font-weight:700;color:#475569;text-transform:uppercase;">Duration</th>
              <th style="padding:10px 12px;font-size:12px;font-weight:700;color:#475569;text-transform:uppercase;">Instructions</th>
            </tr>
          </thead>
          <tbody>
            {med_rows if med_rows else "<tr><td colspan='5' style='padding:16px;text-align:center;color:#64748b;'>No specific pharmaceutical medications prescribed.</td></tr>"}
          </tbody>
        </table>

        <!-- Advisory & Follow up -->
        {f"<div style='background:#fefce8;border:1px solid #fef08a;padding:14px 18px;border-radius:8px;margin-bottom:20px;'><h4 style='margin:0 0 4px;font-size:12px;color:#854d0e;text-transform:uppercase;'>Doctor Advice & Diet Instructions</h4><p style='margin:0;font-size:13px;color:#713f12;'>{doctor_advice}</p></div>" if doctor_advice else ""}

        {f"<div style='margin-bottom:20px;'><p style='margin:0;font-size:13px;color:#334155;'><strong>Next Consultation / Follow-up:</strong> {follow_up_date}</p></div>" if follow_up_date else ""}

        {reports_html}

        <!-- Pharmacy Notice -->
        <div style="margin-top:28px;padding-top:16px;border-top:1px solid #e2e8f0;display:flex;align-items:center;">
          <p style="margin:0;font-size:12px;color:#64748b;line-height:1.5;">
            🏥 <strong>Pharmacy Pickup:</strong> This prescription has also been transmitted directly to the dispensing counter at <strong>{hub_name}</strong>. Please present your Patient ID (<strong>{patient_id}</strong>) to collect your medicines.
          </p>
        </div>
      </div>

      <!-- Footer -->
      <div style="background:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;text-align:center;">
        <p style="margin:0;font-size:11px;color:#94a3b8;">
          Astra Healthcare Smart Clinical System · Confidential Medical Record · Designed for rural & semi-urban digital care
        </p>
      </div>
    </div>
    """

