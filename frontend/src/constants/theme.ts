import { StyleSheet } from 'react-native';

export const COLORS = {
  primary: '#0B1F2A',
  secondary: '#3A4A52',
  accent: '#C89B3C',
  white: '#FFFFFF',
  textPrimary: '#FFFFFF',
  textSecondary: '#9AA4A9',
  textMuted: '#5D4037',
  earthBrown: '#5D4037',
  oliveDrab: '#556B2F',
  fogGray: '#9AA4A9',
  // Overlay colors
  stands: '#2E7D32',
  corridors: '#F57C00',
  accessRoutes: '#42A5F5',
  avoidZones: '#C62828',
  // Utility
  error: '#C62828',
  success: '#2E7D32',
  cardBg: 'rgba(58, 74, 82, 0.5)',
  cardBorder: 'rgba(154, 164, 169, 0.3)',
  // Custom markers
  bedding: '#8D6E63',
  food: '#66BB6A',
  water: '#29B6F6',
  trail: '#FFCA28',
};

export const CUSTOM_MARKER_TYPES = [
  { id: 'stand', label: 'Stand / Blind', icon: 'pin', color: '#2E7D32' },
  { id: 'corridor', label: 'Travel Corridor', icon: 'trail-sign', color: '#F57C00' },
  { id: 'access_route', label: 'Access Route', icon: 'walk', color: '#42A5F5' },
  { id: 'avoid', label: 'Avoid Zone', icon: 'warning', color: '#C62828' },
  { id: 'bedding', label: 'Bedding Area', icon: 'bed', color: '#8D6E63' },
  { id: 'food', label: 'Food Source', icon: 'nutrition', color: '#66BB6A' },
  { id: 'water', label: 'Water Source', icon: 'water', color: '#29B6F6' },
  { id: 'trail', label: 'Trail / Path', icon: 'footsteps', color: '#FFCA28' },
];

// Legacy hardcoded species list — superseded by /api/species +
// `src/constants/species.tsx`. Kept here so older imports keep
// working, but new screens should use `useSpeciesCatalog()` instead.
export const SPECIES = [
  {
    id: 'deer',
    name: 'Whitetail Deer',
    emoji: '',
    description: 'Bedding-to-feeding transitions.\nFunnels, saddles & edges.',
  },
  {
    id: 'turkey',
    name: 'Wild Turkey',
    emoji: '',
    description: 'Roost-to-strut zones.\nOpen areas near cover.',
  },
  {
    id: 'hog',
    name: 'Wild Hog',
    emoji: '',
    description: 'Water, thick cover & trails.\nDusk/dawn ambush points.',
  },
];

export const WIND_DIRECTIONS = [
  'N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'
];

export const TIME_WINDOWS = [
  { id: 'morning', label: 'Morning', subtitle: 'Dawn - Midday' },
  { id: 'evening', label: 'Evening', subtitle: 'Midday - Dusk' },
  { id: 'all-day', label: 'All Day', subtitle: 'Full Coverage' },
];

export const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export const commonStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.primary,
  },
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.primary,
  },
  button: {
    backgroundColor: COLORS.accent,
    borderRadius: 8,
    paddingVertical: 16,
    paddingHorizontal: 24,
    minHeight: 56,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  buttonText: {
    color: COLORS.primary,
    fontSize: 16,
    fontWeight: '700' as const,
    letterSpacing: 1.2,
    textTransform: 'uppercase' as const,
  },
  secondaryButton: {
    backgroundColor: COLORS.secondary,
    borderRadius: 8,
    paddingVertical: 16,
    paddingHorizontal: 24,
    minHeight: 56,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  secondaryButtonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '600' as const,
    letterSpacing: 1,
  },
  card: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: 16,
  },
  heading: {
    color: COLORS.textPrimary,
    fontSize: 28,
    fontWeight: '800' as const,
    letterSpacing: -0.5,
  },
  subheading: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '500' as const,
    letterSpacing: 0.5,
  },
});
