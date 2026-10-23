import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api, ApiError, type Comment } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors, space } from '@/lib/theme';
import { Avatar } from './ui';
import { useReport } from './moderation';

export function CommentsSheet({
  videoId,
  ownerId,
  visible,
  onClose,
  onCountChange,
}: {
  videoId: string;
  ownerId: string;
  visible: boolean;
  onClose: () => void;
  onCountChange: (delta: number) => void;
}) {
  const { user } = useAuth();
  const report = useReport();
  const [items, setItems] = useState<Comment[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(
    async (next?: string | null) => {
      setLoading(true);
      setError(null);
      try {
        const page = await api.comments(videoId, next);
        setItems((prev) => (next ? [...prev, ...page.items] : page.items));
        setCursor(page.nextCursor);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'Could not load comments');
      } finally {
        setLoading(false);
      }
    },
    [videoId],
  );

  useEffect(() => {
    if (visible) void load();
  }, [visible, load]);

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const c = await api.addComment(videoId, body);
      setItems((prev) => [c, ...prev]);
      setText('');
      onCountChange(1);
    } catch (e) {
      Alert.alert('Could not post comment', e instanceof ApiError ? e.message : 'Try again.');
    } finally {
      setSending(false);
    }
  };

  const options = (c: Comment) => {
    const canDelete = c.author.id === user?.id || ownerId === user?.id;
    Alert.alert('Comment', undefined, [
      ...(c.author.id !== user?.id ? [{ text: 'Report', onPress: () => report.open('comment', c.id) }] : []),
      ...(canDelete
        ? [
            {
              text: 'Delete',
              style: 'destructive' as const,
              onPress: async () => {
                try {
                  await api.deleteComment(c.id);
                  setItems((prev) => prev.filter((x) => x.id !== c.id));
                  onCountChange(-1);
                } catch (e) {
                  Alert.alert('Could not delete', e instanceof ApiError ? e.message : 'Try again.');
                }
              },
            },
          ]
        : []),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheet}>
        <View style={styles.header}>
          <Text style={styles.title}>Comments</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close comments">
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
        </View>

        <FlatList
          data={items}
          keyExtractor={(c) => c.id}
          keyboardShouldPersistTaps="handled"
          onEndReached={() => cursor && !loading && void load(cursor)}
          ListEmptyComponent={
            loading ? (
              <ActivityIndicator color={colors.text} style={{ marginTop: 40 }} />
            ) : (
              <Text style={styles.empty}>{error ?? 'No comments yet. Start the conversation.'}</Text>
            )
          }
          renderItem={({ item }) => (
            <Pressable style={styles.row} onLongPress={() => options(item)}>
              <Avatar uri={item.author.avatarUrl} name={item.author.displayName} size={34} />
              <View style={{ flex: 1, marginLeft: space.md }}>
                <Text style={styles.author}>@{item.author.username}</Text>
                <Text style={styles.body}>{item.body}</Text>
              </View>
              <Pressable hitSlop={10} onPress={() => options(item)}>
                <Ionicons name="ellipsis-horizontal" size={18} color={colors.textDim} />
              </Pressable>
            </Pressable>
          )}
        />

        <View style={styles.inputRow}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Add a comment…"
            placeholderTextColor={colors.textDim}
            style={styles.input}
            maxLength={500}
            returnKeyType="send"
            onSubmitEditing={send}
          />
          <Pressable onPress={send} disabled={!text.trim() || sending} hitSlop={8}>
            <Ionicons name="send" size={22} color={text.trim() ? colors.accent : colors.textDim} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
      {report.sheet}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { height: '65%', backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: space.lg },
  title: { color: colors.text, fontWeight: '700', fontSize: 16 },
  row: { flexDirection: 'row', paddingHorizontal: space.lg, paddingVertical: space.md, alignItems: 'flex-start' },
  author: { color: colors.textDim, fontSize: 12, marginBottom: 2 },
  body: { color: colors.text, fontSize: 15 },
  empty: { color: colors.textDim, textAlign: 'center', marginTop: 40, paddingHorizontal: space.xl },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    paddingBottom: space.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  input: { flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: 20, paddingHorizontal: space.lg, height: 40, color: colors.text },
});
