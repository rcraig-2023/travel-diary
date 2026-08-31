import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, Image, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Modal, TextInput, KeyboardAvoidingView,
  Platform, TouchableWithoutFeedback, Keyboard, ScrollView, Dimensions,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Photo } from '../../types';
import { useBatchUpload } from '../../hooks/useBatchUpload';

type Props = {
  tripId: string;
  cityName?: string;
  country?: string | null;
};

type DisplayPhoto = {
  id: string;
  uri: string;
  storagePath?: string;
  remoteUrl?: string;
  lat?: number | null;
  lng?: number | null;
  takenAt?: string | null;
  tags?: string[];
  landmarks?: string[];
  uploading?: boolean;
  errored?: boolean;
  errorMsg?: string;
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const COLUMN_WIDTH = (SCREEN_WIDTH - 36) / 2;

export default function PhotosTab({ tripId, cityName, country }: Props) {
  const { user } = useAuth();
  const [photos, setPhotos] = useState<DisplayPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState<DisplayPhoto | null>(null);

  // Hook for batch uploading, EXIF extraction, compression, and automated landmark tagging
  const { pickAndUpload, uploading, progress } = useBatchUpload(tripId);

  useEffect(() => {
    fetchPhotos();
  }, [tripId]);

  const fetchPhotos = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('photos')
        .select('*')
        .eq('trip_id', tripId)
        .order('created_at', { ascending: false });

      if (error) {
        console.log('[Photos] DB fetch error:', error);
        return;
      }
      if (!data) return;

      const rows = data as Photo[];
      const display: DisplayPhoto[] = await Promise.all(
        rows.map(async (p) => {
          const localUri = `${FileSystem.cacheDirectory}td-${p.id}.jpg`;
          const photoTags = p.ai_tags?.tags || [];
          const photoLandmarks = p.ai_tags?.landmarks || [];

          try {
            const info = await FileSystem.getInfoAsync(localUri);
            if (info.exists) {
              return {
                id: p.id,
                uri: localUri,
                storagePath: p.storage_path,
                remoteUrl: p.url,
                lat: p.lat,
                lng: p.lng,
                takenAt: p.taken_at,
                tags: photoTags,
                landmarks: photoLandmarks,
              };
            }

            // Generate signed URL with 30-day validity
            const { data: signed } = await supabase.storage
              .from('photos')
              .createSignedUrl(p.storage_path, 60 * 60 * 24 * 30);

            const remoteImageUri = signed?.signedUrl || p.url;

            // Trigger background download to local cache
            if (signed?.signedUrl) {
              FileSystem.downloadAsync(signed.signedUrl, localUri).catch(() => {});
            }

            return {
              id: p.id,
              uri: remoteImageUri,
              storagePath: p.storage_path,
              remoteUrl: p.url,
              lat: p.lat,
              lng: p.lng,
              takenAt: p.taken_at,
              tags: photoTags,
              landmarks: photoLandmarks,
            };
          } catch {
            return {
              id: p.id,
              uri: p.url,
              storagePath: p.storage_path,
              remoteUrl: p.url,
              lat: p.lat,
              lng: p.lng,
              takenAt: p.taken_at,
              tags: photoTags,
              landmarks: photoLandmarks,
            };
          }
        })
      );
      setPhotos(display);
    } catch (err) {
      console.log('[Photos] Exception fetching:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleBatchUpload = async () => {
    const uploadedBatch = await pickAndUpload({
      autoTag: true,
      cityName,
      country: country || undefined,
      onPhotoUploaded: (newPhoto, current, total) => {
        const localCachedUri = `${FileSystem.cacheDirectory}td-${newPhoto.id}.jpg`;
        setPhotos((prev) => {
          if (prev.some((p) => p.id === newPhoto.id)) return prev;
          return [
            {
              id: newPhoto.id,
              uri: localCachedUri,
              storagePath: newPhoto.storage_path,
              remoteUrl: newPhoto.url,
              lat: newPhoto.lat,
              lng: newPhoto.lng,
              takenAt: newPhoto.taken_at,
              tags: newPhoto.ai_tags?.tags || [],
              landmarks: newPhoto.ai_tags?.landmarks || [],
            },
            ...prev,
          ];
        });
      },
    });

    if (uploadedBatch && uploadedBatch.length > 0) {
      fetchPhotos();
    }
  };

  const handleImageError = async (item: DisplayPhoto) => {
    if (item.storagePath) {
      try {
        const { data: signed } = await supabase.storage
          .from('photos')
          .createSignedUrl(item.storagePath, 60 * 60 * 24 * 7);
        if (signed?.signedUrl) {
          setPhotos((prev) =>
            prev.map((p) => (p.id === item.id ? { ...p, uri: signed.signedUrl } : p))
          );
          const localUri = `${FileSystem.cacheDirectory}td-${item.id}.jpg`;
          FileSystem.downloadAsync(signed.signedUrl, localUri).catch(() => {});
        }
      } catch (err) {
        console.log('[Photos] image error recovery failed:', err);
      }
    }
  };

  const deletePhoto = (item: DisplayPhoto) => {
    Alert.alert('Delete Photo', 'Remove this photo from your trip diary?', [
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
          if (selectedPhoto?.id === item.id) setSelectedPhoto(null);
        },
      },
    ]);
  };

  const formatPhotoDate = (dateStr?: string | null) => {
    if (!dateStr) return null;
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return null;
    }
  };

  return (
    <View style={styles.container}>
      {/* Upload Progress Banner */}
      {uploading && (
        <View style={styles.progressBanner}>
          <ActivityIndicator color="#00A699" size="small" />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.progressTitle}>
              Uploading {progress.current} of {progress.total} photos ({progress.percentage}%)
            </Text>
            <Text style={styles.progressSubtitle}>
              🏷️ Extracting EXIF metadata & scanning landmarks...
            </Text>
          </View>
        </View>
      )}

      {loading && photos.length === 0 ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#111" />
        </View>
      ) : (
        <FlatList
          data={photos}
          keyExtractor={(item) => item.id}
          numColumns={2}
          contentContainerStyle={styles.gallery}
          renderItem={({ item }) => {
            const topLandmark = item.landmarks?.[0] || item.tags?.[0];
            const dateDisplay = formatPhotoDate(item.takenAt);

            return (
              <TouchableOpacity
                style={styles.photoCard}
                activeOpacity={0.85}
                onPress={() => setSelectedPhoto(item)}
              >
                <Image
                  source={{ uri: item.uri }}
                  style={styles.photoImage}
                  resizeMode="cover"
                  onError={() => handleImageError(item)}
                />

                {/* Detected Landmark or Scenery Badge */}
                {topLandmark ? (
                  <View style={styles.landmarkBadge}>
                    <Text style={styles.landmarkBadgeText} numberOfLines={1}>
                      🏛️ {topLandmark}
                    </Text>
                  </View>
                ) : null}

                {/* Date Taken Badge */}
                {dateDisplay ? (
                  <View style={styles.dateBadge}>
                    <Text style={styles.dateBadgeText}>{dateDisplay}</Text>
                  </View>
                ) : null}

                <TouchableOpacity
                  style={styles.deleteQuickBtn}
                  onPress={(e) => {
                    e.stopPropagation();
                    deletePhoto(item);
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.deleteQuickText}>✕</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            !uploading ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyIcon}>📸</Text>
                <Text style={styles.emptyTitle}>No photos yet</Text>
                <Text style={styles.emptyText}>
                  Batch upload your travel photos. We'll automatically detect landmarks and read dates!
                </Text>
              </View>
            ) : null
          }
        />
      )}

      {/* Bottom Upload Dock */}
      <View style={styles.bottomDock}>
        <TouchableOpacity
          style={[styles.addButton, uploading && styles.addButtonDisabled]}
          onPress={handleBatchUpload}
          disabled={uploading}
          activeOpacity={0.85}
        >
          {uploading ? (
            <View style={styles.uploadingRow}>
              <ActivityIndicator color="#fff" />
              <Text style={[styles.addButtonText, { marginLeft: 10 }]}>
                Uploading & Tagging ({progress.percentage}%)...
              </Text>
            </View>
          ) : (
            <Text style={styles.addButtonText}>+ Add Photos (Auto-Tag)</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Full-Screen Photo Details Modal */}
      <Modal
        visible={!!selectedPhoto}
        animationType="fade"
        transparent
        onRequestClose={() => setSelectedPhoto(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setSelectedPhoto(null)}
            >
              <Text style={styles.modalCloseText}>✕</Text>
            </TouchableOpacity>

            {selectedPhoto && (
              <ScrollView contentContainerStyle={styles.modalScroll}>
                <Image
                  source={{ uri: selectedPhoto.uri }}
                  style={styles.modalImage}
                  resizeMode="cover"
                />

                <View style={styles.modalInfoBox}>
                  {/* Top Landmarks */}
                  {selectedPhoto.landmarks && selectedPhoto.landmarks.length > 0 && (
                    <View style={styles.modalSection}>
                      <Text style={styles.modalSectionLabel}>🏛️ RECOGNIZED LANDMARK</Text>
                      <View style={styles.tagWrap}>
                        {selectedPhoto.landmarks.map((lm, idx) => (
                          <View key={idx} style={styles.landmarkChip}>
                            <Text style={styles.landmarkChipText}>📍 {lm}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}

                  {/* All Scenery Tags */}
                  {selectedPhoto.tags && selectedPhoto.tags.length > 0 && (
                    <View style={styles.modalSection}>
                      <Text style={styles.modalSectionLabel}>🏷️ SCENERY & OBJECT TAGS</Text>
                      <View style={styles.tagWrap}>
                        {selectedPhoto.tags.map((tag, idx) => (
                          <View key={idx} style={styles.tagChip}>
                            <Text style={styles.tagChipText}>{tag}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}

                  {/* EXIF Date & Coordinates */}
                  <View style={styles.metaRow}>
                    {selectedPhoto.takenAt ? (
                      <View style={styles.metaItem}>
                        <Text style={styles.metaLabel}>TAKEN ON</Text>
                        <Text style={styles.metaValue}>{formatPhotoDate(selectedPhoto.takenAt)}</Text>
                      </View>
                    ) : null}

                    {selectedPhoto.lat && selectedPhoto.lng ? (
                      <View style={styles.metaItem}>
                        <Text style={styles.metaLabel}>GPS COORDINATES</Text>
                        <Text style={styles.metaValue}>
                          {selectedPhoto.lat.toFixed(4)}°, {selectedPhoto.lng.toFixed(4)}°
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  <TouchableOpacity
                    style={styles.modalDeleteBtn}
                    onPress={() => selectedPhoto && deletePhoto(selectedPhoto)}
                  >
                    <Text style={styles.modalDeleteText}>🗑 Delete Photo</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  progressBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FAFA',
    borderBottomWidth: 1,
    borderBottomColor: '#C8EEEB',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  progressTitle: { fontSize: 13, fontWeight: '700', color: '#0F766E' },
  progressSubtitle: { fontSize: 11, color: '#14B8A6', marginTop: 2 },
  gallery: { padding: 12, paddingBottom: 100 },
  photoCard: {
    width: COLUMN_WIDTH,
    height: COLUMN_WIDTH * 1.25,
    margin: 6,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#E5E7EB',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  landmarkBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    right: 8,
    backgroundColor: 'rgba(17, 24, 39, 0.82)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  landmarkBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  dateBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 8,
  },
  dateBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  deleteQuickBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteQuickText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingHorizontal: 30,
  },
  emptyIcon: { fontSize: 44, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: '#111', marginBottom: 6 },
  emptyText: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 20 },
  bottomDock: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  addButton: {
    backgroundColor: '#111827',
    paddingVertical: 16,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonDisabled: { backgroundColor: '#4B5563' },
  addButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  uploadingRow: { flexDirection: 'row', alignItems: 'center' },

  // Modal styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    width: '100%',
    maxHeight: '90%',
    backgroundColor: '#fff',
    borderRadius: 24,
    overflow: 'hidden',
    position: 'relative',
  },
  modalCloseBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  modalScroll: { paddingBottom: 24 },
  modalImage: { width: '100%', height: 320 },
  modalInfoBox: { padding: 20 },
  modalSection: { marginBottom: 18 },
  modalSectionLabel: { fontSize: 11, fontWeight: '800', color: '#6B7280', marginBottom: 8, letterSpacing: 0.5 },
  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  landmarkChip: {
    backgroundColor: '#F0FAFA',
    borderWidth: 1,
    borderColor: '#99F6E4',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  landmarkChipText: { color: '#0F766E', fontSize: 13, fontWeight: '700' },
  tagChip: {
    backgroundColor: '#F3F4F6',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 14,
  },
  tagChipText: { color: '#374151', fontSize: 12, fontWeight: '600' },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    marginBottom: 20,
  },
  metaItem: { flex: 1 },
  metaLabel: { fontSize: 10, fontWeight: '700', color: '#9CA3AF', marginBottom: 4 },
  metaValue: { fontSize: 13, fontWeight: '600', color: '#111827' },
  modalDeleteBtn: {
    backgroundColor: '#FEE2E2',
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
  },
  modalDeleteText: { color: '#DC2626', fontSize: 15, fontWeight: '700' },
});
