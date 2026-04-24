import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../src/hooks/useAuth';
import { useWebBlocked, WebBlockerScreen } from '../src/components/WebBlocker';

export default function RootLayout() {
  const webBlocked = useWebBlocked();

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
