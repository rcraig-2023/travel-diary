import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import { Trip } from '../types';
import PhotosTab from './city/PhotosTab';
import JotsTab from './city/JotsTab';
import LandmarksTab from './city/LandmarksTab';
import RestaurantsTab from './city/RestaurantsTab';

type RouteParams = { trip: Trip };

const TABS = ['Photos', 'Jots', 'Highlights', 'Restaurants'] as const;
type Tab = typeof TABS[number];

export default function CityScreen() {
  const route = useRoute<RouteProp<{ City: RouteParams }, 'City'>>();
  const { trip } = route.params;
  const [activeTab, setActiveTab] = useState<Tab>('Photos');

  const formatDate = (iso: string | null) => {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{trip.city_name}</Text>
        <Text style={styles.subtitle}>
          {trip.country ? `${trip.country}${trip.visit_date ? '  ·  ' : ''}` : ''}
          {formatDate(trip.visit_date)}
        </Text>
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
        {activeTab === 'Restaurants' && <RestaurantsTab tripId={trip.id} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  title: { fontSize: 26, fontWeight: 'bold', color: '#111' },
  subtitle: { fontSize: 14, color: '#888', marginTop: 3 },
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
});
