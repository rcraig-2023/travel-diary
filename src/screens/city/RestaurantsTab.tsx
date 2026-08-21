import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, Alert, Modal, ScrollView, ActivityIndicator,
  Platform, Keyboard, KeyboardEvent,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Restaurant } from '../../types';

type Props = {
  tripId: string;
  cityName?: string;
  country?: string | null;
};

const STARS = [1, 2, 3, 4, 5];

const CUISINES = [
  { emoji: '🇪🇺', label: 'European' },
  { emoji: '🇩🇪', label: 'German' },
  { emoji: '🍕', label: 'Italian' },
  { emoji: '🍣', label: 'Japanese' },
  { emoji: '🌮', label: 'Mexican' },
  { emoji: '🥘', label: 'Spanish' },
  { emoji: '🥐', label: 'French' },
  { emoji: '🥗', label: 'Mediterranean' },
  { emoji: '🍜', label: 'Chinese' },
  { emoji: '🍛', label: 'Indian' },
  { emoji: '🍔', label: 'American' },
  { emoji: '🍲', label: 'Thai' },
  { emoji: '🧆', label: 'Middle Eastern' },
  { emoji: '🍱', label: 'Korean' },
  { emoji: '🇬🇷', label: 'Greek' },
  { emoji: '☕', label: 'Cafe / Bakery' },
];

const KEYWORD_CUISINE_MAP: { [key: string]: string } = {
  trattoria: 'Italian',
  osteria: 'Italian',
  pizzeria: 'Italian',
  ristorante: 'Italian',
  pasta: 'Italian',
  pizza: 'Italian',
  izakaya: 'Japanese',
  ramen: 'Japanese',
  sushi: 'Japanese',
  yakitori: 'Japanese',
  udon: 'Japanese',
  taqueria: 'Mexican',
  cantina: 'Mexican',
  tacos: 'Mexican',
  burrito: 'Mexican',
  brasserie: 'French',
  bistrot: 'French',
  bistro: 'French',
  creperie: 'French',
  boulangerie: 'French',
  brauhaus: 'German',
  biergarten: 'German',
  gasthaus: 'German',
  kneipe: 'German',
  schnitzel: 'German',
  tapas: 'Spanish',
  bodega: 'Spanish',
  paella: 'Spanish',
  curry: 'Indian',
  tandoori: 'Indian',
  biryani: 'Indian',
  masala: 'Indian',
  pho: 'Vietnamese',
  'banh mi': 'Vietnamese',
  vietnamese: 'Vietnamese',
  'dim sum': 'Chinese',
  dumpling: 'Chinese',
  hotpot: 'Chinese',
  burger: 'American',
  diner: 'American',
  smokehouse: 'American',
  bibimbap: 'Korean',
  kimchi: 'Korean',
  souvlaki: 'Greek',
  gyros: 'Greek',
  taverna: 'Greek',
  falafel: 'Middle Eastern',
  shawarma: 'Middle Eastern',
  hummus: 'Middle Eastern',
  kebab: 'Middle Eastern',
  bakery: 'Cafe / Bakery',
  cafe: 'Cafe / Bakery',
  kaffee: 'Cafe / Bakery',
  patisserie: 'Cafe / Bakery',
};

const formatCuisineTag = (raw: string): string => {
  return raw
    .split(/[;,/]/)
    .map((s) => s.trim().replace(/_/g, ' '))
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(', ');
};

