import { getVenueLiveVibe } from "@/lib/venues/liveVibeService";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    venueLiveFeedback: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
  },
}));

describe("liveVibeService", () => {
  it("formats lastUpdated correctly when createdAt is a string rather than Date instance", async () => {
    const stringDate = "2026-10-09T12:00:00.000Z";
    (prisma.venueLiveFeedback.findMany as jest.Mock).mockResolvedValue([
      {
        id: "fb-1",
        venueId: "venue-1",
        vibe: "silent_focus",
        isVerifiedCheckIn: true,
        createdAt: stringDate as any,
      },
    ]);

    const result = await getVenueLiveVibe("venue-1");
    expect(result.currentVibe).toBe("silent_focus");
    expect(result.lastUpdated).toBe(stringDate);
  });
});
