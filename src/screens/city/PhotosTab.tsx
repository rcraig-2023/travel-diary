import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, Image, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Modal, TextInput,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Photo } from '../../types';

type Props = { tripId: string };

type DisplayPhoto = {
  id: string;
  uri: string;
  storagePath?: string;
  remoteUrl?: string;
  uploading?: boolean;
  errored?: boolean;
  errorMsg?: string;
};

export default function PhotosTab({ tripId }: Props) {
  const { user } = useAuth();
  const [photos, setPhotos] = useState<DisplayPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showLabelModal, setShowLabelModal] = useState(false);
  const [pendingAsset, setPendingAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [label, setLabel] = useState('');

  useEffect(() => {
    fetchPhotos();
  }, [tripId]);

  const fetchPhotos = async () => {
    const { data, error } = await supabase
      .from('photos')
      .select('*')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: false });

    if (error) { console.log('[Photos] DB fetch error:', error); return; }
    if (!data) return;

    const rows = data as Photo[];
    const display: DisplayPhoto[] = await Promise.all(
      rows.map(async (p) => {
        const localUri = `${FileSystem.cacheDirectory}td-${p.id}.jpg`;
        try {
          const info = await FileSystem.getInfoAsync(localUri);
          if (info.exists) {
            return { id: p.id, uri: localUri, storagePath: p.storage_path, remoteUrl: p.url };
          }
          const { data: signed, error: sErr } = await supabase.storage
            .from('photos')
            .createSignedUrl(p.storage_path, 3600);
          if (sErr || !signed?.signedUrl) {
            const msg = sErr?.message || 'could not sign URL';
            console.log('[Photos] sign failed for', p.storage_path, msg);
            return { id: p.id, uri: '', storagePath: p.storage_path, remoteUrl: p.url, errored: true, errorMsg: msg };
          }
          const res = await FileSystem.downloadAsync(signed.signedUrl, localUri);
          if (res.status !== 200) {
            console.log('[Photos] download HTTP', res.status, 'for', p.storage_path);
            return { id: p.id, uri: '', storagePath: p.storage_path, remoteUrl: p.url, errored: true, errorMsg: `download HTTP ${res.status}` };
          }
          return { id: p.id, uri: res.uri, storagePath: p.storage_path, remoteUrl: p.url };
        } catch (e: any) {
          const msg = e?.message ?? 'download error';
          console.log('[Photos] exception for', p.storage_path, msg);
          return { id: p.id, uri: '', storagePath: p.storage_path, remoteUrl: p.url, errored: true, errorMsg: msg };
        }
      })
    );
    setPhotos(display);
  };

  const pickPhoto = async () => {
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
    if (!asset.base64) {
      Alert.alert('Upload failed', 'Could not read the selected image. Please try another photo.');
      return;
    }

    setPendingAsset(asset);
    setLabel('');
    setShowLabelModal(true);
  };

  const confirmUpload = async () => {
    if (!pendingAsset?.base64) return;

    const asset = pendingAsset;
    const capturedLabel = label.trim();

    setShowLabelModal(false);
    setPendingAsset(null);
    setLabel('');

    const tempId = `temp-${Date.now()}`;
    const localDataUri = `data:image/jpeg;base64,${asset.base64}`;

    setPhotos((prev) => [{ id: tempId, uri: localDataUri, uploading: true }, ...prev]);
    setUploading(true);

    try {
      const fileName = `${Date.now()}.jpg`;
      const storagePath = `${user!.id}/${tripId}/${fileName}`;

      const jpegBlob = await (await fetch(`data:image/jpeg;base64,${asset.base64}`)).blob();

      const { error: uploadError } = await supabase.storage
        .from('photos')
        .upload(storagePath, jpegBlob, { contentType: 'image/jpeg', upsert: false });

      if (uploadError) throw new Error(uploadError.message);

      const { data: { publicUrl } } = supabase.storage.from('photos').getPublicUrl(storagePath);

      const { data: inserted, error: dbError } = await supabase.from('photos').insert({
        trip_id: tripId,
        user_id: user!.id,
        storage_path: storagePath,
        url: publicUrl,
        ai_tags: { landmarks: [], restaurants: [], tags: [] },
      }).select().single();

      if (dbError) throw new Error(dbError.message);

      const cachedUri = `${FileSystem.cacheDirectory}td-${inserted.id}.jpg`;
      try {
        await FileSystem.writeAsStringAsync(cachedUri, asset.base64, { encoding: 'base64' });
      } catch (e) {
        console.log('[Photos] cache write failed', e);
      }

      setPhotos((prev) =>
        prev.map((p) =>
          p.id === tempId
            ? { id: inserted.id, uri: cachedUri, storagePath, remoteUrl: publicUrl, uploading: false }
            : p
        )
      );

      if (capturedLabel) {
        await supabase.from('landmarks').insert({
          trip_id: tripId,
          user_id: user!.id,
          name: capturedLabel,
          visited: true,
          source: 'manual',
        });
      }
    } catch (err: any) {
      setPhotos((prev) => prev.filter((p) => p.id !== tempId));
      Alert.alert('Upload failed', err.message);
    } finally {
      setUploading(false);
    }
  };

  const cancelUpload = () => {
    setShowLabelModal(false);
    setPendingAsset(null);
    setLabel('');
  };

  const deletePhoto = (item: DisplayPhoto) => {
    Alert.alert('Delete photo', 'Remove this photo from your trip?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (item.storagePath) {
            await supabase.storage.from('photos').remove([item.storagePath]);
          }
          await supabase.from('photos').delete().eq('id', item.id);
          if (item.uri.startsWith('file://')) {
            try {
              await FileSystem.deleteAsync(item.uri, { idempotent: true });
            } catch (e) {
              console.log('[Photos] cache delete failed', e);
            }
          }
          setPhotos((prev) => prev.filter((p) => p.id !== item.id));
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={photos}
        keyExtractor={(item) => item.id}
        numColumns={2}
        contentContainerStyle={styles.gallery}
        renderItem={({ item }) => (
          <View style={styles.photoWrapper}>
            {item.errored || !item.uri ? (
              <View style={[styles.photo, styles.errorTile]}>
                <Text style={styles.errorIcon}>📷</Text>
                {item.errorMsg ? <Text style={styles.errorMsgText}>{item.errorMsg}</Text> : null}
              </View>
            ) : (
              <Image
                source={{ uri: item.uri }}
                style={styles.photo}
                onError={() =>
                  setPhotos((prev) =>
                    prev.map((p) =>
                      p.id === item.id
                        ? { ...p, errored: true, errorMsg: p.errorMsg ?? 'Image failed to render' }
                        : p
                    )
                  )
                }
              />
            )}
            {item.uploading ? (
              <View style={styles.uploadingOverlay}>
                <ActivityIndicator color="#fff" />
              </View>
            ) : (
              <TouchableOpacity style={styles.deleteBtn} onPress={() => deletePhoto(item)}>
                <Text style={styles.deleteBtnText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        ListEmptyComponent={
          !uploading ? (
            <Text style={styles.emptyText}>No photos yet. Tap below to add your first one.</Text>
          ) : null
        }
      />

      <View style={styles.bottomDock}>
        <TouchableOpacity style={styles.addButton} onPress={pickPhoto} disabled={uploading}>
          {uploading ? (
            <View style={styles.uploadingRow}>
              <ActivityIndicator color="#fff" />
              <Text style={[styles.addButtonText, { marginLeft: 10 }]}>Uploading...</Text>
            </View>
          ) : (
            <Text style={styles.addButtonText}>+ Add Photo</Text>
          )}
        </TouchableOpacity>
      </View>

      <Modal visible={showLabelModal} animationType="slide" transparent>
        <View style={styles.suggestionOverlay}>
          <View style={styles.suggestionSheet}>
            <Text style={styles.suggestionTitle}>Add a label (optional)</Text>
            <Text style={styles.suggestionSub}>e.g. "Eiffel Tower" — appears in Highlights as visited</Text>
            <TextInput
              style={styles.labelInput}
              placeholder="Label this photo..."
              placeholderTextColor="#999"
              value={label}
              onChangeText={setLabel}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={confirmUpload}
            />
            <TouchableOpacity style={styles.addButton} onPress={confirmUpload} disabled={uploading}>
              <Text style={styles.addButtonText}>Save Photo</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.dismissBtn} onPress={cancelUpload}>
              <Text style={styles.dismissText}>Cancel</Text>
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
  photoWrapper: { flex: 1, margin: 5 },
  photo: { width: '100%', aspectRatio: 1, borderRadius: 10, backgroundColor: '#f0f0f0' },
  errorTile: { justifyContent: 'center', alignItems: 'center', padding: 8 },
  errorIcon: { fontSize: 28, opacity: 0.4 },
  errorMsgText: {
    fontSize: 9,
    color: '#999',
    textAlign: 'center',
    paddingHorizontal: 4,
    marginTop: 6,
  },
  uploadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteBtnText: { color: '#fff', fontSize: 15, fontWeight: '600', lineHeight: 18 },
  emptyText: { textAlign: 'center', color: '#999', marginTop: 50, fontSize: 15, paddingHorizontal: 30 },
  bottomDock: {
    paddingHorizontal: 20, paddingTop: 15, paddingBottom: 40,
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f0f0f0',
  },
  addButton: { backgroundColor: '#000', paddingVertical: 18, borderRadius: 30, alignItems: 'center' },
  addButtonText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  uploadingRow: { flexDirection: 'row', alignItems: 'center' },
  suggestionOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  suggestionSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, paddingBottom: 40,
  },
  suggestionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
  suggestionSub: { fontSize: 14, color: '#888', marginBottom: 20 },
  labelInput: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 14, fontSize: 16, color: '#000',
    marginBottom: 20,
  },
  dismissBtn: { marginTop: 16, alignItems: 'center' },
  dismissText: { fontSize: 16, color: '#666' },
});
