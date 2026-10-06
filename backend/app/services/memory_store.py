import json
import time
from typing import Optional, Dict, Any
import redis.asyncio as aioredis
from app.core.config import settings

class SessionMemoryStore:
    def __init__(self):
        self.redis_client = None
        self._local_cache: Dict[str, Dict[str, Any]] = {}
        self._redis_available = False
        self._init_attempted = False

    async def _get_client(self):
        if not self._init_attempted:
            self._init_attempted = True
            try:
                client = aioredis.from_url(
                    settings.REDIS_URL,
                    decode_responses=True,
                    socket_connect_timeout=1.0,
                )
                await client.ping()
                self.redis_client = client
                self._redis_available = True
                print(f"[SessionStore] Connected to Redis at {settings.REDIS_URL}")
            except Exception as e:
                self._redis_available = False
                print(f"[SessionStore] Redis unavailable ({e}). Using in-memory fallback store.")
        return self.redis_client if self._redis_available else None

    async def save_session(self, session_id: str, data: dict, ttl_seconds: int = 7200):
        client = await self._get_client()
        serialized = json.dumps(data, ensure_ascii=False)
        if client:
            try:
                await client.setex(session_id, ttl_seconds, serialized)
                return
            except Exception:
                self._redis_available = False

        # Fallback to in-memory TTL dictionary
        self._local_cache[session_id] = {
            "expires_at": time.time() + ttl_seconds,
            "data": data,
        }

    async def get_session(self, session_id: str) -> Optional[dict]:
        client = await self._get_client()
        if client:
            try:
                raw = await client.get(session_id)
                if raw:
                    return json.loads(raw)
            except Exception:
                self._redis_available = False

        # Fallback to in-memory cache
        entry = self._local_cache.get(session_id)
        if entry:
            if time.time() < entry["expires_at"]:
                return entry["data"]
            else:
                del self._local_cache[session_id]
        return None

    async def delete_session(self, session_id: str):
        client = await self._get_client()
        if client:
            try:
                await client.delete(session_id)
            except Exception:
                pass
        self._local_cache.pop(session_id, None)

    async def is_redis_active(self) -> bool:
        await self._get_client()
        return self._redis_available


session_memory = SessionMemoryStore()
