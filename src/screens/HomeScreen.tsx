import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet, View, Text, TextInput, TouchableOpacity,
  Modal, FlatList, ActivityIndicator, Alert, Platform,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Trip } from '../types';

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

  const [citySearch, setCitySearch] = useState('');
  const [cityResults, setCityResults] = useState<NominatimResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [creatingTrip, setCreatingTrip] = useState(false);
  const [locating, setLocating] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchTrips();
  }, []);

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

  const useMyLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission needed',
          'Please allow location access in Settings to use this feature.'
        );
        setLocating(false);
        return;
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const { latitude, longitude } = loc.coords;

      // Animate map to current location
      mapRef.current?.animateToRegion(
        {
          latitude,
          longitude,
          latitudeDelta: 2,
          longitudeDelta: 2,
        },
        700
      );

      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&addressdetails=1`,
        { headers: { 'User-Agent': 'TravelDiaryApp/1.0' } }
      );
      const data = await res.json();

      const syntheticResult: NominatimResult = {
        place_id: data.place_id,
        display_name: data.display_name,
        lat: String(latitude),
        lon: String(longitude),
        address: data.address,
      };

      await logTrip(syntheticResult);
    } catch {
      Alert.alert('Could not get location', 'Make sure location services are enabled.');
    }
    setLocating(false);
  };

  const logTrip = async (result: NominatimResult) => {
    const cityName =
      result.address.city ||
      result.address.town ||
      result.address.village ||
      result.display_name.split(',')[0].trim();

    setCreatingTrip(true);
    try {
      const { data, error } = await supabase
        .from('trips')
        .insert({
          user_id: user!.id,
          city_name: cityName,
          country: result.address.country ?? null,
          lat: parseFloat(result.lat),
          lng: parseFloat(result.lon),
          visit_date: new Date().toISOString().split('T')[0],
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

  const closeModal = () => {
    setShowLogModal(false);
    setCitySearch('');
    setCityResults([]);
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
      edgePadding: { top: 120, right: 60, bottom: 180, left: 60 },
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

  const formatDate = (iso: string | null) => {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

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
              ✈️ {trips.length} {trips.length === 1 ? 'City' : 'Cities'} Explored
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
          onPress={useMyLocation}
          activeOpacity={0.8}
          disabled={locating}
        >
          {locating ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <Text style={styles.mapControlEmoji}>📍</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Bottom Floating City Preview Card OR "+ Log Trip" Button */}
      {selectedTrip ? (
        <View style={[styles.previewContainer, { paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity
            style={styles.previewCard}
            activeOpacity={0.9}
            onPress={() => navigation.navigate('City', { trip: selectedTrip })}
          >
            <View style={styles.previewHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.previewCityName}>{selectedTrip.city_name}</Text>
                <Text style={styles.previewCountry}>
                  {selectedTrip.country || 'Destination'}
                  {selectedTrip.visit_date ? ` · ${formatDate(selectedTrip.visit_date)}` : ''}
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

            <TouchableOpacity
              style={styles.previewActionBtn}
              onPress={() => navigation.navigate('City', { trip: selectedTrip })}
            >
              <Text style={styles.previewActionBtnText}>Explore City Diary →</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={[styles.bottomButtonContainer, { paddingBottom: insets.bottom + 20 }]}>
          <TouchableOpacity
            style={styles.logTripButton}
            activeOpacity={0.85}
            onPress={() => setShowLogModal(true)}
          >
            <Text style={styles.logTripButtonIcon}>＋</Text>
            <Text style={styles.logTripButtonText}>Log New Trip</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Account & Profile Modal */}
      <Modal
        visible={showAccountModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAccountModal(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setShowAccountModal(false)}
        >
          <View style={[styles.accountSheet, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.accountSheetHandle} />
            <Text style={styles.accountTitle}>Traveler Profile</Text>
            <Text style={styles.accountEmail}>{user?.email || 'Logged In'}</Text>

            <View style={styles.accountStatsCard}>
              <View style={styles.statCol}>
                <Text style={styles.statNumber}>{trips.length}</Text>
                <Text style={styles.statLabel}>Trips Logged</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statCol}>
                <Text style={styles.statNumber}>
                  {new Set(trips.map((t) => t.country).filter(Boolean)).size}
                </Text>
                <Text style={styles.statLabel}>Countries</Text>
              </View>
            </View>

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

      {/* Log Trip Modal */}
      <Modal
        visible={showLogModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeModal}
      >
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Where did you travel?</Text>
            <TouchableOpacity onPress={closeModal}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>

          {/* Current GPS button */}
          <TouchableOpacity
            style={styles.locationBtn}
            onPress={useMyLocation}
            disabled={locating || creatingTrip}
          >
            {locating ? (
              <ActivityIndicator color="#000" size="small" />
            ) : (
              <Text style={styles.locationIcon}>📍</Text>
            )}
            <Text style={styles.locationBtnText}>Use My Current Location</Text>
          </TouchableOpacity>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or search city name</Text>
            <View style={styles.dividerLine} />
          </View>

          <TextInput
            style={styles.cityInput}
            placeholder="e.g. Paris, Tokyo, Berlin..."
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
                onPress={() => logTrip(item)}
                disabled={creatingTrip}
              >
                <Text style={styles.cityResultName}>
                  {item.address.city ||
                    item.address.town ||
                    item.address.village ||
                    item.display_name.split(',')[0]}
                </Text>
                <Text style={styles.cityResultSub} numberOfLines={1}>
                  {item.display_name}
                </Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              citySearch.length >= 2 && !searchLoading ? (
                <Text style={styles.noResults}>No matching cities found.</Text>
              ) : null
            }
          />
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
  previewActionBtn: {
    backgroundColor: '#111827',
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 14,
  },
  previewActionBtnText: {
    color: '#fff',
    fontSize: 15,
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
    marginBottom: 20,
  },
  accountStatsCard: {
    flexDirection: 'row',
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#EEEEEE',
  },
  statCol: { flex: 1, alignItems: 'center' },
  statNumber: { fontSize: 24, fontWeight: '800', color: '#111' },
  statLabel: { fontSize: 12, color: '#6B7280', marginTop: 2, fontWeight: '600' },
  statDivider: { width: 1, height: '80%', backgroundColor: '#E5E7EB', alignSelf: 'center' },
  signOutBtn: {
    backgroundColor: '#FEE2E2',
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
  },
  signOutText: {
    color: '#DC2626',
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
  locationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 4,
    backgroundColor: '#F3F4F6',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  locationIcon: { fontSize: 18, marginRight: 10 },
  locationBtnText: { fontSize: 15, fontWeight: '600', color: '#111' },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginVertical: 14,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#E5E7EB' },
  dividerText: { marginHorizontal: 10, fontSize: 13, color: '#9CA3AF' },
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
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  cityResultName: { fontSize: 16, fontWeight: '600', color: '#111', marginBottom: 2 },
  cityResultSub: { fontSize: 13, color: '#6B7280' },
  noResults: { textAlign: 'center', color: '#9CA3AF', marginTop: 30, fontSize: 15 },
});
