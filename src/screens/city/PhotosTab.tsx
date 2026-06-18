import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, Image, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Modal, Pressable,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../lib/supabase';
import { analyzePhoto } from '../../lib/gemini';
import { useAuth } from '../../context/AuthContext';
import { Photo, AiTags } from '../../types';

type Props = { tripId: string };

type Suggestion = { type: 'landmark' | 'restaurant'; name: string };

export default function PhotosTab({ tripId }: Props) {
  const { user } = useAuth();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [pendingTripId, setPendingTripId] = useState<string | null>(null);

  useEffect(() => {
    fetchPhotos();
  }, [tripId]);

  const fetchPhotos = async () => {
    const { data, error } = await supabase
      .from('photos')
      .select('*')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: false });
    if (!error && data) setPhotos(data as Photo[]);
  };

  const pickAndUpload = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo library access in Settings.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      base64: true,
    });

    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    setUploading(true);

    try {
      const ext = asset.uri.split('.').pop() ?? 'jpg';
      const fileName = `${Date.now()}.${ext}`;
      const storagePath = `${user!.id}/${tripId}/${fileName}`;

      const fetchRes = await fetch(asset.uri);
      const blob = await fetchRes.blob();

      const { error: uploadError } = await supabase.storage
        .from('photos')
        .upload(storagePath, blob, { contentType: `image/${ext}`, upsert: false });

      if (uploadError) throw new Error(uploadError.message);

      const { data: { publicUrl } } = supabase.storage.from('photos').getPublicUrl(storagePath);

      let aiTags: AiTags = { landmarks: [], restaurants: [], tags: [] };
      if (asset.base64) {
        aiTags = await analyzePhoto(asset.base64);
      }

      const { error: dbError } = await supabase.from('photos').insert({
        trip_id: tripId,
        user_id: user!.id,
        storage_path: storagePath,
        url: publicUrl,
        ai_tags: aiTags,
      });

      if (dbError) throw new Error(dbError.message);

      fetchPhotos();

      const found: Suggestion[] = [
        ...aiTags.landmarks.map((name) => ({ type: 'landmark' as const, name })),
        ...aiTags.restaurants.map((name) => ({ type: 'restaurant' as const, name })),
      ];
      if (found.length > 0) {
        setSuggestions(found);
        setPendingTripId(tripId);
        setShowSuggestions(true);
      }
    } catch (err: any) {
      Alert.alert('Upload failed', err.message);
    } finally {
      setUploading(false);
    }
  };

  const acceptSuggestion = async (s: Suggestion) => {
    const table = s.type === 'landmark' ? 'landmarks' : 'restaurants';
    await supabase.from(table).insert({
      trip_id: pendingTripId,
      user_id: user!.id,
      name: s.name,
      source: 'ai',
      ...(s.type === 'landmark' ? { visited: false } : {}),
    });
    setSuggestions((prev) => prev.filter((x) => x.name !== s.name || x.type !== s.type));
  };

  const dismissSuggestions = () => {
    setShowSuggestions(false);
    setSuggestions([]);
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={photos}
        keyExtractor={(item) => item.id}
        numColumns={2}
        contentContainerStyle={styles.gallery}
        renderItem={({ item }) => (
          <Image source={{ uri: item.url }} style={styles.photo} />
        )}
        ListEmptyComponent={
          !uploading ? (
            <Text style={styles.emptyText}>No photos yet. Tap below to add your first one.</Text>
          ) : null
        }
      />

      <View style={styles.bottomDock}>
        <TouchableOpacity style={styles.addButton} onPress={pickAndUpload} disabled={uploading}>
          {uploading ? (
            <View style={styles.uploadingRow}>
              <ActivityIndicator color="#fff" />
              <Text style={[styles.addButtonText, { marginLeft: 10 }]}>Analyzing photo...</Text>
            </View>
          ) : (
            <Text style={styles.addButtonText}>+ Add Photo</Text>
          )}
        </TouchableOpacity>
      </View>

      <Modal visible={showSuggestions} animationType="slide" presentationStyle="pageSheet" transparent>
        <View style={styles.suggestionOverlay}>
          <View style={styles.suggestionSheet}>
            <Text style={styles.suggestionTitle}>Detected in your photo</Text>
            <Text style={styles.suggestionSub}>Tap to add to your trip's lists</Text>
            {suggestions.map((s) => (
              <TouchableOpacity key={`${s.type}-${s.name}`} style={styles.suggestionRow} onPress={() => acceptSuggestion(s)}>
                <Text style={styles.suggestionIcon}>{s.type === 'landmark' ? '🗺️' : '🍽️'}</Text>
                <View style={styles.suggestionInfo}>
                  <Text style={styles.suggestionName}>{s.name}</Text>
                  <Text style={styles.suggestionType}>{s.type === 'landmark' ? 'Landmark' : 'Restaurant'}</Text>
                </View>
                <Text style={styles.suggestionAdd}>+ Add</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.dismissBtn} onPress={dismissSuggestions}>
              <Text style={styles.dismissText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  gallery: { padding: 10 },
  photo: { flex: 1, aspectRatio: 1, margin: 5, borderRadius: 10, backgroundColor: '#f0f0f0' },
  emptyText: { textAlign: 'center', color: '#999', marginTop: 50, fontSize: 15, paddingHorizontal: 30 },
  bottomDock: {
    paddingHorizontal: 20, paddingTop: 15, paddingBottom: 40,
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f0f0f0',
  },
  addButton: {
    backgroundColor: '#000', paddingVertical: 18, borderRadius: 30, alignItems: 'center',
  },
  addButtonText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  uploadingRow: { flexDirection: 'row', alignItems: 'center' },
  suggestionOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  suggestionSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, paddingBottom: 40,
  },
  suggestionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
  suggestionSub: { fontSize: 14, color: '#888', marginBottom: 20 },
  suggestionRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  suggestionIcon: { fontSize: 24, marginRight: 12 },
  suggestionInfo: { flex: 1 },
  suggestionName: { fontSize: 16, fontWeight: '600', color: '#111' },
  suggestionType: { fontSize: 13, color: '#888', marginTop: 2 },
  suggestionAdd: { fontSize: 15, fontWeight: '600', color: '#00A699' },
  dismissBtn: { marginTop: 20, alignItems: 'center' },
  dismissText: { fontSize: 16, color: '#666' },
});
