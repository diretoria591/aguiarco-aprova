export type PostStatus = 'pending' | 'adjustment_requested' | 'approved' | 'rejected';
export type ClientSegment = '' | 'saude' | 'gastronomia' | 'beleza' | 'empresas' | 'outra';
export type PostFormat = 'foto' | 'video' | 'reels' | 'carrossel' | 'arte' | 'stories' | 'texto';

export interface Client {
  id: string;
  name: string;
  logo_url: string | null;
  logo_path: string | null;
  contact_name: string;
  whatsapp: string;
  email: string;
  access_token: string;
  last_accessed_at: string | null;
  created_at: string;
  instagram?: string;
  segment?: ClientSegment;
}

export interface PostMedia {
  id: string;
  post_id: string;
  file_url: string;
  storage_path: string | null;
  file_type: string;
  file_name: string;
  order_index: number;
}

export interface Comment {
  id: string;
  post_id: string;
  author_name: string;
  author_role: 'agency' | 'client';
  kind: 'comment' | 'approval' | 'adjustment' | 'version' | 'rejection';
  content: string;
  version: number;
  created_at: string;
}

export interface Post {
  id: string;
  client_id: string;
  title: string;
  caption: string;
  format: PostFormat;
  status: PostStatus;
  scheduled_date: string | null;
  version: number;
  sent_at: string;
  first_viewed_at: string | null;
  decided_at: string | null;
  decided_by: string | null;
  created_at: string;
  approved_at?: string | null;
  scheduled_at?: string | null;
  scheduled_by?: string | null;
  client_notified_at?: string | null;
  client_notified_by?: string | null;
  schedule_note?: string | null;
  featured_professional?: string;
  post_media: PostMedia[];
  comments: Comment[];
}

export interface ActivityLog {
  id: string;
  client_id: string;
  post_id: string | null;
  type: string;
  actor: string;
  meta: string;
  action_text: string;
  created_at: string;
  clients?: { name: string } | null;
  posts?: { title: string } | null;
}

export type TeamRole = 'admin' | 'scheduler' | 'team';

export interface Profile {
  id: string;
  name: string;
  email: string;
  role?: TeamRole;
  created_at: string;
}

export interface Counts {
  pendente: number;
  ajustes: number;
  aprovado: number;
  reprovado: number;
}
