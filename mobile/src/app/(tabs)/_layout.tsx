import { Pressable, StyleSheet, View } from 'react-native';
import { Tabs, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/lib/theme';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: colors.bg, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textDim,
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color }) => <Ionicons name="home" size={26} color={color as string} /> }} />
      <Tabs.Screen name="discover" options={{ title: 'Discover', tabBarIcon: ({ color }) => <Ionicons name="search" size={26} color={color as string} /> }} />
      <Tabs.Screen
        name="create-tab"
        options={{
          title: 'Create',
          tabBarButton: () => (
            <Pressable style={styles.createWrap} onPress={() => router.push('/create')} accessibilityLabel="Create video" accessibilityRole="button">
              <View style={styles.create}>
                <Ionicons name="add" size={28} color="#fff" />
              </View>
            </Pressable>
          ),
        }}
      />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color }) => <Ionicons name="person" size={26} color={color as string} /> }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  createWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  create: { width: 46, height: 32, borderRadius: 10, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
});
