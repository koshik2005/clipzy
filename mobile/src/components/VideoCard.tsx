import { memo, useEffect, useRef, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { api, ApiError, type Video } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors, space } from '@/lib/theme';
import { Avatar, formatCount } from './ui';
import { CommentsSheet } from './CommentsSheet';
import { blockUser, useReport } from './moderation';

type Props = {
  video: Video;
  height: number;
  /** Currently visible card: plays. */
  active: boolean;
  /** Near the visible card: loads the player so swiping is instant. */
  preload: boolean;
  onChange: (v: Video) => void;
  onRemove?: (id: string) => void;
};

function VideoCardBase({ video, height, active, preload, onChange, onRemove }: Props) {
  const { user } = useAuth();
  const report = useReport();
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [firstFrame, setFirstFrame] = useState(false);
  const viewed = useRef(false);

  const player = useVideoPlayer(preload ? video.videoUrl : null, (p) => {
    p.loop = true;
  });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });

  useEffect(() => {
    if (active && !userPaused) {
      player.play();
      if (!viewed.current) {
        viewed.current = true;
        void api.view(video.id);
      }
    } else {
      player.pause();
    }
    if (!active) {
      setUserPaused(false);
      try {
        player.currentTime = 0;
      } catch {
        /* player may not be loaded yet */
      }
    }
  }, [active, userPaused, player, video.id]);

  const toggleLike = async () => {
    const next = !video.liked;
    onChange({ ...video, liked: next, likes: Math.max(0, video.likes + (next ? 1 : -1)) }); // optimistic
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const r = next ? await api.like(video.id) : await api.unlike(video.id);
      onChange({ ...video, liked: r.liked, likes: r.likes });
    } catch (e) {
      onChange(video); // roll back
      Alert.alert('Could not update like', e instanceof ApiError ? e.message : 'Try again.');
    }
  };

  const toggleFollow = async () => {
    const next = !video.author.following;
    onChange({ ...video, author: { ...video.author, following: next } });
    try {
      if (next) await api.follow(video.author.username);
      else await api.unfollow(video.author.username);
    } catch {
      onChange(video);
    }
  };

  const openProfile = () => router.push(`/user/${video.author.username}`);
  const mine = user?.id === video.author.id;

  const more = () =>
    Alert.alert('Options', undefined, [
      ...(mine
        ? [
            {
              text: 'Delete video',
              style: 'destructive' as const,
              onPress: () =>
                Alert.alert('Delete this video?', 'This cannot be undone.', [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                      try {
                        await api.deleteVideo(video.id);
                        onRemove?.(video.id);
                      } catch (e) {
                        Alert.alert('Could not delete', e instanceof ApiError ? e.message : 'Try again.');
                      }
                    },
                  },
                ]),
            },
          ]
        : [
            { text: 'Report video', onPress: () => report.open('video', video.id) },
            { text: `Block @${video.author.username}`, style: 'destructive' as const, onPress: () => blockUser(video.author.username, () => onRemove?.(video.id)) },
          ]),
      { text: 'Cancel', style: 'cancel' as const },
    ]);

  return (
    <View style={[styles.container, { height }]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={() => setUserPaused((p) => !p)} accessibilityLabel="Toggle playback">
        {video.thumbUrl && !firstFrame ? <Image source={{ uri: video.thumbUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
        {preload ? (
          <VideoView
            player={player}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            nativeControls={false}
            onFirstFrameRender={() => setFirstFrame(true)}
          />
        ) : null}
        {active && !isPlaying && userPaused ? (
          <View style={styles.pauseIcon} pointerEvents="none">
            <Ionicons name="play" size={72} color="rgba(255,255,255,0.8)" />
          </View>
        ) : null}
      </Pressable>

      <View style={styles.gradient} pointerEvents="none" />

      <View style={styles.rail}>
        <Pressable onPress={openProfile} accessibilityLabel={`Open @${video.author.username}`}>
          <Avatar uri={video.author.avatarUrl} name={video.author.displayName} size={48} />
          {!mine && !video.author.following ? (
            <Pressable style={styles.followBadge} onPress={toggleFollow} hitSlop={8} accessibilityLabel="Follow">
              <Ionicons name="add" size={14} color="#fff" />
            </Pressable>
          ) : null}
        </Pressable>
        <RailButton icon={video.liked ? 'heart' : 'heart-outline'} color={video.liked ? colors.accent : '#fff'} label={formatCount(video.likes)} onPress={toggleLike} a11y="Like" />
        <RailButton icon="chatbubble-ellipses" label={formatCount(video.comments)} onPress={() => setCommentsOpen(true)} a11y="Comments" />
        <RailButton icon="ellipsis-horizontal" label="" onPress={more} a11y="More options" />
      </View>

      <View style={styles.info} pointerEvents="box-none">
        <Pressable onPress={openProfile}>
          <Text style={styles.username}>@{video.author.username}</Text>
        </Pressable>
        {video.caption ? <Text style={styles.caption} numberOfLines={3}>{video.caption}</Text> : null}
      </View>

      <CommentsSheet
        videoId={video.id}
        ownerId={video.author.id}
        visible={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        onCountChange={(d) => onChange({ ...video, comments: Math.max(0, video.comments + d) })}
      />
      {report.sheet}
    </View>
  );
}

function RailButton({
  icon,
  label,
  onPress,
  color = '#fff',
  a11y,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  color?: string;
  a11y: string;
}) {
  return (
    <Pressable onPress={onPress} style={styles.railBtn} accessibilityLabel={a11y} hitSlop={6}>
      <Ionicons name={icon} size={34} color={color} />
      {label ? <Text style={styles.railLabel}>{label}</Text> : null}
    </Pressable>
  );
}

export const VideoCard = memo(VideoCardBase);

const styles = StyleSheet.create({
  container: { width: '100%', backgroundColor: '#000' },
  pauseIcon: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  gradient: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 220, backgroundColor: 'rgba(0,0,0,0.25)' },
  rail: { position: 'absolute', right: space.md, bottom: 40, alignItems: 'center', gap: 18 },
  railBtn: { alignItems: 'center' },
  railLabel: { color: '#fff', fontSize: 12, fontWeight: '600', marginTop: 2 },
  followBadge: {
    position: 'absolute',
    bottom: -8,
    alignSelf: 'center',
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { position: 'absolute', left: space.lg, right: 90, bottom: 40 },
  username: { color: '#fff', fontWeight: '700', fontSize: 16, marginBottom: 6 },
  caption: { color: '#fff', fontSize: 14, lineHeight: 19 },
});
