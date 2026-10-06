from fastapi import APIRouter, Depends
from app.models.admin import Admin
from app.dependencies.auth import get_current_admin

router = APIRouter(prefix="/settings", tags=["Settings"])


@router.get("/profile")
async def get_profile(admin: Admin = Depends(get_current_admin)):
    return {
        "admin_id": str(admin.id),
        "email": admin.email,
        "username": admin.username,
        "care_hub_id": admin.care_hub_id,
        "created_at": admin.created_at,
    }


@router.put("/username")
async def update_username(
    body: dict,
    admin: Admin = Depends(get_current_admin),
):
    new_username = body.get("username", "").strip()
    if not new_username:
        from fastapi import HTTPException
        raise HTTPException(400, "Username cannot be empty")
    admin.username = new_username
    await admin.save()
    return {"message": "Username updated", "username": admin.username}
