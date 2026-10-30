import { db } from './insforge';

/** El rol vive en public.profiles, no en una lista de correos. */
export async function isAdmin(userId: string): Promise<boolean> {
  const { data, error } = await db()
    .database.from('profiles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) return false;
  return (data as { role: string }).role === 'ADMIN';
}
