export type Trip = {
  id: string;
  user_id: string;
  city_name: string;
  country: string | null;
  lat: number;
  lng: number;
  visit_date: string | null;
  cover_photo_url: string | null;
  created_at: string;
};

export type Photo = {
  id: string;
  trip_id: string;
  user_id: string;
  storage_path: string;
  url: string;
  ai_tags: AiTags | null;
  created_at: string;
};

export type AiTags = {
  landmarks: string[];
  restaurants: string[];
  tags: string[];
};

export type Jot = {
  id: string;
  trip_id: string;
  user_id: string;
  content: string;
  created_at: string;
};

export type Landmark = {
  id: string;
  trip_id: string;
  user_id: string;
  name: string;
  visited: boolean;
  source: 'manual' | 'ai';
  created_at: string;
};

export type Restaurant = {
  id: string;
  trip_id: string;
  user_id: string;
  name: string;
  rating: number | null;
  notes: string | null;
  source: 'manual' | 'ai';
  created_at: string;
};
