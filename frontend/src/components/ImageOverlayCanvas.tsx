// Raven Scout — ImageOverlayCanvas
//
// Renders the analyzed map image and its overlay markers inside a
// single transformed container, so pinch-to-zoom and pan share the
// exact same transform matrix. Overlays stay pixel-perfect aligned
// with the underlying image at any scale or offset.
//
// Design rules:
//   1. Overlay anchors live in IMAGE-SPACE (x_percent, y_percent of
//      the natural image). Children are absolute-positioned within
//      an inner View whose rect EXACTLY matches the rendered image
//      rect (letterbox-aware) — so at scale=1 they sit on the exact
//      pixel they were anchored to, regardless of container aspect.
//   2. We use `react-native-gesture-handler` (v2) `Gesture.Pinch`
//      and `Gesture.Pan` composed simultaneously, with
//      `react-native-reanimated` shared values for transform.
//   3. Pan/zoom is OPT-IN via the `enableZoom` prop. When a caller
//      is in edit-mode (dragging markers), enable=false keeps the
//      canvas at scale=1, so existing PanResponder-driven marker
//      dragging behaves predictably.
//   4. A double-tap resets the transform.
//   5. When `overlayStatus === 'stale'` we tint a banner on top so
//      the user knows the overlay is tied to a different image
//      basis and should re-analyze.
//   6. Image is rendered with `resizeMode="contain"` — the full
//      analyzed image is ALWAYS visible. Letterbox padding (if any)
//      is drawn as container background; markers never land on it.
//
// Coordinate contract: see src/utils/imageFit.ts.

