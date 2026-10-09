import { defaultRatingAggregator } from "@/lib/reviews/ratingAggregator";

describe("RatingAggregator", () => {
  it("safely computes wifiSpeed average across numbers and string representations while ignoring booleans and non-numeric strings", () => {
    const ratings = [
      { wifiQuality: 4, wifiSpeed: 100 },
      { wifiQuality: 5, wifiSpeed: "200 Mbps" },
      { wifiQuality: 3, wifiSpeed: "50" },
      { wifiQuality: 4, wifiSpeed: true }, // should be ignored, not coerced to 1
      { wifiQuality: 2, wifiSpeed: "fast" }, // should be ignored
      { wifiQuality: 1, wifiSpeed: null },
    ];

    const result = defaultRatingAggregator.calculateAggregates(ratings);
    // (100 + 200 + 50) / 3 = 116.666... -> Math.round gives 117
    expect(result.wifiSpeed).toBe(117);
  });

  it("returns null wifiSpeed when no valid speeds are present", () => {
    const ratings = [
      { wifiQuality: 4, wifiSpeed: null },
      { wifiQuality: 5, wifiSpeed: "unavailable" },
      { wifiQuality: 3, wifiSpeed: true },
    ];

    const result = defaultRatingAggregator.calculateAggregates(ratings);
    expect(result.wifiSpeed).toBeNull();
  });
});
