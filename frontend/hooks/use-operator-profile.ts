"use client";

import { useCallback, useState } from "react";

import { OPERATOR_PROFILE_STORAGE_KEY } from "@/constants/compliance-export";

export interface OperatorProfile {
  operatorType: "OPERATOR" | "TRADER";
  activityType: "TRADE" | "IMPORT" | "EXPORT" | "DOMESTIC";
  countryOfActivity: string;
  borderCrossCountry: string;
  operatorName: string;
  operatorCountry: string;
  operatorAddress: string;
  operatorEmail: string;
  operatorPhone: string;
  operatorEori: string;
  hsCode: string;
  commodityDescription: string;
  countryOfProduction: string;
  geolocationConfidential: boolean;
}

const EMPTY_PROFILE: OperatorProfile = {
  operatorType: "OPERATOR",
  activityType: "IMPORT",
  countryOfActivity: "",
  borderCrossCountry: "",
  operatorName: "",
  operatorCountry: "",
  operatorAddress: "",
  operatorEmail: "",
  operatorPhone: "",
  operatorEori: "",
  hsCode: "",
  commodityDescription: "",
  countryOfProduction: "",
  geolocationConfidential: false,
};

function readStoredProfile(): OperatorProfile {
  try {
    const raw = localStorage.getItem(OPERATOR_PROFILE_STORAGE_KEY);
    if (!raw) return EMPTY_PROFILE;
    return { ...EMPTY_PROFILE, ...(JSON.parse(raw) as Partial<OperatorProfile>) };
  } catch (error) {
    console.error("[CanoryAI] Failed to read stored operator profile:", error);
    return EMPTY_PROFILE;
  }
}

/**
 * Remembers the operator/commodity/activity details entered for DDS
 * export across shipments, in this browser only. CanoryAI has no
 * operator/company management system yet, so this is a plain
 * convenience — not a substitute for real operator records, and never
 * sent anywhere except as part of an explicit export request the user
 * triggers.
 *
 * The field set here matches the real EUDR DDS schema (verified against
 * a production-tested open-source EUDR API client — see
 * backend/app/services/xml_generator.py's module docstring for the full
 * story), not the smaller, unverified set this used to collect.
 */
export function useOperatorProfile() {
  const [profile, setProfileState] = useState<OperatorProfile>(() =>
    typeof window === "undefined" ? EMPTY_PROFILE : readStoredProfile(),
  );

  const setProfile = useCallback((next: OperatorProfile) => {
    setProfileState(next);
    try {
      localStorage.setItem(OPERATOR_PROFILE_STORAGE_KEY, JSON.stringify(next));
    } catch (error) {
      console.error("[CanoryAI] Failed to persist operator profile:", error);
    }
  }, []);

  return { profile, setProfile };
}
