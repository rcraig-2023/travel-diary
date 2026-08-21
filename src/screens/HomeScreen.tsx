import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet, View, Text, TextInput, TouchableOpacity,
  Modal, FlatList, ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Trip } from '../types';
import { formatTripDateRange, addDaysToDate } from '../utils/dateUtils';

type NominatimResult = {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  address: {
    city?: string;
    town?: string;
    village?: string;
    country?: string;
  };
};

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { user, signOut } = useAuth();
  const mapRef = useRef<MapView | null>(null);

  const [trips, setTrips] = useState<Trip[]>([]);
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showLogModal, setShowLogModal] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);

  // New Trip State
  const [selectedCityResult, setSelectedCityResult] = useState<NominatimResult | null>(null);
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState('');

  const [citySearch, setCitySearch] = useState('');
  const [cityResults, setCityResults] = useState<NominatimResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [creatingTrip, setCreatingTrip] = useState(false);
  const [locating, setLocating] = useState(false);
  const [deletingTripId, setDeletingTripId] = useState<string | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchTrips();
    const unsubscribe = navigation.addListener('focus', () => {
      fetchTrips();
    });
    return unsubscribe;
  }, [navigation]);

  const fetchTrips = async () => {
    try {
      const { data, error } = await supabase
        .from('trips')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data) setTrips(data as Trip[]);
    } catch (e) {
      console.warn('[Home] fetchTrips error:', e);
    }
  };

  const deduplicateResults = (results: NominatimResult[]): NominatimResult[] => {
    const seen = new Set<string>();
    return results.filter((item) => {
      const cityName = (
        item.address.city ||
        item.address.town ||
        item.address.village ||
        item.display_name.split(',')[0]
      ).toLowerCase().trim();
      const country = (item.address.country ?? '').toLowerCase().trim();
      const key = `${cityName}|${country}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const searchCities = useCallback(async (query: string) => {
    if (query.length < 2) {
      setCityResults([]);
      return;
    }
    setSearchLoading(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
          query
        )}&format=json&limit=10&addressdetails=1`,
        { headers: { 'User-Agent': 'TravelDiaryApp/1.0' } }
      );
      const data: NominatimResult[] = await res.json();
      setCityResults(deduplicateResults(data));
    } catch {
      setCityResults([]);
    }
    setSearchLoading(false);
  }, []);

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => searchCities(citySearch), 400);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [citySearch, searchCities]);

  // Center map on user's current GPS location and offer to log
  const centerOnMyLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Needed',
          'Please enable location permissions in Settings to center on your position.'
        );
        setLocating(false);
        return;
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const { latitude, longitude } = loc.coords;

      // Animate map camera to current location
      mapRef.current?.animateToRegion(
        {
          latitude,
          longitude,
          latitudeDelta: 0.8,
          longitudeDelta: 0.8,
        },
        700
      );

      // Reverse geocode to find city name
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&addressdetails=1`,
        { headers: { 'User-Agent': 'TravelDiaryApp/1.0' } }
      );
      const data = await res.json();

      const cityName =
        data.address?.city ||
        data.address?.town ||
        data.address?.village ||
        data.display_name?.split(',')[0] ||
        'Current Location';

      // Ask if the user wants to log this city
      Alert.alert(
        `📍 Located in ${cityName}`,
        `Would you like to log ${cityName} to your travel diary?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: `Log ${cityName}`,
            onPress: () => {
              const syntheticResult: NominatimResult = {
                place_id: data.place_id || Date.now(),
                display_name: data.display_name || cityName,
                lat: String(latitude),
                lon: String(longitude),
                address: data.address || {},
              };
              handleCitySelect(syntheticResult);
            },
          },
        ]
      );
    } catch {
      Alert.alert('Location Error', 'Unable to retrieve current location.');
    }
    setLocating(false);
  };

  const handleCitySelect = (item: NominatimResult) => {
    setSelectedCityResult(item);
    setStartDate(new Date().toISOString().split('T')[0]);
    setEndDate('');
    setShowLogModal(true);
  };

  const saveNewTrip = async () => {
    if (!selectedCityResult) return;

    const cityName =
      selectedCityResult.address.city ||
      selectedCityResult.address.town ||
      selectedCityResult.address.village ||
      selectedCityResult.display_name.split(',')[0].trim();

    setCreatingTrip(true);
    try {
      const { data, error } = await supabase
        .from('trips')
        .insert({
          user_id: user!.id,
          city_name: cityName,
          country: selectedCityResult.address.country ?? null,
          lat: parseFloat(selectedCityResult.lat),
          lng: parseFloat(selectedCityResult.lon),
          visit_date: startDate.trim() || null,
          end_date: endDate.trim() || null,
        })
        .select()
        .single();
      setCreatingTrip(false);

      if (error) {
        Alert.alert('Error', error.message);
        return;
      }

      closeModal();
      await fetchTrips();
      setSelectedTrip(data);
      navigation.navigate('City', { trip: data });
    } catch (err: any) {
      setCreatingTrip(false);
      Alert.alert('Error', err.message || 'Could not create trip.');
    }
  };

  const deleteTrip = (tripToDelete: Trip) => {
    Alert.alert(
      `Delete ${tripToDelete.city_name}?`,
      `Are you sure you want to remove this pin? All photos, jots, and restaurant reviews for ${tripToDelete.city_name} will be deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Pin',
          style: 'destructive',
          onPress: async () => {
            setDeletingTripId(tripToDelete.id);
            try {
              const { error } = await supabase
                .from('trips')
                .delete()
                .eq('id', tripToDelete.id);

              if (error) {
                Alert.alert('Delete Failed', error.message);
                return;
              }

              // Update local state
              setTrips((prev) => prev.filter((t) => t.id !== tripToDelete.id));
              if (selectedTrip?.id === tripToDelete.id) {
                setSelectedTrip(null);
              }
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to delete trip.');
            } finally {
              setDeletingTripId(null);
            }
          },
        },
      ]
    );
  };

  const closeModal = () => {
    setShowLogModal(false);
    setSelectedCityResult(null);
    setCitySearch('');
    setCityResults([]);
    setStartDate(new Date().toISOString().split('T')[0]);
    setEndDate('');
  };

  const fitAllTrips = () => {
    if (trips.length === 0) {
      mapRef.current?.animateToRegion(
        { latitude: 20, longitude: 0, latitudeDelta: 100, longitudeDelta: 100 },
        800
      );
      return;
    }
    const coords = trips.map((t) => ({ latitude: t.lat, longitude: t.lng }));
    mapRef.current?.fitToCoordinates(coords, {
      edgePadding: { top: 140, right: 60, bottom: 200, left: 60 },
      animated: true,
    });
  };

  const handleSelectTrip = (trip: Trip) => {
    setSelectedTrip(trip);
    mapRef.current?.animateToRegion(
      {
        latitude: trip.lat - 0.4,
        longitude: trip.lng,
        latitudeDelta: 3,
        longitudeDelta: 3,
      },
      500
    );
  };

  const filteredTrips = trips.filter((t) =>
    t.city_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (t.country && t.country.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <View style={styles.container}>
      {/* Full screen interactive map */}
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        minZoomLevel={1.5}
        initialRegion={{
          latitude: trips.length > 0 ? trips[0].lat : 25,
          longitude: trips.length > 0 ? trips[0].lng : 10,
          latitudeDelta: 60,
          longitudeDelta: 60,
        }}
        onPress={() => setSelectedTrip(null)}
      >
        {filteredTrips.map((trip) => {
          const isSelected = selectedTrip?.id === trip.id;
          return (
            <Marker
              key={trip.id}
              coordinate={{ latitude: trip.lat, longitude: trip.lng }}
              onPress={(e) => {
                e.stopPropagation();
                handleSelectTrip(trip);
              }}
              tracksViewChanges={false}
            >
              <View style={styles.markerAnchor}>
                <View
                  style={[
                    styles.customMarkerPill,
                    isSelected && styles.customMarkerPillActive,
                  ]}
                >
                  <Text style={styles.markerDot}>📍</Text>
                  <Text
                    style={[
                      styles.markerTitle,
                      isSelected && styles.markerTitleActive,
                    ]}
                    numberOfLines={1}
                  >
                    {trip.city_name}
                  </Text>
                </View>
                <View
                  style={[
                    styles.markerArrow,
                    isSelected && styles.markerArrowActive,
                  ]}
                />
              </View>
            </Marker>
          );
        })}
      </MapView>

      {/* Floating Top Bar (Search + Stats + Profile) */}
      <View style={[styles.topBarContainer, { paddingTop: insets.top + 8 }]}>
        <View style={styles.searchCard}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search your destinations..."
            placeholderTextColor="#8E8E93"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <TouchableOpacity
              onPress={() => setSearchQuery('')}
              style={styles.clearBtn}
            >
              <Text style={styles.clearBtnText}>✕</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={styles.avatarBtn}
            onPress={() => setShowAccountModal(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.avatarText}>
              {user?.email?.charAt(0).toUpperCase() || '✈️'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Stats Pill */}
        <View style={styles.statsRow}>
          <View style={styles.statsPill}>
            <Text style={styles.statsText}>
              ✈️ {trips.length} {trips.length === 1 ? 'Pin' : 'Pins'} on Map
            </Text>
          </View>
        </View>
      </View>

      {/* Floating Map Controls (Right Side) */}
      <View style={[styles.mapControls, { top: insets.top + 95 }]}>
        <TouchableOpacity
          style={styles.mapControlBtn}
          onPress={fitAllTrips}
          activeOpacity={0.8}
        >
          <Text style={styles.mapControlEmoji}>🌍</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.mapControlBtn}
          onPress={centerOnMyLocation}
          activeOpacity={0.8}
          disabled={locating}
        >
          {locating ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <Text style={styles.mapControlEmoji}>🎯</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Bottom Floating City Preview Card OR "+ Log Trip" Button */}
      {selectedTrip ? (
        <View style={[styles.previewContainer, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.previewCard}>
            <View style={styles.previewHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.previewCityName}>{selectedTrip.city_name}</Text>
                <Text style={styles.previewCountry}>
                  {selectedTrip.country || 'Destination'}
                  {selectedTrip.visit_date
                    ? ` · ${formatTripDateRange(selectedTrip.visit_date, selectedTrip.end_date)}`
                    : ''}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.previewCloseBtn}
                onPress={() => setSelectedTrip(null)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={styles.previewCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.previewActionRow}>
              <TouchableOpacity
                style={styles.previewActionBtn}
                onPress={() => navigation.navigate('City', { trip: selectedTrip })}
                activeOpacity={0.85}
              >
                <Text style={styles.previewActionBtnText}>Explore City Diary →</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.deletePinBtn}
                onPress={() => deleteTrip(selectedTrip)}
                activeOpacity={0.8}
                disabled={deletingTripId === selectedTrip.id}
              >
                {deletingTripId === selectedTrip.id ? (
                  <ActivityIndicator size="small" color="#DC2626" />
                ) : (
                  <Text style={styles.deletePinText}>🗑 Delete Pin</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ) : (
        <View style={[styles.bottomButtonContainer, { paddingBottom: insets.bottom + 20 }]}>
          <TouchableOpacity
            style={styles.logTripButton}
            activeOpacity={0.85}
            onPress={() => {
              setSelectedCityResult(null);
              setShowLogModal(true);
            }}
          >
            <Text style={styles.logTripButtonIcon}>＋</Text>
            <Text style={styles.logTripButtonText}>Log New Trip</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Account & Profile Modal with Trip Management */}
      <Modal
        visible={showAccountModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAccountModal(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setShowAccountModal(false)}
        >
          <View style={[styles.accountSheet, { maxHeight: '80%', paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.accountSheetHandle} />
            <Text style={styles.accountTitle}>Traveler Profile</Text>
            <Text style={styles.accountEmail}>{user?.email || 'Logged In'}</Text>

            <View style={styles.accountStatsCard}>
              <View style={styles.statCol}>
                <Text style={styles.statNumber}>{trips.length}</Text>
                <Text style={styles.statLabel}>Pins Logged</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statCol}>
                <Text style={styles.statNumber}>
                  {new Set(trips.map((t) => t.country).filter(Boolean)).size}
                </Text>
                <Text style={styles.statLabel}>Countries</Text>
              </View>
            </View>

            {/* List of saved trips for quick pin management / deleting duplicates */}
            <Text style={styles.sectionHeader}>Manage Your Pins ({trips.length})</Text>
            <FlatList
              data={trips}
              keyExtractor={(item) => item.id}
              style={styles.tripsList}
              renderItem={({ item }) => (
                <View style={styles.tripManageRow}>
                  <TouchableOpacity
                    style={styles.tripManageInfo}
                    onPress={() => {
                      setShowAccountModal(false);
                      handleSelectTrip(item);
                    }}
                  >
                    <Text style={styles.tripManageName}>📍 {item.city_name}</Text>
                    <Text style={styles.tripManageSub}>
                      {item.country || 'Trip'} · {formatTripDateRange(item.visit_date, item.end_date)}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.tripManageDeleteBtn}
                    onPress={() => deleteTrip(item)}
                  >
                    <Text style={styles.tripManageDeleteText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              )}
              ListEmptyComponent={
                <Text style={styles.noTripsText}>No pins logged yet.</Text>
              }
            />

            <TouchableOpacity
              style={styles.signOutBtn}
              onPress={() => {
                setShowAccountModal(false);
                signOut();
              }}
            >
              <Text style={styles.signOutText}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Log Trip Modal (Step 1: City Search, Step 2: Date & Duration Selector) */}
      <Modal
        visible={showLogModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeModal}
      >
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {selectedCityResult ? 'Trip Dates & Duration' : 'Where did you travel?'}
            </Text>
            <TouchableOpacity onPress={closeModal}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>

          {selectedCityResult ? (
            /* Step 2: Configure Dates & Duration */
            <ScrollView
              style={styles.dateStepContainer}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.selectedCityBanner}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.selectedCityBannerTitle}>
                    📍{' '}
                    {selectedCityResult.address.city ||
                      selectedCityResult.address.town ||
                      selectedCityResult.address.village ||
                      selectedCityResult.display_name.split(',')[0]}
                  </Text>
                  <Text style={styles.selectedCityBannerCountry} numberOfLines={1}>
                    {selectedCityResult.address.country || selectedCityResult.display_name}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.changeCityBtn}
                  onPress={() => setSelectedCityResult(null)}
                >
                  <Text style={styles.changeCityBtnText}>Change</Text>
                </TouchableOpacity>
              </View>

              {/* Live Formatted Summary */}
              <View style={styles.previewDurationBox}>
                <Text style={styles.previewDurationLabel}>TRIP DURATION PREVIEW</Text>
                <Text style={styles.previewDurationValue}>
                  🗓️ {formatTripDateRange(startDate, endDate) || 'Set your travel dates'}
                </Text>
              </View>

              {/* Start Date */}
              <Text style={styles.inputLabel}>START DATE</Text>
              <TextInput
                style={styles.dateInput}
                placeholder="YYYY-MM-DD (e.g. 2024-05-12)"
                placeholderTextColor="#999"
                value={startDate}
                onChangeText={setStartDate}
              />

              {/* End Date */}
              <Text style={styles.inputLabel}>END DATE (OPTIONAL FOR MULTI-DAY)</Text>
              <TextInput
                style={styles.dateInput}
                placeholder="YYYY-MM-DD (e.g. 2024-05-19)"
                placeholderTextColor="#999"
                value={endDate}
                onChangeText={setEndDate}
              />

              {/* Quick Duration Helper Chips */}
              <Text style={styles.inputLabel}>QUICK DURATION PRESETS</Text>
              <View style={styles.durationChipGrid}>
                <TouchableOpacity
                  style={styles.durationChip}
                  onPress={() => {
                    setEndDate(startDate);
                  }}
                >
                  <Text style={styles.durationChipText}>⚡ 1 Day</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.durationChip}
                  onPress={() => {
                    setEndDate(addDaysToDate(startDate, 2));
                  }}
                >
                  <Text style={styles.durationChipText}>🗓️ Weekend (3 Days)</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.durationChip}
                  onPress={() => {
                    setEndDate(addDaysToDate(startDate, 6));
                  }}
                >
                  <Text style={styles.durationChipText}>✈️ 1 Week (7 Days)</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.durationChip}
                  onPress={() => {
                    setEndDate(addDaysToDate(startDate, 13));
                  }}
                >
                  <Text style={styles.durationChipText}>🏖️ 2 Weeks (14 Days)</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.durationChip}
                  onPress={() => {
                    setEndDate(addDaysToDate(startDate, 29));
                  }}
                >
                  <Text style={styles.durationChipText}>🌍 1 Month</Text>
                </TouchableOpacity>
                {endDate ? (
                  <TouchableOpacity
                    style={[styles.durationChip, styles.durationChipClear]}
                    onPress={() => setEndDate('')}
                  >
                    <Text style={styles.durationChipClearText}>Clear End Date</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              {/* Past Trip Presets */}
              <Text style={styles.inputLabel}>PAST TRIP PRESETS</Text>
              <View style={styles.durationChipGrid}>
                <TouchableOpacity
                  style={styles.durationChip}
                  onPress={() => {
                    const today = new Date();
                    setStartDate(today.toISOString().split('T')[0]);
                    setEndDate('');
                  }}
                >
                  <Text style={styles.durationChipText}>📍 Today</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.durationChip}
                  onPress={() => {
                    const d = new Date();
                    d.setMonth(d.getMonth() - 1);
                    const y = d.getFullYear();
                    const m = String(d.getMonth() + 1).padStart(2, '0');
                    setStartDate(`${y}-${m}-01`);
                    setEndDate(`${y}-${m}-28`);
                  }}
                >
                  <Text style={styles.durationChipText}>📅 Last Month</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.durationChip}
                  onPress={() => {
                    const prevYear = new Date().getFullYear() - 1;
                    setStartDate(`${prevYear}-06-01`);
                    setEndDate(`${prevYear}-06-15`);
                  }}
                >
                  <Text style={styles.durationChipText}>📅 Last Year ({new Date().getFullYear() - 1})</Text>
                </TouchableOpacity>
              </View>

              {/* Submit Button */}
              <TouchableOpacity
                style={[
                  styles.saveTripBtn,
                  (!startDate.trim() || creatingTrip) && styles.saveTripBtnDisabled,
                ]}
                onPress={saveNewTrip}
                disabled={!startDate.trim() || creatingTrip}
                activeOpacity={0.85}
              >
                {creatingTrip ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.saveTripBtnText}>Log Trip & Open Diary →</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          ) : (
            /* Step 1: City Search */
            <>
              <TextInput
                style={styles.cityInput}
                placeholder="Search a city (e.g. Paris, Tokyo, Berlin)..."
                placeholderTextColor="#999"
                value={citySearch}
                onChangeText={setCitySearch}
                autoFocus
              />

              {(searchLoading || creatingTrip) && (
                <ActivityIndicator style={styles.spinner} color="#000" />
              )}

              <FlatList
                data={cityResults}
                keyExtractor={(item) => item.place_id.toString()}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.cityResult}
                    onPress={() => handleCitySelect(item)}
                    disabled={creatingTrip}
                  >
                    <View style={styles.cityResultLeft}>
                      <Text style={styles.cityResultName}>
                        {item.address.city ||
                          item.address.town ||
                          item.address.village ||
                          item.display_name.split(',')[0]}
                      </Text>
                      <Text style={styles.cityResultSub} numberOfLines={1}>
                        {item.display_name}
                      </Text>
                    </View>
                    <Text style={styles.cityResultArrow}>→</Text>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  citySearch.length >= 2 && !searchLoading ? (
                    <Text style={styles.noResults}>No matching cities found.</Text>
                  ) : (
                    <View style={styles.searchEmptyTip}>
                      <Text style={styles.searchEmptyTipIcon}>🗺️</Text>
                      <Text style={styles.searchEmptyTipText}>
                        Type a city name above to log your past or current travels.
                      </Text>
                    </View>
                  )
                }
              />
            </>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#E5E7EB' },
  topBarContainer: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 10,
  },
  searchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 24,
    paddingVertical: 8,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  searchIcon: { fontSize: 16, marginRight: 8, opacity: 0.6 },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#111',
    paddingVertical: 6,
  },
  clearBtn: { padding: 6, marginRight: 4 },
  clearBtnText: { color: '#9CA3AF', fontSize: 14 },
  avatarBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: 8,
    paddingLeft: 4,
  },
  statsPill: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 16,
    paddingVertical: 5,
    paddingHorizontal: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  statsText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  mapControls: {
    position: 'absolute',
    right: 16,
    zIndex: 9,
    gap: 10,
  },
  mapControlBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  mapControlEmoji: { fontSize: 20 },
  markerAnchor: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  customMarkerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111827',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 5,
  },
  customMarkerPillActive: {
    backgroundColor: '#00A699',
    transform: [{ scale: 1.1 }],
  },
  markerDot: { fontSize: 12, marginRight: 4 },
  markerTitle: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
    maxWidth: 110,
  },
  markerTitleActive: {
    color: '#FFFFFF',
  },
  markerArrow: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#111827',
    alignSelf: 'center',
    marginTop: -1,
  },
  markerArrowActive: {
    borderTopColor: '#00A699',
  },
  bottomButtonContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  logTripButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111827',
    paddingVertical: 15,
    paddingHorizontal: 28,
    borderRadius: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  logTripButtonIcon: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginRight: 8,
  },
  logTripButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  previewContainer: {
    position: 'absolute',
    bottom: 0,
    left: 16,
    right: 16,
    zIndex: 10,
  },
  previewCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  previewCityName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111',
  },
  previewCountry: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 3,
  },
  previewCloseBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewCloseText: { color: '#6B7280', fontSize: 13, fontWeight: '700' },
  previewActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    gap: 10,
  },
  previewActionBtn: {
    flex: 1,
    backgroundColor: '#111827',
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
  },
  previewActionBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  deletePinBtn: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
  },
  deletePinText: {
    color: '#DC2626',
    fontSize: 14,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  accountSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
  },
  accountSheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#E5E7EB',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 18,
  },
  accountTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111',
    textAlign: 'center',
  },
  accountEmail: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  accountStatsCard: {
    flexDirection: 'row',
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#EEEEEE',
  },
  statCol: { flex: 1, alignItems: 'center' },
  statNumber: { fontSize: 22, fontWeight: '800', color: '#111' },
  statLabel: { fontSize: 12, color: '#6B7280', marginTop: 2, fontWeight: '600' },
  statDivider: { width: 1, height: '80%', backgroundColor: '#E5E7EB', alignSelf: 'center' },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tripsList: {
    maxHeight: 180,
    marginBottom: 16,
  },
  tripManageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  tripManageInfo: { flex: 1 },
  tripManageName: { fontSize: 15, fontWeight: '700', color: '#111' },
  tripManageSub: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  tripManageDeleteBtn: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  tripManageDeleteText: {
    color: '#DC2626',
    fontSize: 12,
    fontWeight: '700',
  },
  noTripsText: {
    textAlign: 'center',
    color: '#9CA3AF',
    paddingVertical: 20,
    fontSize: 14,
  },
  signOutBtn: {
    backgroundColor: '#F3F4F6',
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
  },
  signOutText: {
    color: '#374151',
    fontSize: 15,
    fontWeight: '700',
  },
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
  cityInput: {
    marginHorizontal: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    marginBottom: 8,
    backgroundColor: '#FAFAFA',
  },
  spinner: { marginTop: 20 },
  cityResult: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  cityResultLeft: { flex: 1 },
  cityResultName: { fontSize: 16, fontWeight: '600', color: '#111', marginBottom: 2 },
  cityResultSub: { fontSize: 13, color: '#6B7280' },
  cityResultArrow: { fontSize: 18, color: '#9CA3AF', marginLeft: 10 },
  noResults: { textAlign: 'center', color: '#9CA3AF', marginTop: 30, fontSize: 15 },
  searchEmptyTip: { alignItems: 'center', marginTop: 40, paddingHorizontal: 30 },
  searchEmptyTipIcon: { fontSize: 40, marginBottom: 10 },
  searchEmptyTipText: { textAlign: 'center', color: '#888', fontSize: 14, lineHeight: 20 },

  // Date Step Styles
  dateStepContainer: { flex: 1, paddingHorizontal: 20 },
  selectedCityBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  selectedCityBannerTitle: { fontSize: 18, fontWeight: '800', color: '#111' },
  selectedCityBannerCountry: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  changeCityBtn: {
    backgroundColor: '#fff',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  changeCityBtnText: { fontSize: 13, color: '#374151', fontWeight: '600' },
  previewDurationBox: {
    backgroundColor: '#EFF6FF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  previewDurationLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1D4ED8',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  previewDurationValue: {
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
  durationChipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 18,
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
  saveTripBtn: {
    backgroundColor: '#111827',
    paddingVertical: 16,
    borderRadius: 30,
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  saveTripBtnDisabled: {
    backgroundColor: '#9CA3AF',
  },
  saveTripBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
