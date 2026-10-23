import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, ApiError, uploadFile } from '@/lib/api';
import { MAX_VIDEO_SECONDS } from '@/lib/config';
import { invalidateFeed } from '@/lib/events';
import { colors, space } from '@/lib/theme';
import { Button } from '@/components/ui';

type Picked = { uri: string; durationMs: number; mimeType: string };

const guessMime = (uri: string, mime?: string | null) =>
  mime === 'video/quicktime' || /\.mov$/i.test(uri) ? 'video/quicktime' : 'video/mp4';

export default function Create() {
  const insets = useSafeAreaInsets();
  const [picked, setPicked] = useState<Picked | null>(null);
  const [caption, setCaption] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [stage, setStage] = useState('');

  const player = useVideoPlayer(picked?.uri ?? null, (p) => {
    p.loop = true;
    p.play();
  });

  const handle = (result: ImagePicker.ImagePickerResult) => {
    if (result.canceled || !result.assets?.[0]) return;
    const a = result.assets[0];
    const durationMs = Math.round(a.duration ?? 0);
    if (durationMs > MAX_VIDEO_SECONDS * 1000) {
      Alert.alert('Video too long', `Videos can be up to ${MAX_VIDEO_SECONDS} seconds.`);
      return;
    }
    setPicked({ uri: a.uri, durationMs, mimeType: guessMime(a.uri, a.mimeType) });
  };

  const record = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return Alert.alert('Camera permission needed', 'Enable camera access in Settings to record videos.');
    handle(await ImagePicker.launchCameraAsync({ mediaTypes: ['videos'], videoMaxDuration: MAX_VIDEO_SECONDS, allowsEditing: false }));
  };

  const choose = async () => {
    handle(await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], allowsEditing: false }));
  };

  const post = async () => {
    if (!picked || progress !== null) return;
    setProgress(0);
    try {
      setStage('Preparing…');
      let thumbUri: string | null = null;
      try {
        thumbUri = (await VideoThumbnails.getThumbnailAsync(picked.uri, { time: 300, quality: 0.7 })).uri;
      } catch {
        /* thumbnails are optional */
      }

      setStage('Uploading video…');
      const videoKey = await uploadFile('video', picked.uri, picked.mimeType, (f) => setProgress(f * 0.9));

      let thumbKey: string | undefined;
      if (thumbUri) {
        setStage('Finishing up…');
        try {
          thumbKey = await uploadFile('thumb', thumbUri, 'image/jpeg');
        } catch {
          /* publish without thumbnail */
        }
      }
      setProgress(0.95);
      await api.createVideo({ videoKey, thumbKey, caption: caption.trim(), durationMs: picked.durationMs });
      setProgress(1);
      invalidateFeed();
      router.back();
    } catch (e) {
      Alert.alert('Upload failed', e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');
      setProgress(null);
    }
  };

  const uploading = progress !== null;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <Pressable onPress={() => router.back()} disabled={uploading} hitSlop={12} accessibilityLabel="Close">
          <Ionicons name="close" size={28} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>New video</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {picked ? (
          <>
            <View style={styles.preview}>
              <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
            </View>
            <TextInput
              value={caption}
              onChangeText={setCaption}
              placeholder="Describe your video… #hashtags"
              placeholderTextColor={colors.textDim}
              style={styles.caption}
              multiline
              maxLength={300}
              editable={!uploading}
            />
            <Text style={styles.counter}>{caption.length}/300</Text>
            {uploading ? (
              <View style={{ marginVertical: space.lg }}>
                <View style={styles.bar}><View style={[styles.barFill, { width: `${Math.round((progress ?? 0) * 100)}%` }]} /></View>
                <Text style={styles.stage}>{stage} {Math.round((progress ?? 0) * 100)}%</Text>
              </View>
            ) : (
              <>
                <Button title="Post" onPress={post} />
                <Button title="Choose a different video" variant="secondary" onPress={() => setPicked(null)} style={{ marginTop: space.md }} />
              </>
            )}
          </>
        ) : (
          <View style={styles.options}>
            <Text style={styles.hint}>Videos can be up to {MAX_VIDEO_SECONDS} seconds.</Text>
            <Button title="Record a video" onPress={record} />
            <Button title="Upload from library" variant="secondary" onPress={choose} style={{ marginTop: space.md }} />
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, paddingBottom: space.md },
  title: { color: colors.text, fontWeight: '700', fontSize: 17 },
  body: { padding: space.lg, paddingBottom: 60 },
  options: { marginTop: 80 },
  hint: { color: colors.textDim, textAlign: 'center', marginBottom: space.xl },
  preview: { alignSelf: 'center', width: 200, aspectRatio: 9 / 16, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.surface, marginBottom: space.lg },
  caption: { backgroundColor: colors.surface, color: colors.text, borderRadius: 12, padding: space.md, minHeight: 90, textAlignVertical: 'top', fontSize: 16 },
  counter: { color: colors.textDim, alignSelf: 'flex-end', marginTop: 4, marginBottom: space.lg, fontSize: 12 },
  bar: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  barFill: { height: 8, backgroundColor: colors.accent },
  stage: { color: colors.textDim, marginTop: 8, textAlign: 'center' },
});
