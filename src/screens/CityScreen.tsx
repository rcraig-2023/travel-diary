import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, Modal,
  TextInput, ScrollView, ActivityIndicator,
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { Trip } from '../types';
import { formatTripDateRange, addDaysToDate } from '../utils/dateUtils';
import PhotosTab from './city/PhotosTab';
import JotsTab from './city/JotsTab';
import LandmarksTab from './city/LandmarksTab';
import RestaurantsTab from './city/RestaurantsTab';

type RouteParams = { trip: Trip };

const TABS = ['Photos', 'Jots', 'Highlights', 'Restaurants'] as const;
type Tab = typeof TABS[number];

export default function CityScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<{ City: RouteParams }, 'City'>>();
  const { trip: initialTrip } = route.params;

  const [trip, setTrip] = useState<Trip>(initialTrip);
  const [activeTab, setActiveTab] = useState<Tab>('Photos');

  // Edit Date State
  const [showDateModal, setShowDateModal] = useState(false);
  const [editStartDate, setEditStartDate] = useState(trip.visit_date || '');
  const [editEndDate, setEditEndDate] = useState(trip.end_date || '');
  const [savingDate, setSavingDate] = useState(false);

  const openDateModal = () => {
    setEditStartDate(trip.visit_date || '');
    setEditEndDate(trip.end_date || '');
    setShowDateModal(true);
  };

  const saveDates = async () => {
    setSavingDate(true);
    try {
      const { error } = await supabase
        .from('trips')
        .update({
          visit_date: editStartDate.trim() || null,
          end_date: editEndDate.trim() || null,
        })
        .eq('id', trip.id);

      if (error) {
        Alert.alert('Update Failed', error.message);
        return;
      }

      setTrip((prev) => ({
        ...prev,
        visit_date: editStartDate.trim() || null,
        end_date: editEndDate.trim() || null,
      }));
      setShowDateModal(false);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not update trip dates.');
    } finally {
      setSavingDate(false);
    }
  };

  const handleDeleteTrip = () => {
    Alert.alert(
      `Delete ${trip.city_name}?`,
      `Are you sure you want to delete this trip? All its photos, jots, and restaurant reviews will be permanently removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await supabase.from('trips').delete().eq('id', trip.id);
              navigation.goBack();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to delete trip.');
            }
          },
        },
      ]
    );
  };

  const dateDisplay = formatTripDateRange(trip.visit_date, trip.end_date);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{trip.city_name}</Text>
          <TouchableOpacity
            style={styles.subtitleRow}
            onPress={openDateModal}
            activeOpacity={0.7}
          >
            <Text style={styles.subtitle}>
              {trip.country ? `${trip.country} · ` : ''}
              {dateDisplay ? `📅 ${dateDisplay}` : '📅 Set Travel Dates'}
            </Text>
            <Text style={styles.editDatePill}>✎ Edit</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.deleteHeaderBtn}
          onPress={handleDeleteTrip}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.deleteHeaderIcon}>🗑</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabBar}>
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.content}>
        {activeTab === 'Photos' && <PhotosTab tripId={trip.id} />}
        {activeTab === 'Jots' && <JotsTab tripId={trip.id} />}
        {activeTab === 'Highlights' && <LandmarksTab tripId={trip.id} />}
        {activeTab === 'Restaurants' && (
          <RestaurantsTab
            tripId={trip.id}
            cityName={trip.city_name}
            country={trip.country}
          />
        )}
      </View>

      {/* Edit Trip Dates Modal */}
      <Modal
        visible={showDateModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowDateModal(false)}
      >
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Trip Dates & Duration</Text>
            <TouchableOpacity onPress={() => setShowDateModal(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.modalBody}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.previewBox}>
              <Text style={styles.previewBoxLabel}>CURRENT DURATION PREVIEW</Text>
              <Text style={styles.previewBoxValue}>
                🗓️ {formatTripDateRange(editStartDate, editEndDate) || 'No dates set'}
              </Text>
            </View>

            <Text style={styles.inputLabel}>START DATE</Text>
            <TextInput
              style={styles.dateInput}
              placeholder="YYYY-MM-DD (e.g. 2024-05-12)"
              placeholderTextColor="#999"
              value={editStartDate}
              onChangeText={setEditStartDate}
            />

            <Text style={styles.inputLabel}>END DATE (OPTIONAL FOR MULTI-DAY)</Text>
            <TextInput
              style={styles.dateInput}
              placeholder="YYYY-MM-DD (e.g. 2024-05-19)"
              placeholderTextColor="#999"
              value={editEndDate}
              onChangeText={setEditEndDate}
            />

            <Text style={styles.inputLabel}>QUICK DURATION PRESETS</Text>
            <View style={styles.chipGrid}>
              <TouchableOpacity
                style={styles.durationChip}
                onPress={() => setEditEndDate(editStartDate)}
              >
                <Text style={styles.durationChipText}>⚡ 1 Day</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.durationChip}
                onPress={() => setEditEndDate(addDaysToDate(editStartDate || new Date().toISOString().split('T')[0], 2))}
              >
                <Text style={styles.durationChipText}>🗓️ Weekend (3 Days)</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.durationChip}
                onPress={() => setEditEndDate(addDaysToDate(editStartDate || new Date().toISOString().split('T')[0], 6))}
              >
                <Text style={styles.durationChipText}>✈️ 1 Week (7 Days)</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.durationChip}
                onPress={() => setEditEndDate(addDaysToDate(editStartDate || new Date().toISOString().split('T')[0], 13))}
              >
                <Text style={styles.durationChipText}>🏖️ 2 Weeks</Text>
              </TouchableOpacity>
              {editEndDate ? (
                <TouchableOpacity
                  style={[styles.durationChip, styles.durationChipClear]}
                  onPress={() => setEditEndDate('')}
                >
                  <Text style={styles.durationChipClearText}>Clear End Date</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            <TouchableOpacity
              style={[
                styles.saveBtn,
                savingDate && styles.saveBtnDisabled,
              ]}
              onPress={saveDates}
              disabled={savingDate}
              activeOpacity={0.85}
            >
              {savingDate ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveBtnText}>Save Trip Dates</Text>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  deleteHeaderBtn: {
    backgroundColor: '#FEE2E2',
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteHeaderIcon: {
    fontSize: 18,
  },
  title: { fontSize: 26, fontWeight: 'bold', color: '#111' },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    flexWrap: 'wrap',
    gap: 6,
  },
  subtitle: { fontSize: 13, color: '#4B5563', fontWeight: '500' },
  editDatePill: {
    fontSize: 11,
    color: '#00A699',
    fontWeight: '700',
    backgroundColor: '#F0FAFA',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#C8EEEB',
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    backgroundColor: '#fff',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#000',
  },
  tabText: { fontSize: 13, color: '#aaa', fontWeight: '500' },
  tabTextActive: { color: '#000', fontWeight: '700' },
  content: { flex: 1 },

  // Modal styles
  modal: { flex: 1, backgroundColor: '#fff', paddingTop: 20 },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#111' },
  cancelText: { fontSize: 16, color: '#6B7280' },
  modalBody: { flex: 1, paddingHorizontal: 20 },
  previewBox: {
    backgroundColor: '#EFF6FF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  previewBoxLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1D4ED8',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  previewBoxValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E40AF',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dateInput: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#111',
    backgroundColor: '#FAFAFA',
    marginBottom: 16,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 24,
  },
  durationChip: {
    backgroundColor: '#F3F4F6',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  durationChipText: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '600',
  },
  durationChipClear: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FECACA',
  },
  durationChipClearText: {
    fontSize: 13,
    color: '#DC2626',
    fontWeight: '600',
  },
  saveBtn: {
    backgroundColor: '#111827',
    paddingVertical: 16,
    borderRadius: 30,
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 40,
  },
  saveBtnDisabled: {
    backgroundColor: '#9CA3AF',
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
