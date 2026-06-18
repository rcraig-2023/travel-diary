import * as SQLite from 'expo-sqlite';

export const initDB = async () => {
  // Opens or creates the local database file on the phone
  const db = await SQLite.openDatabaseAsync('traveldiary.db');
  
  // Execute standard SQL to build the schema
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    
    CREATE TABLE IF NOT EXISTS trips (
      id INTEGER PRIMARY KEY NOT NULL,
      city_name TEXT NOT NULL,
      visit_date TEXT
    );

    CREATE TABLE IF NOT EXISTS restaurants (
      id INTEGER PRIMARY KEY NOT NULL,
      trip_id INTEGER,
      name TEXT NOT NULL,
      rating REAL,
      favorite_dishes TEXT,
      latitude REAL,
      longitude REAL,
      FOREIGN KEY(trip_id) REFERENCES trips(id)
    );

    CREATE TABLE IF NOT EXISTS photos (
      id INTEGER PRIMARY KEY NOT NULL,
      restaurant_id INTEGER,
      local_asset_uri TEXT NOT NULL,
      FOREIGN KEY(restaurant_id) REFERENCES restaurants(id)
    );
  `);

  // Seed data to test the UI later
  const existingTrips = await db.getAllAsync('SELECT * FROM trips');
  if (existingTrips.length === 0) {
    await db.runAsync(
      'INSERT INTO trips (city_name, visit_date) VALUES (?, ?), (?, ?)',
      ['Paris', '2026-01-03', 'Munich', '2026-07-15']
    );
  }
};