import { Platform } from 'react-native';
import { GOOGLE_WEB_CLIENT_ID } from './config';

/**
 * "Continue with Google" is shown on Android when EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is set.
 * (Apple requires Sign in with Apple alongside any third-party login on iOS, so iOS uses email/password by default.)
 * The native module is loaded lazily so the app still runs in Expo Go / builds without it.
 * See PARAMETERS.md, section "Google sign-in", for the install steps.
 */
export const googleAvailable = Platform.OS === 'android' && !!GOOGLE_WEB_CLIENT_ID;

export async function getGoogleIdToken(): Promise<string | null> {
  let mod: any;
  try {
    mod = require('@react-native-google-signin/google-signin');
  } catch {
    throw new Error('Google sign-in is not included in this build.');
  }
  const { GoogleSignin } = mod;
  GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });
  await GoogleSignin.hasPlayServices();
  const res = await GoogleSignin.signIn();
  if (res?.type === 'cancelled') return null;
  return res?.data?.idToken ?? res?.idToken ?? null;
}
