"""
Cloudinary Image Storage Service
=================================
Handles secure uploading of patient medical documents and handwritten prescriptions
to Cloudinary, with graceful fallback to local storage if Cloudinary credentials
encounter configuration mismatches or network offline conditions.
"""

import os
import re
from typing import Optional, Tuple
import cloudinary
import cloudinary.uploader
from dotenv import dotenv_values, load_dotenv
from app.core.config import settings


class CloudinaryService:
    def __init__(self):
        self._is_configured = False
        self._configured_cloud_name = ""
        self._configure()

    def _configure(self):
        # 1. Load from environment or dynamic .env file
        env_vals = {}
        try:
            load_dotenv(override=False)
            env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env")
            if os.path.exists(env_path):
                env_vals = dotenv_values(env_path)
        except Exception:
            pass

        cloud_name = (
            os.getenv("CLOUDINARY_CLOUD_NAME")
            or env_vals.get("CLOUDINARY_CLOUD_NAME")
            or settings.CLOUDINARY_CLOUD_NAME
            or ""
        ).strip()

        api_key = (
            os.getenv("CLOUDINARY_API_KEY")
            or env_vals.get("CLOUDINARY_API_KEY")
            or settings.CLOUDINARY_API_KEY
            or ""
        ).strip()

        api_secret = (
            os.getenv("CLOUDINARY_API_SECRET")
            or env_vals.get("CLOUDINARY_API_SECRET")
            or settings.CLOUDINARY_API_SECRET
            or ""
        ).strip()

        if cloud_name and api_key and api_secret:
            try:
                cloudinary.config(
                    cloud_name=cloud_name,
                    api_key=api_key,
                    api_secret=api_secret,
                    secure=True,
                )
                self._is_configured = True
                self._configured_cloud_name = cloud_name
            except Exception as e:
                print(f"[CloudinaryService] Configuration warning: {e}")
                self._is_configured = False
        else:
            self._is_configured = False

    def upload_image(
        self,
        image_bytes: bytes,
        public_id: str,
        folder: str = "astra_medical_reports",
    ) -> Tuple[Optional[str], Optional[str]]:
        """
        Uploads document image bytes to Cloudinary.
        Returns: (secure_url, error_message)
        """
        # Ensure fresh config in case .env was recently modified
        self._configure()

        if not self._is_configured:
            err = "Cloudinary credentials (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET) not fully configured in .env"
            print(f"[CloudinaryService] {err}. Using secure local fallback.")
            return None, err

        try:
            # Clean public_id of invalid characters
            safe_public_id = re.sub(r"[^a-zA-Z0-9_\-]", "_", public_id)
            upload_result = cloudinary.uploader.upload(
                image_bytes,
                folder=folder,
                public_id=safe_public_id,
                resource_type="image",
                overwrite=True,
            )
            secure_url = upload_result.get("secure_url")
            print(f"[CloudinaryService] Successfully uploaded document to Cloudinary ({self._configured_cloud_name}): {secure_url}")
            return secure_url, None
        except Exception as e:
            err_str = str(e)
            print(f"[CloudinaryService] Cloudinary upload encountered issue ({err_str}). Using secure local fallback.")
            return None, err_str


cloudinary_service = CloudinaryService()
