import { Platform } from 'react-native';
import { GOOGLE_WEB_CLIENT_ID } from './config';

/**
 * "Continue with Google" is shown on Android when EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is set.
 * (Apple requires Sign in with Apple alongside any third-party login on iOS, so iOS uses email/password by default.)
 * The native module is loaded lazily so the app still runs in Expo Go / builds without it.
 * See PARAMETERS.md, section "Google sign-in", for the install steps.
 */
export const googleAvailable = Platform.OS === 'android' && !!GOOGLE_WEB_CLIENT_ID;

export type GoogleProfile = {
  idToken: string;
  email: string;
  name: string;
  username: string;
  photo: string | null;
};

export async function getGoogleProfile(): Promise<GoogleProfile | null> {
  let mod: any;
  try {
    mod = require('@react-native-google-signin/google-signin');
  } catch {
    throw new Error('Google sign-in is not included in this build.');
  }
  const { GoogleSignin } = mod;
  GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const res = await GoogleSignin.signIn();
  if (res?.type === 'cancelled') return null;
  const user = res?.data?.user ?? res?.user;
  const idToken = res?.data?.idToken ?? res?.idToken ?? null;
  if (!user?.email || !idToken) return null;
  const name = user.name || `${user.givenName || ''} ${user.familyName || ''}`.trim() || user.email.split('@')[0];
  const username = user.email.split('@')[0].replace(/[^a-zA-Z0-9_.]/g, '').slice(0, 18) || 'user';
  return { idToken, email: user.email, name, username, photo: user.photo ?? null };
}

export async function getGoogleIdToken(): Promise<string | null> {
  return (await getGoogleProfile())?.idToken ?? null;
}
