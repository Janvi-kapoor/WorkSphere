/**
 * AmenityClassifier.ts
 * Tokenization, regex dictionary pattern matching, and confidence score scoring pipeline
 * for extracting venue amenities from OCR text, venue photos, flyers, or reviews.
 */

export type AmenityCategory =
  | "wifi"
  | "power"
  | "quiet"
  | "coffee"
  | "standing_desk";

export interface AmenityPattern {
  regex: RegExp;
  weight: number;
}

export interface AmenityDefinition {
  category: AmenityCategory;
  displayName: string;
  patterns: AmenityPattern[];
  minConfidenceThreshold: number;
}

export interface ClassifiedAmenity {
  category: AmenityCategory;
  displayName: string;
  confidence: number;
  matchedKeywords: string[];
}

export interface ClassificationResult {
  amenities: ClassifiedAmenity[];
  tokens: string[];
  rawText: string;
}

export const AMENITY_DEFINITIONS: Record<AmenityCategory, AmenityDefinition> = {
  wifi: {
    category: "wifi",
    displayName: "High-Speed Wi-Fi",
    minConfidenceThreshold: 0.6,
    patterns: [
      { regex: /\b(high[- ]?speed|gigabit|fiber|ultra[- ]?fast)\s+(wi[- ]?fi|wifi|internet)\b/i, weight: 0.95 },
      { regex: /\b(wi[- ]?fi|wifi|wlan|internet)\b/i, weight: 0.75 },
      { regex: /\b(\d+)\s*(mbps|gbps)\b/i, weight: 0.85 },
      { regex: /\b(broadband|ethernet|lan)\b/i, weight: 0.7 },
    ],
  },
  power: {
    category: "power",
    displayName: "Power Outlets",
    minConfidenceThreshold: 0.55,
    patterns: [
      { regex: /\b(power\s+outlets?|wall\s+sockets?|charging\s+stations?)\b/i, weight: 0.9 },
      { regex: /\b(outlets?|sockets?|plugs?|chargers?)\s+at\s+every\s+(desk|seat|table)\b/i, weight: 0.95 },
      { regex: /\b(usb[- ]?c|power\s+strip|surge\s+protector)\b/i, weight: 0.8 },
      { regex: /\b(electric|power|ac\s+outlet)\b/i, weight: 0.6 },
    ],
  },
  quiet: {
    category: "quiet",
    displayName: "Quiet Zone / Soundproof",
    minConfidenceThreshold: 0.6,
    patterns: [
      { regex: /\b(soundproof\s+booths?|phone\s+booths?|quiet\s+zones?|silent\s+rooms?)\b/i, weight: 0.95 },
      { regex: /\b(quiet|peaceful|silent|noise[- ]?free|low\s+noise)\b/i, weight: 0.75 },
      { regex: /\b(acoustic\s+(panels?|insulation|baffles?))\b/i, weight: 0.85 },
      { regex: /\b(no\s+calls|silent\s+study|focus\s+area)\b/i, weight: 0.8 },
    ],
  },
  coffee: {
    category: "coffee",
    displayName: "Specialty Coffee & Tea",
    minConfidenceThreshold: 0.55,
    patterns: [
      { regex: /\b(specialty\s+coffee|espresso\s+bar|artisan\s+roast|barista)\b/i, weight: 0.95 },
      { regex: /\b(free\s+coffee|unlimited\s+tea|pour[- ]?over|cappuccino|latte)\b/i, weight: 0.85 },
      { regex: /\b(coffee|tea|cafe|cafeteria|cold\s+brew)\b/i, weight: 0.7 },
      { regex: /\b(beverage\s+station|kettle|coffee\s+machine)\b/i, weight: 0.75 },
    ],
  },
  standing_desk: {
    category: "standing_desk",
    displayName: "Ergonomic Standing Desks",
    minConfidenceThreshold: 0.6,
    patterns: [
      { regex: /\b(motorized\s+standing\s+desks?|electric\s+height[- ]?adjustable\s+desks?)\b/i, weight: 0.95 },
      { regex: /\b(standing\s+desks?|sit[- ]?to[- ]?stand|height[- ]?adjustable\s+desks?)\b/i, weight: 0.9 },
      { regex: /\b(ergonomic\s+(chairs?|workstations?|desks?)|herman\s+miller)\b/i, weight: 0.8 },
      { regex: /\b(stand[- ]?up\s+desks?|adjustable\s+workstations?)\b/i, weight: 0.85 },
    ],
  },
};

export class AmenityClassifier {
  private definitions: Record<AmenityCategory, AmenityDefinition>;

  constructor(customDefinitions?: Record<AmenityCategory, AmenityDefinition>) {
    this.definitions = customDefinitions ?? AMENITY_DEFINITIONS;
  }

  /**
   * Tokenizes text into normalized words and bigrams.
   */
  public tokenize(text: string): string[] {
    if (!text) return [];
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 1);
  }

  /**
   * Evaluates text against regex dictionaries and computes confidence scores.
   */
  public classify(rawText: string): ClassificationResult {
    const tokens = this.tokenize(rawText);
    const classifiedAmenities: ClassifiedAmenity[] = [];

    for (const key of Object.keys(this.definitions) as AmenityCategory[]) {
      const def = this.definitions[key];
      const matchedKeywords: string[] = [];
      let totalWeight = 0;
      let matchCount = 0;

      for (const pattern of def.patterns) {
        const match = rawText.match(pattern.regex);
        if (match) {
          matchedKeywords.push(match[0].trim());
          totalWeight += pattern.weight;
          matchCount++;
        }
      }

      if (matchCount > 0) {
        // Asymptotic confidence scoring formula: 1 - (1 - maxWeight) * 0.5^(matchCount - 1)
        const highestWeight = Math.max(...def.patterns.filter(p => p.regex.test(rawText)).map(p => p.weight), 0);
        const frequencyBonus = Math.min(0.15, (matchCount - 1) * 0.05);
        const calculatedConfidence = Math.min(1.0, highestWeight + frequencyBonus);

        if (calculatedConfidence >= def.minConfidenceThreshold) {
          classifiedAmenities.push({
            category: def.category,
            displayName: def.displayName,
            confidence: Math.round(calculatedConfidence * 100) / 100,
            matchedKeywords: Array.from(new Set(matchedKeywords)),
          });
        }
      }
    }

    // Sort by confidence descending
    classifiedAmenities.sort((a, b) => b.confidence - a.confidence);

    return {
      amenities: classifiedAmenities,
      tokens,
      rawText,
    };
  }
}

export const amenityClassifier = new AmenityClassifier();
