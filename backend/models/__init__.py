"""Pydantic data models for Raven Scout.

Kept in their own package so server.py stays navigable and so other
modules (routers, tests, migrations) can import the canonical shapes
without reaching into a 2,000-line server file.
"""
from .hunt_location_asset import (  # noqa: F401
    HUNT_LOCATION_ASSET_TYPES,
    HuntLocationAsset,
    HuntLocationAssetCreate,
    HuntLocationAssetUpdate,
    HuntLocationAssetType,
    asset_doc_to_dict,
)
from .saved_map_image import (  # noqa: F401
    SAVED_MAP_IMAGE_SOURCES,
    SavedMapImage,
    SavedMapImageCreate,
    SavedMapImageUpdate,
    SavedMapImageSource,
    saved_map_image_doc_to_dict,
)
