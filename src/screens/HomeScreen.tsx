import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet, View, Text, TextInput, TouchableOpacity,
  Modal, FlatList, ActivityIndicator, Alert,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useNavigation } from '@react-navigation/native';
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
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showLogModal, setShowLogModal] = useState(false);
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
    const { data, error } = await supabase
      .from('trips')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) setTrips(data as Trip[]);
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
    if (query.length < 2) { setCityResults([]); return; }
    setSearchLoading(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=10&addressdetails=1`,
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
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
  }, [citySearch, searchCities]);

  const useMyLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please allow location access in Settings to use this feature.');
        setLocating(false);
        return;
      }

      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = loc.coords;

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

    if (error) { Alert.alert('Error', error.message); return; }

    closeModal();
    fetchTrips();
    navigation.navigate('City', { trip: data });
  };

  const closeModal = () => {
    setShowLogModal(false);
    setCitySearch('');
    setCityResults([]);
  };

  const filteredTrips = trips.filter((t) =>
    t.city_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <View style={styles.container}>
      <MapView
        style={StyleSheet.absoluteFillObject}
        minZoomLevel={2}
        initialRegion={{ latitude: 20, longitude: 0, latitudeDelta: 100, longitudeDelta: 100 }}
      >
        {filteredTrips.map((trip) => (
          <Marker
            key={trip.id}
            coordinate={{ latitude: trip.lat, longitude: trip.lng }}
            title={trip.city_name}
            description={trip.country ?? ''}
            pinColor={trip.country === 'United States' ? '#FF5A5F' : '#00A699'}
            onCalloutPress={() => navigation.navigate('City', { trip })}
          />
        ))}
      </MapView>

      <View style={styles.topContainer}>
        <TextInput
          style={styles.searchBar}
          placeholder="Search your trips..."
          placeholderTextColor="#666"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <TouchableOpacity style={styles.floatingButton} activeOpacity={0.85} onPress={() => setShowLogModal(true)}>
        <Text style={styles.buttonText}>+ Log Trip</Text>
      </TouchableOpacity>

      <Modal visible={showLogModal} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Where did you go?</Text>
            <TouchableOpacity onPress={closeModal}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>

          {/* GPS option */}
          <TouchableOpacity
            style={styles.locationBtn}
            onPress={useMyLocation}
            disabled={locating || creatingTrip}
          >
            {locating ? (
              <ActivityIndicator color="#00A699" size="small" />
            ) : (
              <Text style={styles.locationIcon}>📍</Text>
            )}
            <Text style={styles.locationBtnText}>Use My Current Location</Text>
          </TouchableOpacity>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or search</Text>
            <View style={styles.dividerLine} />
          </View>

          <TextInput
            style={styles.cityInput}
            placeholder="Search a city or town..."
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
                  {item.address.city || item.address.town || item.address.village || item.display_name.split(',')[0]}
                </Text>
                <Text style={styles.cityResultSub} numberOfLines={1}>{item.display_name}</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              citySearch.length >= 2 && !searchLoading
                ? <Text style={styles.noResults}>No results found.</Text>
                : null
            }
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topContainer: { position: 'absolute', top: 60, width: '100%', paddingHorizontal: 20 },
  searchBar: {
    backgroundColor: '#fff', paddingVertical: 12, paddingHorizontal: 20,
    borderRadius: 25, fontSize: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 10, elevation: 5,
  },
  floatingButton: {
    position: 'absolute', bottom: 50, alignSelf: 'center',
    backgroundColor: '#000', paddingVertical: 16, paddingHorizontal: 32,
    borderRadius: 30,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 6, elevation: 8,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  modal: { flex: 1, backgroundColor: '#fff', paddingTop: 20 },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, marginBottom: 16,
  },
  modalTitle: { fontSize: 20, fontWeight: 'bold' },
  cancelText: { fontSize: 16, color: '#666' },
  locationBtn: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 20, marginBottom: 4,
    backgroundColor: '#F0FAFA', borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 16,
    borderWidth: 1, borderColor: '#C8EEEB',
  },
  locationIcon: { fontSize: 18, marginRight: 10 },
  locationBtnText: { fontSize: 15, fontWeight: '600', color: '#00A699' },
  dividerRow: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 20, marginVertical: 14,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#eee' },
  dividerText: { marginHorizontal: 10, fontSize: 13, color: '#aaa' },
  cityInput: {
    marginHorizontal: 20, borderWidth: 1, borderColor: '#ddd',
    borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16,
    fontSize: 16, marginBottom: 8,
  },
  spinner: { marginTop: 20 },
  cityResult: { paddingVertical: 14, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  cityResultName: { fontSize: 16, fontWeight: '600', color: '#111', marginBottom: 2 },
  cityResultSub: { fontSize: 13, color: '#888' },
  noResults: { textAlign: 'center', color: '#999', marginTop: 30, fontSize: 15 },
});
