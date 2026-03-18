from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.models.user import User
from app.routers.deps import get_current_user, get_db
from app.schemas.user_public import UserPublicOut


router = APIRouter(prefix="/users", tags=["users"])


@router.get("/{user_id}", response_model=UserPublicOut)
def get_user_public(
    user_id: int,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    return u
