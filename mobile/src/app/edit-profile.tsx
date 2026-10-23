import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, ApiError, uploadFile } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors, space } from '@/lib/theme';
import { Avatar, Button, Field } from '@/components/ui';

export default function EditProfile() {
  const insets = useSafeAreaInsets();
  const { user, setUser } = useAuth();
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const pickAvatar = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (!r.canceled && r.assets[0]) setAvatarUri(r.assets[0].uri);
  };

  const save = async () => {
    if (!displayName.trim()) return Alert.alert('Name required', 'Enter a display name.');
    setSaving(true);
    try {
      let avatarKey: string | undefined;
      if (avatarUri) avatarKey = await uploadFile('avatar', avatarUri, 'image/jpeg');
      setUser(await api.updateMe({ displayName: displayName.trim(), bio: bio.trim(), avatarKey }));
      router.back();
    } catch (e) {
      Alert.alert('Could not save', e instanceof ApiError ? e.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Back"><Ionicons name="chevron-back" size={28} color={colors.text} /></Pressable>
        <Text style={styles.title}>Edit profile</Text>
        <View style={{ width: 28 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: space.xl }} keyboardShouldPersistTaps="handled">
        <Pressable onPress={pickAvatar} style={{ alignSelf: 'center', marginBottom: space.xl }} accessibilityLabel="Change profile photo">
          <Avatar uri={avatarUri ?? user?.avatarUrl} name={displayName || user?.username || '?'} size={100} />
          <Text style={styles.change}>Change photo</Text>
        </Pressable>
        <Field label="Name" value={displayName} onChangeText={setDisplayName} autoCapitalize="words" maxLength={40} />
        <Field label="Bio" value={bio} onChangeText={setBio} maxLength={160} multiline style={{ height: 90, paddingTop: 12, textAlignVertical: 'top' }} />
        <Button title="Save" onPress={save} loading={saving} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, paddingBottom: space.md },
  title: { color: colors.text, fontWeight: '700', fontSize: 17 },
  change: { color: colors.accent, textAlign: 'center', marginTop: space.sm, fontWeight: '600' },
});
