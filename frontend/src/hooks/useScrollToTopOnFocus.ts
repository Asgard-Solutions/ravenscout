// ===================================================================
// useScrollToTopOnFocus — reset a ScrollView back to y=0 every time
// the screen re-enters focus.
// ===================================================================
//
// WHY THIS EXISTS:
// Expo Router keeps screens in the component tree across navigation
// (it's a Stack under the hood), so when you navigate from /results
// back to /setup, /setup is re-focused but its ScrollView still
// remembers the scroll offset from the last visit. That produces
// the "I tapped back and landed halfway down the form" bug.
//
// USAGE:
//   const scrollRef = useRef<ScrollView>(null);
//   useScrollToTopOnFocus(scrollRef);
//   return <ScrollView ref={scrollRef}>...</ScrollView>;
//
// IMPLEMENTATION NOTE:
// We pass `animated: false` because the user just finished a
// navigation animation; adding a scroll animation on top feels
// twitchy. The jump is instant and happens during the focus tick,
// so users perceive it as "page loaded at top".
//
// Works with any component that exposes a `scrollTo({ y, animated })`
// method — so ScrollView, FlatList, and FlashList all work.

import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';

export interface ScrollableRef {
  scrollTo?: (options: { x?: number; y?: number; animated?: boolean }) => void;
  scrollToOffset?: (options: { offset: number; animated?: boolean }) => void;
  scrollToIndex?: (options: { index: number; animated?: boolean }) => void;
}

export function useScrollToTopOnFocus<T extends ScrollableRef>(
  ref: React.RefObject<T | null>,
) {
  useFocusEffect(
    useCallback(() => {
      // Tiny defer so the screen layout has settled before we
      // issue the scroll command. On Android in particular,
      // scrolling during the focus frame is sometimes ignored.
      const t = setTimeout(() => {
        const node: any = ref.current;
        if (!node) return;
        if (typeof node.scrollTo === 'function') {
          node.scrollTo({ x: 0, y: 0, animated: false });
        } else if (typeof node.scrollToOffset === 'function') {
          // FlashList / FlatList.
          node.scrollToOffset({ offset: 0, animated: false });
        }
      }, 0);
      return () => clearTimeout(t);
    }, [ref]),
  );
}
