import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../src/hooks/useAuth';
import { SpeciesCatalogProvider } from '../src/constants/species';
import { useWebBlocked, WebBlockerScreen } from '../src/components/WebBlocker';
import { initPurchases } from '../src/lib/purchases';
import { OrphanCleanupOnLaunch } from '../src/lib/useOrphanCleanupOnLaunch';

export default function RootLayout() {
  const webBlocked = useWebBlocked();

  // Configure RevenueCat once on app boot. No-op in Expo Go / web
  // because the SDK detects the missing native module and returns
  // false without crashing.
  useEffect(() => {
    initPurchases().catch(() => { /* swallow — wrapper already logs */ });
  }, []);

  if (webBlocked) {
    // Mobile-only product. Web visitors (except dev bypass) see the
    // install-the-app screen instead of the router tree.
    return (
      <SafeAreaProvider>
        <GestureHandlerRootView style={styles.container}>
          <StatusBar style="light" />
          <WebBlockerScreen />
        </GestureHandlerRootView>
      </SafeAreaProvider>
    );
  }

  // SafeAreaProvider MUST wrap the whole tree so that every screen
  // can call useSafeAreaInsets() / render the context-aware
  // <SafeAreaView>. Without this, RN-Android ignores safe-area
  // insets entirely and action buttons slide under the status bar /
  // gesture nav bar.
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <SpeciesCatalogProvider>
          {/* Pro-only background sweep of S3 objects that were
              presigned-uploaded but never committed to a saved hunt.
              Renders nothing; throttled to once per cold start with a
              6h floor backed by AsyncStorage. */}
          <OrphanCleanupOnLaunch />
          <GestureHandlerRootView style={styles.container}>
            <StatusBar style="light" />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: '#0B1F2A' },
                animation: 'fade',
              }}
            />
          </GestureHandlerRootView>
        </SpeciesCatalogProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B1F2A',
  },
});
