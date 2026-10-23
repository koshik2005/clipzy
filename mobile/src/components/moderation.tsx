import { useCallback, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api, ApiError } from '@/lib/api';
import { colors, space } from '@/lib/theme';

const REASONS: { label: string; value: string }[] = [
  { label: 'Spam or scam', value: 'spam' },
  { label: 'Nudity or sexual content', value: 'nudity' },
  { label: 'Violence', value: 'violence' },
  { label: 'Hate speech', value: 'hate' },
  { label: 'Harassment or bullying', value: 'harassment' },
  { label: 'Self-harm', value: 'self_harm' },
  { label: 'Illegal activity', value: 'illegal' },
  { label: 'Child safety', value: 'minor_safety' },
  { label: 'Something else', value: 'other' },
];

type Target = { type: 'video' | 'comment' | 'user'; id: string } | null;
const msg = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong.');

/** Report flow: call `open(type, id)` and render `sheet` somewhere in your screen. */
export function useReport() {
  const [target, setTarget] = useState<Target>(null);

  const open = useCallback((type: 'video' | 'comment' | 'user', id: string) => setTarget({ type, id }), []);

  const submit = async (reason: string) => {
    const t = target;
    setTarget(null);
    if (!t) return;
    try {
      await api.report({ targetType: t.type, targetId: t.id, reason });
      Alert.alert('Thanks', "We've received your report and will review it.");
    } catch (e) {
      Alert.alert('Could not send report', msg(e));
    }
  };

  const sheet = (
    <Modal visible={!!target} transparent animationType="slide" onRequestClose={() => setTarget(null)}>
      <Pressable style={styles.backdrop} onPress={() => setTarget(null)} />
      <View style={styles.sheet}>
        <Text style={styles.title}>Why are you reporting this?</Text>
        <ScrollView>
          {REASONS.map((r) => (
            <Pressable key={r.value} style={styles.row} onPress={() => void submit(r.value)}>
              <Text style={styles.rowText}>{r.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <Pressable style={styles.cancel} onPress={() => setTarget(null)}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  );

  return { open, sheet };
}

export function blockUser(username: string, onDone?: () => void) {
  Alert.alert(`Block @${username}?`, "You won't see their videos or comments, and they won't see yours.", [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Block',
      style: 'destructive',
      onPress: async () => {
        try {
          await api.block(username);
          onDone?.();
        } catch (e) {
          Alert.alert('Could not block user', msg(e));
        }
      },
    },
  ]);
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: space.lg, maxHeight: '75%' },
  title: { color: colors.text, fontSize: 17, fontWeight: '700', marginBottom: space.md },
  row: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowText: { color: colors.text, fontSize: 16 },
  cancel: { paddingVertical: 16, alignItems: 'center' },
  cancelText: { color: colors.textDim, fontSize: 16 },
});
