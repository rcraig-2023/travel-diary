import { useState, useCallback } from "react";
import { Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { Photo } from "../types";

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
  itineraryItemId?: string;
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
    // Standard EXIF format: "YYYY:MM:DD HH:MM:SS"
    const match = rawDateStr.trim().match(/^(\d{4})[:\-](\d{2})[:\-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
    if (match) {
      const [, y, m, d, h, min, s] = match;
      const dateObj = new Date(Date.UTC(+y, +m - 1, +d, +h, +min, +s));
      if (!isNaN(dateObj.getTime())) {
        takenAt = dateObj.toISOString();
      }
    } else {
      const parsed = new Date(rawDateStr);
      if (!isNaN(parsed.getTime())) {
        takenAt = parsed.toISOString();
      }
    }
  }

  return {
    lat,
    lng,
    takenAt,
    rawExif: exif,
  };
}

/**
 * Custom hook for batch photo selection, EXIF extraction, aggressive client-side
 * compression (to protect Supabase storage limit), storage upload, and database synchronization.
 */
export function useBatchUpload(defaultTripId?: string) {
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress>({ current: 0, total: 0, percentage: 0 });
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

      if (!user) {
        const msg = "User must be authenticated to upload photos.";
        setError(msg);
        Alert.alert("Authentication Error", msg);
        return null;
      }

      if (!targetTripId) {
        const msg = "A valid tripId is required to upload photos.";
        setError(msg);
        Alert.alert("Upload Error", msg);
        return null;
      }

      // 1. Request Media Library Permissions
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission Required",
          "Please grant photo library access in your device settings to select photos."
        );
        return null;
      }

      // 2. Batch Image Selection with EXIF enabled
      const pickerResult = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        exif: true,
        quality: 1, // Keep full quality for initial EXIF read
      });

      if (pickerResult.canceled || !pickerResult.assets || pickerResult.assets.length === 0) {
        return null;
      }

      const totalAssets = pickerResult.assets.length;
      setUploading(true);
      setError(null);
      setProgress({ current: 0, total: totalAssets, percentage: 0 });

      const uploadedBatch: Photo[] = [];

      try {
        for (let i = 0; i < totalAssets; i++) {
          const asset = pickerResult.assets[i];

          // STEP A: EXIF Extraction FIRST (before compression strips metadata)
          const exifData = extractExifMetadata(asset.exif);

          // STEP B: Aggressive Client-Side Compression
          // Caps longest edge to 1400px and compresses to 70% JPEG quality
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

          const compressed = await ImageManipulator.manipulateAsync(
            asset.uri,
            manipActions,
            {
              compress: 0.7, // Aggressive compression protects 1GB quota
              format: ImageManipulator.SaveFormat.JPEG,
            }
          );

          // STEP C: Storage Upload to Supabase "photos" bucket
          const response = await fetch(compressed.uri);
          const blob = await response.blob();

          const randomSuffix = Math.random().toString(36).substring(2, 9);
          const fileName = Date.now() + "_" + i + "_" + randomSuffix + ".jpg";
          const storagePath = user.id + "/" + targetTripId + "/" + fileName;

          const { error: uploadError } = await supabase.storage
            .from("photos")
            .upload(storagePath, blob, {
              contentType: "image/jpeg",
              upsert: false,
            });

          if (uploadError) {
            throw new Error("Failed to upload photo " + (i + 1) + ": " + uploadError.message);
          }

          const { data: { publicUrl } } = supabase.storage.from("photos").getPublicUrl(storagePath);

          // STEP D: Database Sync - insert into photos table with EXIF and coordinates
          const { data: photoRow, error: dbError } = await supabase
            .from("photos")
            .insert({
              trip_id: targetTripId,
              user_id: user.id,
              storage_path: storagePath,
              url: publicUrl,
              lat: exifData.lat,
              lng: exifData.lng,
              taken_at: exifData.takenAt,
              itinerary_item_id: options?.itineraryItemId || null,
              ai_tags: {
                landmarks: [],
                restaurants: [],
                tags: [],
                exif: {
                  lat: exifData.lat,
                  lng: exifData.lng,
                  taken_at: exifData.takenAt,
                },
              },
            })
            .select()
            .single();

          if (dbError) {
            throw new Error("Failed to save photo record " + (i + 1) + ": " + dbError.message);
          }

          const insertedPhoto = photoRow as Photo;
          uploadedBatch.push(insertedPhoto);

          // Update progress
          const currentCount = i + 1;
          const currentPercentage = Math.round((currentCount / totalAssets) * 100);
          setProgress({
            current: currentCount,
            total: totalAssets,
            percentage: currentPercentage,
          });

          if (options?.onPhotoUploaded) {
            options.onPhotoUploaded(insertedPhoto, currentCount, totalAssets);
          }
        }

        setUploadedPhotos((prev) => [...uploadedBatch, ...prev]);
        return uploadedBatch;
      } catch (err: any) {
        const errorMsg = err.message || "An unexpected error occurred during batch upload.";
        setError(errorMsg);
        Alert.alert("Upload Incomplete", errorMsg);
        return uploadedBatch.length > 0 ? uploadedBatch : null;
      } finally {
        setUploading(false);
      }
    },
    [user, defaultTripId]
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