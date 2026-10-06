import random
import string
from datetime import datetime, timedelta

from jose import jwt, JWTError
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])


def generate_id(prefix: str, length: int = 5) -> str:
    """Generate a random ID like DOC-12345"""
    digits = "".join(random.choices(string.digits, k=length))
    return f"{prefix}-{digits}"


def generate_password(length: int = 10) -> str:
    """Generate a random secure password"""
    chars = string.ascii_letters + string.digits + "!@#$"
    return "".join(random.choices(chars, k=length))
