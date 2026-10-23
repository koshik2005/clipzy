import { useLocalSearchParams } from 'expo-router';
import { ProfileView } from '@/components/ProfileView';

export default function UserScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  return <ProfileView username={String(username)} showBack />;
}
