"""
Email/password authentication + OTP password reset.

Mounted as additional endpoints on the main `api_router` in server.py.
Lives in its own file so the growing auth surface area stays reviewable.

ARCHITECTURE:
- Password storage: bcrypt via passlib (cost=12 — standard).
- Session tokens: reuse the same `user_sessions` collection as
  Google OAuth so /api/auth/me doesn't need to branch on provider.
- OTP: 6-digit numeric code, valid 15 min, stored in `password_reset_otps`
  collection with a TTL index. One code per email; new request invalidates
  prior codes. Max 5 verification attempts per code.
- Email sender: pluggable. Default = MicrosoftGraphMailer that sends
  from support@asgardsolution.io if MSGRAPH_* env vars are set;
  otherwise a ConsoleMailer just logs. Swap via EMAIL_PROVIDER env.

PASSWORD RULES (strict tier, per spec):
  - 10+ chars
  - mixed case (at least 1 uppercase + 1 lowercase)
  - at least 1 digit
  - at least 1 symbol
"""
from __future__ import annotations

import os
import re
import uuid
import logging
import secrets
import asyncio
from datetime import datetime, timezone, timedelta
from typing import Optional, Protocol

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field
from passlib.hash import bcrypt

logger = logging.getLogger(__name__)

# -------------------- Password policy --------------------

_PW_SYMBOLS = r"!@#$%^&*(),.?\":{}|<>_\-+=~`\[\]\\/;'"


def validate_password(pw: str) -> Optional[str]:
    """Returns a user-facing error string, or None if pw passes."""
    if not pw or len(pw) < 10:
        return "Password must be at least 10 characters long."
    if not re.search(r"[A-Z]", pw):
        return "Password must include an uppercase letter."
    if not re.search(r"[a-z]", pw):
        return "Password must include a lowercase letter."
    if not re.search(r"\d", pw):
        return "Password must include a number."
    if not re.search(rf"[{re.escape(_PW_SYMBOLS)}]", pw):
        return "Password must include a symbol (e.g. !@#$)."
    return None


def hash_password(pw: str) -> str:
    return bcrypt.using(rounds=12).hash(pw)


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.verify(pw, hashed)
    except Exception:
        return False


# -------------------- OTP helpers --------------------

def generate_otp() -> str:
    # 6-digit numeric code. `secrets.randbelow` is cryptographically
    # secure. Zero-pad so we always emit 6 chars.
    return f"{secrets.randbelow(1_000_000):06d}"


# -------------------- Email sender (pluggable) --------------------

class Mailer(Protocol):
    async def send(self, to_email: str, subject: str, html: str, text: str) -> bool: ...


class ConsoleMailer:
    """Dev-mode mailer — logs instead of sending. Never fails."""
    async def send(self, to_email: str, subject: str, html: str, text: str) -> bool:
        logger.info(
            "[ConsoleMailer] Would send email:\n"
            f"  to={to_email}\n  subject={subject}\n  text=\n{text}"
        )
        return True


