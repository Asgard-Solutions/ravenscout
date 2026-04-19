// Raven Scout — Cloud media presign client.
//
// Thin fetch wrapper around the backend presign endpoints. No AWS
// SDKs on device, no credentials ever shipped to the client.
//
// The adapter (CloudMediaStore) calls these functions to:
//   - mint a short-lived PUT URL for a direct S3 upload
//   - mint a short-lived GET URL for private-bucket delivery
//   - request a best-effort cloud delete
//
// Auth token is pulled from cloudConfig (which defaults to reading
// `session_token` from AsyncStorage).

import { getAuthToken, getBackendBaseUrl } from '../cloudConfig';

export interface PresignUploadRequest {
  imageId: string;
  huntId?: string;
  role: string;
  mime: string;
  extension: string;
}

export interface PresignUploadResponse {
  uploadUrl: string;
  assetUrl: string;
  storageKey: string;
  expiresIn: number;
  privateDelivery: boolean;
  mime: string;
}

export interface PresignDownloadResponse {
  downloadUrl: string;
  expiresIn: number;
}

/** Thrown when the client can't even attempt the network call
 * (missing base URL / missing auth token). Caller should treat this
 * as a permanent failure for the current invocation. */
export class CloudMediaUnavailableError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'CloudMediaUnavailableError';
  }
}

async function authedFetch(
  path: string,
  init: RequestInit,
): Promise<Response> {
  const base = getBackendBaseUrl();
  if (!base) throw new CloudMediaUnavailableError('cloud: backend url not configured');
  const token = await getAuthToken();
  if (!token) throw new CloudMediaUnavailableError('cloud: not authenticated');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    ...((init.headers as Record<string, string>) || {}),
  };
  return fetch(`${base}${path}`, { ...init, headers });
}

export async function requestPresignUpload(
  body: PresignUploadRequest,
): Promise<PresignUploadResponse> {
  const resp = await authedFetch('/api/media/presign-upload', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const msg = await safeText(resp);
    throw new Error(`presign-upload ${resp.status}: ${msg}`);
  }
  return (await resp.json()) as PresignUploadResponse;
}

export async function requestPresignDownload(
  storageKey: string,
): Promise<string> {
  const resp = await authedFetch('/api/media/presign-download', {
    method: 'POST',
    body: JSON.stringify({ storageKey }),
  });
  if (!resp.ok) {
    throw new Error(`presign-download ${resp.status}`);
  }
  const data = (await resp.json()) as PresignDownloadResponse;
  return data.downloadUrl;
}

export async function requestCloudDelete(storageKey: string): Promise<boolean> {
  try {
    const resp = await authedFetch('/api/media/delete', {
      method: 'POST',
      body: JSON.stringify({ storageKey }),
    });
    if (!resp.ok) return false;
    const data = await resp.json().catch(() => null);
    return !!(data && data.success);
  } catch {
    return false;
  }
}

async function safeText(r: Response): Promise<string> {
  try {
    return (await r.text()) || r.statusText;
  } catch {
    return r.statusText || '';
  }
}
