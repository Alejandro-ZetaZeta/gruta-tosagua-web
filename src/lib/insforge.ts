/**
 * Capa de compatibilidad: redirige todas las llamadas a Supabase.
 */
export {
  db,
  authClient,
  storage,
  describeDbError,
  getAdminClient,
  getAnonClient,
} from './supabase';
