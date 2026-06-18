import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Image, FlatList } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { addPhoto, getPhotosForRestaurant } from '../db/database';

export default function CityScreen() {
  const [photos, setPhotos] = useState<string[]>([]);
  const dummyRestaurantId = 1; // Our seeded Paris restaurant

  // Load photos from SQLite when the screen opens
  useEffect(() => {
    async function loadPhotos() {
      const savedPhotos = await getPhotosForRestaurant(dummyRestaurantId);
      setPhotos(savedPhotos);
    }
    loadPhotos();
  }, []);

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });

    if (!result.canceled) {
      const localUri = result.assets[0].uri;
      setPhotos((prevPhotos) => [...prevPhotos, localUri]);
      await addPhoto(dummyRestaurantId, localUri);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Paris</Text>
        <Text style={styles.subtitle}>Winter 2026</Text>
      </View>

      {/* Adding flex: 1 directly to the FlatList forces it to fill the middle 
        of the screen and cleanly pushes the button container to the bottom.
      */}
      <FlatList
        style={{ flex: 1 }}
        data={photos}
        keyExtractor={(item, index) => index.toString()}
        numColumns={2}
        contentContainerStyle={styles.gallery}
        renderItem={({ item }) => (
          <Image source={{ uri: item }} style={styles.photo} />
        )}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No photos yet. Add your favorite meals and spots!</Text>
        }
      />

      {/* This container sits solidly at the bottom of the document flow */}
      <View style={styles.bottomDock}>
        <TouchableOpacity style={styles.addButton} onPress={pickImage}>
          <Text style={styles.addButtonText}>+ Add Photo</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginTop: 4,
  },
  gallery: {
    padding: 10,
  },
  photo: {
    flex: 1,
    aspectRatio: 1,
    margin: 5,
    borderRadius: 10,
    backgroundColor: '#f0f0f0',
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    marginTop: 40,
    fontSize: 16,
  },
  bottomDock: {
    paddingHorizontal: 20,
    paddingTop: 15,
    paddingBottom: 40, // Gives generous clearance for the iPhone home bar
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  addButton: {
    backgroundColor: '#000',
    paddingVertical: 18,
    borderRadius: 30,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 5,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});