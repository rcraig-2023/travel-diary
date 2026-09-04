export type TripStatus = 'future' | 'current' | 'past';

export type Trip = {
  id: string;
  user_id: string;
  city_name: string;
  country: string | null;
  lat: number;
  lng: number;
  visit_date: string | null;
  end_date?: string | null;
  status?: TripStatus;
  cover_photo_url: string | null;
  created_at: string;
};

export type ItineraryCategory = 'activity' | 'transit' | 'restaurant' | 'lodging' | 'ticket' | 'general';

export type ItineraryItem = {
  id: string;
  trip_id: string;
  user_id: string;
  title: string;
  item_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  location?: string | null;
  transit_route?: string | null;
  ticket_info?: string | null;
  category?: ItineraryCategory | string;
  notes?: string | null;
  completed?: boolean;
  created_at: string;
};

export type AuthorshipMetadata = {
  author_id: string;
  author_name: string | null;
  author_email: string | null;
  camera_make?: string | null;
  camera_model?: string | null;
  lens_model?: string | null;
  software?: string | null;
  device_platform?: string;
  captured_at?: string | null;
  uploaded_at: string;
};

export type Photo = {
  id: string;
  trip_id: string;
  user_id: string;
  itinerary_item_id?: string | null;
  storage_path: string;
  url: string;
  lat?: number | null;
  lng?: number | null;
  taken_at?: string | null;
  author_name?: string | null;
  author_email?: string | null;
  camera_model?: string | null;
  ai_tags: AiTags | null;
  created_at: string;
};

export type AiTags = {
  landmarks: string[];
  restaurants: string[];
  tags: string[];
  authorship?: AuthorshipMetadata;
  exif?: Record<string, any>;
};

export type Jot = {
  id: string;
  trip_id: string;
  user_id: string;
  itinerary_item_id?: string | null;
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
  itinerary_item_id?: string | null;
  name: string;
  rating: number | null;
  notes: string | null;
  cuisine: string | null;
  recommended?: boolean | null;
  visit_date?: string | null;
  source: 'manual' | 'ai';
  created_at: string;
};
