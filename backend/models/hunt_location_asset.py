"""HuntLocationAsset — user-provided GPS pins attached to a hunt.

A hunt can have zero, one, or many of these. They represent things
the hunter has placed in the field: stands, blinds, feeders, trail
cameras, parking spots, access points, water sources, scrapes, rubs,
bedding areas, plus a `custom` escape hatch.

Persistence:
  * Stored in the Mongo collection `hunt_location_assets`.
  * Compound unique index on (user_id, asset_id).
  * Compound query index on (user_id, hunt_id, created_at).

Ownership / scoping:
  * Every asset is scoped to a single user_id.
  * Every asset belongs to a specific hunt_id.
  * The router enforces that the hunt_id exists for the calling user
    before it will create or list assets — that check lives in the
    router (not the model) so the model stays infrastructure-free.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

from geo_validation import (
    GeoValidationError,
    validate_latitude,
    validate_longitude,
)

# Canonical asset types — keep in sync with the frontend
# `HuntLocationAssetType` union in src/types/geo.ts.
HUNT_LOCATION_ASSET_TYPES = (
    "stand",
    "blind",
    "feeder",
    "camera",
    "parking",
    "access_point",
    "water",
    "scrape",
    "rub",
    "bedding",
    "custom",
)

HuntLocationAssetType = Literal[
    "stand",
    "blind",
    "feeder",
    "camera",
    "parking",
    "access_point",
    "water",
    "scrape",
    "rub",
    "bedding",
    "custom",
]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class HuntLocationAssetCreate(BaseModel):
    """Payload for creating a single asset (POST body shape).

    `asset_id` is optional on create — when omitted, the router mints
    a uuid4 so frontends that don't manage their own ids stay happy.
    """

    asset_id: Optional[str] = Field(default=None, min_length=4, max_length=64)
    # Optional in the wire payload: routes mounted at
    # `POST /api/hunts/{hunt_id}/assets` overwrite this from the URL
    # path before persistence. Tests / direct callers may still supply
    # it explicitly when posting to a generic create endpoint.
    hunt_id: Optional[str] = Field(default=None, max_length=128)
    type: HuntLocationAssetType
    name: str = Field(..., min_length=1, max_length=120)
    latitude: float
    longitude: float
    notes: Optional[str] = Field(default=None, max_length=2000)

    @field_validator("latitude")
    @classmethod
    def _check_lat(cls, v):
        try:
            return validate_latitude(v)
        except GeoValidationError as exc:
            raise ValueError(str(exc)) from exc

    @field_validator("longitude")
    @classmethod
    def _check_lng(cls, v):
        try:
            return validate_longitude(v)
        except GeoValidationError as exc:
            raise ValueError(str(exc)) from exc

    @field_validator("name")
    @classmethod
    def _check_name(cls, v: str) -> str:
        v2 = v.strip()
        if not v2:
            raise ValueError("name must not be blank")
        return v2


class HuntLocationAssetUpdate(BaseModel):
    """Partial-update payload — only fields present are written."""

    type: Optional[HuntLocationAssetType] = None
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    notes: Optional[str] = Field(default=None, max_length=2000)

    @field_validator("latitude")
    @classmethod
    def _check_lat(cls, v):
        if v is None:
            return v
        try:
            return validate_latitude(v)
        except GeoValidationError as exc:
            raise ValueError(str(exc)) from exc

    @field_validator("longitude")
    @classmethod
    def _check_lng(cls, v):
        if v is None:
            return v
        try:
            return validate_longitude(v)
        except GeoValidationError as exc:
            raise ValueError(str(exc)) from exc

    @field_validator("name")
    @classmethod
    def _check_name(cls, v):
        if v is None:
            return v
        v2 = v.strip()
        if not v2:
            raise ValueError("name must not be blank")
        return v2


class HuntLocationAsset(BaseModel):
    """Canonical persisted shape returned by the API."""

    asset_id: str
    user_id: str
    hunt_id: str
    type: HuntLocationAssetType
    name: str
    latitude: float
    longitude: float
    notes: Optional[str] = None
    created_at: str
    updated_at: str

    @classmethod
    def new_from_create(
        cls, *, user_id: str, payload: HuntLocationAssetCreate
    ) -> "HuntLocationAsset":
        """Mint a HuntLocationAsset from a create payload.

        Used by the router to centralise id minting + timestamping so
        the same logic runs in tests.
        """
        now = _now_iso()
        return cls(
            asset_id=payload.asset_id or f"hla_{uuid.uuid4().hex}",
            user_id=user_id,
            hunt_id=payload.hunt_id,
            type=payload.type,
            name=payload.name,
            latitude=payload.latitude,
            longitude=payload.longitude,
            notes=payload.notes,
            created_at=now,
            updated_at=now,
        )


def asset_doc_to_dict(doc: dict) -> dict:
    """Strip Mongo `_id` and return a JSON-safe shape.

    Defensive about missing fields so legacy / partial documents (if
    any ever land in the collection through migrations) don't crash
    the read path.
    """
    if not doc:
        return doc
    out = {k: v for k, v in doc.items() if k != "_id"}
    for key in ("created_at", "updated_at"):
        v = out.get(key)
        if isinstance(v, datetime):
            out[key] = v.isoformat()
    return out


__all__ = [
    "HUNT_LOCATION_ASSET_TYPES",
    "HuntLocationAssetType",
    "HuntLocationAssetCreate",
    "HuntLocationAssetUpdate",
    "HuntLocationAsset",
    "asset_doc_to_dict",
]
