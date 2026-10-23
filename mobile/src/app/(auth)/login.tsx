import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { getGoogleIdToken, googleAvailable } from '@/lib/google';
import { colors, space } from '@/lib/theme';
import { Button, Field } from '@/components/ui';

export default function Login() {
  const insets = useSafeAreaInsets();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!email.trim() || !password) return setError('Enter your email and password.');
    setLoading(true);
    setError(null);
    try {
      await signIn(await api.login({ email: email.trim(), password }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const google = async () => {
    setGoogleLoading(true);
    try {
      const idToken = await getGoogleIdToken();
      if (idToken) await signIn(await api.google(idToken));
    } catch (e) {
      Alert.alert('Google sign-in failed', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.container, { paddingTop: insets.top + 60 }]} keyboardShouldPersistTaps="handled">
        <Text style={styles.logo}>Clipzy</Text>
        <Text style={styles.tag}>Watch, create and share short videos.</Text>
        <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" textContentType="emailAddress" />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" textContentType="password" onSubmitEditing={submit} />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button title="Log in" onPress={submit} loading={loading} />
        {googleAvailable ? <Button title="Continue with Google" variant="secondary" onPress={google} loading={googleLoading} style={{ marginTop: space.md }} /> : null}
        <View style={styles.footer}>
          <Text style={styles.dim}>New here? </Text>
          <Link href="/register" style={styles.link}>Create an account</Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: space.xl, paddingBottom: 40 },
  logo: { color: colors.text, fontSize: 44, fontWeight: '800', textAlign: 'center' },
  tag: { color: colors.textDim, textAlign: 'center', marginBottom: 40, marginTop: 6 },
  error: { color: colors.danger, marginBottom: space.md },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 28 },
  dim: { color: colors.textDim },
  link: { color: colors.accent, fontWeight: '700' },
});
