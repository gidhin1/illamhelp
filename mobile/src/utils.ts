
import {
  ProfileRecord
} from "./api";


export function validateJobPayload(payload: CreateJobPayload): string | null {
  const errors: string[] = [];
  if (payload.category.length < 2) {
    errors.push("Category must be at least 2 characters");
  }
  if (payload.title.length < 4) {
    errors.push("Title must be at least 4 characters");
  }
  if (payload.description.length < 10) {
    errors.push("Description must be at least 10 characters");
  }
  if (payload.locationText.length < 2) {
    errors.push("Location must be at least 2 characters");
  }

  return errors.length > 0 ? errors.join(", ") : null;
}

export function randomHex(length: number): string {
  const alphabet = "0123456789abcdef";
  let output = "";
  for (let index = 0; index < length; index += 1) {
    output += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return output;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}


export interface ProfileFormState {
  firstName: string;
  lastName: string;
  city: string;
  area: string;
  serviceCategories: string;
  email: string;
  phone: string;
  alternatePhone: string;
  fullAddress: string;
}

export function buildProfileForm(profile: ProfileRecord): ProfileFormState {
  return {
    firstName: profile.firstName,
    lastName: profile.lastName ?? "",
    city: profile.city ?? "",
    area: profile.area ?? "",
    serviceCategories: profile.serviceCategories.join(", "),
    email: profile.contact.email ?? "",
    phone: profile.contact.phone ?? "",
    alternatePhone: profile.contact.alternatePhone ?? "",
    fullAddress: profile.contact.fullAddress ?? ""
  };
}

export function parseServiceCategories(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function shouldForceSignOut(errorMessage: string): boolean {
  const normalized = errorMessage.toLowerCase();
  return (
    normalized.includes("unauthorized") ||
    normalized.includes("authorization") ||
    normalized.includes("invalid or expired bearer token") ||
    normalized.includes("token")
  );
}

export function asError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export interface CreateJobPayload {
  category: string;
  title: string;
  description: string;
  locationText: string;
  visibility: "public" | "connections_only";
}
