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
from app.core.config import settings


class CloudinaryService:
    def __init__(self):
        self._is_configured = False
        self._configure()

    def _configure(self):
        # Determine cloud name: CLOUDINARY_CLOUD_NAME or CLOUDINARY_API_KEY_NAME
        cloud_name = (settings.CLOUDINARY_CLOUD_NAME or settings.CLOUDINARY_API_KEY_NAME or "Astra").strip()
        api_key = (settings.CLOUDINARY_API_KEY or "").strip()
        api_secret = (settings.CLOUDINARY_API_SECRET or "").strip()

        if api_key and api_secret:
            try:
                cloudinary.config(
                    cloud_name=cloud_name,
                    api_key=api_key,
                    api_secret=api_secret,
                    secure=True,
                )
                self._is_configured = True
            except Exception as e:
                print(f"[CloudinaryService] Configuration warning: {e}")
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
        if not self._is_configured:
            self._configure()

        if not self._is_configured:
            return None, "Cloudinary credentials not configured in .env"

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
            print(f"[CloudinaryService] Successfully uploaded document to Cloudinary: {secure_url}")
            return secure_url, None
        except Exception as e:
            err_str = str(e)
            print(f"[CloudinaryService] Cloudinary upload encountered issue ({err_str}). Using secure local fallback.")
            return None, err_str


cloudinary_service = CloudinaryService()
