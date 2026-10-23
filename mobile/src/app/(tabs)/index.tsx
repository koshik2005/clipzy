import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, ApiError, type Video } from '@/lib/api';
import { onFeedInvalidated } from '@/lib/events';
import { colors, space } from '@/lib/theme';
import { VideoCard } from '@/components/VideoCard';
import { Button, Empty } from '@/components/ui';

type Tab = 'foryou' | 'following';
type Viewable = { index?: number | null; isViewable: boolean };

export default function Feed() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('foryou');
  const [items, setItems] = useState<Video[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [height, setHeight] = useState(0);
  const [focused, setFocused] = useState(true);
  const loadId = useRef(0);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false); // pause playback when leaving the tab
    }, []),
  );

  const load = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      const id = ++loadId.current;
      if (mode === 'refresh') setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const page = await api.feed(tab);
        if (id !== loadId.current) return; // a newer request superseded this one
        setItems(page.items);
        setCursor(page.nextCursor);
        setActiveIndex(0);
      } catch (e) {
        if (id === loadId.current) setError(e instanceof ApiError ? e.message : 'Could not load videos');
      } finally {
        if (id === loadId.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [tab],
  );

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => onFeedInvalidated(() => void load('refresh')), [load]);

  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await api.feed(tab, cursor);
      setItems((prev) => [...prev, ...page.items.filter((n) => !prev.some((p) => p.id === n.id))]);
      setCursor(page.nextCursor);
    } catch {
      /* swallow; next scroll retries */
    } finally {
      setLoadingMore(false);
    }
  };

  const update = useCallback((v: Video) => setItems((prev) => prev.map((p) => (p.id === v.id ? v : p))), []);
  const remove = useCallback((id: string) => setItems((prev) => prev.filter((p) => p.id !== id)), []);

  const onViewable = useRef(({ viewableItems }: { viewableItems: Viewable[] }) => {
    const first = viewableItems.find((v) => v.isViewable);
    if (first?.index != null) setActiveIndex(first.index);
  }).current;

  return (
    <View style={styles.container} onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
      {height > 0 ? (
        loading ? (
          <View style={styles.center}><ActivityIndicator color={colors.text} /></View>
        ) : error ? (
          <View style={styles.center}>
            <Empty title="Couldn't load videos" subtitle={error} />
            <Button title="Try again" onPress={() => load()} style={{ marginBottom: 100 }} />
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(v) => v.id}
            pagingEnabled
            snapToInterval={height}
            decelerationRate="fast"
            showsVerticalScrollIndicator={false}
            getItemLayout={(_, i) => ({ length: height, offset: height * i, index: i })}
            onViewableItemsChanged={onViewable}
            viewabilityConfig={{ itemVisiblePercentThreshold: 80 }}
            initialNumToRender={2}
            maxToRenderPerBatch={2}
            windowSize={3}
            removeClippedSubviews
            onEndReached={loadMore}
            onEndReachedThreshold={1.5}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('refresh')} tintColor="#fff" />}
            ListEmptyComponent={
              <View style={{ height }}>
                <Empty
                  title={tab === 'following' ? 'Nothing here yet' : 'No videos yet'}
                  subtitle={tab === 'following' ? 'Follow creators to see their videos here.' : 'Be the first to post one with the + button.'}
                />
              </View>
            }
            renderItem={({ item, index }) => (
              <VideoCard
                video={item}
                height={height}
                active={focused && index === activeIndex}
                preload={Math.abs(index - activeIndex) <= 1}
                onChange={update}
                onRemove={remove}
              />
            )}
          />
        )
      ) : null}

      <View style={[styles.tabs, { top: insets.top + 8 }]} pointerEvents="box-none">
        <TabButton label="Following" active={tab === 'following'} onPress={() => setTab('following')} />
        <Text style={styles.sep}>|</Text>
        <TabButton label="For You" active={tab === 'foryou'} onPress={() => setTab('foryou')} />
      </View>
    </View>
  );
}

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={10}>
      <Text style={[styles.tab, active && styles.tabActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabs: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: space.md },
  tab: { color: 'rgba(255,255,255,0.65)', fontSize: 17, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.4)', textShadowRadius: 4 },
  tabActive: { color: '#fff' },
  sep: { color: 'rgba(255,255,255,0.35)' },
});
