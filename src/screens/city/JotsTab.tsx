import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Jot } from '../../types';

type Props = { tripId: string };

export default function JotsTab({ tripId }: Props) {
  const { user } = useAuth();
  const [jots, setJots] = useState<Jot[]>([]);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchJots();
  }, [tripId]);

  const fetchJots = async () => {
    const { data, error } = await supabase
      .from('jots')
      .select('*')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: false });
    if (!error && data) setJots(data as Jot[]);
  };

  const saveJot = async () => {
    if (!text.trim()) return;
    setSaving(true);
    const { error } = await supabase.from('jots').insert({
      trip_id: tripId,
      user_id: user!.id,
      content: text.trim(),
    });
    setSaving(false);
    if (error) { Alert.alert('Error', error.message); return; }
    setText('');
    fetchJots();
  };

  const deleteJot = async (id: string) => {
    await supabase.from('jots').delete().eq('id', id);
    setJots((prev) => prev.filter((j) => j.id !== id));
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={140}
    >
      <FlatList
        data={jots}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.jot}>
            <Text style={styles.jotText}>{item.content}</Text>
            <View style={styles.jotFooter}>
              <Text style={styles.jotDate}>{formatDate(item.created_at)}</Text>
              <TouchableOpacity onPress={() => deleteJot(item.id)}>
                <Text style={styles.deleteText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No jots yet. Write down a memory below.</Text>
        }
      />

      <View style={styles.inputDock}>
        <TextInput
          style={styles.input}
          placeholder="Write a jot about this trip..."
          placeholderTextColor="#999"
          value={text}
          onChangeText={setText}
          multiline
          maxLength={500}
        />
        <TouchableOpacity style={styles.sendBtn} onPress={saveJot} disabled={saving || !text.trim()}>
          <Text style={styles.sendText}>Save</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  list: { padding: 16, paddingBottom: 8 },
  jot: {
    backgroundColor: '#FFFBF0',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#FFD700',
  },
  jotText: { fontSize: 15, color: '#222', lineHeight: 22 },
  jotFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  jotDate: { fontSize: 12, color: '#aaa' },
  deleteText: { fontSize: 12, color: '#FF5A5F' },
  emptyText: { textAlign: 'center', color: '#999', marginTop: 50, fontSize: 15, paddingHorizontal: 30 },
  inputDock: {
    flexDirection: 'row',
    alignItems: 'flex-end',
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
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 15,
    maxHeight: 120,
    color: '#000',
  },
  sendBtn: {
    backgroundColor: '#000',
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  sendText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
});
