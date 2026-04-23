// ===================================================================
// RavenSpinner — frame-based animated loading spinner
// ===================================================================
// Replaces the generic <ActivityIndicator> in Raven Scout's large
// loading states (analyze-hunt, initial app boot, results hydrate,
// auth handoff). Cycles through N pre-rendered PNG frames of a
// raven circling a dashed path, giving the wait a branded feel.
//
// WHY FRAME ANIMATION (not CSS rotate):
// A single rotating image would spin the raven silhouette in place,
// which looks wrong — the bird needs to TRANSLATE around a
// stationary dashed orbit. Each frame is a pre-composed snapshot
// of the bird at a different position on the orbit, so swapping
// them in sequence reads as circular flight.
//
// MEMORY / RENDER STRATEGY:
// All frames are rendered simultaneously with absolute positioning,
// and we toggle `opacity: 1` on just the active frame. This:
//   - avoids mount/unmount flicker when switching (decoded bitmaps
//     stay warm in the RN Image cache)
//   - keeps layout dimensions stable regardless of frame index
//   - costs ~zero extra RAM once frames are decoded (4 × 500KB
//     PNGs ~= 2MB bitmap, negligible next to the primary hunt
//     image)
//
// TIMER STRATEGY:
// setInterval(frameDuration). When the component unmounts the
// interval is cleared. No requestAnimationFrame because we want a
// fixed cadence regardless of display refresh rate — too-smooth
// interpolation would look wrong with only 4-8 discrete frames.
// ===================================================================

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, StyleSheet, View, type ImageSourcePropType } from 'react-native';

// Static requires so Metro bundles each PNG into the production
// APK / IPA. DO NOT switch to a dynamic require — that breaks EAS
// asset resolution.
const FRAMES: ImageSourcePropType[] = [
  require('../../assets/images/spinner/1.png'),
  require('../../assets/images/spinner/2.png'),
  require('../../assets/images/spinner/3.png'),
  require('../../assets/images/spinner/4.png'),
  // 5-8 will slot in here automatically if you drop them in
  // /app/frontend/assets/images/spinner/ and uncomment these lines:
  // require('../../assets/images/spinner/5.png'),
  // require('../../assets/images/spinner/6.png'),
  // require('../../assets/images/spinner/7.png'),
  // require('../../assets/images/spinner/8.png'),
];

export interface RavenSpinnerProps {
  /** Width & height in px. Default 120 — matches the large
   * ActivityIndicator footprint the old spinner occupied. */
  size?: number;
  /** ms per frame. Default 100 — with 8 frames that gives a full
   * orbit every 800ms (spec-recommended). Lower (80ms) = faster
   * pulse; higher (120ms) = more contemplative. */
  frameDuration?: number;
  /** Pass false to freeze on the current frame. Useful if you
   * eventually want to fade in/out without stopping the loop. */
  playing?: boolean;
  /** Accessibility label. */
  accessibilityLabel?: string;
  /** Extra style overrides (rare — `size` usually covers it). */
  style?: any;
}

export function RavenSpinner({
  size = 120,
  frameDuration = 100,
  playing = true,
  accessibilityLabel = 'Loading',
  style,
}: RavenSpinnerProps) {
  const [frameIdx, setFrameIdx] = useState(0);
  // Ref so the interval callback always reads the current length
  // without re-subscribing when FRAMES changes at module level.
  const frameCountRef = useRef(FRAMES.length);

  useEffect(() => {
    if (!playing || FRAMES.length <= 1) return;
    const id = setInterval(() => {
      setFrameIdx(prev => (prev + 1) % frameCountRef.current);
    }, Math.max(30, frameDuration));
    return () => clearInterval(id);
  }, [playing, frameDuration]);

  const containerStyle = useMemo(
    () => [styles.container, { width: size, height: size }, style],
    [size, style],
  );

  return (
    <View
      style={containerStyle}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      // iOS VoiceOver / Android TalkBack cue that this is indefinite.
      accessibilityState={{ busy: true }}
    >
      {FRAMES.map((src, i) => (
        <Image
          key={i}
          source={src}
          style={[
            styles.frame,
            {
              width: size,
              height: size,
              opacity: i === frameIdx ? 1 : 0,
            },
          ]}
          // 'contain' preserves the transparent padding around the
          // orbit so every frame lines up pixel-perfect.
          resizeMode="contain"
          // Don't fade — we want a sharp frame swap.
          fadeDuration={0}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    // Reserve space at fixed width/height so surrounding text /
    // buttons never reflow as frames swap.
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
});

export default RavenSpinner;
