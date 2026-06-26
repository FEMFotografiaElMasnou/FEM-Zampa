import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_CONFIGS = {
  normal: {
    url: 'https://ogqqcgbgcqowvywaolln.supabase.co',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ncXFjZ2JnY3Fvd3Z5d2FvbGxuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0OTYzNTIsImV4cCI6MjA4OTA3MjM1Mn0.f4JGoy2BQmir9veKMp_Fk1GqjMGGbMr4YMUK1iH9wfM',
  },
  test: {
    url: 'https://xxydxdsiunfwzkcffdai.supabase.co',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh4eWR4ZHNpdW5md3prY2ZmZGFpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3NDQ5MDYsImV4cCI6MjA5NDMyMDkwNn0.OmI1ShqJe4v1__JpaCzh2nGcwqtNWns5TC45el6sFsw',
  },
};

export const safeStorage = {
  getItem: (key: string): string | null => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string): void => {
    try {
      localStorage.setItem(key, value);
    } catch {}
  },
  removeItem: (key: string): void => {
    try {
      localStorage.removeItem(key);
    } catch {}
  }
};

let currentMode: 'normal' | 'test' | 'custom' = 
  (safeStorage.getItem('femvotacions_dbmode') as 'normal' | 'test' | 'custom') || 'test';

let sClient: SupabaseClient | null = null;

export function getActiveConfig(): { url: string; key: string } {
  // 1. Env variables
  const envUrl = typeof import.meta !== 'undefined' && (import.meta as any).env ? (import.meta as any).env.VITE_SUPABASE_URL : undefined;
  const envKey = typeof import.meta !== 'undefined' && (import.meta as any).env ? (import.meta as any).env.VITE_SUPABASE_ANON_KEY : undefined;
  if (envUrl && envUrl.trim() && envKey && envKey.trim()) {
    return { url: envUrl.trim(), key: envKey.trim() };
  }

  // 2. Custom config in localStorage
  const customUrl = safeStorage.getItem('femvotacions_custom_url');
  const customKey = safeStorage.getItem('femvotacions_custom_key');
  if (currentMode === 'custom' && customUrl && customKey) {
    return { url: customUrl.trim(), key: customKey.trim() };
  }

  // 3. Fallbacks
  const mode = currentMode === 'custom' ? 'test' : currentMode;
  return SUPABASE_CONFIGS[mode] || SUPABASE_CONFIGS.test;
}

export function getSupabaseClient(): SupabaseClient {
  if (!sClient) {
    const config = getActiveConfig();
    sClient = createClient(config.url, config.key);
  }
  return sClient;
}

export function getCurrentMode(): 'normal' | 'test' | 'custom' {
  const envUrl = typeof import.meta !== 'undefined' && (import.meta as any).env ? (import.meta as any).env.VITE_SUPABASE_URL : undefined;
  const envKey = typeof import.meta !== 'undefined' && (import.meta as any).env ? (import.meta as any).env.VITE_SUPABASE_ANON_KEY : undefined;
  if (envUrl && envUrl.trim() && envKey && envKey.trim()) {
    return 'custom';
  }
  return currentMode;
}

export function switchDbMode(newMode: 'normal' | 'test' | 'custom'): void {
  currentMode = newMode;
  safeStorage.setItem('femvotacions_dbmode', newMode);
  sClient = null;
}

export function setCustomConfig(url: string, key: string): void {
  safeStorage.setItem('femvotacions_custom_url', url.trim());
  safeStorage.setItem('femvotacions_custom_key', key.trim());
  safeStorage.setItem('femvotacions_dbmode', 'custom');
  currentMode = 'custom';
  sClient = null;
}

export function clearCustomConfig(): void {
  safeStorage.removeItem('femvotacions_custom_url');
  safeStorage.removeItem('femvotacions_custom_key');
  safeStorage.setItem('femvotacions_dbmode', 'test');
  currentMode = 'test';
  sClient = null;
}

export interface ReplicationAnalysis {
  editions: {
    id: number;
    status: string;
    existsInReal: boolean;
  }[];
  projectsCount: number;
  photosCount: number;
  votesCount: number;
  usersAnalysis: {
    totalVoters: number;
    existingVotersInReal: number;
    missingVoters: {
      id: string;
      display_name: string;
      email: string;
      role: 'admin' | 'participant';
      zampa_role?: 'admin' | 'editor' | 'user';
    }[];
  };
}

