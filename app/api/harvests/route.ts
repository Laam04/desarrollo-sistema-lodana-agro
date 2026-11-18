import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  cleanName,
  normalizeName,
  parseDate,
  parsePositiveDecimal,
  validateCropReferences,
  validateUnit,
} from "@/lib/production-validation";

const harvestInclude = {
  crop: true,
  variety: {
    where: { deletedAt: null },
  },
  productionArea: {
    where: { deletedAt: null },
  },
  unit: true,
  losses: {
    where: {
      status: "ACTIVE",
      deletedAt: null,
    },
    include: {
      reason: true,
    },
    orderBy: {
      date: "desc" as const,
    },
  },
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const cropId = searchParams.get("cropId");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const where: {
      status: string;
      deletedAt: Date | null;
      cropId?: string;
      crop?: {
        is: {
          deletedAt: null;
        };
      };
      date?: {
        gte?: Date;
        lt?: Date;
      };
    } = {
      status: "ACTIVE",
      deletedAt: null,
      crop: {
        is: {
          deletedAt: null,
        },
      },
    };

    if (cropId) where.cropId = cropId;

    if (from || to) {
      where.date = {};

      if (from) {
        const start = parseDate(from);

        if (!start) {
          return NextResponse.json(
            { error: "La fecha inicial no es válida." },
            { status: 400 },
          );
        }

        start.setUTCHours(0, 0, 0, 0);
        where.date.gte = start;
      }

      if (to) {
        const end = parseDate(to);

        if (!end) {
          return NextResponse.json(
            { error: "La fecha final no es válida." },
            { status: 400 },
          );
        }

        end.setUTCHours(0, 0, 0, 0);
        end.setUTCDate(end.getUTCDate() + 1);
        where.date.lt = end;
      }
    }

    if (where.date?.gte && where.date?.lt && where.date.gte >= where.date.lt) {
      return NextResponse.json(
        { error: "El rango de fechas no es válido." },
        { status: 400 },
      );
    }

    const rows = await prisma.harvest.findMany({
      where,
      include: harvestInclude,
      orderBy: { date: "desc" },
      take: 200,
    });

    return NextResponse.json(rows);
  } catch (error) {
    console.error("Error al consultar cosechas:", error);

    return NextResponse.json(
      { error: "No se pudieron consultar las cosechas." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;

    const date = parseDate(body.date);
    const cropId = typeof body.cropId === "string" ? body.cropId : "";
    const quantity = parsePositiveDecimal(body.quantity);

    if (!date || !cropId || !quantity) {
      return NextResponse.json(
        { error: "Fecha, cultivo y cantidad positiva son obligatorios." },
        { status: 400 },
      );
    }

    // El precio estimado es opcional, pero debe ser positivo si se proporciona.
    const hasPrice =
      body.estimatedUnitPrice !== undefined &&
      body.estimatedUnitPrice !== null &&
      body.estimatedUnitPrice !== "";

    const estimatedUnitPrice = hasPrice
      ? parsePositiveDecimal(body.estimatedUnitPrice)
      : null;

    if (hasPrice && !estimatedUnitPrice) {
      return NextResponse.json(
        { error: "El precio estimado debe ser mayor que cero." },
        { status: 400 },
      );
    }

    // Datos opcionales de la merma asociada a esta cosecha.
    const hasLoss =
      body.lossQuantity !== undefined &&
      body.lossQuantity !== null &&
      body.lossQuantity !== "";

    const lossQuantity = hasLoss
      ? parsePositiveDecimal(body.lossQuantity)
      : null;

    const lossReason = cleanName(body.lossReason);
    const lossNotes = cleanName(body.lossNotes);
    const lossDate = body.lossDate ? parseDate(body.lossDate) : date;
    const lossAffectsHarvest: boolean | null =
      typeof body.lossAffectsHarvest === "boolean"
        ? body.lossAffectsHarvest
        : null;
    if (
      hasLoss &&
      (!lossQuantity ||
        !lossReason ||
        !lossDate ||
        typeof lossAffectsHarvest !== "boolean")
    ) {
      return NextResponse.json(
        {
          error:
            "Para registrar una merma debes indicar una cantidad positiva y un motivo.",
        },
        { status: 400 },
      );
    }

    if (!hasLoss && (lossReason || lossNotes || body.lossDate)) {
      return NextResponse.json(
        { error: "Completa la cantidad de merma o deja sus campos vacíos." },
        { status: 400 },
      );
    }

    if (lossQuantity && lossQuantity > quantity) {
      return NextResponse.json(
        { error: "La merma no puede superar la cantidad cosechada." },
        { status: 400 },
      );
    }

    const refs = await validateCropReferences(body, cropId);

    if ("error" in refs) {
      return NextResponse.json({ error: refs.error }, { status: 400 });
    }

    const unit = await validateUnit(body.unitId || refs.crop.unitId);

    if (!unit) {
      return NextResponse.json(
        { error: "Selecciona una unidad activa." },
        { status: 400 },
      );
    }

    const row = await prisma.$transaction(async (tx) => {
      const harvest = await tx.harvest.create({
        data: {
          date,
          cropId,
          varietyId: refs.varietyId,
          productionAreaId: refs.productionAreaId,
          quantity,
          unitId: unit.id,
          estimatedUnitPrice,
          notes: cleanName(body.notes) || null,
        },
      });

      if (lossQuantity && lossReason && lossDate) {
        const normalizedReason = normalizeName(lossReason);

        const existingReason = await tx.lossReason.findUnique({
          where: {
            normalizedName: normalizedReason,
          },
        });

        if (existingReason?.deletedAt) {
          throw new Error("LOSS_REASON_IN_TRASH");
        }

        const reason = existingReason
          ? await tx.lossReason.update({
              where: {
                id: existingReason.id,
              },
              data: {
                name: lossReason,
                active: true,
              },
            })
          : await tx.lossReason.create({
              data: {
                name: lossReason,
                normalizedName: normalizedReason,
              },
            });

        await tx.loss.create({
          data: {
            harvestId: harvest.id,
            date: lossDate,
            quantity: lossQuantity,
            affectsHarvest: lossAffectsHarvest,
            reasonId: reason.id,
            notes: lossNotes || null,
          },
        });
      }

      return tx.harvest.findUniqueOrThrow({
        where: { id: harvest.id },
        include: harvestInclude,
      });
    });

    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "LOSS_REASON_IN_TRASH") {
      return NextResponse.json(
        {
          error:
            "La razón de merma está en la papelera. Restáurala antes de utilizarla.",
        },
        { status: 409 },
      );
    }

    console.error("Error al registrar cosecha:", error);

    return NextResponse.json(
      { error: "No se pudo registrar la cosecha." },
      { status: 500 },
    );
  }
}
