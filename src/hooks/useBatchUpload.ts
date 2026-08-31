import { useState, useCallback } from "react";
import { Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { Photo } from "../types";
import { recognizeLandmarksAndLabels } from "./useLandmarkRecognition";

export type ExtractedExif = {
  lat: number | null;
  lng: number | null;
  takenAt: string | null;
  rawExif?: Record<string, any>;
};

export type UploadProgress = {
  current: number;
  total: number;
  percentage: number;
};

export type BatchUploadOptions = {
  tripId?: string;
  cityName?: string;
  country?: string;
  itineraryItemId?: string;
  autoTag?: boolean; // Enable automated landmark tagging (default: true)
  onPhotoUploaded?: (photo: Photo, index: number, total: number) => void;
};

/**
 * Parses DMS (Degrees, Minutes, Seconds) format or raw numeric GPS coordinates.
 */
function parseDmsCoordinate(dms: any): number | null {
  if (typeof dms === "number" && !isNaN(dms)) return dms;
  if (Array.isArray(dms) && dms.length >= 3) {
    const deg = parseFloat(dms[0]);
    const min = parseFloat(dms[1]);
    const sec = parseFloat(dms[2]);
    if (!isNaN(deg) && !isNaN(min) && !isNaN(sec)) {
      return deg + min / 60 + sec / 3600;
    }
  }
  if (typeof dms === "string") {
    const num = parseFloat(dms);
    if (!isNaN(num)) return num;
  }
  return null;
}

/**
 * Extracts GPS Coordinates and DateTimeOriginal from asset EXIF metadata
 * directly before any client-side compression occurs.
 */
export function extractExifMetadata(exif: Record<string, any> | undefined | null): ExtractedExif {
  if (!exif || typeof exif !== "object") {
    return { lat: null, lng: null, takenAt: null };
  }

  // 1. Extract GPS Coordinates (supporting iOS {GPS} dictionary and Android top-level EXIF)
  const gpsObj = exif["{GPS}"] || exif.GPS || {};
  const rawLat = exif.GPSLatitude ?? exif.Latitude ?? gpsObj.Latitude ?? gpsObj.GPSLatitude;
  const rawLng = exif.GPSLongitude ?? exif.Longitude ?? gpsObj.Longitude ?? gpsObj.GPSLongitude;
  const latRef = exif.GPSLatitudeRef ?? exif.LatitudeRef ?? gpsObj.LatitudeRef ?? gpsObj.GPSLatitudeRef;
  const lngRef = exif.GPSLongitudeRef ?? exif.LongitudeRef ?? gpsObj.LongitudeRef ?? gpsObj.GPSLongitudeRef;

  let lat = parseDmsCoordinate(rawLat);
  let lng = parseDmsCoordinate(rawLng);

  if (lat !== null && latRef && String(latRef).toUpperCase() === "S" && lat > 0) {
    lat = -lat;
  }
  if (lng !== null && lngRef && String(lngRef).toUpperCase() === "W" && lng > 0) {
    lng = -lng;
  }

  // Bounds check
  if (lat !== null && (lat < -90 || lat > 90)) lat = null;
  if (lng !== null && (lng < -180 || lng > 180)) lng = null;

  // 2. Extract Timestamp (DateTimeOriginal / DateTime / DateTimeDigitized)
  const exifBlock = exif["{Exif}"] || exif.Exif || {};
  const tiffBlock = exif["{TIFF}"] || exif.TIFF || {};
  const rawDateStr =
    exif.DateTimeOriginal ??
    exifBlock.DateTimeOriginal ??
    exif.DateTime ??
    tiffBlock.DateTime ??
    exif.DateTimeDigitized ??
    exifBlock.DateTimeDigitized;

  let takenAt: string | null = null;
  if (typeof rawDateStr === "string" && rawDateStr.trim().length > 0) {
    const formatted = rawDateStr.trim().replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3");
    const d = new Date(formatted);
    if (!isNaN(d.getTime())) {
      takenAt = d.toISOString();
    }
  }

  return { lat, lng, takenAt, rawExif: exif };
}

// Upload with 2 automatic retries for network resilience
async function uploadToStorageWithRetry(
  storagePath: string,
  blob: Blob,
  retries = 2
): Promise<void> {
  let lastErr: any = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const { error } = await supabase.storage
        .from("photos")
        .upload(storagePath, blob, {
          contentType: "image/jpeg",
          upsert: true,
        });
      if (!error) return;
      lastErr = error;
    } catch (e) {
      lastErr = e;
    }
    if (attempt < retries) {
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
    }
  }
  throw new Error(lastErr?.message || "Storage upload failed after retries");
}

