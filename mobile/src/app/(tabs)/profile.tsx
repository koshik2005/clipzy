import { ProfileView } from '@/components/ProfileView';
import { useAuth } from '@/lib/auth';

export default function MyProfile() {
  const { user } = useAuth();
  if (!user) return null;
  return <ProfileView username={user.username} />;
}
