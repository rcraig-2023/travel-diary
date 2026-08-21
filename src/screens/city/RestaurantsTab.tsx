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
  const [showModal, setShowModal] = useState(false);
  const [editingRestaurant, setEditingRestaurant] = useState<Restaurant | null>(null);

  const [newName, setNewName] = useState('');
  const [newRating, setNewRating] = useState(0);
  const [newNotes, setNewNotes] = useState('');
  const [newCuisine, setNewCuisine] = useState('');
  const [newRecommended, setNewRecommended] = useState(false);
  const [newVisitDate, setNewVisitDate] = useState('');

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

    if (text.trim().length >= 2 && !editingRestaurant) {
      searchDebounce.current = setTimeout(() => {
        detectCuisineForName(text);
      }, 500);
    } else {
      setDetectionNote(null);
    }
  };

  const openAddModal = () => {
    resetForm();
    setNewVisitDate(new Date().toISOString().split('T')[0]);
    setShowModal(true);
  };

  const openEditModal = (item: Restaurant) => {
    setEditingRestaurant(item);
    setNewName(item.name);
    setNewRating(item.rating || 0);
    setNewNotes(item.notes || '');
    setNewCuisine(item.cuisine || '');
    setNewRecommended(!!item.recommended);
    setNewVisitDate(item.visit_date || '');
    setDetectionNote(null);
    setShowModal(true);
  };

  const saveRestaurant = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      if (editingRestaurant) {
        // UPDATE existing review
        const { error } = await supabase
          .from('restaurants')
          .update({
            name: newName.trim(),
            rating: newRating || null,
            notes: newNotes.trim() || null,
            cuisine: newCuisine.trim() || null,
            recommended: newRecommended,
            visit_date: newVisitDate.trim() || null,
          })
          .eq('id', editingRestaurant.id);

        if (error) {
          Alert.alert('Update Failed', error.message);
          return;
        }

        setRestaurants((prev) =>
          prev.map((r) =>
            r.id === editingRestaurant.id
              ? {
                  ...r,
                  name: newName.trim(),
                  rating: newRating || null,
                  notes: newNotes.trim() || null,
                  cuisine: newCuisine.trim() || null,
                  recommended: newRecommended,
                  visit_date: newVisitDate.trim() || null,
                }
              : r
          )
        );
      } else {
        // INSERT new review
        const { data, error } = await supabase
          .from('restaurants')
          .insert({
            trip_id: tripId,
            user_id: user!.id,
            name: newName.trim(),
            rating: newRating || null,
            notes: newNotes.trim() || null,
            cuisine: newCuisine.trim() || null,
            recommended: newRecommended,
            visit_date: newVisitDate.trim() || null,
            source: 'manual',
          })
          .select()
          .single();

        if (error) {
          Alert.alert('Error', error.message);
          return;
        }
        if (data) {
          setRestaurants((prev) => [...prev, data as Restaurant]);
        }
      }

      resetForm();
      fetchRestaurants();
    } catch (err: any) {
      Alert.alert('Save Failed', err.message || 'Unable to save restaurant review.');
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setShowModal(false);
    setEditingRestaurant(null);
    setNewName('');
    setNewRating(0);
    setNewNotes('');
    setNewCuisine('');
    setNewRecommended(false);
    setNewVisitDate('');
    setDetectionNote(null);
  };

  const deleteRestaurant = async (id: string) => {
    Alert.alert('Delete Restaurant', 'Are you sure you want to remove this restaurant review?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('restaurants').delete().eq('id', id);
          setRestaurants((prev) => prev.filter((r) => r.id !== id));
          if (editingRestaurant?.id === id) {
            resetForm();
          }
        },
      },
    ]);
  };

  const formatCardDate = (iso: string | null | undefined) => {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return iso;
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return iso;
    }
  };

  const renderStars = (rating: number | null) => {
    if (!rating) return null;
    return (
      <View style={styles.starRow}>
        <Text style={styles.stars}>{'★'.repeat(rating)}</Text>
        <Text style={styles.starsEmpty}>{'★'.repeat(5 - rating)}</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={restaurants}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.7}
            onPress={() => openEditModal(item)}
          >
            <View style={styles.cardHeader}>
              <View style={styles.nameRow}>
                <Text style={styles.cardName}>{item.name}</Text>
                {item.recommended && (
                  <View style={styles.recommendBadge}>
                    <Text style={styles.recommendBadgeText}>✓ Recommended</Text>
                  </View>
                )}
              </View>
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={styles.editIconBtn}
                  onPress={() => openEditModal(item)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={styles.editText}>✎ Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.deleteIconBtn}
                  onPress={() => deleteRestaurant(item.id)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={styles.deleteText}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.badgeRow}>
              {item.cuisine ? (
                <View style={styles.cuisineBadge}>
                  <Text style={styles.cuisineBadgeText}>{item.cuisine}</Text>
                </View>
              ) : null}
              {item.visit_date ? (
                <View style={styles.dateBadge}>
                  <Text style={styles.dateBadgeText}>📅 {formatCardDate(item.visit_date)}</Text>
                </View>
              ) : null}
            </View>

            {renderStars(item.rating)}
            {item.notes ? <Text style={styles.notes}>{item.notes}</Text> : null}
            {item.source === 'ai' && <Text style={styles.aiBadge}>AI detected</Text>}
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>🍽️</Text>
            <Text style={styles.emptyTitle}>No restaurants added yet</Text>
            <Text style={styles.emptyText}>
              Log the cafes, bars, and restaurants you've visited on this trip.
            </Text>
          </View>
        }
      />

      <View style={styles.bottomDock}>
        <TouchableOpacity style={styles.addButton} activeOpacity={0.85} onPress={openAddModal}>
          <Text style={styles.addButtonText}>+ Add Restaurant</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {editingRestaurant ? 'Edit Restaurant Review' : 'Add Restaurant'}
            </Text>
            <TouchableOpacity onPress={resetForm}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.modalBody}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: kbHeight + 60 }}
          >
            <Text style={styles.label}>RESTAURANT NAME *</Text>
            <View style={styles.inputWithSpinner}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder={cityName ? `e.g. Barra in ${cityName}` : 'Restaurant name'}
                placeholderTextColor="#999"
                value={newName}
                onChangeText={handleNameChange}
                autoFocus={!editingRestaurant}
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

            {/* Visit Date */}
            <Text style={styles.label}>VISIT DATE</Text>
            <TextInput
              style={styles.input}
              placeholder="YYYY-MM-DD (e.g. 2026-08-21)"
              placeholderTextColor="#999"
              value={newVisitDate}
              onChangeText={setNewVisitDate}
            />
            <View style={styles.quickDateRow}>
              <TouchableOpacity
                style={styles.quickDateChip}
                onPress={() => setNewVisitDate(new Date().toISOString().split('T')[0])}
              >
                <Text style={styles.quickDateChipText}>📍 Today</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.quickDateChip}
                onPress={() => {
                  const yesterday = new Date();
                  yesterday.setDate(yesterday.getDate() - 1);
                  setNewVisitDate(yesterday.toISOString().split('T')[0]);
                }}
              >
                <Text style={styles.quickDateChipText}>🗓️ Yesterday</Text>
              </TouchableOpacity>
              {newVisitDate ? (
                <TouchableOpacity
                  style={[styles.quickDateChip, styles.quickDateChipClear]}
                  onPress={() => setNewVisitDate('')}
                >
                  <Text style={styles.quickDateChipClearText}>Clear</Text>
                </TouchableOpacity>
              ) : null}
            </View>

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

            <Text style={styles.label}>NOTES & MUST-ORDER DISHES</Text>
            <TextInput
              style={[styles.input, styles.notesInput]}
              placeholder="What did you love? Any standout dishes or tips?"
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
                <Text style={styles.saveBtnText}>
                  {editingRestaurant ? 'Save Changes' : 'Save Restaurant'}
                </Text>
              )}
            </TouchableOpacity>

            {editingRestaurant ? (
              <TouchableOpacity
                style={styles.deleteReviewBtn}
                onPress={() => deleteRestaurant(editingRestaurant.id)}
              >
                <Text style={styles.deleteReviewBtnText}>Delete this Review</Text>
              </TouchableOpacity>
            ) : null}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  list: { padding: 16, paddingBottom: 24 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#EEEEEE',
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
  cardName: { fontSize: 17, fontWeight: '700', color: '#111' },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editIconBtn: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  editText: {
    fontSize: 12,
    color: '#4B5563',
    fontWeight: '600',
  },
  deleteIconBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  deleteText: { fontSize: 16, color: '#9CA3AF' },
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
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  cuisineBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#F0FAFA',
    borderRadius: 20,
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#C8EEEB',
  },
  cuisineBadgeText: { fontSize: 13, color: '#00A699', fontWeight: '600' },
  dateBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  dateBadgeText: { fontSize: 12, color: '#4B5563', fontWeight: '600' },
  quickDateRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    marginBottom: 4,
  },
  quickDateChip: {
    backgroundColor: '#F3F4F6',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  quickDateChipText: { fontSize: 13, color: '#374151', fontWeight: '600' },
  quickDateChipClear: { backgroundColor: '#FEE2E2', borderColor: '#FECACA' },
  quickDateChipClearText: { fontSize: 13, color: '#DC2626', fontWeight: '600' },
  starRow: {
    flexDirection: 'row',
    marginTop: 6,
  },
  stars: { fontSize: 16, color: '#FFB800' },
  starsEmpty: { fontSize: 16, color: '#E5E7EB' },
  notes: {
    fontSize: 14,
    color: '#4B5563',
    marginTop: 8,
    lineHeight: 20,
    backgroundColor: '#F9FAFB',
    padding: 10,
    borderRadius: 10,
  },
  aiBadge: {
    fontSize: 11,
    color: '#00A699',
    marginTop: 6,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 50,
    paddingHorizontal: 30,
  },
  emptyIcon: { fontSize: 44, marginBottom: 12 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#333', marginBottom: 6 },
  emptyText: {
    textAlign: 'center',
    color: '#888',
    fontSize: 14,
    lineHeight: 20,
  },
  bottomDock: {
    paddingHorizontal: 20,
    paddingTop: 15,
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  addButton: {
    backgroundColor: '#000',
    paddingVertical: 16,
    borderRadius: 30,
    alignItems: 'center',
  },
  addButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
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
  modalTitle: { fontSize: 19, fontWeight: 'bold', color: '#111' },
  cancelText: { fontSize: 16, color: '#666' },
  modalBody: { padding: 20 },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    marginBottom: 8,
    marginTop: 18,
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
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    color: '#111',
    backgroundColor: '#FAFAFA',
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
    borderColor: '#E5E7EB',
    borderRadius: 20,
    paddingVertical: 7,
    paddingHorizontal: 14,
    backgroundColor: '#fff',
  },
  cuisineChipSelected: { backgroundColor: '#000', borderColor: '#000' },
  cuisineChipText: { fontSize: 14, color: '#374151' },
  cuisineChipTextSelected: { color: '#fff', fontWeight: '600' },
  recommendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#9CA3AF',
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
    fontSize: 15,
    fontWeight: '600',
    color: '#111',
  },
  recommendSub: {
    fontSize: 13,
    color: '#6B7280',
    marginLeft: 8,
  },
  starPicker: { flexDirection: 'row', gap: 8 },
  starOption: { fontSize: 32, color: '#E5E7EB' },
  starSelected: { color: '#FFB800' },
  saveBtn: {
    backgroundColor: '#000',
    paddingVertical: 16,
    borderRadius: 30,
    alignItems: 'center',
    marginTop: 26,
  },
  saveBtnDisabled: { backgroundColor: '#D1D5DB' },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  deleteReviewBtn: {
    marginTop: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  deleteReviewBtnText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '600',
  },
});
