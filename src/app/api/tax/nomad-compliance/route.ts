import { NextRequest, NextResponse } from "next/server";
import {
  calculateNomadTaxPresence,
  TaxPresenceEntry,
  NomadTaxOptions,
} from "@/lib/tax/nomadTaxEngine";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const entries: TaxPresenceEntry[] = Array.isArray(body.entries) ? body.entries : [];
    const options: NomadTaxOptions = {
      taxYear: body.taxYear ? Number(body.taxYear) : undefined,
      taxResidencyThresholdDays: body.taxResidencyThresholdDays
        ? Number(body.taxResidencyThresholdDays)
        : 183,
      collisionRule: body.collisionRule || "DESTINATION_PRIORITY",
    };

    if (entries.length === 0) {
      return NextResponse.json(
        {
          error: "Invalid request payload. Expected an array of 'entries'.",
        },
        { status: 400 }
      );
    }

    const report = calculateNomadTaxPresence(entries, options);

    return NextResponse.json({
      success: true,
      report,
    });
  } catch (err: any) {
    console.error("[NomadTaxCompliance API Error]:", err);
    return NextResponse.json(
      { error: err.message || "Failed to process tax compliance report" },
      { status: 500 }
    );
  }
}
