import { db, describeDbError } from './insforge';

export type UserRole = 'ADMIN' | 'CLIENT';

export interface Profile {
  user_id: string;
  display_name: string | null;
  phone: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await db()
    .database.from('profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(describeDbError(error));
  return (data as Profile | null) ?? null;
}
