export interface User {
  id: string;
  display_name: string;
  email: string;
  password?: string;
  role: 'admin' | 'participant';
  zampa_role?: 'admin' | 'editor' | 'user';
  created_at?: string;
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
