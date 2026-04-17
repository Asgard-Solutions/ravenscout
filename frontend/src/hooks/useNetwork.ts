import { useState, useEffect, useCallback } from 'react';
import * as Network from 'expo-network';
import { Platform } from 'react-native';

export function useNetwork() {
  const [isConnected, setIsConnected] = useState(true);
  const [isChecking, setIsChecking] = useState(false);

  const checkConnection = useCallback(async () => {
    try {
      setIsChecking(true);
      // On web, expo-network may not work reliably — default to connected
      if (Platform.OS === 'web') {
        setIsConnected(navigator?.onLine ?? true);
        return;
      }
      const state = await Network.getNetworkStateAsync();
      setIsConnected(state.isConnected ?? true);
    } catch {
      // Default to connected if check fails
      setIsConnected(true);
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    checkConnection();
    const interval = setInterval(checkConnection, 15000);
    return () => clearInterval(interval);
  }, [checkConnection]);

  return { isConnected, isChecking, refresh: checkConnection };
}