import React, { useImperativeHandle, forwardRef, useCallback, useMemo, useEffect, useState } from 'react';
import { Image, Platform, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';

import { COLORS } from '../constants/theme';
import { computeFittedImageRect } from '../utils/imageFit';
import { logClientEvent } from '../utils/clientLog';

/**
 * Convert a base64 data URI to a blob URL. On web, this lets the
 * browser hold the image as a separate binary blob instead of
 * retaining a ~2MB string on the JS heap. The caller is responsible
 * for revoking the blob URL when the component unmounts.
 *
 * Returns `null` when the input isn't a data URI we can parse, so
 * the caller can fall back to using the original string.
 *
 * Safe on native (returns null — `URL.createObjectURL` /
 * `atob` aren't available in Hermes/JSC without polyfills). Native
 * builds keep using the data URI directly, which works fine there
 * because iOS/Android bitmap decoders don't compete with a small
 * browser tab heap.
 */
function dataUriToBlobUrl(dataUri: string): string | null {
  if (typeof URL === 'undefined' || typeof (URL as any).createObjectURL !== 'function') {
    return null;
  }
  if (typeof atob !== 'function') return null;
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUri);
  if (!m) return null;
  try {
    const mime = m[1];
    const b64 = m[2];
    const binary = atob(b64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: mime });
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

export interface ImageOverlayCanvasProps {
  imageUri: string | null;
  /** Outer container size (fixed). */
  width: number;
  height: number;
  /**
   * Natural dimensions of the ANALYZED image (the image the LLM
   * saw). When provided, the image is rendered with contain
   * letterboxing and overlay children are laid out inside the
   * fitted rect — keeping x_percent/y_percent aligned to real image
   * pixels. When omitted / 0, we degrade to full-container layout
   * (legacy hunts lack these dims).
   */
  imageNaturalWidth?: number;
  imageNaturalHeight?: number;
  /** Overlay markers/decoration children rendered in image-space. */
  children?: React.ReactNode;
  /** Enable pinch / pan / double-tap-to-reset. Defaults to true. */
  enableZoom?: boolean;
  /** 'stale' renders a subtle warning banner across the top. */
  overlayStatus?: 'valid' | 'stale';
  /**
   * Called when the user taps the canvas (in image-space percent).
   * Only fires when `enableZoom` is false, so marker-add flows work
   * predictably at scale=1. Coordinates are clamped to [0,100]; taps
   * in the letterbox padding are rejected (callback not fired).
   */
  onTapImageSpace?: (xPct: number, yPct: number) => void;
  /** Fallback block (e.g. TacticalMapView) when imageUri is null. */
  fallback?: React.ReactNode;
  /** Accessibility / test id. */
  testID?: string;
}

export interface ImageOverlayCanvasHandle {
  resetTransform: () => void;
}

const MIN_SCALE = 1;
const MAX_SCALE = 5;

export const ImageOverlayCanvas = forwardRef<
  ImageOverlayCanvasHandle,
  ImageOverlayCanvasProps
>(function ImageOverlayCanvas(
  {
    imageUri,
    width,
    height,
    imageNaturalWidth,
    imageNaturalHeight,
    children,
    enableZoom = true,
    overlayStatus = 'valid',
    onTapImageSpace,
    fallback,
    testID,
  },
  ref,
) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  // Single canonical fitted rect — used for both the image and its
  // child overlays so they share the exact same coordinate space.
  const fitted = useMemo(
    () =>
      computeFittedImageRect(
        width,
        height,
        imageNaturalWidth ?? 0,
        imageNaturalHeight ?? 0,
      ),
    [width, height, imageNaturalWidth, imageNaturalHeight],
  );

  const resetTransform = useCallback(() => {
    scale.value = withTiming(1);
    savedScale.value = 1;
    translateX.value = withTiming(0);
    translateY.value = withTiming(0);
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  }, [scale, savedScale, translateX, translateY, savedTranslateX, savedTranslateY]);

  useImperativeHandle(ref, () => ({ resetTransform }), [resetTransform]);

  // On web: convert the base64 data URI into a blob URL so the
  // browser doesn't have to keep re-parsing a ~2MB string every
  // render. A single conversion up-front + URL.createObjectURL lets
  // the underlying base64 be GC'd, and the <img> element can stream
  // the binary blob directly without the synchronous decode spike
  // that was OOM-killing mobile Chrome on /results.
  //
  // On native (iOS/Android) the browser globals aren't available
  // and the data URI works fine — bitmap decoding there doesn't
  // fight for the same tiny JS heap. dataUriToBlobUrl returns
  // null on native so we fall through to the original uri.
  const [webBlobUri, setWebBlobUri] = useState<string | null>(null);
  useEffect(() => {
    if (Platform.OS !== 'web' || !imageUri) {
      setWebBlobUri(null);
      return;
    }
    // Pass-through for already-blob / http URIs.
    if (!imageUri.startsWith('data:')) {
      setWebBlobUri(null);
      return;
    }
    const url = dataUriToBlobUrl(imageUri);
    if (url) {
      setWebBlobUri(url);
      logClientEvent({
        event: 'overlay_image_blob_created',
        data: { bytes: imageUri.length },
      });
    } else {
      setWebBlobUri(null);
    }
    return () => {
      if (url && typeof URL !== 'undefined' && typeof (URL as any).revokeObjectURL === 'function') {
        try { URL.revokeObjectURL(url); } catch {}
      }
    };
  }, [imageUri]);

  // On web: NEVER pass the raw base64 data URI to <Image>. React
  // Native Web synchronously decodes the whole bitmap on first paint
  // and that's what's been OOM-killing mobile Chrome. Instead we
  // render a placeholder rect until `webBlobUri` is ready (one React
  // tick after mount), then swap to the blob URL which the browser
  // can stream without a blocking decode.
  //
  // On native (iOS/Android), the original data URI is fine — the
  // native bitmap decoder runs off the JS heap and competes with a
  // much larger address space, not a tiny mobile-web tab.
  const effectiveUri = Platform.OS === 'web' ? webBlobUri : imageUri;

  // Clamp transforms so the image can't be panned completely out of view.
  const clampTranslate = (tx: number, ty: number, s: number) => {
    'worklet';
    const maxX = (width * (s - 1)) / 2;
    const maxY = (height * (s - 1)) / 2;
    const cx = Math.max(-maxX, Math.min(maxX, tx));
    const cy = Math.max(-maxY, Math.min(maxY, ty));
    return { cx, cy };
  };

  // ---- Gestures -----------------------------------------------------
  const pinch = Gesture.Pinch()
    .enabled(enableZoom)
    .onUpdate(e => {
      const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, savedScale.value * e.scale));
      scale.value = next;
      const { cx, cy } = clampTranslate(translateX.value, translateY.value, next);
      translateX.value = cx;
      translateY.value = cy;
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
      // If we snapped back to 1.0, clear the translate drift.
      if (scale.value <= MIN_SCALE + 0.001) {
        scale.value = withTiming(1);
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedScale.value = 1;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      }
    });

  const pan = Gesture.Pan()
    .enabled(enableZoom)
    .minPointers(1)
    .maxPointers(2)
    .averageTouches(true)
    // Only enter pan when we're zoomed in — at scale=1 this would
    // otherwise fight with vertical ScrollView scrolling.
    .activateAfterLongPress(0)
    .onStart(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    })
    .onUpdate(e => {
      if (scale.value <= MIN_SCALE + 0.001) return;
      const { cx, cy } = clampTranslate(
        savedTranslateX.value + e.translationX,
        savedTranslateY.value + e.translationY,
        scale.value,
      );
      translateX.value = cx;
      translateY.value = cy;
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const doubleTap = Gesture.Tap()
    .enabled(enableZoom)
    .numberOfTaps(2)
    .onStart(() => {
      scale.value = withTiming(1);
      translateX.value = withTiming(0);
      translateY.value = withTiming(0);
      savedScale.value = 1;
      savedTranslateX.value = 0;
      savedTranslateY.value = 0;
    });

  // Single-tap to image-space — only active when zoom is disabled
  // (so marker-add flows work at scale=1 as the old code expects).
  // Taps inside the fitted-image rect are forwarded as percent of
  // that rect (NOT the container); taps in the letterbox pad are
  // dropped so users can't add markers onto blank background.
  const tap = Gesture.Tap()
    .enabled(!!onTapImageSpace && !enableZoom)
    .numberOfTaps(1)
    .onEnd(e => {
      const localX = e.x - fitted.offsetX;
      const localY = e.y - fitted.offsetY;
      if (
        localX < 0 || localX > fitted.width ||
        localY < 0 || localY > fitted.height ||
        fitted.width <= 0 || fitted.height <= 0
      ) {
        return;
      }
      const xPct = (localX / fitted.width) * 100;
      const yPct = (localY / fitted.height) * 100;
      if (onTapImageSpace) runOnJS(onTapImageSpace)(xPct, yPct);
    });

  const composed = Gesture.Race(
    doubleTap,
    Gesture.Simultaneous(pinch, pan),
    tap,
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <View
      testID={testID}
      style={[styles.viewport, { width, height }]}
      pointerEvents="box-none"
    >
      <GestureDetector gesture={composed}>
        <Animated.View
          style={[styles.transformed, { width, height }, animatedStyle]}
        >
          {imageUri ? (
            // Inner letterbox-aware rect. EVERY child (image + markers)
            // positions against THIS rect, so overlay
            // `x_percent/y_percent` land on the exact image pixels
            // the LLM anchored them to.
            <View
              testID="overlay-canvas-fitted-rect"
              style={{
                position: 'absolute',
                left: fitted.offsetX,
                top: fitted.offsetY,
                width: fitted.width,
                height: fitted.height,
              }}
              pointerEvents="box-none"
            >
              {effectiveUri ? (
                <Image
                  source={{ uri: effectiveUri }}
                  style={{ width: fitted.width, height: fitted.height }}
                  // `contain` would add its OWN internal letterbox if
                  // the aspect drifted — but because the inner rect is
                  // already sized to the image's aspect, any resizeMode
                  // paints edge-to-edge. 'cover' is explicitly chosen
                  // here so a 1-pixel rounding mismatch never leaves a
                  // visible gap line at the rect edge.
                  resizeMode="cover"
                  onLoad={() =>
                    logClientEvent({
                      event: 'overlay_image_loaded',
                      data: {
                        via: Platform.OS === 'web' && webBlobUri ? 'blob_url' : 'data_uri',
                        width: fitted.width,
                        height: fitted.height,
                      },
                    })
                  }
                  onError={(e: any) =>
                    logClientEvent({
                      event: 'overlay_image_error',
                      data: {
                        via: Platform.OS === 'web' && webBlobUri ? 'blob_url' : 'data_uri',
                        error: e?.nativeEvent?.error || String(e),
                      },
                    })
                  }
                />
              ) : (
                // Brief placeholder while blob URL is being minted on
                // web. Avoids passing a null URI to Image (undefined
                // behavior on some RN Web versions).
                <View
                  testID="overlay-image-placeholder"
                  style={{
                    width: fitted.width,
                    height: fitted.height,
                    backgroundColor: COLORS.primary,
                  }}
                />
              )}
              {/* Overlay markers — parent is the fitted rect, so
                  `x_percent/y_percent` mapping is naturally correct. */}
              {children}
            </View>
          ) : (
            fallback
          )}
        </Animated.View>
      </GestureDetector>

      {overlayStatus === 'stale' && (
        <View style={styles.staleBanner} pointerEvents="none">
          <Text style={styles.staleBannerText}>
            OVERLAY STALE — IMAGE BASIS CHANGED. Re-analyze to refresh.
          </Text>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  viewport: {
    overflow: 'hidden',
    borderRadius: 8,
    backgroundColor: COLORS.primary,
  },
  transformed: {
    position: 'relative',
  },
  staleBanner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(200, 90, 90, 0.88)',
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  staleBannerText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
});

export default ImageOverlayCanvas;
