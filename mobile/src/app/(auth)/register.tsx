import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Link, router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, ApiError } from '@/lib/api';
import { API_URL } from '@/lib/config';
import { useAuth } from '@/lib/auth';
import { colors, space } from '@/lib/theme';
import { Button, Field } from '@/components/ui';

export default function Register() {
  const insets = useSafeAreaInsets();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = async () => {
    const next: Record<string, string> = {};
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) next.email = 'Enter a valid email.';
    if (!/^[a-zA-Z0-9_.]{3,24}$/.test(username.trim())) next.username = '3-24 characters: letters, numbers, _ or .';
    if (password.length < 8) next.password = 'Use at least 8 characters.';
    setErrors(next);
    if (Object.keys(next).length) return;

    setLoading(true);
    try {
      await signIn(await api.register({ email: email.trim(), username: username.trim(), password }));
    } catch (e) {
      if (e instanceof ApiError && e.code === 'email_taken') setErrors({ email: e.message });
      else if (e instanceof ApiError && e.code === 'username_taken') setErrors({ username: e.message });
      else setErrors({ form: e instanceof ApiError ? e.message : 'Something went wrong.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.container, { paddingTop: insets.top + 40 }]} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()} hitSlop={12}><Text style={styles.link}>‹ Back</Text></Pressable>
        <Text style={styles.title}>Create your account</Text>
        <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" error={errors.email} />
        <Field label="Username" value={username} onChangeText={setUsername} autoComplete="username-new" error={errors.username} />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password-new" error={errors.password} />
        {errors.form ? <Text style={styles.error}>{errors.form}</Text> : null}
        <Text style={styles.legal}>
          By signing up you agree to our{' '}
          <Text style={styles.link} onPress={() => WebBrowser.openBrowserAsync(`${API_URL}/terms`)}>Terms</Text> and{' '}
          <Text style={styles.link} onPress={() => WebBrowser.openBrowserAsync(`${API_URL}/privacy`)}>Privacy Policy</Text>.
        </Text>
        <Button title="Sign up" onPress={submit} loading={loading} />
        <View style={styles.footer}>
          <Text style={styles.dim}>Already have an account? </Text>
          <Link href="/login" style={styles.link}>Log in</Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: space.xl, paddingBottom: 40 },
  title: { color: colors.text, fontSize: 28, fontWeight: '800', marginVertical: 24 },
  error: { color: colors.danger, marginBottom: space.md },
  legal: { color: colors.textDim, fontSize: 12, marginBottom: space.lg, lineHeight: 18 },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 28 },
  dim: { color: colors.textDim },
  link: { color: colors.accent, fontWeight: '700' },
});
