import { calculateJitteredBackoff } from "@/hooks/usePartySocket";

describe("calculateJitteredBackoff (#3769)", () => {
  it("returns 0 for initial connect (attempt <= 0)", () => {
    expect(calculateJitteredBackoff(0)).toBe(0);
    expect(calculateJitteredBackoff(-1)).toBe(0);
  });

  it("calculates exponential backoff with jitter within [0.8, 1.2] bounds", () => {
    // Attempt 1: base = 1000
    const delayMin = calculateJitteredBackoff(1, { random: () => 0 });
    const delayMid = calculateJitteredBackoff(1, { random: () => 0.5 });
    const delayMax = calculateJitteredBackoff(1, { random: () => 1 });

    expect(delayMin).toBe(800); // 1000 * 0.8
    expect(delayMid).toBe(1000); // 1000 * 1.0
    expect(delayMax).toBe(1200); // 1000 * 1.2
  });

  it("scales exponentially on subsequent retry attempts", () => {
    // Attempt 2: base = 1000 * 2^1 = 2000
    const delay2Mid = calculateJitteredBackoff(2, { random: () => 0.5 });
    expect(delay2Mid).toBe(2000);

    // Attempt 3: base = 1000 * 2^2 = 4000
    const delay3Mid = calculateJitteredBackoff(3, { random: () => 0.5 });
    expect(delay3Mid).toBe(4000);

    // Attempt 4: base = 1000 * 2^3 = 8000
    const delay4Mid = calculateJitteredBackoff(4, { random: () => 0.5 });
    expect(delay4Mid).toBe(8000);
  });

  it("caps maximum reconnection delay at 30,000ms (30s)", () => {
    // Attempt 10: 1000 * 2^9 = 512,000 => capped at 30,000ms
    const delayCapped = calculateJitteredBackoff(10, { random: () => 1 });
    expect(delayCapped).toBe(30000);
  });

  it("prevents synchronized reconnect spikes across multiple simulated clients", () => {
    const samples = Array.from({ length: 20 }, () => calculateJitteredBackoff(2));
    const uniqueDelays = new Set(samples);
    expect(uniqueDelays.size).toBeGreaterThan(1);
  });
});
