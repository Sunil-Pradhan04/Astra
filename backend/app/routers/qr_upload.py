from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File
from pydantic import BaseModel

from app.dependencies.auth import get_current_device
from app.models.endpoint_device import EndpointDevice
from app.services.qr_upload_service import qr_upload_service, validate_uploaded_image
from app.routers.kiosk import process_prescription_upload_core

router = APIRouter(prefix="/kiosk/qr-upload", tags=["Kiosk QR Upload"])


class CreateQRSessionRequest(BaseModel):
    session_id: str
    patient_id: str
    client_host: Optional[str] = None


@router.post("/create")
async def create_qr_session(
    body: CreateQRSessionRequest,
    request: Request,
    device: EndpointDevice = Depends(get_current_device),
):
    """
    Called by the kiosk to initialize a secure temporary QR upload session.
    Generates a cryptographically strong token and resolves the non-localhost LAN URL.
    """
    if not body.session_id or not body.patient_id:
        raise HTTPException(status_code=400, detail="session_id and patient_id are required")

    # If client passed host or request header has host, prioritize over localhost
    req_host = body.client_host or request.headers.get("x-forwarded-host") or request.headers.get("host")

    session_info = qr_upload_service.create_session(
        session_id=body.session_id,
        patient_id=body.patient_id,
        care_hub_id=device.care_hub_id,
        device_id=device.device_id,
        device=device,
        client_host=req_host,
    )

    return {
        "success": True,
        **session_info,
    }


@router.get("/session/{token}")
async def get_qr_session(token: str):
    """
    Public endpoint accessed by the patient's phone browser.
    Validates token without leaking any sensitive patient records or system secrets.
    """
    info = qr_upload_service.get_public_session_info(token)
    if not info:
        raise HTTPException(status_code=404, detail="Upload session not found or invalid.")
    return info


@router.post("/submit/{token}")
async def submit_qr_photo(
    token: str,
    file: UploadFile = File(...),
):
    """
    Public upload endpoint accessed by the patient's phone.
    Receives photo/document, validates content & format, and triggers the full OCR pipeline.
    """
    session = qr_upload_service.get_session(token)
    if not session:
        raise HTTPException(status_code=404, detail="Upload session not found or expired.")

    if session.get("status") == "expired":
        raise HTTPException(status_code=410, detail="This upload session has expired. Please refresh the QR code on the kiosk.")

    if session.get("status") == "completed":
        return {
            "success": True,
            "status": "completed",
            "message": "File already submitted and processed for this session.",
        }

    image_bytes = await file.read()
    valid, err_msg = validate_uploaded_image(image_bytes, file.filename or "photo.jpg")
    if not valid:
        raise HTTPException(status_code=400, detail=err_msg)

    qr_upload_service.update_session_status(token, "processing")

    try:
        result = await process_prescription_upload_core(
            session_id=session["session_id"],
            patient_id=session["patient_id"],
            image_bytes=image_bytes,
            filename=file.filename or "mobile_prescription.jpg",
            care_hub_id=session.get("care_hub_id") or "HUB-DEFAULT",
            device_id=session.get("device_id"),
            device=session.get("device"),
        )

        if result.get("success", False):
            qr_upload_service.update_session_status(token, "completed", result=result)
            return {
                "success": True,
                "status": "completed",
                "message": "Prescription successfully uploaded and processed.",
                "prescription_data": result.get("prescription_data"),
            }
        else:
            fail_msg = result.get("translated_message") or result.get("message") or "Document could not be processed. Please retake the photo."
            qr_upload_service.update_session_status(token, "failed", result=result, error_message=fail_msg)
            return {
                "success": False,
                "status": "failed",
                "message": fail_msg,
                "action_required": result.get("action_required", "retake_photo"),
                "quality_metrics": result.get("quality_metrics", {}),
            }
    except Exception as e:
        qr_upload_service.update_session_status(token, "failed", error_message=str(e))
        raise HTTPException(status_code=500, detail=f"Error processing document: {str(e)}")


@router.get("/status/{token}")
async def get_session_status(token: str):
    """
    Polled by the kiosk to observe real-time upload and OCR analysis status.
    Returns status: pending | processing | completed | failed | expired.
    Once completed, returns the full processed result payload to advance the kiosk session.
    """
    session = qr_upload_service.get_session(token)
    if not session:
        return {"status": "not_found", "valid": False}

    remaining = max(0, int((session["expires_at"] - datetime.utcnow()).total_seconds()))
    return {
        "token": token,
        "status": session["status"],
        "message": session.get("error_message"),
        "result": session.get("result"),
        "expires_in_seconds": remaining,
        "valid": session["status"] != "expired" and remaining > 0,
    }
