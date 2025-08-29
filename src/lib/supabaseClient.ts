import { createClient } from '@supabase/supabase-js';
import { Database } from './database.types'; // This will be generated later

// Environment variables should be prefixed with NEXT_PUBLIC_ if they are used on the client-side.
// For server-side only, the plain names are fine.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase URL and Anon Key must be defined in environment variables.');
}

// Note: The 'Database' generic is for TypeScript support.
// We will generate the types from the schema in a later step.
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
