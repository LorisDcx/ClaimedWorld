import { createClient } from '@supabase/supabase-js';

// Ces valeurs doivent être remplacées par votre URL Supabase et votre clé anonyme
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 'YOUR_SUPABASE_URL';
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY';

// Définir l'URL de redirection en fonction de l'environnement
const redirectTo = process.env.NODE_ENV === 'production' 
  ? 'https://claimed-world-app.windsurf.build'
  : window.location.origin;

// Options de configuration pour le client Supabase
const supabaseOptions = {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    redirectTo: redirectTo
  }
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, supabaseOptions);
