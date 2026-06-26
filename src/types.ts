export interface User {
  id: string;
  display_name: string;
  email: string;
  password?: string;
  role: 'admin' | 'participant';
  zampa_role?: 'admin' | 'editor' | 'user';
  created_at?: string;
}

export interface Objective {
  id: string;
  title: string;
  description: string;
  status: 'active' | 'finished' | 'inactive';
  uploads_enabled: boolean;
  voting_enabled: boolean;
  start_date?: string;
  end_date?: string;
  created_by?: string;
}

export interface PhotoSubmission {
  id: string;
  userId: string;
  objectiveId: string;
  fileName: string;
  url: string;
  originalUrl?: string;
  fileSize?: string;
  published: boolean;
  revealed: boolean;
  submitted_at?: string;
}

export interface Vote {
  id: string;
  userId: string;
  photoId: string;
  objectiveId: string;
  creativity: number;
  theme: number;
  composition: number;
  created_at?: string;
}

export interface AppSettings {
  uploads_enabled: boolean;
  voting_enabled: boolean;
  namesRevealed: boolean;
  rankingHidden: boolean;
  force_hide_upload: boolean;
  force_hide_vote: boolean;
  force_hide_resultats: boolean;
  force_hide_classificacio: boolean;
}

// Zampa Custom Interfaces
export interface ZampaEdition {
  id: number; // Year, e.g., 2026
  status: 'open' | 'vote' | 'closed' | 'finished';
  official_winner_adult?: string | null;
}

export interface ZampaProject {
  id: string;
  edition_year: number;
  category?: 'adult';
  author_name: string;
  project_title: string;
  description?: string;
  popular_rank_position?: number | null;
  submitted_at?: string;
}

export interface ZampaPhoto {
  id: string;
  project_id: string;
  file_url: string;
  file_name?: string;
  photo_title?: string;
  description?: string;
  order_index: number;
}

export interface ZampaUserRank {
  id?: number;
  user_id: string;
  project_id: string;
  edition_year: number;
  category?: 'adult';
  assigned_position: number;
  submitted_at?: string;
}
