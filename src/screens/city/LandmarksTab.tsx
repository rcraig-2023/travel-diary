import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, Alert,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Landmark } from '../../types';

type Props = { tripId: string };

export default function HighlightsTab({ tripId }: Props) {
  const { user } = useAuth();
  const [highlights, setHighlights] = useState<Landmark[]>([]);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    fetchHighlights();
  }, [tripId]);

  const fetchHighlights = async () => {
    const { data, error } = await supabase
      .from('landmarks')
      .select('*')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: false });
    if (!error && data) setHighlights(data as Landmark[]);
  };

  const addHighlight = async () => {
    if (!newName.trim()) return;
    setAdding(true);
    const { error } = await supabase.from('landmarks').insert({
      trip_id: tripId,
      user_id: user!.id,
      name: newName.trim(),
      visited: false,
      source: 'manual',
    });
    setAdding(false);
    if (error) { Alert.alert('Error', error.message); return; }
    setNewName('');
    fetchHighlights();
  };

  const deleteHighlight = async (id: string) => {
    await supabase.from('landmarks').delete().eq('id', id);
    setHighlights((prev) => prev.filter((h) => h.id !== id));
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={highlights}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardLeft}>
              <View style={[styles.iconBadge, item.source === 'ai' ? styles.iconBadgeAi : styles.iconBadgeManual]}>
                <Text style={styles.iconText}>{item.source === 'ai' ? '✨' : '📍'}</Text>
              </View>
              <View style={styles.cardInfo}>
                <Text style={styles.cardName}>{item.name}</Text>
                <Text style={styles.cardSource}>
                  {item.source === 'ai' ? 'Detected from photo' : 'Added by you'}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={() => deleteHighlight(item.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.deleteText}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>✨</Text>
            <Text style={styles.emptyTitle}>No highlights yet</Text>
            <Text style={styles.emptySubtitle}>
              Upload a photo and the app will auto-detect standout places, or add one manually below.
            </Text>
          </View>
        }
      />

      <View style={styles.inputDock}>
        <TextInput
          style={styles.input}
          placeholder="Add a highlight..."
          placeholderTextColor="#999"
          value={newName}
          onChangeText={setNewName}
          onSubmitEditing={addHighlight}
          returnKeyType="done"
        />
        <TouchableOpacity
          style={[styles.addBtn, (!newName.trim() || adding) && styles.addBtnDisabled]}
          onPress={addHighlight}
          disabled={adding || !newName.trim()}
        >
          <Text style={styles.addBtnText}>Add</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  list: { padding: 16, paddingBottom: 8 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  cardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  iconBadge: {
    width: 42, height: 42, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
    marginRight: 14,
  },
  iconBadgeAi: { backgroundColor: '#FFF8E1' },
  iconBadgeManual: { backgroundColor: '#F0F4FF' },
  iconText: { fontSize: 20 },
  cardInfo: { flex: 1 },
  cardName: { fontSize: 15, fontWeight: '700', color: '#111' },
  cardSource: { fontSize: 12, color: '#aaa', marginTop: 2 },
  deleteText: { fontSize: 16, color: '#ddd', paddingLeft: 10 },
  emptyContainer: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 30 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#333', marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: '#999', textAlign: 'center', lineHeight: 20 },
  inputDock: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40,
    borderTopWidth: 1, borderTopColor: '#f0f0f0',
    backgroundColor: '#fff', gap: 10,
  },
  input: {
    flex: 1, borderWidth: 1, borderColor: '#ddd',
    borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14,
    fontSize: 15, color: '#000',
  },
  addBtn: {
    backgroundColor: '#000', borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 20,
  },
  addBtnDisabled: { backgroundColor: '#ccc' },
  addBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
});
