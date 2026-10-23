import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, ApiError, type Video } from '@/lib/api';
import { colors } from '@/lib/theme';
import { VideoCard } from '@/components/VideoCard';
import { Button, Empty } from '@/components/ui';

export default function VideoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [video, setVideo] = useState<Video | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(true);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  const load = useCallback(() => {
    setError(null);
    api.video(String(id)).then(setVideo).catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load video'));
  }, [id]);
  useEffect(load, [load]);

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {video ? (
        <VideoCard
          video={video}
          height={height}
          active={focused}
          preload
          onChange={setVideo}
          onRemove={() => router.back()}
        />
      ) : error ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Empty title={error} />
          <Button title="Try again" variant="secondary" onPress={load} />
        </View>
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.text} /></View>
      )}
      <Pressable onPress={() => router.back()} style={{ position: 'absolute', top: insets.top + 8, left: 12 }} hitSlop={12} accessibilityLabel="Back">
        <Ionicons name="chevron-back" size={30} color="#fff" />
      </Pressable>
    </View>
  );
}
