import React from 'react';
import { StyleSheet, View, Text, TextInput, TouchableOpacity } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useNavigation } from '@react-navigation/native';

export default function HomeScreen() {
  // Initialize navigation so we can route to the City screen
  const navigation = useNavigation<any>();

  return (
    <View style={styles.container}>
      {/* StyleSheet.absoluteFillObject forces the map to the absolute edges.
        minZoomLevel prevents the user from pinching out into the gray grid void.
      */}
      <MapView 
        style={StyleSheet.absoluteFillObject}
        minZoomLevel={3} 
        initialRegion={{
          latitude: 40.0000,      // Centered lower so we see more landmass
          longitude: -30.0000,    
          latitudeDelta: 45.0,    // Reduced from 70 to keep tiles filling the screen
          longitudeDelta: 45.0,
        }}
      >
        {/* Domestic Pins */}
        <Marker
          coordinate={{ latitude: 40.7128, longitude: -74.0060 }}
          title="New York"
          description="Great sushi and matcha lattes"
          pinColor="#FF5A5F"
        />
        <Marker
          coordinate={{ latitude: 41.3111, longitude: -72.9267 }}
          title="New Haven"
          description="Day trip & campus tour"
          pinColor="#FF5A5F"
        />

        {/* International Pins */}
        <Marker
          coordinate={{ latitude: 48.8566, longitude: 2.3522 }}
          title="Paris"
          description="Winter 2026 - Eiffel Tower views"
          pinColor="#00A699"
          // This routes the user to the City Screen when the bubble is tapped!
          onCalloutPress={() => navigation.navigate('City')}
        />
        <Marker
          coordinate={{ latitude: 52.5200, longitude: 13.4050 }}
          title="Berlin"
          description="Family travels"
          pinColor="#00A699"
        />
        <Marker
          coordinate={{ latitude: 50.0755, longitude: 14.4378 }}
          title="Prague"
          description="Summer trip"
          pinColor="#00A699"
        />
      </MapView>

      {/* Top Search Bar Overlay */}
      <View style={styles.topContainer}>
        <TextInput 
          style={styles.searchBar}
          placeholder="Search your pins (e.g. 'Paris' or 'Texas')"
          placeholderTextColor="#666"
        />
      </View>

      {/* Floating Action Button */}
      <TouchableOpacity 
        style={styles.floatingButton}
        activeOpacity={0.8}
        onPress={() => console.log("Add Trip tapped!")}
      >
        <Text style={styles.buttonText}>+ Log Trip</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topContainer: {
    position: 'absolute',
    top: 60,
    width: '100%',
    paddingHorizontal: 20,
  },
  searchBar: {
    backgroundColor: '#fff',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 25,
    fontSize: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 5,
  },
  floatingButton: {
    position: 'absolute',
    bottom: 50,
    alignSelf: 'center',
    backgroundColor: '#000',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  }
});