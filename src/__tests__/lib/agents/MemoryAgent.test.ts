import {
  updateUserPreferencesSummary,
  cosineSimilarity,
  clusterMemoriesBySimilarity,
  synthesizeClusterWithLLM,
  compactUserMemories,
} from "@/lib/agents/MemoryAgent";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    userMemory: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
    favorite: {
      findMany: jest.fn(),
    },
    venueRating: {
      findMany: jest.fn(),
    },
    user: {
      update: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $executeRawUnsafe: jest.fn(),
  },
}));

jest.mock("groq-sdk", () => {
  return {
    Groq: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue({
            choices: [
              {
                message: {
                  content: "I prefer quiet libraries with outlets.",
                },
              },
            ],
          }),
        },
      },
    })),
  };
});

describe("MemoryAgent - updateUserPreferencesSummary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return null if there are no memories, favorites, or ratings", async () => {
    (prisma.userMemory.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.favorite.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.venueRating.findMany as jest.Mock).mockResolvedValue([]);

    const result = await updateUserPreferencesSummary("test-user");
    expect(result).toBeNull();
  });

  it("should query databases, call LLM, and update preferencesSummary", async () => {
    (prisma.userMemory.findMany as jest.Mock).mockResolvedValue([
      { content: "I like silent work areas." },
    ]);
    (prisma.favorite.findMany as jest.Mock).mockResolvedValue([
      { venue: { name: "Central Library", category: "library" } },
    ]);
    (prisma.venueRating.findMany as jest.Mock).mockResolvedValue([
      { venue: { name: "Starbucks" }, wifiQuality: 4, noiseLevel: "moderate", hasOutlets: true },
    ]);

    const result = await updateUserPreferencesSummary("test-user");

    expect(prisma.userMemory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "test-user" } })
    );
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "test-user" },
      data: { preferencesSummary: "I prefer quiet libraries with outlets." },
    });
    expect(result).toBe("I prefer quiet libraries with outlets.");
  });
});

describe("MemoryAgent - Episodic Memory Compaction (#3449)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("cosineSimilarity", () => {
    it("should calculate exact cosine similarity between two identical vectors", () => {
      const vecA = [1, 2, 3];
      const vecB = [1, 2, 3];
      expect(cosineSimilarity(vecA, vecB)).toBeCloseTo(1.0, 5);
    });

    it("should return 0 for orthogonal vectors", () => {
      const vecA = [1, 0];
      const vecB = [0, 1];
      expect(cosineSimilarity(vecA, vecB)).toBeCloseTo(0.0, 5);
    });

    it("should return 0 for invalid, empty, or mismatched length vectors", () => {
      expect(cosineSimilarity([], [1, 2])).toBe(0);
      expect(cosineSimilarity([1], [1, 2])).toBe(0);
      expect(cosineSimilarity([0, 0], [0, 0])).toBe(0);
    });
  });

  describe("clusterMemoriesBySimilarity", () => {
    it("should group memories with similarity > 0.82 into thematic clusters and isolate dissimilar ones", () => {
      const memories = [
        {
          id: "mem-1",
          content: "I need fast wifi",
          embedding: [1, 0, 0],
        },
        {
          id: "mem-2",
          content: "Wifi must be high-speed",
          embedding: [0.98, 0.05, 0], // Cosine sim ~0.99 with mem-1
        },
        {
          id: "mem-3",
          content: "Prefers oat milk in coffee",
          embedding: [0, 1, 0], // Orthogonal to wifi
        },
        {
          id: "mem-4",
          content: "Only drinks coffee with oat milk",
          embedding: [0, 0.99, 0.02], // Cosine sim ~0.99 with mem-3
        },
        {
          id: "mem-5",
          content: "Needs quiet space for calls",
          embedding: [0, 0, 1], // Distinct acoustic constraint
        },
      ];

      const clusters = clusterMemoriesBySimilarity(memories, 0.82);

      expect(clusters.length).toBe(3);
      // Cluster 1: fast wifi
      expect(clusters[0].items.map((i) => i.id)).toEqual(["mem-1", "mem-2"]);
      // Cluster 2: oat milk
      expect(clusters[1].items.map((i) => i.id)).toEqual(["mem-3", "mem-4"]);
      // Cluster 3: quiet space
      expect(clusters[2].items.map((i) => i.id)).toEqual(["mem-5"]);
    });

    it("should return empty array for empty input", () => {
      expect(clusterMemoriesBySimilarity([])).toEqual([]);
    });
  });

  describe("synthesizeClusterWithLLM", () => {
    it("should return single content directly without calling LLM if cluster size is 1", async () => {
      const items = [{ id: "1", content: "Needs standing desk" }];
      const result = await synthesizeClusterWithLLM(items);
      expect(result).toBe("Needs standing desk");
    });

    it("should call LLM to synthesize multi-item cluster statements", async () => {
      const items = [
        { id: "1", content: "Prefers standing desks" },
        { id: "2", content: "Always books standing desk spots" },
      ];
      const result = await synthesizeClusterWithLLM(items);
      expect(result).toBe("I prefer quiet libraries with outlets.");
    });
  });

  describe("compactUserMemories", () => {
    it("should skip compaction when memory items count is <= 40 and force is not set", async () => {
      (prisma.$queryRaw as jest.Mock) = jest.fn().mockResolvedValue([
        { id: "1", content: "Mem 1" },
        { id: "2", content: "Mem 2" },
      ]);

      const result = await compactUserMemories("user-1", {
        compactionThreshold: 40,
      });

      expect(result.status).toBe("skipped");
      expect(result.originalCount).toBe(2);
      expect(result.compactedCount).toBe(2);
    });

    it("should run compaction pipeline, cluster similar items, persist summary and delete redundant items", async () => {
      // 3 items: 2 similar (high cosine similarity) and 1 distinct
      (prisma.$queryRaw as jest.Mock) = jest.fn().mockResolvedValue([
        { id: "1", content: "Prefers standing desk", embedding_text: "[1,0,0]" },
        { id: "2", content: "Wants height-adjustable desk", embedding_text: "[0.99,0.01,0]" },
        { id: "3", content: "Likes quiet library spaces", embedding_text: "[0,1,0]" },
      ]);
      (prisma.userMemory.deleteMany as jest.Mock) = jest.fn().mockResolvedValue({ count: 2 });
      (prisma.userMemory.create as jest.Mock) = jest.fn().mockResolvedValue({ id: "new-summary" });

      const result = await compactUserMemories("user-1", {
        compactionThreshold: 2, // Trigger compaction
        similarityThreshold: 0.82,
      });

      expect(result.status).toBe("compacted");
      expect(result.originalCount).toBe(3);
      expect(result.compactedCount).toBe(2); // 1 synthesized + 1 standalone
      expect(result.archivedIds).toEqual(["1", "2"]);
      expect(prisma.userMemory.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ["1", "2"] } },
      });
    });
  });
});
