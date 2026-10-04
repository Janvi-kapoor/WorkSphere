import { NextRequest, NextResponse } from "next/server";
import {
  autoCreateUpcomingPartitions,
  archiveExpiredPushNotificationPartitions,
  archiveExpiredTelemetryPartitions,
  checkPartitionHealth,
} from "@/lib/partitionMaintenance";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";

/**
 * GET /api/cron/partition-maintenance
 *
 * Monthly cron job that:
 * 1. Creates upcoming table partitions (telemetry and push notification logs)
 * 2. Detaches and archives expired telemetry partitions older than 12 months to S3/cold storage
 * 3. Archives expired push notification partitions older than 6 months
 * 4. Returns a health report
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
    telemetryPartitionsArchived?: string[];
    healthReport?: unknown;
    errors: string[];
  } = { errors: [] };

  // 1. Create upcoming partitions (TelemetryRecord & PushNotificationLog)
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

  // 2. Archive expired push notification partitions
  try {
    const archiveResult = await archiveExpiredPushNotificationPartitions();
    results.partitionsArchived = archiveResult.archived.map((a) => a.name);
    console.log(
      `[PartitionCron] Archived ${results.partitionsArchived.length} expired push partition(s)`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.errors.push(`archiveExpiredPushNotificationPartitions: ${msg}`);
    console.error("[PartitionCron] Failed to archive push partitions:", err);
  }

  // 3. Detach and archive expired telemetry partitions older than 12 months to cold storage / S3
  try {
    if (typeof archiveExpiredTelemetryPartitions === "function") {
      const telemetryArchiveResult = await archiveExpiredTelemetryPartitions();
      results.telemetryPartitionsArchived = telemetryArchiveResult.archived.map((a) => a.name);
      console.log(
        `[PartitionCron] Archived ${results.telemetryPartitionsArchived.length} expired telemetry partition(s)`,
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.errors.push(`archiveExpiredTelemetryPartitions: ${msg}`);
    console.error("[PartitionCron] Failed to archive telemetry partitions:", err);
  }

  // 4. Collect health report
  try {
    results.healthReport = await checkPartitionHealth();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.errors.push(`checkPartitionHealth: ${msg}`);
  }

  const durationMs = Date.now() - startedAt;
  const success = results.errors.length === 0;

  return NextResponse.json(
    {
      success,
      durationMs,
      ...results,
    },
    { status: success ? 200 : 207 },
  );
}
