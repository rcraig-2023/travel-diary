import { useState, useCallback } from "react";

export type ImageLabel = {
  text: string;
  confidence: number;
  index?: number;
};

export type RecognitionOptions = {
  confidenceThreshold?: number; // Minimum confidence (0.0 to 1.0), defaults to 0.5
  maxResults?: number; // Maximum number of labels to return
};

/**
 * Pure on-device image labeling function using Google ML Kit.
 * Runs locally on the device with zero cloud API calls or backend compute costs.
 * Includes graceful fallback if running in environments where native ML Kit is not linked.
 */
export async function recognizeLandmarksAndLabels(
  imageUri: string,
  options?: RecognitionOptions
): Promise<string[]> {
  const threshold = options?.confidenceThreshold ?? 0.5;
  const maxResults = options?.maxResults ?? 10;

  try {
    // Dynamic import to support both Expo Prebuild/Dev Client and graceful fallback in Expo Go
    const MLKitImageLabeling = require("@react-native-ml-kit/image-labeling").default;
    if (!MLKitImageLabeling || typeof MLKitImageLabeling.label !== "function") {
      console.warn("[useLandmarkRecognition] ML Kit native module not available. Build a development client.");
      return [];
    }

    // Run on-device labeling
    const rawLabels: ImageLabel[] = await MLKitImageLabeling.label(imageUri, {
      confidenceThreshold: threshold,
    });

    if (!Array.isArray(rawLabels)) return [];

    // Format into clean, distinct string labels sorted by highest confidence
    const cleanLabels = rawLabels
      .filter((item) => item && typeof item.text === "string" && (item.confidence ?? 1) >= threshold)
      .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
      .map((item) => item.text.trim())
      .filter((text, idx, arr) => text.length > 0 && arr.indexOf(text) === idx)
      .slice(0, maxResults);

    return cleanLabels;
  } catch (err: any) {
    console.warn("[useLandmarkRecognition] On-device labeling error:", err?.message || err);
    return [];
  }
}

/**
 * Custom React Hook for automated, 100% on-device photo labeling and landmark recognition.
 * Designed to easily chain with batch upload flows.
 */
export function useLandmarkRecognition() {
  const [labeling, setLabeling] = useState<boolean>(false);
  const [labels, setLabels] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const labelPhoto = useCallback(
    async (imageUri: string, options?: RecognitionOptions): Promise<string[]> => {
      if (!imageUri) {
        setLabels([]);
        return [];
      }

      setLabeling(true);
      setError(null);

      try {
        const result = await recognizeLandmarksAndLabels(imageUri, options);
        setLabels(result);
        return result;
      } catch (err: any) {
        const errMsg = err?.message || "Failed to run on-device photo recognition.";
        setError(errMsg);
        return [];
      } finally {
        setLabeling(false);
      }
    },
    []
  );

  const labelPhotosBatch = useCallback(
    async (
      imageUris: string[],
      options?: RecognitionOptions
    ): Promise<Record<string, string[]>> => {
      if (!imageUris || imageUris.length === 0) return {};

      setLabeling(true);
      setError(null);

      const resultsMap: Record<string, string[]> = {};

      try {
        for (const uri of imageUris) {
          const tags = await recognizeLandmarksAndLabels(uri, options);
          resultsMap[uri] = tags;
        }
        return resultsMap;
      } catch (err: any) {
        const errMsg = err?.message || "Failed to label batch of photos.";
        setError(errMsg);
        return resultsMap;
      } finally {
        setLabeling(false);
      }
    },
    []
  );

  const reset = useCallback(() => {
    setLabeling(false);
    setLabels([]);
    setError(null);
  }, []);

  return {
    labelPhoto,
    labelPhotosBatch,
    labeling,
    labels,
    error,
    reset,
  };
}
