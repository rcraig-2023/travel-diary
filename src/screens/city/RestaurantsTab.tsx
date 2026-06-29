import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, Alert, Modal, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Restaurant } from '../../types';

type Props = { tripId: string };

const STARS = [1, 2, 3, 4, 5];

const CUISINE_TAGS = [
  { emoji: '🍕', label: 'Italian' },
  { emoji: '🍣', label: 'Japanese' },
  { emoji: '🥐', label: 'French' },
  { emoji: '🌮', label: 'Mexican' },
  { emoji: '🍔', label: 'American' },
  { emoji: '🍜', label: 'Asian' },
  { emoji: '🫕', label: 'Mediterranean' },
  { emoji: '🍛', label: 'Indian' },
];

export default function RestaurantsTab({ tripId }: Props) {
  const { user } = useAuth();
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRating, setNewRating] = useState(0);
  const [newNotes, setNewNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchRestaurants();
  }, [tripId]);

  const fetchRestaurants = async () => {
    const { data, error } = await supabase
      .from('restaurants')
      .select('*')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: true });
    if (!error && data) setRestaurants(data as Restaurant[]);
  };

  const saveRestaurant = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    const { error } = await supabase.from('restaurants').insert({
      trip_id: tripId,
      user_id: user!.id,
      name: newName.trim(),
      rating: newRating || null,
      notes: newNotes.trim() || null,
      source: 'manual',
    });
    setSaving(false);
    if (error) { Alert.alert('Error', error.message); return; }
    resetForm();
    fetchRestaurants();
  };

  const resetForm = () => {
    setShowAdd(false);
    setNewName('');
    setNewRating(0);
    setNewNotes('');
  };

  const deleteRestaurant = async (id: string) => {
    await supabase.from('restaurants').delete().eq('id', id);
    setRestaurants((prev) => prev.filter((r) => r.id !== id));
  };

  const renderStars = (rating: number | null) => {
    if (!rating) return null;
    return (
      <Text style={styles.stars}>
        {'★'.repeat(rating)}
        <Text style={styles.starsEmpty}>{'★'.repeat(5 - rating)}</Text>
      </Text>
    );
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
              <Text style={styles.cardName}>{item.name}</Text>
              <TouchableOpacity onPress={() => deleteRestaurant(item.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={styles.deleteText}>✕</Text>
              </TouchableOpacity>
            </View>
            {renderStars(item.rating)}
            {item.notes ? <Text style={styles.notes}>{item.notes}</Text> : null}
            {item.source === 'ai' && <Text style={styles.aiBadge}>✨ Detected from photo</Text>}
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>🍽️</Text>
            <Text style={styles.emptyTitle}>No restaurants yet</Text>
            <Text style={styles.emptySubtitle}>
              Upload a photo to auto-detect restaurants, or add one manually.
            </Text>
          </View>
        }
      />

      <View style={styles.bottomDock}>
        <TouchableOpacity style={styles.addButton} onPress={() => setShowAdd(true)}>
          <Text style={styles.addButtonText}>+ Add Restaurant</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={showAdd} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          <View style={styles.modal}>
            {/* Modal handle bar */}
            <View style={styles.handleBar} />

            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={resetForm} style={styles.cancelBtn}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Add Restaurant</Text>
              <View style={{ width: 60 }} />
            </View>

            <ScrollView
              contentContainerStyle={styles.modalBody}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Name — large borderless input */}
              <TextInput
                style={styles.nameInput}
                placeholder="Restaurant name..."
                placeholderTextColor="#ccc"
                value={newName}
                onChangeText={setNewName}
                autoFocus
                returnKeyType="next"
              />

              <View style={styles.divider} />

              {/* Star rating */}
              <View style={styles.ratingSection}>
                <View style={styles.starRow}>
                  {STARS.map((s) => (
                    <TouchableOpacity key={s} onPress={() => setNewRating(s)} style={styles.starBtn}>
                      <Text style={[styles.starIcon, s <= newRating && styles.starIconSelected]}>★</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {newRating > 0 && (
                  <Text style={styles.ratingLabel}>
                    {['', 'Not great', 'It was ok', 'Liked it', 'Really good', 'Amazing!'][newRating]}
                  </Text>
                )}
              </View>

              <View style={styles.divider} />

              {/* Cuisine quick-tags */}
              <Text style={styles.sectionLabel}>Cuisine</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.cuisineRow}
              >
                {CUISINE_TAGS.map((c) => {
                  const selected = newNotes.startsWith(`${c.emoji} ${c.label}`);
                  return (
                    <TouchableOpacity
                      key={c.label}
                      style={[styles.cuisineChip, selected && styles.cuisineChipSelected]}
                      onPress={() => {
                        const tag = `${c.emoji} ${c.label}`;
                        setNewNotes((prev) => (prev.startsWith(tag) ? prev.slice(tag.length).trimStart() : `${tag} ${prev}`.trim()));
                      }}
                    >
                      <Text style={styles.cuisineChipText}>{c.emoji} {c.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <View style={styles.divider} />

              {/* Notes */}
              <TextInput
                style={styles.notesInput}
                placeholder="Any notes? Favorite dish, must-order, vibe..."
                placeholderTextColor="#bbb"
                value={newNotes}
                onChangeText={setNewNotes}
                multiline
              />
            </ScrollView>

            <View style={styles.saveSection}>
              <TouchableOpacity
                style={[styles.saveBtn, (!newName.trim() || saving) && styles.saveBtnDisabled]}
                onPress={saveRestaurant}
                disabled={!newName.trim() || saving}
              >
                <Text style={styles.saveBtnText}>Save Restaurant</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  list: { padding: 16, paddingBottom: 8 },
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
    borderWidth: 1, borderColor: '#f0f0f0',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardName: { fontSize: 16, fontWeight: '700', color: '#111', flex: 1 },
  deleteText: { fontSize: 16, color: '#ddd', paddingLeft: 10 },
  stars: { fontSize: 18, color: '#FFD700', marginTop: 6 },
  starsEmpty: { color: '#e0e0e0' },
  notes: { fontSize: 14, color: '#555', marginTop: 6, lineHeight: 20 },
  aiBadge: { fontSize: 12, color: '#00A699', marginTop: 8, fontWeight: '600' },
  emptyContainer: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 30 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#333', marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: '#999', textAlign: 'center', lineHeight: 20 },
  bottomDock: {
    paddingHorizontal: 20, paddingTop: 15, paddingBottom: 40,
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f0f0f0',
  },
  addButton: { backgroundColor: '#000', paddingVertical: 18, borderRadius: 30, alignItems: 'center' },
  addButtonText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  modal: { flex: 1, backgroundColor: '#fff' },
  handleBar: {
    width: 36, height: 4, backgroundColor: '#ddd', borderRadius: 2,
    alignSelf: 'center', marginTop: 10, marginBottom: 4,
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#f5f5f5',
  },
  cancelBtn: { width: 60 },
  cancelText: { fontSize: 16, color: '#999' },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#111' },
  modalBody: { paddingBottom: 20 },
  nameInput: {
    fontSize: 26, fontWeight: '700', color: '#111',
    paddingHorizontal: 24, paddingTop: 24, paddingBottom: 16,
  },
  divider: { height: 1, backgroundColor: '#f5f5f5', marginHorizontal: 20 },
  ratingSection: { alignItems: 'center', paddingVertical: 20 },
  starRow: { flexDirection: 'row', gap: 8 },
  starBtn: { padding: 4 },
  starIcon: { fontSize: 38, color: '#e0e0e0' },
  starIconSelected: { color: '#FFD700' },
  ratingLabel: { fontSize: 14, color: '#888', marginTop: 8, fontWeight: '500' },
  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: '#aaa', letterSpacing: 0.8,
    paddingHorizontal: 24, paddingTop: 16, paddingBottom: 10,
    textTransform: 'uppercase',
  },
  cuisineRow: { paddingHorizontal: 20, gap: 8, paddingBottom: 16 },
  cuisineChip: {
    paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20,
    backgroundColor: '#f5f5f5', borderWidth: 1, borderColor: '#efefef',
  },
  cuisineChipSelected: { backgroundColor: '#000', borderColor: '#000' },
  cuisineChipText: { fontSize: 14, color: '#333' },
  notesInput: {
    fontSize: 15, color: '#333', lineHeight: 22,
    paddingHorizontal: 24, paddingVertical: 16,
    minHeight: 100, textAlignVertical: 'top',
  },
  saveSection: {
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40,
    borderTopWidth: 1, borderTopColor: '#f5f5f5',
  },
  saveBtn: {
    backgroundColor: '#000', paddingVertical: 17, borderRadius: 30, alignItems: 'center',
  },
  saveBtnDisabled: { backgroundColor: '#ddd' },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