export async function analyzeZampaReplication(): Promise<ReplicationAnalysis> {
  const testConfig = SUPABASE_CONFIGS.test;
  const normalConfig = SUPABASE_CONFIGS.normal;

  const testClient = createClient(testConfig.url, testConfig.key);
  const normalClient = createClient(normalConfig.url, normalConfig.key);

  try {
    // 1. Fetch all Zampa info from TEST
    const { data: testEditions } = await testClient.from('zampa_editions').select('*');
    const { data: testProjects } = await testClient.from('zampa_projects').select('*');
    const { data: testPhotos } = await testClient.from('zampa_photos').select('*');
    const { data: testUserRanks } = await testClient.from('zampa_user_ranks').select('*');

    // 2. Fetch editions from NORMAL/REAL to see if they exist
    const { data: realEditions } = await normalClient.from('zampa_editions').select('id');
    const realEditionIds = new Set((realEditions || []).map(e => e.id));

    const editionsAnalysis = (testEditions || []).map(e => ({
      id: e.id,
      status: e.status,
      existsInReal: realEditionIds.has(e.id)
    }));

    // 3. User analysis
    const voterIds = Array.from(new Set((testUserRanks || []).map(r => r.user_id)));
    
    let missingVoters: any[] = [];
    let existingVotersCount = 0;

    if (voterIds.length > 0) {
      const { data: testVoters } = await testClient.from('users').select('*').in('id', voterIds);
      // Fetch from real
      const { data: realVoters } = await normalClient.from('users').select('id, email');
      const realVoterIds = new Set((realVoters || []).map(v => v.id));
      const realVoterEmails = new Set((realVoters || []).map(v => v.email?.toLowerCase()));

      if (testVoters) {
        for (const v of testVoters) {
          const isIdExists = realVoterIds.has(v.id);
          const isEmailExists = v.email && realVoterEmails.has(v.email.toLowerCase());
          
          if (isIdExists || isEmailExists) {
            existingVotersCount++;
          } else {
            missingVoters.push({
              id: v.id,
              display_name: v.display_name || v.name || 'Usuari sense nom',
              email: v.email,
              role: v.role || 'participant',
              zampa_role: v.zampa_role || 'user'
            });
          }
        }
      }
    }

    return {
      editions: editionsAnalysis,
      projectsCount: testProjects?.length || 0,
      photosCount: testPhotos?.length || 0,
      votesCount: testUserRanks?.length || 0,
      usersAnalysis: {
        totalVoters: voterIds.length,
        existingVotersInReal: existingVotersCount,
        missingVoters
      }
    };
  } catch (error: any) {
    console.error('Error analitzant rèplica:', error);
    return {
      editions: [],
      projectsCount: 0,
      photosCount: 0,
      votesCount: 0,
      usersAnalysis: { totalVoters: 0, existingVotersInReal: 0, missingVoters: [] }
    };
  }
}

