/**
 * nomadTaxEngine.ts
 * Multi-jurisdiction physical presence and 183-day tax residency compliance engine.
 * Resolves transitional travel day collisions according to IATA/OECD tax residency conventions.
 */

export interface TaxPresenceEntry {
  id: string;
  userId: string;
  countryCode: string; // ISO 2-letter country code (e.g. "US", "ES", "PT", "MX")
  jurisdiction: string; // Human-readable country/region name
  timestamp: string; // ISO string e.g. "2026-03-15T14:30:00Z"
  timezone?: string;
  entryType?: "CHECK_IN" | "BOOKING" | "BORDER_CROSSING" | "MANUAL";
  isArrival?: boolean;
  isDeparture?: boolean;
}

export interface JurisdictionPresenceSummary {
  countryCode: string;
  jurisdiction: string;
  daysCount: number;
  isTaxResidentRisk: boolean; // >= 183 days
  daysRemainingBefore183: number;
  riskLevel: "LOW" | "WARNING" | "CRITICAL";
  firstSeen: string;
  lastSeen: string;
}

export interface TaxCollisionResolution {
  date: string; // YYYY-MM-DD
  conflictingCountries: string[];
  allocatedCountry: string;
  resolutionReason: string;
}

export interface NomadTaxComplianceReport {
  userId: string;
  taxYear: number;
  totalUniqueCalendarDays: number;
  collisionsResolvedCount: number;
  jurisdictions: JurisdictionPresenceSummary[];
  collisions: TaxCollisionResolution[];
  warnings: string[];
}

export interface NomadTaxOptions {
  taxYear?: number;
  taxResidencyThresholdDays?: number; // Default 183 days
  collisionRule?: "DESTINATION_PRIORITY" | "LATEST_TIMESTAMP" | "FIRST_TIMESTAMP";
}

/**
 * Normalizes an ISO timestamp string to YYYY-MM-DD calendar date string in UTC.
 */