export function useBatchUpload(defaultTripId?: string) {
  const { user } = useAuth();
  const [uploading, setUploading] = useState<boolean>(false);
  const [progress, setProgress] = useState<UploadProgress>({
    current: 0,
    total: 0,
    percentage: 0,
  });
  const [error, setError] = useState<string | null>(null);
  const [uploadedPhotos, setUploadedPhotos] = useState<Photo[]>([]);

  const reset = useCallback(() => {
    setUploading(false);
    setProgress({ current: 0, total: 0, percentage: 0 });
    setError(null);
    setUploadedPhotos([]);
  }, []);

  const pickAndUpload = useCallback(
    async (options?: BatchUploadOptions): Promise<Photo[] | null> => {
      const targetTripId = options?.tripId || defaultTripId;
      if (!targetTripId) {
        Alert.alert("Upload Error", "Trip ID is required for photo upload.");
        return null;
      }

      if (!user) {
        Alert.alert("Upload Error", "You must be logged in to upload photos.");
        return null;
      }

      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Required", "Please allow photo library access to upload photos.");
        return null;
      }

      const pickerResult = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        exif: true,
        quality: 1,
      });

      if (pickerResult.canceled || !pickerResult.assets || pickerResult.assets.length === 0) {
        return null;
      }

      const assets = pickerResult.assets;
      const totalAssets = assets.length;
      setUploading(true);
      setError(null);
      setProgress({ current: 0, total: totalAssets, percentage: 0 });

      const batchResults: Photo[] = [];
      let completedCount = 0;
      let failedCount = 0;

      // Process single photo pipeline
      const processSingleAsset = async (asset: ImagePicker.ImagePickerAsset, index: number) => {
        try {
          // 1. Extract EXIF metadata
          const exifData = extractExifMetadata(asset.exif);

          // 2. High-Quality Compressed Image (max 1400px, 70% quality for storage)
          const maxDimension = 1400;
          const manipActions: ImageManipulator.Action[] = [];
          if (asset.width && asset.height) {
            if (asset.width > maxDimension || asset.height > maxDimension) {
              if (asset.width >= asset.height) {
                manipActions.push({ resize: { width: maxDimension } });
              } else {
                manipActions.push({ resize: { height: maxDimension } });
              }
            }
          } else {
            manipActions.push({ resize: { width: maxDimension } });
          }

          // 3. Run high-quality storage compression and fast lightweight AI thumbnail in parallel
          const [compressed, thumbCompressed] = await Promise.all([
            ImageManipulator.manipulateAsync(
              asset.uri,
              manipActions,
              { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
            ),
            options?.autoTag !== false
              ? ImageManipulator.manipulateAsync(
                  asset.uri,
                  [{ resize: { width: 512 } }], // 512px lightweight thumbnail makes Vision AI 4x faster
                  { compress: 0.4, format: ImageManipulator.SaveFormat.JPEG, base64: true }
                )
              : Promise.resolve(null),
          ]);

          // 4. Run automated landmark recognition and prepare storage blob simultaneously
          const randomSuffix = Math.random().toString(36).substring(2, 9);
          const fileName = `${Date.now()}_${index}_${randomSuffix}.jpg`;
          const storagePath = `${user.id}/${targetTripId}/${fileName}`;

          const [recognitionResult, blob] = await Promise.all([
            options?.autoTag !== false && thumbCompressed?.base64
              ? recognizeLandmarksAndLabels(compressed.uri, {
                  base64: thumbCompressed.base64,
                  gps: exifData.lat && exifData.lng ? { lat: exifData.lat, lng: exifData.lng } : null,
                  cityName: options?.cityName,
                }).catch(() => ({ landmark: null, tags: [] }))
              : Promise.resolve({ landmark: null, tags: [] }),
            fetch(compressed.uri).then((r) => r.blob()),
          ]);

          const detectedLandmark = recognitionResult.landmark;
          const detectedTags = recognitionResult.tags || [];
          const landmarkList = detectedLandmark ? [detectedLandmark] : detectedTags.slice(0, 2);

          // 5. Upload compressed image with retry
          await uploadToStorageWithRetry(storagePath, blob);

          const { data: { publicUrl } } = supabase.storage.from("photos").getPublicUrl(storagePath);

          // 6. Insert photo record with fallback for schema
          const fullPayload: any = {
            trip_id: targetTripId,
            user_id: user.id,
            storage_path: storagePath,
            url: publicUrl,
            lat: exifData.lat,
            lng: exifData.lng,
            taken_at: exifData.takenAt,
            itinerary_item_id: options?.itineraryItemId || null,
            ai_tags: {
              landmarks: landmarkList,
              restaurants: [],
              tags: detectedTags,
              exif: {
                lat: exifData.lat,
                lng: exifData.lng,
                taken_at: exifData.takenAt,
              },
            },
          };

          let photoRow: any = null;
          const { data: insertedData, error: dbError } = await supabase
            .from("photos")
            .insert(fullPayload)
            .select()
            .single();

          if (dbError) {
            if (dbError.message?.includes("lat") || dbError.message?.includes("schema cache")) {
              const fallbackPayload = {
                trip_id: targetTripId,
                user_id: user.id,
                storage_path: storagePath,
                url: publicUrl,
                ai_tags: fullPayload.ai_tags,
              };
              const { data: fallbackData, error: fallbackError } = await supabase
                .from("photos")
                .insert(fallbackPayload)
                .select()
                .single();
              if (fallbackError) throw new Error(fallbackError.message);
              photoRow = fallbackData;
            } else {
              throw new Error(dbError.message);
            }
          } else {
            photoRow = insertedData;
          }

          // 7. Write to local cache for instantaneous rendering
          const localCacheUri = `${FileSystem.cacheDirectory}td-${photoRow.id}.jpg`;
          try {
            if (compressed.base64) {
              await FileSystem.writeAsStringAsync(localCacheUri, compressed.base64, { encoding: "base64" });
            } else {
              await FileSystem.copyAsync({ from: compressed.uri, to: localCacheUri });
            }
          } catch (cErr) {
            console.log("[useBatchUpload] cache write notice:", cErr);
          }

          // 8. Auto-insert detected landmark into landmarks highlights table
          if (detectedLandmark) {
            try {
              await supabase.from("landmarks").insert({
                trip_id: targetTripId,
                user_id: user.id,
                name: detectedLandmark,
                visited: true,
                source: "ai",
              });
            } catch (landmarkErr) {
              console.log("[useBatchUpload] landmark insert notice:", landmarkErr);
            }
          }

          const savedPhoto: Photo = photoRow as Photo;
          batchResults.push(savedPhoto);

          if (options?.onPhotoUploaded) {
            options.onPhotoUploaded(savedPhoto, completedCount + 1, totalAssets);
          }
        } catch (itemErr: any) {
          console.warn(`[useBatchUpload] Photo ${index + 1} upload failed:`, itemErr?.message || itemErr);
          failedCount++;
        } finally {
          completedCount++;
          const pct = Math.round((completedCount / totalAssets) * 100);
          setProgress({ current: completedCount, total: totalAssets, percentage: pct });
        }
      };

      // Execute in parallel chunks of 2 concurrent workers for speed and reliability
      const CONCURRENCY = 2;
      for (let i = 0; i < assets.length; i += CONCURRENCY) {
        const chunk = assets.slice(i, i + CONCURRENCY);
        await Promise.all(chunk.map((asset, offset) => processSingleAsset(asset, i + offset)));
      }

      setUploading(false);
      setUploadedPhotos((prev) => [...batchResults, ...prev]);

      if (failedCount > 0 && batchResults.length > 0) {
        Alert.alert(
          "Upload Summary",
          `${batchResults.length} of ${totalAssets} photos uploaded successfully. ${failedCount} photo(s) had a network error and were skipped.`
        );
      } else if (failedCount > 0 && batchResults.length === 0) {
        Alert.alert("Upload Failed", "Could not upload photos due to a network connection issue. Please try again.");
      }

      return batchResults;
    },
    [defaultTripId, user]
  );

  return {
    pickAndUpload,
    uploading,
    progress,
    error,
    uploadedPhotos,
    reset,
  };
}