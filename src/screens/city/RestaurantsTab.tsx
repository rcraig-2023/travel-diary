import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, Alert, Modal,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Restaurant } from '../../types';

type Props = { tripId: string };

const STARS = [1, 2, 3, 4, 5];

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
    setShowAdd(false);
    setNewName('');
    setNewRating(0);
    setNewNotes('');
    fetchRestaurants();
  };

  const deleteRestaurant = async (id: string) => {
    await supabase.from('restaurants').delete().eq('id', id);
    setRestaurants((prev) => prev.filter((r) => r.id !== id));
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
              <Text style={styles.cardName}>{item.name}</Text>
              <TouchableOpacity onPress={() => deleteRestaurant(item.id)}>
                <Text style={styles.deleteText}>✕</Text>
              </TouchableOpacity>
            </View>
            {renderStars(item.rating)}
            {item.notes ? <Text style={styles.notes}>{item.notes}</Text> : null}
            {item.source === 'ai' && <Text style={styles.aiBadge}>AI detected</Text>}
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No restaurants yet. Add one below or upload a photo to auto-detect.</Text>
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
            <TouchableOpacity onPress={() => setShowAdd(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.modalBody}>
            <Text style={styles.label}>Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="Restaurant name"
              placeholderTextColor="#999"
              value={newName}
              onChangeText={setNewName}
              autoFocus
            />

            <Text style={styles.label}>Rating</Text>
            <View style={styles.starPicker}>
              {STARS.map((s) => (
                <TouchableOpacity key={s} onPress={() => setNewRating(s)}>
                  <Text style={[styles.starOption, s <= newRating && styles.starSelected]}>★</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Notes</Text>
            <TextInput
              style={[styles.input, styles.notesInput]}
              placeholder="What did you love? Any must-order dishes?"
              placeholderTextColor="#999"
              value={newNotes}
              onChangeText={setNewNotes}
              multiline
            />

            <TouchableOpacity
              style={[styles.saveBtn, (!newName.trim() || saving) && styles.saveBtnDisabled]}
              onPress={saveRestaurant}
              disabled={!newName.trim() || saving}
            >
              <Text style={styles.saveBtnText}>Save</Text>
            </TouchableOpacity>
          </View>
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
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardName: { fontSize: 16, fontWeight: '700', color: '#111', flex: 1 },
  deleteText: { fontSize: 16, color: '#ccc', paddingLeft: 10 },
  stars: { fontSize: 16, color: '#FFD700', marginTop: 4 },
  notes: { fontSize: 14, color: '#555', marginTop: 6, lineHeight: 20 },
  aiBadge: { fontSize: 11, color: '#00A699', marginTop: 6, fontWeight: '600', letterSpacing: 0.3 },
  emptyText: { textAlign: 'center', color: '#999', marginTop: 50, fontSize: 15, paddingHorizontal: 30 },
  bottomDock: {
    paddingHorizontal: 20, paddingTop: 15, paddingBottom: 40,
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f0f0f0',
  },
  addButton: {
    backgroundColor: '#000', paddingVertical: 18, borderRadius: 30, alignItems: 'center',
  },
  addButtonText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  modal: { flex: 1, backgroundColor: '#fff' },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  modalTitle: { fontSize: 20, fontWeight: 'bold' },
  cancelText: { fontSize: 16, color: '#666' },
  modalBody: { padding: 20 },
  label: { fontSize: 13, fontWeight: '600', color: '#888', marginBottom: 8, marginTop: 16, letterSpacing: 0.5 },
  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 14, fontSize: 16, color: '#000',
  },
  notesInput: { height: 100, textAlignVertical: 'top' },
  starPicker: { flexDirection: 'row', gap: 8 },
  starOption: { fontSize: 32, color: '#ddd' },
  starSelected: { color: '#FFD700' },
  saveBtn: {
    backgroundColor: '#000', paddingVertical: 16, borderRadius: 30,
    alignItems: 'center', marginTop: 30,
  },
  saveBtnDisabled: { backgroundColor: '#ccc' },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
