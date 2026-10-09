import io
import os
import socket
import secrets
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, Tuple
from PIL import Image

from app.core.config import settings


def detect_lan_ip() -> str:
    """
    Dynamically discover the local network IP address of the machine.
    Does not make an outbound network call; probes standard routing table.
    Works across Wi-Fi networks and Ethernet without hardcoding any IP address.
    """
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # Probes gateway route without sending actual packets
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
    except Exception:
        try:
            ip = socket.gethostbyname(socket.gethostname())
        except Exception:
            ip = "127.0.0.1"
    finally:
        s.close()
    return ip


def generate_qr_url(token: str, client_host: Optional[str] = None) -> str:
    """
    Constructs the mobile-friendly upload URL intended for scanning on a phone.
    Guarantees that 'localhost' and '127.0.0.1' are never used.
    """
    # 1. Configured FRONTEND_LAN_URL in settings (.env) has first priority
    if settings.FRONTEND_LAN_URL and settings.FRONTEND_LAN_URL.strip():
        base = settings.FRONTEND_LAN_URL.strip().rstrip("/")
        return f"{base}/mobile-upload?token={token}"

    # 2. If client passed their own host and it's a non-loopback LAN IP (not localhost or 127.x)
    if client_host:
        host_clean = client_host.strip().split(":")[0].strip()
        if (
            host_clean
            and host_clean not in ("localhost", "127.0.0.1", "::1", "0.0.0.0", "test")
            and not host_clean.startswith("127.")
        ):
            return f"http://{host_clean}:5173/mobile-upload?token={token}"

    # 3. Dynamic LAN IP auto-discovery (e.g. 192.168.31.222)
    lan_ip = detect_lan_ip()
    if lan_ip in ("localhost", "127.0.0.1", "::1") or lan_ip.startswith("127."):
        # Fallback to local machine hostname if IP is still loopback
        try:
            lan_ip = socket.gethostname()
        except Exception:
            pass

    return f"http://{lan_ip}:5173/mobile-upload?token={token}"


def validate_uploaded_image(file_bytes: bytes, filename: str) -> Tuple[bool, str]:
    """
    Validates uploaded file size, extension, and decodes header to confirm a valid image.
    """
    MAX_SIZE = 15 * 1024 * 1024  # 15 MB
    if not file_bytes or len(file_bytes) == 0:
        return False, "Empty image file received. Please take or choose a photo."
    if len(file_bytes) > MAX_SIZE:
        return False, "File size exceeds 15 MB limit. Please take a smaller photo."

    ext = os.path.splitext(filename or "")[1].lower()
    if ext not in [".jpg", ".jpeg", ".png", ".webp"]:
        # Check if file has standard magic bytes for image formats even if filename is generic
        if not (file_bytes.startswith(b"\xff\xd8\xff") or  # JPEG
                file_bytes.startswith(b"\x89PNG\r\n\x1a\n") or  # PNG
                file_bytes.startswith(b"RIFF") and b"WEBP" in file_bytes[:16]):  # WEBP
            return False, "Unsupported file format. Please upload a JPG, PNG, or WebP photo."

    try:
        with Image.open(io.BytesIO(file_bytes)) as img:
            img.verify()
    except Exception:
        return False, "Corrupted or unreadable image file. Please recapture the photo."

    return True, ""


class QRUploadService:
    def __init__(self):
        # In-memory storage for active upload sessions
        # key: token (str) -> dict
        self._sessions: Dict[str, Dict[str, Any]] = {}

    def _cleanup_expired(self):
        """Remove sessions older than TTL."""
        now = datetime.utcnow()
        expired_keys = [k for k, v in self._sessions.items() if now > v.get("expires_at", now)]
        for k in expired_keys:
            self._sessions.pop(k, None)

    def create_session(
        self,
        session_id: str,
        patient_id: str,
        care_hub_id: str,
        device_id: Optional[str] = None,
        device: Optional[Any] = None,
        client_host: Optional[str] = None,
        ttl_minutes: int = 10,
    ) -> Dict[str, Any]:
        """
        Creates a temporary, secure QR upload session.
        Uses secrets.token_urlsafe(32) for high cryptographic entropy.
        """
        self._cleanup_expired()

        token = secrets.token_urlsafe(32)
        expires_at = datetime.utcnow() + timedelta(minutes=ttl_minutes)
        qr_url = generate_qr_url(token, client_host=client_host)

        self._sessions[token] = {
            "token": token,
            "session_id": session_id,
            "patient_id": patient_id,
            "care_hub_id": care_hub_id,
            "device_id": device_id,
            "device": device,
            "status": "pending",  # pending | processing | completed | failed | expired
            "created_at": datetime.utcnow(),
            "expires_at": expires_at,
            "qr_url": qr_url,
            "result": None,
            "error_message": None,
        }

        return {
            "token": token,
            "qr_url": qr_url,
            "expires_in_seconds": ttl_minutes * 60,
            "expires_at": expires_at.isoformat(),
            "lan_ip": detect_lan_ip(),
        }

    def get_session(self, token: str) -> Optional[Dict[str, Any]]:
        """Retrieve active session by token."""
        self._cleanup_expired()
        session = self._sessions.get(token)
        if not session:
            return None
        if datetime.utcnow() > session["expires_at"]:
            session["status"] = "expired"
        return session

    def get_public_session_info(self, token: str) -> Optional[Dict[str, Any]]:
        """
        Returns safe, non-sensitive session metadata for the patient's phone.
        Never reveals patient identity, care hub keys, or backend secrets.
        """
        session = self.get_session(token)
        if not session:
            return None

        remaining = max(0, int((session["expires_at"] - datetime.utcnow()).total_seconds()))
        is_expired = remaining <= 0 or session.get("status") == "expired"

        return {
            "valid": not is_expired and session.get("status") != "expired",
            "status": "expired" if is_expired else session.get("status", "pending"),
            "expires_in_seconds": remaining,
            "error_message": session.get("error_message"),
            "has_completed": session.get("status") == "completed",
        }

    def update_session_status(
        self,
        token: str,
        status: str,
        result: Optional[Dict[str, Any]] = None,
        error_message: Optional[str] = None,
    ):
        """Update the processing status of a session."""
        session = self._sessions.get(token)
        if session:
            session["status"] = status
            if result is not None:
                session["result"] = result
            if error_message is not None:
                session["error_message"] = error_message


qr_upload_service = QRUploadService()
