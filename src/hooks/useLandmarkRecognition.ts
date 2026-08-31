import { useState, useCallback } from "react";
import * as Location from "expo-location";
import { analyzePhoto } from "../lib/gemini";

export type ImageLabel = {
  text: string;
  confidence: number;
  index?: number;
};

export type RecognitionOptions = {
  confidenceThreshold?: number; // Minimum confidence (0.0 to 1.0), defaults to 0.5
  maxResults?: number; // Maximum number of labels to return
  gps?: { lat: number; lng: number } | null;
  cityName?: string | null;
  base64?: string | null;
};

export type RecognitionResult = {
  landmark: string | null;
  tags: string[];
  locationDetails?: {
    name?: string;
    city?: string;
    country?: string;
  };
};

/**
 * Free, zero-cost reverse GPS landmark resolver using OpenStreetMap Nominatim and Expo Location.
 * Identifies exact POIs (e.g., "Cathédrale Notre-Dame de Paris", "Eiffel Tower").
 */
export async function resolveLandmarkFromGps(
  lat: number,
  lng: number
): Promise<{ landmark: string | null; tags: string[]; locationDetails?: any }> {
  try {
    const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
    const response = await fetch(nominatimUrl, {
      headers: {
        "User-Agent": "TravelDiaryApp/1.0",
        "Accept-Language": "en",
      },
    });

    if (response.ok) {
      const data = await response.json();
      const addr = data.address || {};
      const foundName = data.name || addr.tourism || addr.historic || addr.amenity || addr.attraction || addr.building;
      const city = addr.city || addr.town || addr.village || addr.municipality;
      const country = addr.country;

      const landmarkTags: string[] = [];
      if (foundName) landmarkTags.push(foundName);
      if (addr.tourism && addr.tourism !== foundName) landmarkTags.push(addr.tourism);
      if (addr.historic && addr.historic !== foundName) landmarkTags.push(addr.historic);
      if (addr.amenity && addr.amenity !== foundName) landmarkTags.push(addr.amenity);
      if (city) landmarkTags.push(city);

      if (foundName) {
        return {
          landmark: foundName,
          tags: landmarkTags,
          locationDetails: { name: foundName, city, country },
        };
      }
    }
  } catch (err) {
    console.log("[resolveLandmarkFromGps] Nominatim lookup notice:", err);
  }

  // Fallback to native system reverse geocoder via expo-location
  try {
    const [geo] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    if (geo) {
      const name = geo.name || geo.district;
      const city = geo.city;
      const country = geo.country;
      const tags: string[] = [];
      if (name) tags.push(name);
      if (city && city !== name) tags.push(city);
      return {
        landmark: name || null,
        tags,
        locationDetails: { name, city, country },
      };
    }
  } catch (err) {
    console.log("[resolveLandmarkFromGps] Expo reverse geocode notice:", err);
  }

  return { landmark: null, tags: [] };
}

/**
 * Multi-Stage Automated Landmark & Scenery Recognition:
 * 1. Visual Recognition (via client-side Gemini Flash Vision API in .env)
 * 2. EXIF GPS Reverse Landmark Lookup (OpenStreetMap / Expo Location)
 * 3. On-Device ML Kit Labeling (when available in native builds)
 */
export async function recognizeLandmarksAndLabels(
  imageUri: string,
  options?: RecognitionOptions
): Promise<RecognitionResult> {
  const maxResults = options?.maxResults ?? 10;
  const threshold = options?.confidenceThreshold ?? 0.5;
  const combinedTags: string[] = [];
  let detectedLandmark: string | null = null;
  let locDetails: any = undefined;

  // Step 1: Visual Image Analysis via free client-side Gemini Vision (if base64 provided)
  if (options?.base64) {
    try {
      const aiResult = await analyzePhoto(options.base64);
      if (aiResult.landmarks && aiResult.landmarks.length > 0) {
        detectedLandmark = aiResult.landmarks[0];
        combinedTags.push(...aiResult.landmarks);
      }
      if (aiResult.tags && aiResult.tags.length > 0) {
        combinedTags.push(...aiResult.tags);
      }
    } catch (aiErr) {
      console.log("[useLandmarkRecognition] Visual AI recognition notice:", aiErr);
    }
  }

  // Step 2: If GPS coordinates are available in EXIF, resolve landmark and location tags
  if (options?.gps && typeof options.gps.lat === "number" && typeof options.gps.lng === "number") {
    const gpsResult = await resolveLandmarkFromGps(options.gps.lat, options.gps.lng);
    if (gpsResult.landmark && !detectedLandmark) {
      detectedLandmark = gpsResult.landmark;
    }
    if (gpsResult.tags.length > 0) {
      combinedTags.push(...gpsResult.tags);
    }
    if (gpsResult.locationDetails) {
      locDetails = gpsResult.locationDetails;
    }
  }

  // Step 3: On-Device ML Kit Labeling (if available in native client)
  try {
    const MLKitImageLabeling = require("@react-native-ml-kit/image-labeling").default;
    if (MLKitImageLabeling && typeof MLKitImageLabeling.label === "function") {
      const rawLabels: ImageLabel[] = await MLKitImageLabeling.label(imageUri, {
        confidenceThreshold: threshold,
      });

      if (Array.isArray(rawLabels)) {
        const mlTags = rawLabels
          .filter((item) => item && typeof item.text === "string" && (item.confidence ?? 1) >= threshold)
          .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
          .map((item) => item.text.trim())
          .filter((t) => t.length > 0);

        if (!detectedLandmark && mlTags.length > 0) {
          const first = mlTags[0];
          if (["Cathedral", "Church", "Tower", "Monument", "Castle", "Temple", "Museum", "Palace"].some(k => first.includes(k))) {
            detectedLandmark = first;
          }
        }

        combinedTags.push(...mlTags);
      }
    }
  } catch (err: any) {
    // Graceful fallback in Expo Go
  }

  // Step 4: Deduplicate and format tags
  const uniqueTags = Array.from(new Set(combinedTags)).slice(0, maxResults);

  return {
    landmark: detectedLandmark,
    tags: uniqueTags,
    locationDetails: locDetails,
  };
}

/**
 * Custom React Hook for automated photo labeling and landmark recognition.
 */
export function useLandmarkRecognition() {
  const [labeling, setLabeling] = useState<boolean>(false);
  const [result, setResult] = useState<RecognitionResult>({ landmark: null, tags: [] });
  const [error, setError] = useState<string | null>(null);

  const labelPhoto = useCallback(
    async (imageUri: string, options?: RecognitionOptions): Promise<RecognitionResult> => {
      if (!imageUri) {
        setResult({ landmark: null, tags: [] });
        return { landmark: null, tags: [] };
      }

      setLabeling(true);
      setError(null);

      try {
        const res = await recognizeLandmarksAndLabels(imageUri, options);
        setResult(res);
        return res;
      } catch (err: any) {
        const errMsg = err?.message || "Failed to run photo recognition.";
        setError(errMsg);
        return { landmark: null, tags: [] };
      } finally {
        setLabeling(false);
      }
    },
    []
  );

  const reset = useCallback(() => {
    setLabeling(false);
    setResult({ landmark: null, tags: [] });
    setError(null);
  }, []);

  return {
    labelPhoto,
    labeling,
    landmark: result.landmark,
    tags: result.tags,
    locationDetails: result.locationDetails,
    error,
    reset,
  };
}