export async function replicateZampaFromTestToNormal(copyMissingUsers: boolean = true): Promise<{ success: boolean; message: string }> {
  try {
    const testConfig = SUPABASE_CONFIGS.test;
    const normalConfig = SUPABASE_CONFIGS.normal;

    const testClient = createClient(testConfig.url, testConfig.key);
    const normalClient = createClient(normalConfig.url, normalConfig.key);

    // 1. Fetch all data from TEST
    const { data: testEditions, error: errEd1 } = await testClient.from('zampa_editions').select('*');
    if (errEd1) throw new Error(`Error llegint edicions de test: ${errEd1.message}`);

    const { data: testProjects, error: errPr1 } = await testClient.from('zampa_projects').select('*');
    if (errPr1) throw new Error(`Error llegint projectes de test: ${errPr1.message}`);

    const { data: testPhotos, error: errPh1 } = await testClient.from('zampa_photos').select('*');
    if (errPh1) throw new Error(`Error llegint fotos de test: ${errPh1.message}`);

    const { data: testUserRanks, error: errUr1 } = await testClient.from('zampa_user_ranks').select('*');
    if (errUr1) throw new Error(`Error llegint vots de test: ${errUr1.message}`);

    // 2. Handle missing users if needed
    const userIdMap = new Map<string, string>(); // test_user_id -> real_user_id

    if (testUserRanks && testUserRanks.length > 0) {
      const voterIds = Array.from(new Set(testUserRanks.map(r => r.user_id)));
      if (voterIds.length > 0) {
        const { data: testVoters } = await testClient.from('users').select('*').in('id', voterIds);
        const { data: realVoters } = await normalClient.from('users').select('id, email');
        
        const realVoterIds = new Set((realVoters || []).map(v => v.id));
        const realVoterEmailMap = new Map<string, string>(); // lowercase_email -> real_user_id
        if (realVoters) {
          realVoters.forEach(v => {
            if (v.email) {
              realVoterEmailMap.set(v.email.toLowerCase(), v.id);
            }
          });
        }

        const usersToInsert: any[] = [];
        if (testVoters) {
          for (const v of testVoters) {
            const isIdExists = realVoterIds.has(v.id);
            const emailKey = v.email ? v.email.toLowerCase() : null;
            const existingRealIdByEmail = emailKey ? realVoterEmailMap.get(emailKey) : null;

            if (isIdExists) {
              // Exact ID match exists, map it to itself
              userIdMap.set(v.id, v.id);
            } else if (existingRealIdByEmail) {
              // Email match exists but with a different ID, map test ID to the existing real ID
              userIdMap.set(v.id, existingRealIdByEmail);
            } else {
              // User doesn't exist in Real at all. We will insert them with their original Test ID.
              userIdMap.set(v.id, v.id);

              if (copyMissingUsers) {
                const u: any = {
                  id: v.id,
                  display_name: v.display_name || v.name || 'Usuari sense nom',
                  email: v.email,
                  password: v.password || '',
                  role: v.role || 'participant',
                  zampa_role: v.zampa_role || 'user'
                };
                if ('name' in v) u.name = v.name;
                if ('username' in v) u.username = v.username;
                if ('created_at' in v) u.created_at = v.created_at;
                
                usersToInsert.push(u);
              }
            }
          }
        }

        if (usersToInsert.length > 0 && copyMissingUsers) {
          const { error: errInsUs } = await normalClient.from('users').insert(usersToInsert);
          if (errInsUs) throw new Error(`Error creant usuaris a real: ${errInsUs.message}`);
        }
      }
    }

    // 3. Clear old data from NORMAL
    if (testEditions && testEditions.length > 0) {
      const editionIds = testEditions.map(e => e.id);
      
      // Clear votes of normal matching test editions
      await normalClient.from('zampa_user_ranks').delete().in('edition_year', editionIds);

      // Nullify the winners in Normal editions to avoid reference constraints
      await normalClient.from('zampa_editions').update({ official_winner_adult: null }).in('id', editionIds);
      
      // Also delete photos and projects matching test editions
      const projectIds = testProjects?.map(p => p.id) || [];
      if (projectIds.length > 0) {
        await normalClient.from('zampa_photos').delete().in('project_id', projectIds);
        await normalClient.from('zampa_projects').delete().in('id', projectIds);
      }
      
      await normalClient.from('zampa_editions').delete().in('id', editionIds);
    }

    // 4. Insert into NORMAL
    if (testEditions && testEditions.length > 0) {
      // Step A: Insert editions with NULL winners
      const editionsToInsert = testEditions.map(e => ({
        id: e.id,
        status: e.status,
        official_winner_adult: null
      }));
      const { error: errInsEd } = await normalClient.from('zampa_editions').insert(editionsToInsert);
      if (errInsEd) throw new Error(`Error creant edicions a real: ${errInsEd.message}`);

      // Step B: Insert projects
      if (testProjects && testProjects.length > 0) {
        const { error: errInsPr } = await normalClient.from('zampa_projects').insert(testProjects);
        if (errInsPr) throw new Error(`Error creant projectes a real: ${errInsPr.message}`);
      }

      // Step C: Insert photos
      if (testPhotos && testPhotos.length > 0) {
        const { error: errInsPh } = await normalClient.from('zampa_photos').insert(testPhotos);
        if (errInsPh) throw new Error(`Error creant fotos a real: ${errInsPh.message}`);
      }

      // Step D: Insert user ranks (votes)
      if (testUserRanks && testUserRanks.length > 0) {
        const ranksToInsert = testUserRanks.map(r => ({
          ...r,
          user_id: userIdMap.get(r.user_id) || r.user_id
        }));
        const { error: errInsUr } = await normalClient.from('zampa_user_ranks').insert(ranksToInsert);
        if (errInsUr) throw new Error(`Error creant vots de socis a real: ${errInsUr.message}`);
      }

      // Step E: Update editions with non-null winners if any
      for (const e of testEditions) {
        if (e.official_winner_adult) {
          await normalClient.from('zampa_editions')
            .update({
              official_winner_adult: e.official_winner_adult || null
            })
            .eq('id', e.id);
        }
      }
    }

    return { success: true, message: `La rèplica s'ha completat amb èxit: s'han passat totes les edicions, projectes, fotos i un total de ${testUserRanks?.length || 0} vots de socis a la base real.` };
  } catch (error: any) {
    console.error('Error en la rèplica:', error);
    return { success: false, message: error.message || 'Error desconegut durant la rèplica.' };
  }
}