export function toCalendarDateString(timestamp: string): string {
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid timestamp string: ${timestamp}`);
  }
  return date.toISOString().split("T")[0];
}

/**
 * Calculates physical presence days across jurisdictions while resolving
 * multi-country collisions on transitional travel days without double-counting.
 */
export function calculateNomadTaxPresence(
  entries: TaxPresenceEntry[],
  options: NomadTaxOptions = {}
): NomadTaxComplianceReport {
  const threshold = options.taxResidencyThresholdDays ?? 183;
  const collisionRule = options.collisionRule ?? "DESTINATION_PRIORITY";
  const userId = entries.length > 0 ? entries[0].userId : "anonymous";
  const taxYear = options.taxYear ?? new Date().getUTCFullYear();

  // Filter entries matching the specified tax year if taxYear option provided
  const filteredEntries = entries.filter((e) => {
    const entryDate = new Date(e.timestamp);
    return !isNaN(entryDate.getTime()) && entryDate.getUTCFullYear() === taxYear;
  });

  // Group entries by calendar date YYYY-MM-DD
  const dateMap = new Map<string, TaxPresenceEntry[]>();

  for (const entry of filteredEntries) {
    const dateKey = toCalendarDateString(entry.timestamp);
    if (!dateMap.has(dateKey)) {
      dateMap.set(dateKey, []);
    }
    dateMap.get(dateKey)!.push(entry);
  }

  const jurisdictionDaysMap = new Map<
    string,
    {
      countryCode: string;
      jurisdiction: string;
      days: Set<string>;
      firstSeen: string;
      lastSeen: string;
    }
  >();

  const collisions: TaxCollisionResolution[] = [];

  // Sort dates chronologically
  const sortedDates = Array.from(dateMap.keys()).sort();

  for (const dateKey of sortedDates) {
    const dayEntries = dateMap.get(dateKey)!;

    // Get unique country codes present on this calendar day
    const uniqueCountriesOnDay = Array.from(
      new Set(dayEntries.map((e) => e.countryCode))
    );

    let allocatedEntry: TaxPresenceEntry;

    if (uniqueCountriesOnDay.length > 1) {
      // MULTI-JURISDICTION COLLISION DETECTED: Nomad traveled across countries on same date
      // Resolve according to IATA/OECD tax residency conventions:
      // Priority 1: Check for explicit `isArrival` entry
      const arrivalEntry = dayEntries.find((e) => e.isArrival);
      if (arrivalEntry) {
        allocatedEntry = arrivalEntry;
      } else if (collisionRule === "FIRST_TIMESTAMP") {
        // Priority by earliest timestamp
        allocatedEntry = [...dayEntries].sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        )[0];
      } else {
        // Priority by latest timestamp (default destination on travel day)
        allocatedEntry = [...dayEntries].sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        )[0];
      }

      collisions.push({
        date: dateKey,
        conflictingCountries: uniqueCountriesOnDay,
        allocatedCountry: allocatedEntry.countryCode,
        resolutionReason: arrivalEntry
          ? `Arrival priority allocated to ${allocatedEntry.jurisdiction} (${allocatedEntry.countryCode})`
          : `Transitional travel day collision resolved to destination ${allocatedEntry.jurisdiction} (${allocatedEntry.countryCode}) based on latest timestamp`,
      });
    } else {
      allocatedEntry = dayEntries[0];
    }

    // Allocate 1 unique physical day to the resolved country
    const code = allocatedEntry.countryCode;
    if (!jurisdictionDaysMap.has(code)) {
      jurisdictionDaysMap.set(code, {
        countryCode: code,
        jurisdiction: allocatedEntry.jurisdiction,
        days: new Set<string>(),
        firstSeen: allocatedEntry.timestamp,
        lastSeen: allocatedEntry.timestamp,
      });
    }

    const record = jurisdictionDaysMap.get(code)!;
    record.days.add(dateKey);

    if (new Date(allocatedEntry.timestamp) < new Date(record.firstSeen)) {
      record.firstSeen = allocatedEntry.timestamp;
    }
    if (new Date(allocatedEntry.timestamp) > new Date(record.lastSeen)) {
      record.lastSeen = allocatedEntry.timestamp;
    }
  }

  // Build jurisdiction summaries and compliance alerts
  const jurisdictions: JurisdictionPresenceSummary[] = Array.from(
    jurisdictionDaysMap.values()
  ).map((item) => {
    const daysCount = item.days.size;
    const isTaxResidentRisk = daysCount >= threshold;
    const daysRemainingBefore183 = Math.max(0, threshold - daysCount);

    let riskLevel: JurisdictionPresenceSummary["riskLevel"] = "LOW";
    if (daysCount >= threshold) {
      riskLevel = "CRITICAL";
    } else if (daysCount >= threshold - 30) {
      riskLevel = "WARNING";
    }

    return {
      countryCode: item.countryCode,
      jurisdiction: item.jurisdiction,
      daysCount,
      isTaxResidentRisk,
      daysRemainingBefore183,
      riskLevel,
      firstSeen: item.firstSeen,
      lastSeen: item.lastSeen,
    };
  });

  // Sort jurisdictions by days count descending
  jurisdictions.sort((a, b) => b.daysCount - a.daysCount);

  const warnings: string[] = [];
  for (const j of jurisdictions) {
    if (j.isTaxResidentRisk) {
      warnings.push(
        `CRITICAL TAX RESIDENCY RISK: Reached ${j.daysCount} physical days in ${j.jurisdiction} (${j.countryCode}), triggering potential 183-day tax residency.`
      );
    } else if (j.riskLevel === "WARNING") {
      warnings.push(
        `Tax Residency Warning: Approaching 183-day threshold in ${j.jurisdiction} (${j.daysCount} days logged, ${j.daysRemainingBefore183} days remaining).`
      );
    }
  }

  return {
    userId,
    taxYear,
    totalUniqueCalendarDays: dateMap.size,
    collisionsResolvedCount: collisions.length,
    jurisdictions,
    collisions,
    warnings,
  };
}