export default function RestaurantsTab({ tripId, cityName, country }: Props) {
  const { user } = useAuth();
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRating, setNewRating] = useState(0);
  const [newNotes, setNewNotes] = useState('');
  const [newCuisine, setNewCuisine] = useState('');
  const [newRecommended, setNewRecommended] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [detectionNote, setDetectionNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [kbHeight, setKbHeight] = useState(0);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchRestaurants();
  }, [tripId]);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardWillShow', (e: KeyboardEvent) =>
      setKbHeight(e.endCoordinates.height)
    );
    const hide = Keyboard.addListener('keyboardWillHide', () => setKbHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const fetchRestaurants = async () => {
    try {
      const { data, error } = await supabase
        .from('restaurants')
        .select('*')
        .eq('trip_id', tripId)
        .order('created_at', { ascending: true });
      if (!error && data) setRestaurants(data as Restaurant[]);
    } catch (e) {
      console.warn('[Restaurants] fetch error:', e);
    }
  };

  // Automatic non-AI cuisine detection via local rules + OpenStreetMap Nominatim
  const detectCuisineForName = useCallback(
    async (name: string) => {
      const query = name.trim().toLowerCase();
      if (query.length < 2) {
        setDetectionNote(null);
        return;
      }

      // Fast local keyword heuristic
      for (const [kw, cuisine] of Object.entries(KEYWORD_CUISINE_MAP)) {
        if (query.includes(kw)) {
          setNewCuisine((prev) => (prev ? prev : cuisine));
          setDetectionNote(`Detected from keyword: ${cuisine}`);
          break;
        }
      }

      // Query OpenStreetMap Nominatim for exact place metadata
      setDetecting(true);
      try {
        const searchQuery = `${name} ${cityName || ''} ${country || ''}`.trim();
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
            searchQuery
          )}&format=json&extratags=1&addressdetails=1&limit=3`,
          { headers: { 'User-Agent': 'TravelDiaryApp/1.0' } }
        );
        const results = await res.json();

        if (Array.isArray(results) && results.length > 0) {
          const matchWithCuisine = results.find(
            (r: any) => r.extratags?.cuisine || r.type === 'restaurant' || r.class === 'amenity'
          );

          if (matchWithCuisine?.extratags?.cuisine) {
            const formatted = formatCuisineTag(matchWithCuisine.extratags.cuisine);
            setNewCuisine(formatted);
            setDetectionNote(`✨ Auto-detected: ${formatted}`);
          } else if (matchWithCuisine?.type && matchWithCuisine.type !== 'yes') {
            const formattedType = formatCuisineTag(matchWithCuisine.type);
            setNewCuisine((prev) => (prev ? prev : formattedType));
            setDetectionNote(`✨ Found place type: ${formattedType}`);
          }
        }
      } catch (err) {
        console.log('[Restaurants] OSM detection error:', err);
      } finally {
        setDetecting(false);
      }
    },
    [cityName, country]
  );

  const handleNameChange = (text: string) => {
    setNewName(text);
    if (searchDebounce.current) clearTimeout(searchDebounce.current);

    if (text.trim().length >= 2) {
      searchDebounce.current = setTimeout(() => {
        detectCuisineForName(text);
      }, 500);
    } else {
      setDetectionNote(null);
    }
  };

  const saveRestaurant = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('restaurants').insert({
        trip_id: tripId,
        user_id: user!.id,
        name: newName.trim(),
        rating: newRating || null,
        notes: newNotes.trim() || null,
        cuisine: newCuisine.trim() || null,
        recommended: newRecommended,
        source: 'manual',
      });
      if (error) {
        Alert.alert('Error', error.message);
        return;
      }
      resetForm();
      fetchRestaurants();
    } catch (err: any) {
      Alert.alert('Save Failed', err.message || 'Unable to save restaurant.');
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setShowAdd(false);
    setNewName('');
    setNewRating(0);
    setNewNotes('');
    setNewCuisine('');
    setNewRecommended(false);
    setDetectionNote(null);
  };

  const deleteRestaurant = async (id: string) => {
    Alert.alert('Delete Restaurant', 'Are you sure you want to remove this restaurant?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('restaurants').delete().eq('id', id);
          setRestaurants((prev) => prev.filter((r) => r.id !== id));
        },
      },
    ]);
  };

  const renderStars = (rating: number | null) => {
    if (!rating) return null;
    return <Text style={styles.stars}>{'★'.repeat(rating)}{'☆'.repeat(5 - rating)}</Text>;
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={restaurants}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.nameRow}>
                <Text style={styles.cardName}>{item.name}</Text>
                {item.recommended && (
                  <View style={styles.recommendBadge}>
                    <Text style={styles.recommendBadgeText}>✓ Recommended</Text>
                  </View>
                )}
              </View>
              <TouchableOpacity onPress={() => deleteRestaurant(item.id)}>
                <Text style={styles.deleteText}>✕</Text>
              </TouchableOpacity>
            </View>

            {item.cuisine ? (
              <View style={styles.cuisineBadge}>
                <Text style={styles.cuisineBadgeText}>{item.cuisine}</Text>
              </View>
            ) : null}

            {renderStars(item.rating)}
            {item.notes ? <Text style={styles.notes}>{item.notes}</Text> : null}
            {item.source === 'ai' && <Text style={styles.aiBadge}>AI detected</Text>}
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            No restaurants yet. Add one below to track your favorite food spots.
          </Text>
        }
      />

      <View style={styles.bottomDock}>
        <TouchableOpacity style={styles.addButton} onPress={() => setShowAdd(true)}>
          <Text style={styles.addButtonText}>+ Add Restaurant</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={showAdd} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Add Restaurant</Text>
            <TouchableOpacity onPress={resetForm}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.modalBody}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: kbHeight + 60 }}
          >
            <Text style={styles.label}>NAME *</Text>
            <View style={styles.inputWithSpinner}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder={cityName ? `e.g. Barra in ${cityName}` : 'Restaurant name'}
                placeholderTextColor="#999"
                value={newName}
                onChangeText={handleNameChange}
                autoFocus
              />
              {detecting && (
                <ActivityIndicator
                  size="small"
                  color="#00A699"
                  style={styles.inlineSpinner}
                />
              )}
            </View>

            {detectionNote ? (
              <View style={styles.detectionBanner}>
                <Text style={styles.detectionText}>{detectionNote}</Text>
              </View>
            ) : null}

            <Text style={styles.label}>CUISINE</Text>
            <TextInput
              style={[styles.input, { marginBottom: 10 }]}
              placeholder="e.g. Modern European, Tapas, Bakery..."
              placeholderTextColor="#999"
              value={newCuisine}
              onChangeText={(val) => {
                setNewCuisine(val);
                setDetectionNote(null);
              }}
            />

            <View style={styles.chipGrid}>
              {CUISINES.map((c) => {
                const tag = `${c.emoji} ${c.label}`;
                const isSelected =
                  newCuisine.toLowerCase().includes(c.label.toLowerCase()) ||
                  newCuisine === tag;
                return (
                  <TouchableOpacity
                    key={c.label}
                    style={[styles.cuisineChip, isSelected && styles.cuisineChipSelected]}
                    onPress={() => {
                      setNewCuisine(isSelected ? '' : c.label);
                      setDetectionNote(null);
                    }}
                  >
                    <Text
                      style={[
                        styles.cuisineChipText,
                        isSelected && styles.cuisineChipTextSelected,
                      ]}
                    >
                      {c.emoji} {c.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Recommend Checkbox */}
            <Text style={styles.label}>RECOMMENDATION</Text>
            <TouchableOpacity
              style={styles.recommendRow}
              activeOpacity={0.7}
              onPress={() => setNewRecommended(!newRecommended)}
            >
              <View
                style={[
                  styles.checkbox,
                  newRecommended && styles.checkboxChecked,
                ]}
              >
                {newRecommended && <Text style={styles.checkIcon}>✓</Text>}
              </View>
              <Text style={styles.recommendLabel}>Recommend?</Text>
              <Text style={styles.recommendSub}>
                {newRecommended ? '(Marked as recommended)' : '(Tap to recommend)'}
              </Text>
            </TouchableOpacity>

            <Text style={styles.label}>RATING</Text>
            <View style={styles.starPicker}>
              {STARS.map((s) => (
                <TouchableOpacity
                  key={s}
                  onPress={() => setNewRating(s === newRating ? 0 : s)}
                >
                  <Text
                    style={[styles.starOption, s <= newRating && styles.starSelected]}
                  >
                    ★
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>NOTES</Text>
            <TextInput
              style={[styles.input, styles.notesInput]}
              placeholder="What did you love? Any must-order dishes?"
              placeholderTextColor="#999"
              value={newNotes}
              onChangeText={setNewNotes}
              multiline
            />

            <TouchableOpacity
              style={[
                styles.saveBtn,
                (!newName.trim() || saving) && styles.saveBtnDisabled,
              ]}
              onPress={saveRestaurant}
              disabled={!newName.trim() || saving}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveBtnText}>Save Restaurant</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  list: { padding: 16, paddingBottom: 8 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    flex: 1,
    gap: 8,
  },
  cardName: { fontSize: 16, fontWeight: '700', color: '#111' },
  recommendBadge: {
    backgroundColor: '#E6F4EA',
    borderColor: '#34A853',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  recommendBadgeText: {
    fontSize: 11,
    color: '#137333',
    fontWeight: '700',
  },
  deleteText: { fontSize: 16, color: '#ccc', paddingLeft: 10 },
  cuisineBadge: {
    alignSelf: 'flex-start',
    marginTop: 6,
    backgroundColor: '#F0FAFA',
    borderRadius: 20,
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#C8EEEB',
  },
  cuisineBadgeText: { fontSize: 13, color: '#00A699', fontWeight: '600' },
  stars: { fontSize: 16, color: '#FFD700', marginTop: 4 },
  notes: { fontSize: 14, color: '#555', marginTop: 6, lineHeight: 20 },
  aiBadge: {
    fontSize: 11,
    color: '#00A699',
    marginTop: 6,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    marginTop: 50,
    fontSize: 15,
    paddingHorizontal: 30,
  },
  bottomDock: {
    paddingHorizontal: 20,
    paddingTop: 15,
    paddingBottom: 40,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  addButton: {
    backgroundColor: '#000',
    paddingVertical: 18,
    borderRadius: 30,
    alignItems: 'center',
  },
  addButtonText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  modal: { flex: 1, backgroundColor: '#fff' },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  modalTitle: { fontSize: 20, fontWeight: 'bold' },
  cancelText: { fontSize: 16, color: '#666' },
  modalBody: { padding: 20 },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
    marginBottom: 8,
    marginTop: 16,
    letterSpacing: 0.5,
  },
  inputWithSpinner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inlineSpinner: {
    position: 'absolute',
    right: 14,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    color: '#000',
    backgroundColor: '#fff',
  },
  detectionBanner: {
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginTop: 6,
  },
  detectionText: {
    fontSize: 13,
    color: '#2E7D32',
    fontWeight: '600',
  },
  notesInput: { height: 100, textAlignVertical: 'top' },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cuisineChip: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 20,
    paddingVertical: 7,
    paddingHorizontal: 14,
    backgroundColor: '#fff',
  },
  cuisineChipSelected: { backgroundColor: '#000', borderColor: '#000' },
  cuisineChipText: { fontSize: 14, color: '#333' },
  cuisineChipTextSelected: { color: '#fff' },
  recommendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9F9F9',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EAEAEA',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#999',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    backgroundColor: '#fff',
  },
  checkboxChecked: {
    backgroundColor: '#000',
    borderColor: '#000',
  },
  checkIcon: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  recommendLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
  },
  recommendSub: {
    fontSize: 13,
    color: '#888',
    marginLeft: 8,
  },
  starPicker: { flexDirection: 'row', gap: 8 },
  starOption: { fontSize: 32, color: '#ddd' },
  starSelected: { color: '#FFD700' },
  saveBtn: {
    backgroundColor: '#000',
    paddingVertical: 16,
    borderRadius: 30,
    alignItems: 'center',
    marginTop: 30,
  },
  saveBtnDisabled: { backgroundColor: '#ccc' },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
