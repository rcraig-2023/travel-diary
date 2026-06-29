# Touri

A React Native mobile application designed to log personal travels, track favorite restaurants, and pin memories on an interactive map.

## 🗺️ Features

* **Secure Authentication:** User sign-up and login managed through Supabase Auth, keeping travel data private with Row Level Security (RLS).
* **Cloud Sync & Storage:** All trips, jots, landmarks, and photos are safely stored in a Supabase PostgreSQL database and public storage bucket, accessible across devices.
* **Detailed City Views:** Organize your memories effortlessly using a tabbed interface for Photos, written Jots, Landmarks, and Restaurants for each trip.
* **Interactive Global Map:** View your domestic and international travel pins on a fully interactive map interface.

## 🛠️ Tech Stack & Tools

This project is built with the following core technologies:

* **Framework:** [Expo v54](https://docs.expo.dev/versions/v54.0.0/) & React Native
* **Navigation:** `@react-navigation/native-stack` for seamless screen transitions
* **Backend as a Service (BaaS):** Supabase for secure user logins, saving trip data, and storing uploaded photos
* **State Management:** React Context API for global authentication state
* **Language:** TypeScript to catch errors early and ensure our app handles data reliably

## 🏗️ Architecture Diagram

The application has migrated to a cloud-first architecture from an offline-first architecture, separating the client UI from the backend services and external APIs.

```mermaid
graph TD
    %% Client Application Layer
    subgraph Client [React Native Expo App]
        Auth[AuthContext Provider] --> AppNav[AppNavigator]
        AppNav --> AuthScreen(AuthScreen)
        AppNav --> Home(HomeScreen)
        AppNav --> City(CityScreen)
        
        City --> Tabs[Photos, Jots, Landmarks, Restaurants]
    end

    %% Service Integrations Layer
    subgraph Services [API & Libraries]
        SupaClient[Supabase JS Client]
        GeminiClient[Gemini Fetch Service]
        SecureStore[Expo Secure Store]
    end

    %% Backend & External Layer
    subgraph Cloud [Backend & AI]
        SupaAuth[(Supabase Auth)]
        SupaDB[(Supabase PostgreSQL)]
        SupaStorage[(Supabase Storage Bucket)]
        GeminiAPI((Google Gemini API))
    end

    %% Client to Services
    Auth -.-> SupaClient
    Home -.-> SupaClient
    Tabs -.-> SupaClient
    Tabs -.-> GeminiClient
    SupaClient <--> SecureStore

    %% Services to Cloud
    SupaClient ===> SupaAuth
    SupaClient ===> SupaDB
    SupaClient ===> SupaStorage
    GeminiClient ===> GeminiAPI