class MicrosoftGraphMailer:
    """Send mail via Microsoft Graph (from support@asgardsolution.io).

    Reads from env:
      MSGRAPH_TENANT_ID
      MSGRAPH_CLIENT_ID
      MSGRAPH_CLIENT_SECRET
      MSGRAPH_SENDER         (defaults to support@asgardsolution.io)

    Uses the client-credentials (app-only) flow — the Azure app must
    have Application permission `Mail.Send` granted + admin-consented.
    """
    def __init__(self):
        self.tenant = os.environ.get("MSGRAPH_TENANT_ID", "")
        self.client_id = os.environ.get("MSGRAPH_CLIENT_ID", "")
        self.client_secret = os.environ.get("MSGRAPH_CLIENT_SECRET", "")
        self.sender = os.environ.get("MSGRAPH_SENDER", "support@asgardsolution.io")

    def _ready(self) -> bool:
        return bool(self.tenant and self.client_id and self.client_secret)

    async def _get_token(self) -> Optional[str]:
        # msal is sync; run in a thread to avoid blocking the event loop.
        def _fetch():
            import msal
            app = msal.ConfidentialClientApplication(
                self.client_id,
                authority=f"https://login.microsoftonline.com/{self.tenant}",
                client_credential=self.client_secret,
            )
            res = app.acquire_token_for_client(scopes=["https://graph.microsoft.com/.default"])
            return res.get("access_token")
        return await asyncio.to_thread(_fetch)

    async def send(self, to_email: str, subject: str, html: str, text: str) -> bool:
        if not self._ready():
            logger.warning("MicrosoftGraphMailer: MSGRAPH_* env not configured; falling back to console.")
            return await ConsoleMailer().send(to_email, subject, html, text)
        token = await self._get_token()
        if not token:
            logger.error("MicrosoftGraphMailer: could not acquire token")
            return False

        import httpx
        url = f"https://graph.microsoft.com/v1.0/users/{self.sender}/sendMail"
        body = {
            "message": {
                "subject": subject,
                "body": {"contentType": "HTML", "content": html},
                "toRecipients": [{"emailAddress": {"address": to_email}}],
            },
            "saveToSentItems": "true",
        }
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(url, json=body, headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            })
        if resp.status_code >= 400:
            logger.error(f"MicrosoftGraphMailer: send failed {resp.status_code} {resp.text[:200]}")
            return False
        logger.info(f"MicrosoftGraphMailer: sent to {to_email} ({subject})")
        return True


def _pick_mailer() -> Mailer:
    """Default: try Graph if configured, else Console."""
    provider = os.environ.get("EMAIL_PROVIDER", "auto").lower()
    if provider == "console":
        return ConsoleMailer()
    graph = MicrosoftGraphMailer()
    if graph._ready() or provider == "msgraph":
        return graph
    return ConsoleMailer()


mailer: Mailer = _pick_mailer()


# -------------------- API request / response models --------------------

class RegisterBody(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=10, max_length=256)
    name: str = Field(..., min_length=1, max_length=80)


class LoginBody(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=256)


class RequestPwResetBody(BaseModel):
    email: EmailStr


class VerifyOtpBody(BaseModel):
    email: EmailStr
    otp: str = Field(..., min_length=4, max_length=8)


class ResetPasswordBody(BaseModel):
    reset_token: str
    new_password: str = Field(..., min_length=10, max_length=256)


class ChangePasswordBody(BaseModel):
    current_password: str = Field(..., min_length=1, max_length=256)
    new_password: str = Field(..., min_length=10, max_length=256)


class UpdateProfileBody(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=80)
    picture: Optional[str] = Field(None, max_length=8192)  # base64 data URI or URL


# -------------------- Router factory --------------------

