import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, ApiError } from '@/lib/api';
import { API_URL } from '@/lib/config';
import { useAuth } from '@/lib/auth';
import { colors, space } from '@/lib/theme';

function Row({ label, onPress, danger, icon }: { label: string; onPress: () => void; danger?: boolean; icon: React.ComponentProps<typeof Ionicons>['name'] }) {
  return (
    <Pressable style={styles.row} onPress={onPress} accessibilityRole="button">
      <Ionicons name={icon} size={20} color={danger ? colors.danger : colors.text} />
      <Text style={[styles.rowText, danger && { color: colors.danger }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
    </Pressable>
  );
}

export default function Settings() {
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const open = (path: string) => WebBrowser.openBrowserAsync(`${API_URL}${path}`);

  const deleteAccount = () =>
    Alert.alert('Delete account?', 'This permanently deletes your profile, videos and comments. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete forever',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteMe();
            await signOut();
          } catch (e) {
            Alert.alert('Could not delete account', e instanceof ApiError ? e.message : 'Try again.');
          }
        },
      },
    ]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Back"><Ionicons name="chevron-back" size={28} color={colors.text} /></Pressable>
        <Text style={styles.title}>Settings</Text>
        <View style={{ width: 28 }} />
      </View>
      <ScrollView>
        <Text style={styles.email}>{user?.email ?? ''}</Text>
        <Row icon="person-outline" label="Edit profile" onPress={() => router.push('/edit-profile')} />
        <Row icon="document-text-outline" label="Terms of Service" onPress={() => open('/terms')} />
        <Row icon="shield-checkmark-outline" label="Privacy Policy" onPress={() => open('/privacy')} />
        <Row icon="help-circle-outline" label="Help & support" onPress={() => open('/support')} />
        <Row icon="log-out-outline" label="Log out" onPress={() => Alert.alert('Log out?', undefined, [{ text: 'Cancel', style: 'cancel' }, { text: 'Log out', onPress: () => void signOut() }])} />
        <Row icon="trash-outline" label="Delete account" danger onPress={deleteAccount} />
        <Text style={styles.version}>Version {Constants.expoConfig?.version ?? '1.0.0'}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, height: 48 },
  title: { color: colors.text, fontWeight: '700', fontSize: 17 },
  email: { color: colors.textDim, textAlign: 'center', marginVertical: space.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowText: { flex: 1, color: colors.text, fontSize: 16 },
  version: { color: colors.textDim, textAlign: 'center', marginVertical: space.xl, fontSize: 12 },
});
