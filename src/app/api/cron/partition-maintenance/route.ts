import { NextRequest, NextResponse } from "next/server";
import {
  autoCreateUpcomingPartitions,
  archiveExpiredPushNotificationPartitions,
  checkPartitionHealth,
} from "@/lib/partitionMaintenance";
import { runPartmanPartitionMaintenance } from "@/lib/db/partitionMaintenance";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/cron/partition-maintenance
 *
 * Monthly cron job that:
 * 1. Creates upcoming telemetry table partitions (next 2 months)
 * 2. Archives/drops expired partitions older than the retention window
 * 3. Returns a health report
 *
 * Secure with a CRON_SECRET env var; configure in Vercel cron.json as
 * a monthly job (e.g. "0 2 1 * *" = 2 AM on the 1st of each month).
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const results: {
    partitionsCreated?: string[];
    partitionsArchived?: string[];
    healthReport?: unknown;
    telemetryMaintenance?: {
      maintained: string[];
      plannedPartitions: string[];
      activePartitions: string[];
      skippedTables: string[];
    };
    errors: string[];
  } = { errors: [] };

  // 1. Create upcoming partitions
  try {
    results.partitionsCreated = await autoCreateUpcomingPartitions();
    console.log(
      `[PartitionCron] Created ${results.partitionsCreated.length} upcoming partition(s)`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.errors.push(`autoCreateUpcomingPartitions: ${msg}`);
    console.error("[PartitionCron] Failed to create partitions:", err);
  }

  // 2. Archive expired partitions
  try {
    const archiveResult = await archiveExpiredPushNotificationPartitions();
    results.partitionsArchived = archiveResult.archived.map((a) => a.name);
    console.log(
      `[PartitionCron] Archived ${results.partitionsArchived.length} expired partition(s)`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.errors.push(`archiveExpiredPartitions: ${msg}`);
    console.error("[PartitionCron] Failed to archive partitions:", err);
  }

  // 3. Collect health report
  try {
    results.healthReport = await checkPartitionHealth();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.errors.push(`checkPartitionHealth: ${msg}`);
  }

  try {
    results.telemetryMaintenance = await runPartmanPartitionMaintenance();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.errors.push(`runPartmanPartitionMaintenance: ${msg}`);
    console.error("[PartitionCron] Telemetry maintenance failed:", err);
  }

  const durationMs = Date.now() - startedAt;
  const success = results.errors.length === 0;

  try {
    const adminId = process.env.PARTITION_MAINTENANCE_ADMIN_ID;
    if (!adminId) {
      throw new Error("PARTITION_MAINTENANCE_ADMIN_ID is not configured");
    }

    const auditActor = await prisma.user.findFirst({
      where: { id: adminId, isAdmin: true },
      select: { id: true },
    });
    if (!auditActor) {
      throw new Error("Configured partition maintenance audit actor is not an admin user");
    }

    await prisma.adminAuditLog.create({
      data: {
        adminId: auditActor.id,
        action: "PARTITION_MAINTENANCE",
        entityType: "DatabasePartition",
        entityId: "WifiTelemetry,AcousticTelemetry",
        details: JSON.stringify({ success, durationMs, ...results }),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.errors.push(`partitionMaintenanceAudit: ${msg}`);
    console.error("[PartitionCron] Failed to log maintenance metrics:", err);
  }

  return NextResponse.json(
    {
      success: results.errors.length === 0,
      durationMs,
      ...results,
    },
    { status: success ? 200 : 207 },
  );
}
