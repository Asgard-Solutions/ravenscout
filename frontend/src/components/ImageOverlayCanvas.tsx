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
//      the Animated container that has the image's display size —
//      i.e. at scale=1 their on-screen pixel position matches the
//      image exactly. When the container scales, both image and
//      anchors scale together. No screen-space math required.
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

import React, { useImperativeHandle, forwardRef, useCallback } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';

import { COLORS } from '../constants/theme';

export interface ImageOverlayCanvasProps {
  imageUri: string | null;
  width: number;
  height: number;
  /** Overlay markers/decoration children rendered in image-space. */
  children?: React.ReactNode;
  /** Enable pinch / pan / double-tap-to-reset. Defaults to true. */
  enableZoom?: boolean;
  /** 'stale' renders a subtle warning banner across the top. */
  overlayStatus?: 'valid' | 'stale';
  /**
   * Called when the user taps the canvas (in image-space percent).
   * Only fires when `enableZoom` is false, so marker-add flows work
   * predictably at scale=1.
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

  const resetTransform = useCallback(() => {
    scale.value = withTiming(1);
    savedScale.value = 1;
    translateX.value = withTiming(0);
    translateY.value = withTiming(0);
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  }, [scale, savedScale, translateX, translateY, savedTranslateX, savedTranslateY]);

  useImperativeHandle(ref, () => ({ resetTransform }), [resetTransform]);

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
  const tap = Gesture.Tap()
    .enabled(!!onTapImageSpace && !enableZoom)
    .numberOfTaps(1)
    .onEnd(e => {
      const xPct = (e.x / width) * 100;
      const yPct = (e.y / height) * 100;
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
            <Image
              source={{ uri: imageUri }}
              style={{ width, height }}
              resizeMode="cover"
            />
          ) : (
            fallback
          )}
          {/* Overlay markers — same transformed parent → perfectly aligned */}
          {children}
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
    backgroundColor: COLORS.void,
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
