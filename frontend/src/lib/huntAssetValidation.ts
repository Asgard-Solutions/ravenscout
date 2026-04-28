// Pure-function validation for the New Hunt "Known Hunt Locations"
// form (Task 4). Lives in src/lib so node:test unit tests can import
// it without dragging in React Native.
//
// Mirrors backend/geo_validation.py + the Pydantic model in
// backend/models/hunt_location_asset.py:
//   - type required (one of HUNT_LOCATION_ASSET_TYPES)
//   - name required, non-blank, max 120 chars
//   - latitude  required, finite, ∈ [-90, 90]
//   - longitude required, finite, ∈ [-180, 180]
//   - notes optional

import {
  HUNT_LOCATION_ASSET_TYPES,
  type HuntLocationAssetType,
  isValidLatitude,
  isValidLongitude,
} from '../types/geo';

export interface AssetFormState {
  type: HuntLocationAssetType;
  name: string;
  latitude: string;
  longitude: string;
  notes: string;
}

export interface AssetFormErrors {
  type?: string;
  name?: string;
  latitude?: string;
  longitude?: string;
}

export function validateAssetForm(form: AssetFormState): AssetFormErrors {
  const errors: AssetFormErrors = {};

  if (!form.type || !HUNT_LOCATION_ASSET_TYPES.includes(form.type)) {
    errors.type = 'Type is required';
  }

  const name = (form.name || '').trim();
  if (!name) {
    errors.name = 'Name is required';
  } else if (name.length > 120) {
    errors.name = 'Name must be 120 characters or fewer';
  }

  const latRaw = (form.latitude || '').trim();
  if (!latRaw) {
    errors.latitude = 'Latitude is required';
  } else {
    const lat = Number(latRaw);
    if (!Number.isFinite(lat)) {
      errors.latitude = 'Latitude must be a number';
    } else if (!isValidLatitude(lat)) {
      errors.latitude = 'Latitude must be between -90 and 90';
    }
  }

  const lngRaw = (form.longitude || '').trim();
  if (!lngRaw) {
    errors.longitude = 'Longitude is required';
  } else {
    const lng = Number(lngRaw);
    if (!Number.isFinite(lng)) {
      errors.longitude = 'Longitude must be a number';
    } else if (!isValidLongitude(lng)) {
      errors.longitude = 'Longitude must be between -180 and 180';
    }
  }

  return errors;
}
