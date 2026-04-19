// Raven Scout — Tests for cloud presign client + cloudConfig plumbing.
//
// The CloudMediaStore itself depends on `expo-file-system/legacy`
// which only loads inside a real Expo runtime. These tests cover the
// pure network / config code paths that drive it: the fetch contract,
// auth wiring, and error handling.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  configureCloudMedia,
  getAuthToken,
  getBackendBaseUrl,
  isCloudMediaDisabled,
  _resetCloudConfigForTests,
} from '../cloudConfig';
import {
  CloudMediaUnavailableError,
  requestPresignUpload,
  requestPresignDownload,
  requestCloudDelete,
} from '../adapters/cloudPresignClient';

// ---- fetch mock plumbing ----
type FetchHandler = (url: string, init: RequestInit) => Response | Promise<Response>;

function installFetch(handler: FetchHandler) {
  const originalFetch = (globalThis as any).fetch;
  (globalThis as any).fetch = async (url: string, init: RequestInit) =>
    handler(url, init || {});
  return () => {
    (globalThis as any).fetch = originalFetch;
  };
}

function jsonResponse(status: number, body: any): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function textResponse(status: number, text: string): Response {
  return new Response(text, { status });
}

function wireAuth(token: string | null, baseUrl = 'https://test.example.com') {
  configureCloudMedia({
    baseUrl,
    getToken: () => token,
    disabled: false,
  });
}

// ============================== cloudConfig ==============================

test('cloudConfig — default token provider reads null when AsyncStorage empty', async () => {
  _resetCloudConfigForTests();
  const t = await getAuthToken();
  assert.equal(t, null);
});

test('cloudConfig — configureCloudMedia wires base url + token provider', async () => {
  _resetCloudConfigForTests();
  configureCloudMedia({ baseUrl: 'https://foo.example', getToken: () => 'tok-123' });
  assert.equal(getBackendBaseUrl(), 'https://foo.example');
  assert.equal(await getAuthToken(), 'tok-123');
});

test('cloudConfig — token provider returning null/undefined resolves to null', async () => {
  _resetCloudConfigForTests();
  configureCloudMedia({ getToken: () => null });
  assert.equal(await getAuthToken(), null);
  configureCloudMedia({ getToken: () => undefined as any });
  assert.equal(await getAuthToken(), null);
});

test('cloudConfig — token provider that throws is swallowed', async () => {
  _resetCloudConfigForTests();
  configureCloudMedia({ getToken: () => { throw new Error('boom'); } });
  const t = await getAuthToken();
  assert.equal(t, null);
});

test('cloudConfig — disabled flag is honored', () => {
  _resetCloudConfigForTests();
  assert.equal(isCloudMediaDisabled(), false);
  configureCloudMedia({ disabled: true });
  assert.equal(isCloudMediaDisabled(), true);
  configureCloudMedia({ disabled: false });
  assert.equal(isCloudMediaDisabled(), false);
});

// ============================== requestPresignUpload ==============================

test('presign-upload — throws CloudMediaUnavailableError when not authenticated', async () => {
  _resetCloudConfigForTests();
  configureCloudMedia({ baseUrl: 'https://api.example', getToken: () => null });
  await assert.rejects(
    () => requestPresignUpload({
      imageId: 'img_1', role: 'primary', mime: 'image/jpeg', extension: 'jpg',
    }),
    (e: any) => e instanceof CloudMediaUnavailableError,
  );
});

test('presign-upload — throws when backend base url is missing', async () => {
  _resetCloudConfigForTests();
  configureCloudMedia({ baseUrl: '', getToken: () => 'tok' });
  await assert.rejects(
    () => requestPresignUpload({
      imageId: 'img_1', role: 'primary', mime: 'image/jpeg', extension: 'jpg',
    }),
    (e: any) => e instanceof CloudMediaUnavailableError,
  );
});

