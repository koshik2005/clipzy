import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, type User, type Video } from '@/lib/api';
import { colors, space } from '@/lib/theme';
import { Avatar, Empty, formatCount } from '@/components/ui';

export default function Discover() {
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setUsers([]);
      setVideos([]);
      setSearched(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await api.search(term);
        if (cancelled) return;
        setUsers(r.users);
        setVideos(r.videos);
        setSearched(true);
      } catch {
        if (!cancelled) setSearched(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 350); // debounce
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color={colors.textDim} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search creators and videos"
          placeholderTextColor={colors.textDim}
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {loading ? <ActivityIndicator color={colors.textDim} /> : null}
      </View>

      <FlatList
        data={videos}
        keyExtractor={(v) => v.id}
        numColumns={3}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          users.length ? (
            <View>
              <Text style={styles.section}>Creators</Text>
              {users.map((u) => (
                <Pressable key={u.id} style={styles.userRow} onPress={() => router.push(`/user/${u.username}`)}>
                  <Avatar uri={u.avatarUrl} name={u.displayName} size={44} />
                  <View style={{ marginLeft: space.md }}>
                    <Text style={styles.userName}>{u.displayName}</Text>
                    <Text style={styles.userHandle}>@{u.username}</Text>
                  </View>
                </Pressable>
              ))}
              {videos.length ? <Text style={styles.section}>Videos</Text> : null}
            </View>
          ) : videos.length ? (
            <Text style={styles.section}>Videos</Text>
          ) : undefined
        }
        ListEmptyComponent={
          <Empty
            title={searched ? 'No results' : 'Find something to watch'}
            subtitle={searched ? 'Try a different search.' : 'Search by username, name or caption.'}
          />
        }
        renderItem={({ item }) => (
          <Pressable style={styles.cell} onPress={() => router.push(`/video/${item.id}`)}>
            {item.thumbUrl ? (
              <Image source={{ uri: item.thumbUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            ) : (
              <View style={[StyleSheet.absoluteFill, styles.noThumb]}><Ionicons name="play" size={26} color={colors.textDim} /></View>
            )}
            <Text style={styles.cellText}>{formatCount(item.likes)} ♥</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, marginHorizontal: space.lg, marginBottom: space.md, paddingHorizontal: space.md, borderRadius: 12, height: 44 },
  input: { flex: 1, color: colors.text, fontSize: 16 },
  section: { color: colors.textDim, fontWeight: '700', marginHorizontal: space.lg, marginTop: space.lg, marginBottom: space.sm, textTransform: 'uppercase', fontSize: 12 },
  userRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingVertical: space.sm },
  userName: { color: colors.text, fontWeight: '600', fontSize: 16 },
  userHandle: { color: colors.textDim, fontSize: 13 },
  cell: { width: '33.333%', aspectRatio: 0.75, padding: 1 },
  noThumb: { backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  cellText: { position: 'absolute', left: 6, bottom: 6, color: '#fff', fontSize: 12, fontWeight: '600' },
});
