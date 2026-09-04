import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, Image, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Modal, TextInput, KeyboardAvoidingView,
  Platform, TouchableWithoutFeedback, Keyboard, ScrollView, Dimensions,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Photo, AuthorshipMetadata } from '../../types';
import { useBatchUpload } from '../../hooks/useBatchUpload';

type Props = {
  tripId: string;
  cityName?: string;
  country?: string | null;
  onPhotosLoaded?: (photos: DisplayPhoto[]) => void;
};

export type DisplayPhoto = {
  id: string;
  uri: string;
  storagePath?: string;
  remoteUrl?: string;
  lat?: number | null;
  lng?: number | null;
  takenAt?: string | null;
  authorName?: string | null;
  authorEmail?: string | null;
  cameraModel?: string | null;
  authorship?: AuthorshipMetadata | null;
  tags?: string[];
  landmarks?: string[];
  uploading?: boolean;
  errored?: boolean;
  errorMsg?: string;
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const COLUMN_WIDTH = (SCREEN_WIDTH - 36) / 2;

export default function PhotosTab({ tripId, cityName, country, onPhotosLoaded }: Props) {
  const { user } = useAuth();
  const [photos, setPhotos] = useState<DisplayPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState<DisplayPhoto | null>(null);

  // Tag & Landmark Editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editLandmark, setEditLandmark] = useState('');
  const [editTags, setEditTags] = useState<string[]>([]);
  const [newTagText, setNewTagText] = useState('');
  const [savingEdits, setSavingEdits] = useState(false);

  // Hook for batch & single uploading, EXIF extraction, compression, and automated landmark tagging
  const { pickAndUpload, pickAndUploadSingle, uploading, progress } = useBatchUpload(tripId);

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
          const photoAuthorship = p.ai_tags?.authorship || null;
          const authorName = p.author_name || photoAuthorship?.author_name || null;
          const authorEmail = p.author_email || photoAuthorship?.author_email || null;
          const cameraModel = p.camera_model || photoAuthorship?.camera_model || null;

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
                authorName,
                authorEmail,
                cameraModel,
                authorship: photoAuthorship,
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
              authorName,
              authorEmail,
              cameraModel,
              authorship: photoAuthorship,
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
              authorName,
              authorEmail,
              cameraModel,
              authorship: photoAuthorship,
              tags: photoTags,
              landmarks: photoLandmarks,
            };
          }
        })
      );
      setPhotos(display);
      if (onPhotosLoaded) {
        onPhotosLoaded(display);
      }
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
        const authorship = newPhoto.ai_tags?.authorship || null;
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
              authorName: newPhoto.author_name || authorship?.author_name || null,
              authorEmail: newPhoto.author_email || authorship?.author_email || null,
              cameraModel: newPhoto.camera_model || authorship?.camera_model || null,
              authorship,
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

  const handleSingleUpload = async () => {
    const singlePhoto = await pickAndUploadSingle({
      autoTag: true,
      cityName,
      country: country || undefined,
    });

    if (singlePhoto) {
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

  const startEditing = (photo: DisplayPhoto) => {
    setEditLandmark(photo.landmarks?.[0] || '');
    setEditTags([...(photo.tags || [])]);
    setNewTagText('');
    setIsEditing(true);
  };

  const handleAddTag = () => {
    const trimmed = newTagText.trim();
    if (!trimmed) return;
    if (!editTags.includes(trimmed)) {
      setEditTags([...editTags, trimmed]);
    }
    setNewTagText('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setEditTags(editTags.filter((t) => t !== tagToRemove));
  };

  const handleSaveEdits = async () => {
    if (!selectedPhoto) return;
    setSavingEdits(true);

    const cleanLandmark = editLandmark.trim();
    const updatedLandmarks = cleanLandmark ? [cleanLandmark] : [];
    const updatedTags = editTags.map((t) => t.trim()).filter(Boolean);

    try {
      const { error: dbError } = await supabase
        .from('photos')
        .update({
          ai_tags: {
            landmarks: updatedLandmarks,
            restaurants: [],
            tags: updatedTags,
            authorship: selectedPhoto.authorship || undefined,
            exif: {
              lat: selectedPhoto.lat,
              lng: selectedPhoto.lng,
              taken_at: selectedPhoto.takenAt,
              camera_model: selectedPhoto.cameraModel,
            },
          },
        })
        .eq('id', selectedPhoto.id);

      if (dbError) throw new Error(dbError.message);

      // If a landmark was added or changed, also sync it to highlights table
      if (cleanLandmark) {
        await supabase.from('landmarks').insert({
          trip_id: tripId,
          user_id: user!.id,
          name: cleanLandmark,
          visited: true,
          source: 'manual',
        });
      }

      // Update local state
      const updatedPhotoItem: DisplayPhoto = {
        ...selectedPhoto,
        landmarks: updatedLandmarks,
        tags: updatedTags,
      };

      setSelectedPhoto(updatedPhotoItem);
      setPhotos((prev) =>
        prev.map((p) => (p.id === selectedPhoto.id ? updatedPhotoItem : p))
      );
      setIsEditing(false);
      Alert.alert('Saved', 'Photo tags and landmark updated successfully.');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save edits.');
    } finally {
      setSavingEdits(false);
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
          if (selectedPhoto?.id === item.id) {
            setSelectedPhoto(null);
            setIsEditing(false);
          }
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
              Uploading & Tagging {progress.current} of {progress.total} photos ({progress.percentage}%)
            </Text>
            <Text style={styles.progressSubtitle}>
              ⚡ High-speed compression & Vision AI scanning...
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
                onPress={() => {
                  setSelectedPhoto(item);
                  setIsEditing(false);
                }}
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

      {/* Bottom Upload Dock with Single & Batch Upload Options */}
      <View style={styles.bottomDock}>
        <View style={styles.dockButtonsRow}>
          <TouchableOpacity
            style={[styles.singleAddButton, uploading && styles.addButtonDisabled]}
            onPress={handleSingleUpload}
            disabled={uploading}
            activeOpacity={0.85}
          >
            <Text style={styles.singleAddButtonText}>📷 Single</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.addButton, uploading && styles.addButtonDisabled, { flex: 1, marginLeft: 10 }]}
            onPress={handleBatchUpload}
            disabled={uploading}
            activeOpacity={0.85}
          >
            {uploading ? (
              <View style={styles.uploadingRow}>
                <ActivityIndicator color="#fff" size="small" />
                <Text style={[styles.addButtonText, { marginLeft: 8 }]}>
                  Uploading ({progress.percentage}%)...
                </Text>
              </View>
            ) : (
              <Text style={styles.addButtonText}>+ Batch Upload</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Full-Screen Photo Details & Tag Editor Modal */}
      <Modal
        visible={!!selectedPhoto}
        animationType="fade"
        transparent
        onRequestClose={() => {
          setSelectedPhoto(null);
          setIsEditing(false);
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => {
                setSelectedPhoto(null);
                setIsEditing(false);
              }}
            >
              <Text style={styles.modalCloseText}>✕</Text>
            </TouchableOpacity>

            {selectedPhoto && (
              <ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled">
                <Image
                  source={{ uri: selectedPhoto.uri }}
                  style={styles.modalImage}
                  resizeMode="cover"
                />

                <View style={styles.modalInfoBox}>
                  {/* EDIT MODE */}
                  {isEditing ? (
                    <View style={styles.editSection}>
                      <Text style={styles.modalSectionLabel}>🏛️ LANDMARK NAME</Text>
                      <TextInput
                        style={styles.editInput}
                        value={editLandmark}
                        onChangeText={setEditLandmark}
                        placeholder="e.g. Notre-Dame de Paris, Eiffel Tower"
                        placeholderTextColor="#9CA3AF"
                      />

                      <Text style={[styles.modalSectionLabel, { marginTop: 14 }]}>🏷️ PHOTO TAGS</Text>
                      <View style={styles.tagWrap}>
                        {editTags.map((tag, idx) => (
                          <View key={idx} style={styles.tagChipEditable}>
                            <Text style={styles.tagChipText}>{tag}</Text>
                            <TouchableOpacity
                              style={styles.tagRemoveBtn}
                              onPress={() => handleRemoveTag(tag)}
                            >
                              <Text style={styles.tagRemoveText}>✕</Text>
                            </TouchableOpacity>
                          </View>
                        ))}
                      </View>

                      {/* Add Custom Tag Row */}
                      <View style={styles.addTagRow}>
                        <TextInput
                          style={styles.addTagInput}
                          value={newTagText}
                          onChangeText={setNewTagText}
                          placeholder="Add new tag..."
                          placeholderTextColor="#9CA3AF"
                          onSubmitEditing={handleAddTag}
                          returnKeyType="done"
                        />
                        <TouchableOpacity style={styles.addTagBtn} onPress={handleAddTag}>
                          <Text style={styles.addTagBtnText}>+ Add</Text>
                        </TouchableOpacity>
                      </View>

                      {/* Edit Actions */}
                      <View style={styles.editActionRow}>
                        <TouchableOpacity
                          style={styles.cancelEditBtn}
                          onPress={() => setIsEditing(false)}
                          disabled={savingEdits}
                        >
                          <Text style={styles.cancelEditText}>Cancel</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.saveEditBtn}
                          onPress={handleSaveEdits}
                          disabled={savingEdits}
                        >
                          {savingEdits ? (
                            <ActivityIndicator color="#fff" size="small" />
                          ) : (
                            <Text style={styles.saveEditText}>✓ Save Changes</Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    /* VIEW MODE */
                    <>
                      <View style={styles.viewHeaderRow}>
                        <Text style={styles.viewTitle}>Photo Details</Text>
                        <TouchableOpacity
                          style={styles.editPillBtn}
                          onPress={() => startEditing(selectedPhoto)}
                        >
                          <Text style={styles.editPillText}>✎ Edit Tags</Text>
                        </TouchableOpacity>
                      </View>

                      {/* Authorship & Photographer Verification Card */}
                      <View style={styles.authorshipCard}>
                        <View style={styles.authorshipHeader}>
                          <View style={styles.avatarCircle}>
                            <Text style={styles.avatarInitial}>
                              {(selectedPhoto.authorName || 'U').charAt(0).toUpperCase()}
                            </Text>
                          </View>
                          <View style={{ flex: 1, marginLeft: 10 }}>
                            <View style={styles.authorRow}>
                              <Text style={styles.authorshipAuthorName} numberOfLines={1}>
                                {selectedPhoto.authorName || 'Original Photographer'}
                              </Text>
                              <View style={styles.verifiedBadge}>
                                <Text style={styles.verifiedBadgeText}>✓ Verified</Text>
                              </View>
                            </View>
                            {selectedPhoto.authorEmail ? (
                              <Text style={styles.authorshipAuthorEmail} numberOfLines={1}>
                                {selectedPhoto.authorEmail}
                              </Text>
                            ) : null}
                          </View>
                        </View>

                        {(selectedPhoto.cameraModel || selectedPhoto.authorship?.camera_make) ? (
                          <View style={styles.deviceRow}>
                            <Text style={styles.deviceIcon}>📷</Text>
                            <Text style={styles.deviceText} numberOfLines={1}>
                              Shot on {selectedPhoto.authorship?.camera_make ? `${selectedPhoto.authorship.camera_make} ` : ''}
                              {selectedPhoto.cameraModel || selectedPhoto.authorship?.camera_model}
                              {selectedPhoto.authorship?.device_platform ? ` (${selectedPhoto.authorship.device_platform.toUpperCase()})` : ''}
                            </Text>
                          </View>
                        ) : null}
                      </View>

                      {/* Top Landmarks */}
                      {selectedPhoto.landmarks && selectedPhoto.landmarks.length > 0 ? (
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
                      ) : null}

                      {/* All Scenery Tags */}
                      {selectedPhoto.tags && selectedPhoto.tags.length > 0 ? (
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
                      ) : (
                        <View style={styles.noTagsBox}>
                          <Text style={styles.noTagsText}>No tags yet. Tap "Edit Tags" above to add some!</Text>
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
                    </>
                  )}
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

  // Edit Mode Styles
  viewHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  viewTitle: { fontSize: 18, fontWeight: 'bold', color: '#111827' },
  editPillBtn: {
    backgroundColor: '#F3F4F6',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  editPillText: { fontSize: 12, fontWeight: '700', color: '#1F2937' },
  editSection: { marginBottom: 12 },
  editInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
    marginTop: 4,
    marginBottom: 8,
  },
  tagChipEditable: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    paddingVertical: 6,
    paddingLeft: 10,
    paddingRight: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  tagRemoveBtn: {
    marginLeft: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagRemoveText: { fontSize: 10, color: '#374151', fontWeight: 'bold' },
  addTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 16,
    gap: 8,
  },
  addTagInput: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#111827',
  },
  addTagBtn: {
    backgroundColor: '#111827',
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  addTagBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  editActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  cancelEditBtn: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  cancelEditText: { color: '#4B5563', fontSize: 14, fontWeight: '700' },
  saveEditBtn: {
    flex: 2,
    backgroundColor: '#0F766E',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveEditText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  noTagsBox: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    marginBottom: 14,
  },
  noTagsText: { fontSize: 12, color: '#9CA3AF', fontStyle: 'italic' },

  // Authorship and Dock Styles
  dockButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  singleAddButton: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  singleAddButtonText: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '700',
  },
  authorshipCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    marginBottom: 16,
  },
  authorshipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0F766E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  authorshipAuthorName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    flexShrink: 1,
  },
  authorshipAuthorEmail: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  verifiedBadge: {
    backgroundColor: '#CCFBF1',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 6,
    marginLeft: 6,
  },
  verifiedBadgeText: {
    color: '#0F766E',
    fontSize: 10,
    fontWeight: '700',
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  deviceIcon: {
    fontSize: 13,
    marginRight: 6,
  },
  deviceText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '500',
    flexShrink: 1,
  },
});
