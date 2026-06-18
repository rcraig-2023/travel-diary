import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, Alert,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Landmark } from '../../types';

type Props = { tripId: string };

export default function LandmarksTab({ tripId }: Props) {
  const { user } = useAuth();
  const [landmarks, setLandmarks] = useState<Landmark[]>([]);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    fetchLandmarks();
  }, [tripId]);

  const fetchLandmarks = async () => {
    const { data, error } = await supabase
      .from('landmarks')
      .select('*')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: true });
    if (!error && data) setLandmarks(data as Landmark[]);
  };

  const addLandmark = async () => {
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
    fetchLandmarks();
  };

  const toggleVisited = async (item: Landmark) => {
    await supabase.from('landmarks').update({ visited: !item.visited }).eq('id', item.id);
    setLandmarks((prev) =>
      prev.map((l) => (l.id === item.id ? { ...l, visited: !l.visited } : l))
    );
  };

  const deleteLandmark = async (id: string) => {
    await supabase.from('landmarks').delete().eq('id', id);
    setLandmarks((prev) => prev.filter((l) => l.id !== id));
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={landmarks}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <TouchableOpacity style={styles.checkbox} onPress={() => toggleVisited(item)}>
              <Text style={styles.checkboxText}>{item.visited ? '✅' : '⬜'}</Text>
            </TouchableOpacity>
            <View style={styles.rowInfo}>
              <Text style={[styles.name, item.visited && styles.nameVisited]}>{item.name}</Text>
              {item.source === 'ai' && <Text style={styles.aiBadge}>AI detected</Text>}
            </View>
            <TouchableOpacity onPress={() => deleteLandmark(item.id)}>
              <Text style={styles.deleteText}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No landmarks yet. Add one below or upload a photo to auto-detect.</Text>
        }
      />

      <View style={styles.inputDock}>
        <TextInput
          style={styles.input}
          placeholder="Add a landmark..."
          placeholderTextColor="#999"
          value={newName}
          onChangeText={setNewName}
          onSubmitEditing={addLandmark}
          returnKeyType="done"
        />
        <TouchableOpacity style={styles.addBtn} onPress={addLandmark} disabled={adding || !newName.trim()}>
          <Text style={styles.addBtnText}>Add</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  list: { padding: 16, paddingBottom: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  checkbox: { marginRight: 12 },
  checkboxText: { fontSize: 20 },
  rowInfo: { flex: 1 },
  name: { fontSize: 16, color: '#111' },
  nameVisited: { color: '#aaa', textDecorationLine: 'line-through' },
  aiBadge: {
    fontSize: 11, color: '#00A699', marginTop: 2,
    fontWeight: '600', letterSpacing: 0.3,
  },
  deleteText: { fontSize: 16, color: '#ccc', paddingLeft: 10 },
  emptyText: { textAlign: 'center', color: '#999', marginTop: 50, fontSize: 15, paddingHorizontal: 30 },
  inputDock: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    backgroundColor: '#fff',
    gap: 10,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#000',
  },
  addBtn: {
    backgroundColor: '#000', borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 20,
  },
  addBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
});