test('presign-upload — hits /api/media/presign-upload with auth + json body', async () => {
  _resetCloudConfigForTests();
  wireAuth('tok-42');

  let capturedUrl = '';
  let capturedInit: RequestInit = {};
  const restore = installFetch((url, init) => {
    capturedUrl = url;
    capturedInit = init;
    return jsonResponse(200, {
      uploadUrl: 'https://s3.example/put',
      assetUrl: 'https://cdn.example/hunts/u1/h1/primary/img_1.jpg',
      storageKey: 'hunts/u1/h1/primary/img_1.jpg',
      expiresIn: 900,
      privateDelivery: false,
      mime: 'image/jpeg',
    });
  });
  try {
    const out = await requestPresignUpload({
      imageId: 'img_1', huntId: 'h1', role: 'primary', mime: 'image/jpeg', extension: 'jpg',
    });
    assert.equal(capturedUrl, 'https://test.example.com/api/media/presign-upload');
    assert.equal((capturedInit.headers as any).Authorization, 'Bearer tok-42');
    assert.equal((capturedInit.headers as any)['Content-Type'], 'application/json');
    const parsed = JSON.parse(capturedInit.body as string);
    assert.equal(parsed.imageId, 'img_1');
    assert.equal(parsed.huntId, 'h1');
    assert.equal(parsed.role, 'primary');
    assert.equal(out.storageKey, 'hunts/u1/h1/primary/img_1.jpg');
    assert.equal(out.privateDelivery, false);
  } finally { restore(); }
});

test('presign-upload — propagates server error with status', async () => {
  _resetCloudConfigForTests();
  wireAuth('tok');
  const restore = installFetch(() => textResponse(503, 'Cloud media storage is not configured'));
  try {
    await assert.rejects(
      () => requestPresignUpload({
        imageId: 'img_1', role: 'primary', mime: 'image/jpeg', extension: 'jpg',
      }),
      (e: any) => /503/.test(e.message) && /not configured/i.test(e.message),
    );
  } finally { restore(); }
});

// ============================== requestPresignDownload ==============================

test('presign-download — returns downloadUrl on 200', async () => {
  _resetCloudConfigForTests();
  wireAuth('tok');
  const restore = installFetch(() =>
    jsonResponse(200, { downloadUrl: 'https://s3.example/signed-get', expiresIn: 3600 }),
  );
  try {
    const url = await requestPresignDownload('hunts/u1/h1/primary/img_1.jpg');
    assert.equal(url, 'https://s3.example/signed-get');
  } finally { restore(); }
});

test('presign-download — throws on non-200', async () => {
  _resetCloudConfigForTests();
  wireAuth('tok');
  const restore = installFetch(() => textResponse(403, 'forbidden'));
  try {
    await assert.rejects(
      () => requestPresignDownload('some/key.jpg'),
      (e: any) => /403/.test(e.message),
    );
  } finally { restore(); }
});

// ============================== requestCloudDelete ==============================

test('delete — success=true when backend returns success:true', async () => {
  _resetCloudConfigForTests();
  wireAuth('tok');
  const restore = installFetch(() => jsonResponse(200, { success: true }));
  try {
    assert.equal(await requestCloudDelete('k1'), true);
  } finally { restore(); }
});

test('delete — returns false when backend returns success:false', async () => {
  _resetCloudConfigForTests();
  wireAuth('tok');
  const restore = installFetch(() => jsonResponse(200, { success: false, reason: 'S3 not configured' }));
  try {
    assert.equal(await requestCloudDelete('k1'), false);
  } finally { restore(); }
});

test('delete — returns false when fetch throws (network error)', async () => {
  _resetCloudConfigForTests();
  wireAuth('tok');
  const restore = installFetch(() => { throw new Error('network down'); });
  try {
    assert.equal(await requestCloudDelete('k1'), false);
  } finally { restore(); }
});

test('delete — returns false when not authenticated (no token)', async () => {
  _resetCloudConfigForTests();
  configureCloudMedia({ baseUrl: 'https://api.example', getToken: () => null });
  // Should NOT throw — delete swallows unavailability.
  assert.equal(await requestCloudDelete('k1'), false);
});

// ============================== storage-key shape invariant ==============================
// The exact key is computed server-side, but we verify the client
// forwards the fields the server needs to construct
// `hunts/{userId}/{huntId}/{role}/{imageId}.{ext}`.

test('presign-upload — forwards all key components to the server', async () => {
  _resetCloudConfigForTests();
  wireAuth('tok');
  let capturedBody: any = null;
  const restore = installFetch((_url, init) => {
    capturedBody = JSON.parse(init.body as string);
    return jsonResponse(200, {
      uploadUrl: 'x', assetUrl: 'y', storageKey: 'z',
      expiresIn: 900, privateDelivery: true, mime: 'image/jpeg',
    });
  });
  try {
    await requestPresignUpload({
      imageId: 'img_xyz',
      huntId: 'hunt_abc',
      role: 'thumbnail',
      mime: 'image/jpeg',
      extension: 'jpg',
    });
    // Server will build key from these — confirm every component is present.
    for (const k of ['imageId', 'huntId', 'role', 'mime', 'extension']) {
      assert.ok(capturedBody[k], `missing ${k} in presign request body`);
    }
  } finally { restore(); }
});
