import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, ApiError, type Profile, type Video } from '@/lib/api';
import { colors, space } from '@/lib/theme';
import { Avatar, Button, Empty, formatCount } from './ui';
import { blockUser, useReport } from './moderation';

export function ProfileView({ username, showBack }: { username: string; showBack?: boolean }) {
  const insets = useSafeAreaInsets();
  const report = useReport();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [p, v] = await Promise.all([api.profile(username), api.userVideos(username)]);
      setProfile(p);
      setVideos(v.items);
      setCursor(v.nextCursor);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load profile');
    } finally {
      setLoading(false);
    }
  }, [username]);

  // Refresh whenever the screen regains focus (e.g. after editing the profile or posting).
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  useEffect(() => setLoading(true), [username]);

  const loadMore = async () => {
    if (!cursor) return;
    try {
      const v = await api.userVideos(username, cursor);
      setVideos((prev) => [...prev, ...v.items]);
      setCursor(v.nextCursor);
    } catch {
      /* ignore; user can scroll again */
    }
  };

  const toggleFollow = async () => {
    if (!profile || busy) return;
    setBusy(true);
    const next = !profile.isFollowing;
    try {
      if (next) await api.follow(username);
      else await api.unfollow(username);
      setProfile({
        ...profile,
        isFollowing: next,
        stats: { ...profile.stats, followers: profile.stats.followers + (next ? 1 : -1) },
      });
    } catch (e) {
      Alert.alert('Error', e instanceof ApiError ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  const more = () => {
    if (!profile) return;
    Alert.alert(`@${profile.username}`, undefined, [
      { text: 'Report user', onPress: () => report.open('user', profile.id) },
      { text: 'Block user', style: 'destructive', onPress: () => blockUser(profile.username, () => router.back()) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.text} /></View>;
  if (error || !profile) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        {showBack ? <BackButton top={insets.top} /> : null}
        <Empty title={error ?? 'User not found'} />
        <Button title="Try again" variant="secondary" onPress={load} style={{ marginBottom: 80 }} />
      </View>
    );
  }

  const header = (
    <View style={styles.header}>
      <Avatar uri={profile.avatarUrl} name={profile.displayName} size={96} />
      <Text style={styles.name}>{profile.displayName}</Text>
      <Text style={styles.handle}>@{profile.username}</Text>
      <View style={styles.stats}>
        <Stat n={profile.stats.following} label="Following" />
        <Stat n={profile.stats.followers} label="Followers" />
        <Stat n={profile.stats.likes} label="Likes" />
      </View>
      {profile.isMe ? (
        <Button title="Edit profile" variant="secondary" onPress={() => router.push('/edit-profile')} style={styles.cta} />
      ) : (
        <Button title={profile.isFollowing ? 'Following' : 'Follow'} variant={profile.isFollowing ? 'secondary' : 'primary'} onPress={toggleFollow} loading={busy} style={styles.cta} />
      )}
      {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        {showBack ? (
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={28} color={colors.text} />
          </Pressable>
        ) : <View style={{ width: 28 }} />}
        <Text style={styles.topTitle}>@{profile.username}</Text>
        {profile.isMe ? (
          <Pressable onPress={() => router.push('/settings')} hitSlop={12} accessibilityLabel="Settings">
            <Ionicons name="settings-outline" size={24} color={colors.text} />
          </Pressable>
        ) : (
          <Pressable onPress={more} hitSlop={12} accessibilityLabel="More">
            <Ionicons name="ellipsis-horizontal" size={24} color={colors.text} />
          </Pressable>
        )}
      </View>

      <FlatList
        data={videos}
        keyExtractor={(v) => v.id}
        numColumns={3}
        ListHeaderComponent={header}
        ListEmptyComponent={<Text style={styles.noVideos}>{profile.isMe ? 'Post your first video with the + button.' : 'No videos yet.'}</Text>}
        onEndReached={loadMore}
        onEndReachedThreshold={0.6}
        renderItem={({ item }) => (
          <Pressable style={styles.cell} onPress={() => router.push(`/video/${item.id}`)} accessibilityLabel="Open video">
            {item.thumbUrl ? (
              <Image source={{ uri: item.thumbUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            ) : (
              <View style={[StyleSheet.absoluteFill, styles.noThumb]}><Ionicons name="play" size={28} color={colors.textDim} /></View>
            )}
            <View style={styles.cellMeta}>
              <Ionicons name="heart" size={12} color="#fff" />
              <Text style={styles.cellMetaText}>{formatCount(item.likes)}</Text>
            </View>
          </Pressable>
        )}
      />
      {report.sheet}
    </View>
  );
}

function BackButton({ top }: { top: number }) {
  return (
    <Pressable onPress={() => router.back()} style={{ position: 'absolute', top: top + 8, left: 12 }} hitSlop={12}>
      <Ionicons name="chevron-back" size={28} color={colors.text} />
    </Pressable>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <View style={{ alignItems: 'center', minWidth: 80 }}>
      <Text style={styles.statN}>{formatCount(n)}</Text>
      <Text style={styles.statL}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, height: 48 },
  topTitle: { color: colors.text, fontWeight: '700', fontSize: 16 },
  header: { alignItems: 'center', paddingVertical: space.lg, paddingHorizontal: space.lg },
  name: { color: colors.text, fontSize: 20, fontWeight: '700', marginTop: space.md },
  handle: { color: colors.textDim, marginTop: 2 },
  stats: { flexDirection: 'row', marginTop: space.lg },
  statN: { color: colors.text, fontSize: 18, fontWeight: '700' },
  statL: { color: colors.textDim, fontSize: 12, marginTop: 2 },
  cta: { marginTop: space.lg, minWidth: 180 },
  bio: { color: colors.text, textAlign: 'center', marginTop: space.lg },
  cell: { width: '33.333%', aspectRatio: 0.75, padding: 1 },
  noThumb: { backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  cellMeta: { position: 'absolute', left: 6, bottom: 6, flexDirection: 'row', alignItems: 'center', gap: 3 },
  cellMetaText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  noVideos: { color: colors.textDim, textAlign: 'center', marginTop: 40, paddingHorizontal: space.xl },
});