def build_password_auth_router(db, get_current_user):
    """Returns an APIRouter wired with `db` (motor client) and the
    existing `get_current_user` dep. Mount it onto the main /api
    router from server.py."""
    router = APIRouter()

    async def _mint_session(user_id: str, provider: str) -> str:
        token = f"rs_{uuid.uuid4().hex}"
        now_iso = datetime.now(timezone.utc).isoformat()
        expires_at = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
        await db.user_sessions.insert_one({
            "user_id": user_id,
            "session_token": token,
            "provider": provider,
            "created_at": now_iso,
            "expires_at": expires_at,
        })
        return token

    # ---------- REGISTER ----------
    @router.post("/auth/register")
    async def register(body: RegisterBody):
        email = body.email.lower().strip()
        pw_err = validate_password(body.password)
        if pw_err:
            raise HTTPException(status_code=400, detail=pw_err)

        existing = await db.users.find_one({"email": email}, {"_id": 0, "user_id": 1, "password_hash": 1})
        if existing:
            if existing.get("password_hash"):
                raise HTTPException(status_code=409, detail="An account already exists for this email.")
            # Google-only account exists — attach password to it.
            await db.users.update_one(
                {"user_id": existing["user_id"]},
                {"$set": {
                    "password_hash": hash_password(body.password),
                    "name": body.name,
                    "last_login": datetime.now(timezone.utc).isoformat(),
                }},
            )
            session_token = await _mint_session(existing["user_id"], "password")
            return {
                "user_id": existing["user_id"],
                "email": email,
                "name": body.name,
                "session_token": session_token,
                "email_verified": False,
            }

        user_id = f"user_{uuid.uuid4().hex[:12]}"
        now_iso = datetime.now(timezone.utc).isoformat()
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": body.name,
            "picture": "",
            "password_hash": hash_password(body.password),
            "email_verified": False,
            "tier": "trial",
            "analysis_count": 0,
            "billing_cycle_start": now_iso,
            "rollover_count": 0,
            "revenuecat_id": None,
            "created_at": now_iso,
            "last_login": now_iso,
        })
        session_token = await _mint_session(user_id, "password")
        return {
            "user_id": user_id,
            "email": email,
            "name": body.name,
            "session_token": session_token,
            "email_verified": False,
        }

    # ---------- LOGIN ----------
    @router.post("/auth/login")
    async def login(body: LoginBody):
        email = body.email.lower().strip()
        user = await db.users.find_one({"email": email}, {"_id": 0})
        if not user or not user.get("password_hash"):
            # Uniform error — never leak whether email exists.
            raise HTTPException(status_code=401, detail="Invalid email or password.")
        if not verify_password(body.password, user["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid email or password.")
        session_token = await _mint_session(user["user_id"], "password")
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {"$set": {"last_login": datetime.now(timezone.utc).isoformat()}},
        )
        return {
            "user_id": user["user_id"],
            "email": user["email"],
            "name": user.get("name", ""),
            "picture": user.get("picture", ""),
            "session_token": session_token,
            "email_verified": bool(user.get("email_verified", False)),
        }

    # ---------- REQUEST PASSWORD RESET (send OTP) ----------
    @router.post("/auth/request-password-reset")
    async def request_password_reset(body: RequestPwResetBody):
        email = body.email.lower().strip()
        user = await db.users.find_one({"email": email}, {"_id": 0, "user_id": 1, "name": 1})
        # UX anti-enumeration: always 200 so attackers can't tell which
        # emails have accounts. But only send mail if user exists.
        if user:
            otp = generate_otp()
            # Replace any prior unused codes.
            await db.password_reset_otps.delete_many({"email": email})
            await db.password_reset_otps.insert_one({
                "email": email,
                "user_id": user["user_id"],
                "otp_hash": hash_password(otp),
                "attempts": 0,
                "created_at": datetime.now(timezone.utc),
                "expires_at": datetime.now(timezone.utc) + timedelta(minutes=15),
            })
            subject = "Raven Scout password reset code"
            name = user.get("name") or "hunter"
            text = (
                f"Hi {name},\n\n"
                f"Your Raven Scout password reset code is: {otp}\n\n"
                f"This code expires in 15 minutes. If you did not request "
                f"this, you can ignore this email.\n\n"
                f"— Raven Scout"
            )
            html = f"""
              <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#0B1F2A;color:#F5F5F0;">
                <h2 style="color:#C89B3C;margin:0 0 16px;letter-spacing:2px;">RAVEN SCOUT</h2>
                <p>Hi {name},</p>
                <p>Your password reset code is:</p>
                <div style="font-size:32px;font-weight:800;letter-spacing:8px;color:#C89B3C;padding:16px;text-align:center;background:rgba(200,155,60,0.08);border-radius:8px;margin:16px 0;">{otp}</div>
                <p style="color:#9AA4A9;font-size:13px;">This code expires in 15 minutes. If you didn't request this, ignore this email.</p>
              </div>
            """
            await mailer.send(email, subject, html, text)
        return {"ok": True}

    # ---------- VERIFY OTP ----------
    @router.post("/auth/verify-otp")
    async def verify_otp(body: VerifyOtpBody):
        email = body.email.lower().strip()
        rec = await db.password_reset_otps.find_one({"email": email}, {"_id": 0})
        if not rec:
            raise HTTPException(status_code=400, detail="No active reset code. Request a new one.")
        if rec.get("attempts", 0) >= 5:
            await db.password_reset_otps.delete_many({"email": email})
            raise HTTPException(status_code=429, detail="Too many attempts. Request a new code.")
        # Parse expiry (stored as datetime, but tolerate string)
        expires_at = rec.get("expires_at")
        if isinstance(expires_at, str):
            try:
                expires_at = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
            except Exception:
                expires_at = None
        if not expires_at or expires_at < datetime.now(timezone.utc):
            await db.password_reset_otps.delete_many({"email": email})
            raise HTTPException(status_code=400, detail="Code expired. Request a new one.")

        if not verify_password(body.otp, rec["otp_hash"]):
            await db.password_reset_otps.update_one(
                {"email": email}, {"$inc": {"attempts": 1}}
            )
            raise HTTPException(status_code=401, detail="Invalid code.")

        # Valid — mint a short-lived reset token and cache it.
        reset_token = f"rst_{secrets.token_urlsafe(32)}"
        await db.password_reset_tokens.insert_one({
            "token": reset_token,
            "user_id": rec["user_id"],
            "email": email,
            "expires_at": datetime.now(timezone.utc) + timedelta(minutes=10),
        })
        await db.password_reset_otps.delete_many({"email": email})
        return {"reset_token": reset_token}

    # ---------- RESET PASSWORD ----------
    @router.post("/auth/reset-password")
    async def reset_password(body: ResetPasswordBody):
        pw_err = validate_password(body.new_password)
        if pw_err:
            raise HTTPException(status_code=400, detail=pw_err)
        rec = await db.password_reset_tokens.find_one({"token": body.reset_token}, {"_id": 0})
        if not rec:
            raise HTTPException(status_code=400, detail="Reset link invalid or expired.")
        expires_at = rec.get("expires_at")
        if isinstance(expires_at, str):
            try:
                expires_at = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
            except Exception:
                expires_at = None
        if not expires_at or expires_at < datetime.now(timezone.utc):
            await db.password_reset_tokens.delete_many({"token": body.reset_token})
            raise HTTPException(status_code=400, detail="Reset link expired.")

        await db.users.update_one(
            {"user_id": rec["user_id"]},
            {"$set": {"password_hash": hash_password(body.new_password)}},
        )
        await db.password_reset_tokens.delete_many({"token": body.reset_token})
        # Invalidate all existing sessions for safety.
        await db.user_sessions.delete_many({"user_id": rec["user_id"]})
        # Mint a fresh session so the UI can sign the user straight in.
        session_token = await _mint_session(rec["user_id"], "password")
        return {"ok": True, "session_token": session_token}

    # ---------- CHANGE PASSWORD (auth'd) ----------
    @router.post("/auth/change-password")
    async def change_password(body: ChangePasswordBody, request: Request):
        user = await get_current_user(request)
        pw_err = validate_password(body.new_password)
        if pw_err:
            raise HTTPException(status_code=400, detail=pw_err)
        doc = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "password_hash": 1})
        if not doc or not doc.get("password_hash"):
            raise HTTPException(
                status_code=400,
                detail="This account was created with Google sign-in. Use Reset Password to set one.",
            )
        if not verify_password(body.current_password, doc["password_hash"]):
            raise HTTPException(status_code=401, detail="Current password is incorrect.")
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {"$set": {"password_hash": hash_password(body.new_password)}},
        )
        # Keep current session active; log out *other* devices as a security nudge.
        current_token = request.headers.get("Authorization", "").replace("Bearer ", "").strip()
        await db.user_sessions.delete_many({
            "user_id": user["user_id"],
            "session_token": {"$ne": current_token},
        })
        return {"ok": True}

    # ---------- PROFILE: read / update / delete ----------
    @router.patch("/users/me")
    async def update_profile(body: UpdateProfileBody, request: Request):
        user = await get_current_user(request)
        updates = {}
        if body.name is not None:
            updates["name"] = body.name.strip()
        if body.picture is not None:
            updates["picture"] = body.picture
        if not updates:
            return {"ok": True, "user_id": user["user_id"]}
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": updates})
        doc = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "password_hash": 0})
        return {"ok": True, "user": doc}

    @router.delete("/users/me")
    async def delete_account(request: Request):
        user = await get_current_user(request)
        uid = user["user_id"]
        # Cascade: hunts + sessions + reset tokens.
        await db.hunts.delete_many({"user_id": uid})
        await db.user_sessions.delete_many({"user_id": uid})
        await db.password_reset_otps.delete_many({"user_id": uid})
        await db.password_reset_tokens.delete_many({"user_id": uid})
        await db.users.delete_one({"user_id": uid})
        return {"ok": True, "deleted": 1}

    return router
