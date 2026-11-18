"use client";

import useSWR from "swr";
import { formatDate, invalidateProduction, productionFetch, today } from "@/lib/production-client";
import { receiptCode } from "@/lib/market-data";
import { editableShipmentStatuses, shipmentStatusLabels } from "@/lib/shipment-status";
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ElementType,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Ban,
  CalendarDays,
  CheckCircle2,
  Info,
  Inbox,
  Loader2,
  Package,
  Pencil,
  Plus,
  Search,
  Sprout,
  Trash2,
  TrendingDown,
  TriangleAlert,
  Truck,
  Wallet,
  X,
} from "lucide-react";

/* ───────────────────────── Tipos ───────────────────────── */

type Crop = {
  id: string;
  name: string;
  unit?: { id: string; name: string } | null;
  varieties?: { id: string; name: string }[];
  productionAreas?: {
    id: string;
    name: string;
    type: "LOT" | "ZONE";
  }[];
};

type Unit = { id: string; name: string };

type Availability = {
  cropId: string;
  cropName: string;
  varietyId: string | null;
  varietyName: string | null;
  productionAreaId: string | null;
  productionAreaName: string | null;
  unitId: string;
  unitName?: string;
  available: number | string;
  estimatedUnitPrice: string | null;
};

type ShipmentLine = {
  uid: string;
  cropId: string;
  varietyId: string;
  productionAreaId: string;
  unitId: string;
  quantity: string;
  unitPrice: string;
  notes?: string | null;
};

type Quantity = string | number;
type LossDetails = {
  id: string;
  date: string;
  quantity: Quantity;
  affectsHarvest: boolean | null;
  reason?: { name: string };
};
type ShipmentProduct = {
  id: string;
  cropId: string;
  varietyId: string | null;
  productionAreaId: string | null;
  unitId: string;
  quantity: Quantity;
  estimatedUnitPrice: Quantity | null;
  estimatedTotalAmount: Quantity | null;
  crop?: Crop;
  variety?: { name: string } | null;
  productionArea?: { name: string } | null;
  unit?: Unit;
  notes?: string | null;
};
type HistoryRow = {
  id: string;
  date: string;
  notes?: string | null;
  cropId?: string;
  unitId?: string;
  varietyId?: string | null;
  productionAreaId?: string | null;
  crop?: Crop;
  variety?: { name: string } | null;
  productionArea?: { name: string } | null;
  unit?: Unit;
  quantity?: Quantity;
  estimatedUnitPrice?: Quantity | null;
  losses?: LossDetails[];
  harvest?: HistoryRow;
  harvestId?: string;
  reason?: { name: string };
  affectsHarvest?: boolean | null;
  description?: string;
  category?: { name: string };
  amountUsd?: Quantity;
  applicationType?: string;
  allocations?: { cropId: string | null; crop: Crop | null; amountUsd: Quantity | null }[];
  code?: string;
  status?: string;
  items?: ShipmentProduct[];
  receptions?: { receiptNumber?: number; items: { shipmentItemId: string; receivedQuantity: Quantity }[] }[];
};

type HistoryPage = { rows: HistoryRow[]; hasNext: boolean };

type Message = {
  kind: "success" | "error";
  text: string;
};

type Tone = "primary" | "danger" | "warning";

/* ───────────────────── Sistema de estilos ─────────────────────
   Una sola paleta: verde (acción principal), ámbar (advertencia)
   y rojo (destructivo). Todo lo demás usa los tokens del tema. */

const card =
  "rounded-2xl border border-emerald-900/10 bg-white shadow-sm dark:border-emerald-100/10 dark:bg-[#18211c]";

const innerBox =
  "rounded-xl border border-border/70 bg-muted/30 dark:bg-white/[0.03]";

const inputCls =
  "w-full min-w-0 rounded-xl border border-border bg-background px-3 py-2.5 text-sm shadow-sm transition placeholder:text-muted-foreground/70 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20";

const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40 disabled:cursor-not-allowed disabled:opacity-60";

const btnPrimary = `${btnBase} bg-emerald-700 text-white shadow-sm hover:bg-emerald-800`;
const btnOutline = `${btnBase} border border-border bg-background hover:bg-muted`;
const btnDanger = `${btnBase} bg-red-600 text-white shadow-sm hover:bg-red-700`;
const btnSmall =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold transition hover:bg-muted disabled:opacity-50";

const toneStyles: Record<
  Tone,
  { badge: string; confirm: string; icon: ElementType }
> = {
  primary: {
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    confirm: btnPrimary,
    icon: CheckCircle2,
  },
  warning: {
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    confirm: `${btnBase} bg-amber-600 text-white shadow-sm hover:bg-amber-700`,
    icon: TriangleAlert,
  },
  danger: {
    badge: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    confirm: btnDanger,
    icon: TriangleAlert,
  },
};

/* ───────────────────────── Utilidades ───────────────────────── */

const fetcher = productionFetch;

let lineSequence = 0;

function emptyShipmentLine(overrides: Partial<ShipmentLine> = {}): ShipmentLine {
  lineSequence += 1;
  return {
    uid: `line-${lineSequence}`,
    cropId: "",
    varietyId: "",
    productionAreaId: "",
    unitId: "",
    quantity: "",
    unitPrice: "",
    ...overrides,
  };
}

function stockKey(
  cropId: string,
  varietyId?: string | null,
  productionAreaId?: string | null,
  unitId?: string | null,
) {
  return [cropId, varietyId ?? "", productionAreaId ?? "", unitId ?? ""].join(
    "|",
  );
}

const currency = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' });
function formatAmount(value: unknown) {
  return currency.format(Number(value ?? 0));
}

function shipmentSubtotal(line: ShipmentLine) {
  const quantity = Math.round(Number(line.quantity) * 100);
  const price = Math.round(Number(line.unitPrice) * 100);
  if (!Number.isSafeInteger(quantity) || !Number.isSafeInteger(price) || quantity < 0 || price < 0) return 0;
  const cents = (BigInt(quantity) * BigInt(price) + BigInt(50)) / BigInt(100);
  return Number(cents) / 100;
}

/* ───────────────────── Componentes de apoyo ───────────────────── */

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-1.5 text-sm font-medium">
      {label}
      {children}
      {hint && (
        <span className="text-xs font-normal text-muted-foreground">
          {hint}
        </span>
      )}
    </label>
  );
}

function IconBadge({
  icon: Icon,
  className = "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
}: {
  icon: ElementType;
  className?: string;
}) {
  return (
    <span
      className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${className}`}
    >
      <Icon className="size-5" />
    </span>
  );
}

function Toast({
  message,
  onClose,
}: {
  message: Message | null;
  onClose: () => void;
}) {
  if (!message) return null;
  const success = message.kind === "success";

  return (
    <div
      role={success ? "status" : "alert"}
      className="fixed right-4 top-4 z-[60] w-[calc(100%-2rem)] max-w-sm"
    >
      <div
        className={`flex items-start gap-3 rounded-2xl border bg-background p-4 shadow-xl ${
          success
            ? "border-emerald-300 dark:border-emerald-700"
            : "border-red-300 dark:border-red-800"
        }`}
      >
        <span
          className={`flex size-8 shrink-0 items-center justify-center rounded-full ${
            success
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
              : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
          }`}
        >
          {success ? (
            <CheckCircle2 className="size-4" />
          ) : (
            <TriangleAlert className="size-4" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {success ? "Listo" : "Algo salió mal"}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">{message.text}</p>
        </div>
        <button
          type="button"
          aria-label="Cerrar aviso"
          onClick={onClose}
          className="rounded-lg p-1 text-muted-foreground hover:bg-muted"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}

function ConfirmDialog({
  open,
  title,
  description,
  children,
  confirmLabel,
  cancelLabel = "Volver",
  tone = "primary",
  icon,
  loading = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: string;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: Tone;
  icon?: ElementType;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, [open]);

  if (!open) return null;

  const style = toneStyles[tone];
  const Icon = icon ?? style.icon;

  return (
    <dialog
      ref={dialogRef}
      aria-label={title}
      onCancel={(event) => { event.preventDefault(); if (!loading) onClose(); }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !loading) onClose();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-lg overflow-visible bg-transparent p-0 text-foreground backdrop:bg-black/50 backdrop:backdrop-blur-sm"
    >
      <div className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
        <div className="flex items-start gap-4 p-5">
          <IconBadge icon={Icon} className={style.badge} />
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold leading-tight">{title}</h2>
            {description && (
              <p className="mt-1 text-sm text-muted-foreground">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            disabled={loading}
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            <X className="size-4" />
          </button>
        </div>

        {children && (
          <div className="overflow-y-auto border-t border-border/70 bg-muted/20 p-5 text-sm">
            {children}
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 border-t border-border/70 p-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            className={btnOutline}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={onConfirm}
            className={style.confirm}
          >
            {loading && <Loader2 className="size-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}

function SummaryList({
  rows,
}: {
  rows: { label: string; value: string }[];
}) {
  return (
    <dl className="grid gap-2">
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex items-start justify-between gap-4 rounded-lg bg-background px-3 py-2"
        >
          <dt className="text-muted-foreground">{row.label}</dt>
          <dd className="text-right font-medium">{row.value || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

function SectionTitle({
  step,
  title,
  hint,
  action,
}: {
  step?: number;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-3">
        {step !== undefined && (
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-xs font-bold text-white">
            {step}
          </span>
        )}
        <div>
          <p className="text-sm font-semibold">{title}</p>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

/* ───────────────────── Pantalla principal ───────────────────── */

export function ProductionRecords({ active }: { active: string }) {
  const isHarvests = active === "cosechas";
  const isShipments = active === "envios";
  const isCosts = active === "costos";

  const [harvestView, setHarvestView] = useState<"cosechas" | "mermas">(
    "cosechas",
  );
  const isLosses = isHarvests && harvestView === "mermas";

  const formRef = useRef<HTMLFormElement>(null);

  const [formDate, setFormDate] = useState(today());

  // Estado exclusivo de envíos
  const [editingShipmentId, setEditingShipmentId] = useState<string | null>(
    null,
  );
  const [editingCode, setEditingCode] = useState("");
  const [shipmentNotes, setShipmentNotes] = useState("");
  const [shipmentLines, setShipmentLines] = useState<ShipmentLine[]>(() => [
    emptyShipmentLine(),
  ]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [shipmentToCancel, setShipmentToCancel] = useState<HistoryRow | null>(null);
  const [cancelling, setCancelling] = useState(false);

  // Confirmaciones adicionales
  const [discardOpen, setDiscardOpen] = useState(false);
  const [prepareOpen, setPrepareOpen] = useState(false);
  const [lineToRemove, setLineToRemove] = useState<number | null>(null);
  const [simpleConfirm, setSimpleConfirm] = useState<
    { label: string; value: string }[] | null
  >(null);

  const { data: crops = [], error: cropsError } = useSWR<Crop[]>("/api/crops", fetcher);
  const { data: units = [], error: unitsError } = useSWR<Unit[]>(isCosts || isLosses ? null : "/api/units", fetcher);
  const [harvestSearch, setHarvestSearch] = useState("");
  const deferredHarvestSearch = useDeferredValue(harvestSearch);
  const { data: harvestResults, error: harvestOptionsError } = useSWR<HistoryPage>(
    isLosses ? `/api/harvests?${new URLSearchParams({ page: '1', q: deferredHarvestSearch })}` : null, fetcher,
  );
  const {
    data: shipmentAvailability = [],
    error: availabilityError,
    isLoading: availabilityLoading,
    mutate: mutateAvailability,
  } = useSWR<Availability[]>(
    isShipments && formDate ? `/api/shipments/availability?${new URLSearchParams({
      asOf: formDate, ...(editingShipmentId ? { editShipmentId: editingShipmentId } : {}),
    })}` : null,
    fetcher,
  );

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [filterCropId, setFilterCropId] = useState("");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [page, setPage] = useState(1);

  const [cropId, setCropId] = useState("");
  const [editingRecord, setEditingRecord] = useState<HistoryRow | null>(null);
  const [linkedHarvest, setLinkedHarvest] = useState<HistoryRow | null>(null);
  const [lossHarvestId, setLossHarvestId] = useState("");
  const harvestOptions = [...(harvestResults?.rows ?? [])];
  if (linkedHarvest && !harvestOptions.some((row) => row.id === linkedHarvest.id)) harvestOptions.unshift(linkedHarvest);
  const selectedCrop: Crop | undefined = crops.find((crop) => crop.id === cropId) ??
    (editingRecord?.crop?.id === cropId ? editingRecord?.crop : undefined);
  const [unitId, setUnitId] = useState("");
  const [costApplication, setCostApplication] = useState("GENERAL");
  const [costCropId, setCostCropId] = useState("");

  const [message, setMessage] = useState<Message | null>(null);
  const [saving, setSaving] = useState(false);
  const [recordToDelete, setRecordToDelete] = useState<HistoryRow | null>(null);
  const [deletingRecord, setDeletingRecord] = useState(false);

  // Los avisos se cierran solos
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(
      () => setMessage(null),
      message.kind === "error" ? 8000 : 5000,
    );
    return () => clearTimeout(timer);
  }, [message]);

  const endpoint = isLosses ? "/api/losses" : isHarvests ? "/api/harvests" : isShipments ? "/api/shipments" : "/api/costs";
  const query = new URLSearchParams({ page: String(page), from, to, cropId: filterCropId, q: deferredSearch });

  const {
    data: history,
    error: loadError,
    isLoading: rowsLoading,
    mutate,
  } = useSWR<HistoryPage>(`${endpoint}?${query}`, fetcher);
  const visibleRows = history?.rows ?? [];

  const hasFilters = Boolean(from || to || search || filterCropId);

  function refreshRecords(alsoTrash = false) {
    const endpoints = isHarvests ? ['/api/harvests', '/api/losses', '/api/shipments/availability']
      : isShipments ? ['/api/shipments', '/api/shipments/availability'] : [endpoint];
    if (alsoTrash) endpoints.push('/api/trash');
    void invalidateProduction('/api/production-summary', ...endpoints);
  }

  function clearFilters() {
    setPage(1);
    setFrom("");
    setTo("");
    setSearch("");
    setFilterCropId("");
  }

  async function deleteRecord() {
    if (!recordToDelete || deletingRecord) return;
    setDeletingRecord(true);
    try {
      await productionFetch(endpoint, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: recordToDelete.id }),
      });
      if (editingRecord?.id === recordToDelete.id) resetRecordForm();
      setRecordToDelete(null);
      setMessage({ kind: "success", text: "Registro movido a la papelera." });
      if (visibleRows.length === 1 && page > 1) setPage(page - 1);
      refreshRecords(true);
    } catch (error) {
      setRecordToDelete(null);
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "No se pudo eliminar el registro.",
      });
    } finally {
      setDeletingRecord(false);
    }
  }

  /* ---------- Envíos: helpers ---------- */

  const lineUnitId = (line: ShipmentLine) =>
    line.unitId || crops.find((item) => item.id === line.cropId)?.unit?.id || "";

  const keyOf = (line: ShipmentLine) =>
    stockKey(
      line.cropId,
      line.varietyId,
      line.productionAreaId,
      lineUnitId(line),
    );

  const stockByKey = useMemo(() => {
    const map = new Map<string, Availability>();
    for (const item of shipmentAvailability) {
      map.set(
        stockKey(
          item.cropId,
          item.varietyId,
          item.productionAreaId,
          item.unitId,
        ),
        item,
      );
    }
    return map;
  }, [shipmentAvailability]);

  const availableStock = shipmentAvailability.filter(
    (item) => Number(item.available) > 0,
  );

  function describeStock(item: Availability) {
    return {
      title: item.cropName,
      detail: [item.varietyName, item.productionAreaName].filter(Boolean).join(" · "),
    };
  }

  const shipmentCheck = useMemo(() => {
    const requested = new Map<string, number>();
    let incomplete = false;

    const lineKeys = shipmentLines.map((line) => {
      const key = stockKey(
        line.cropId,
        line.varietyId,
        line.productionAreaId,
        line.unitId ||
          crops.find((item) => item.id === line.cropId)?.unit?.id ||
          "",
      );
      const quantity = Number(line.quantity);
      const price = Number(line.unitPrice);

      if (
        !line.cropId ||
        !Number.isFinite(quantity) ||
        quantity <= 0 ||
        !Number.isFinite(price) ||
        price <= 0
      ) {
        incomplete = true;
      }

      if (Number.isFinite(quantity) && quantity > 0) {
        requested.set(key, (requested.get(key) ?? 0) + quantity);
      }

      return key;
    });

    const availableFor = (key: string) => Number(stockByKey.get(key)?.available ?? 0);

    const exceeds = lineKeys.map(
      (key) =>
        !availabilityLoading &&
        (requested.get(key) ?? 0) > availableFor(key) + 0.0001,
    );

    const hasStockError = exceeds.some(Boolean);

    return {
      lineKeys,
      exceeds,
      availableFor,
      incomplete,
      hasStockError,
      canSubmit:
        shipmentLines.length > 0 &&
        !incomplete &&
        !hasStockError &&
        !availabilityLoading && !availabilityError && Boolean(formDate),
    };
  }, [shipmentLines, crops, stockByKey, availabilityLoading, availabilityError, formDate]);

  const totalShipment = shipmentLines.reduce(
    (total, line) => total + shipmentSubtotal(line),
    0,
  );

  const lineHasData = (line: ShipmentLine) =>
    Boolean(line.cropId || line.quantity || line.unitPrice);

  const formHasData = shipmentLines.some(lineHasData) || shipmentNotes.trim();

  function updateShipmentLine(index: number, changes: Partial<ShipmentLine>) {
    setShipmentLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...changes } : line,
      ),
    );
  }

  function addShipmentLine() {
    setShipmentLines((current) => [...current, emptyShipmentLine()]);
  }

  function removeShipmentLine(index: number) {
    setShipmentLines((current) =>
      current.length === 1
        ? [emptyShipmentLine()]
        : current.filter((_, lineIndex) => lineIndex !== index),
    );
  }

  function requestRemoveLine(index: number) {
    if (lineHasData(shipmentLines[index])) {
      setLineToRemove(index);
    } else {
      removeShipmentLine(index);
    }
  }

  function lineFromStock(item: Availability, unitPrice = "") {
    return emptyShipmentLine({
      cropId: item.cropId,
      varietyId: item.varietyId ?? "",
      productionAreaId: item.productionAreaId ?? "",
      unitId: item.unitId,
      quantity: String(item.available),
      unitPrice,
    });
  }

  function prepareAllAvailableHarvests(replace = false) {
    if (replace) setPrepareOpen(false);
    if (availabilityError || availabilityLoading || !formDate) {
      setMessage({ kind: "error", text: "Consulta las existencias de la fecha seleccionada antes de preparar el envío." });
      return;
    }
    if (availableStock.length > 100) {
      setMessage({ kind: 'error', text: 'Puedes incluir hasta 100 productos por envío. Agrega los deseados desde las existencias disponibles.' });
      return;
    }
    if (availableStock.length === 0) {
      setMessage({
        kind: "error",
        text: "No hay existencias disponibles para preparar un envío.",
      });
      return;
    }

    if (!replace && shipmentLines.some(lineHasData)) {
      setPrepareOpen(true);
      return;
    }

    const lines = availableStock.map((item) => lineFromStock(item, item.estimatedUnitPrice ?? ""));
    const hasMissingPrices = lines.some((line) => !line.unitPrice);
    setShipmentLines(lines);
    setMessage({
      kind: hasMissingPrices ? "error" : "success",
      text: hasMissingPrices
        ? "Se cargaron las existencias. Completa los precios de los productos con cosechas sin precio estimado."
        : "Se cargaron las existencias con sus precios estimados. Revisa y confirma el envío.",
    });
  }

  function addStockLine(item: Availability) {
    const key = stockKey(
      item.cropId,
      item.varietyId,
      item.productionAreaId,
      item.unitId,
    );

    setShipmentLines((current) => {
      if (current.some((line) => keyOf(line) === key)) return current;
      const emptyIndex = current.findIndex((line) => !lineHasData(line));
      if (emptyIndex !== -1) return current.map((line, index) => index === emptyIndex ? lineFromStock(item) : line);
      return current.length < 100 ? [...current, lineFromStock(item)] : current;
    });
    setMessage(null);
  }

  function resetShipmentForm() {
    setEditingShipmentId(null);
    setEditingCode("");
    setFormDate(today());
    setShipmentNotes("");
    setShipmentLines([emptyShipmentLine()]);
  }

  function editShipment(row: HistoryRow) {
    const lines: ShipmentLine[] = (row.items ?? []).map((item) =>
      emptyShipmentLine({
        cropId: item.cropId,
        varietyId: item.varietyId || "",
        productionAreaId: item.productionAreaId || "",
        unitId: item.unitId || item.unit?.id || "",
        quantity: String(item.quantity),
        unitPrice: String(item.estimatedUnitPrice ?? ""),
        notes: item.notes,
      }),
    );

    setEditingShipmentId(row.id);
    setEditingCode(row.code || "");
    setFormDate(String(row.date).slice(0, 10));
    setShipmentNotes(row.notes || "");
    setShipmentLines(lines.length > 0 ? lines : [emptyShipmentLine()]);
    setMessage(null);

    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function saveShipment() {
    if (saving) return;
    setSaving(true);
    setMessage(null);

    try {
      const wasEditing = Boolean(editingShipmentId);

      const items = shipmentLines.map((line) => ({
        cropId: line.cropId,
        varietyId: line.varietyId || null,
        productionAreaId: line.productionAreaId || null,
        unitId: lineUnitId(line) || null,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        notes: line.notes,
      }));

      const data = await productionFetch<{ code: string }>(
        wasEditing ? `/api/shipments/${editingShipmentId}` : "/api/shipments",
        {
          method: wasEditing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date: formDate,
            notes: shipmentNotes,
            items,
          }),
        },
      );

      setConfirmOpen(false);
      resetShipmentForm();
      setMessage({
        kind: "success",
        text: wasEditing
          ? "Envío actualizado correctamente."
          : `Envío ${data.code || ""} registrado correctamente.`,
      });

      if (!wasEditing && page > 1) setPage(1);
      refreshRecords();
    } catch (error) {
      setConfirmOpen(false);
      void mutateAvailability();
      setMessage({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "Ocurrió un error al guardar el envío.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function cancelShipment() {
    if (!shipmentToCancel || cancelling) return;

    setCancelling(true);

    try {
      await productionFetch(`/api/shipments/${shipmentToCancel.id}`, {
        method: "DELETE",
      });

      if (editingShipmentId === shipmentToCancel.id) resetShipmentForm();

      setShipmentToCancel(null);
      setMessage({ kind: "success", text: "Envío cancelado correctamente." });
      refreshRecords();
    } catch (error) {
      setShipmentToCancel(null);
      setMessage({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "No se pudo cancelar el envío.",
      });
    } finally {
      setCancelling(false);
    }
  }

  /* ---------- Cosechas, mermas y costos ---------- */

  function resetRecordForm() {
    formRef.current?.reset();
    setEditingRecord(null);
    setLinkedHarvest(null);
    setLossHarvestId("");
    setHarvestSearch("");
    setCropId("");
    setUnitId("");
    setCostApplication("GENERAL");
    setCostCropId("");
    setFormDate(today());
  }

  function editRecord(row: HistoryRow) {
    setEditingRecord(row);
    setFormDate(String(row.date).slice(0, 10));
    setCropId(row.cropId || "");
    setUnitId(row.unitId || "");
    setLinkedHarvest(row.harvest ?? null);
    setLossHarvestId(row.harvestId ?? "");
    setCostApplication(row.applicationType === "CROP" || row.allocations?.length ? "CROP" : "GENERAL");
    setCostCropId(row.allocations?.length === 1 ? row.allocations[0].cropId ?? "" : "");
    setMessage(null);
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function logLossFor(row: HistoryRow) {
    resetRecordForm();
    clearFilters();
    setHarvestView("mermas");
    setLinkedHarvest(row);
    setLossHarvestId(row.id);
    setFormDate(String(row.date).slice(0, 10) > today() ? String(row.date).slice(0, 10) : today());
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function submitRecord(form: HTMLFormElement) {
    const payload: Record<string, unknown> = Object.fromEntries(new FormData(form));
    if (editingRecord) payload.id = editingRecord.id;
    if (isLosses) {
      payload.affectsHarvest = payload.affectsHarvest === 'true';
    } else if (isHarvests) {
      payload.cropId = cropId;
    } else if (isCosts && costApplication === 'CROP' && costCropId) {
      const prior = editingRecord?.allocations?.length === 1 ? editingRecord.allocations[0] : undefined;
      const amountChanged = prior?.amountUsd != null && Number(prior.amountUsd) !== Number(payload.amountUsd);
      if (prior?.cropId !== costCropId || amountChanged) {
        payload.allocations = [{ cropId: costCropId, amountUsd: payload.amountUsd }];
      }
    }
    return productionFetch(endpoint, {
      method: editingRecord ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  // Resumen que se muestra en el diálogo de confirmación
  function buildSummary(form: HTMLFormElement) {
    const fd = new FormData(form);
    const date = formatDate(String(fd.get("date") ?? ""));

    if (isLosses) {
      const harvest = harvestOptions.find((h) => h.id === fd.get("harvestId"));
      return [
        { label: "Fecha", value: date },
        {
          label: "Cosecha asociada",
          value: harvest
            ? `${harvest.crop?.name || "Cultivo"} · ${formatDate(harvest.date)}`
            : "—",
        },
        {
          label: "Cantidad de merma",
          value: `${fd.get("quantity")} ${harvest?.unit?.name ?? ""}`.trim(),
        },
        { label: "Motivo", value: String(fd.get("reason") ?? "") },
        {
          label: "Descuenta producción útil",
          value: fd.get("affectsHarvest") === "true" ? "Sí" : "No",
        },
      ];
    }

    if (isHarvests) {
      const unitName = units.find(
        (u) => u.id === (unitId || selectedCrop?.unit?.id),
      )?.name;
      return [
        { label: "Fecha", value: date },
        { label: "Cultivo", value: selectedCrop?.name ?? "—" },
        {
          label: "Cantidad cosechada",
          value: `${fd.get("quantity")} ${unitName ?? ""}`.trim(),
        },
        {
          label: "Precio estimado",
          value: fd.get("estimatedUnitPrice")
            ? formatAmount(fd.get("estimatedUnitPrice"))
            : "No indicado",
        },
      ];
    }

    return [
      { label: "Fecha", value: date },
      { label: "Descripción", value: String(fd.get("description") ?? "") },
      { label: "Categoría", value: String(fd.get("category") ?? "") },
      { label: "Importe", value: formatAmount(fd.get("amountUsd")) },
      { label: 'Aplicación', value: costApplication === 'GENERAL' ? 'General' :
        crops.find((crop) => crop.id === costCropId)?.name ?? editingRecord?.allocations?.map((item) => item.crop?.name).filter(Boolean).join(' · ') ?? 'Cultivo' },
    ];
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isShipments) {
      if (shipmentCheck.canSubmit) {
        setMessage(null);
        setConfirmOpen(true);
      }
      return;
    }

    // Cosechas, mermas y costos: confirmar antes de guardar
    setMessage(null);
    setSimpleConfirm(buildSummary(event.currentTarget));
  }

  async function confirmSimpleSave() {
    const form = formRef.current;
    if (!form || saving) return;

    setSaving(true);
    setMessage(null);

    try {
      await submitRecord(form);

      setSimpleConfirm(null);
      setMessage({
        kind: "success",
        text: editingRecord ? "Cambios guardados." : "Registro guardado.",
      });

      resetRecordForm();
      if (!editingRecord && page > 1) setPage(1);
      refreshRecords();
    } catch (error) {
      setSimpleConfirm(null);
      setMessage({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "Ocurrió un error al guardar el registro.",
      });
    } finally {
      setSaving(false);
    }
  }

  const unitNameFor = (line: ShipmentLine) =>
    stockByKey.get(keyOf(line))?.unitName ??
    units.find((unit) => unit.id === lineUnitId(line))?.name ??
    "";

  /* ---------- Textos y colores según la vista ---------- */

  const view = isLosses
    ? {
        icon: TrendingDown,
        subtitle: "Pérdidas ligadas a una cosecha",
        title: "Registrar merma",
        history: "Mermas registradas",
        cta: "Registrar merma",
        confirmTitle: "Confirmar merma",
      }
    : isHarvests
      ? {
          icon: Sprout,
          subtitle: "Producción obtenida en campo",
          title: "Registrar cosecha",
          history: "Cosechas registradas",
          cta: "Guardar cosecha",
          confirmTitle: "Confirmar cosecha",
        }
      : isShipments
        ? {
            icon: Truck,
            subtitle: editingShipmentId
              ? "Modificación de un envío registrado"
              : "Despacho de existencias disponibles",
            title: editingShipmentId
              ? `Editar envío ${editingCode}`.trim()
              : "Preparar envío",
            history: "Envíos registrados",
            cta: editingShipmentId
              ? "Revisar y guardar cambios"
              : "Revisar y confirmar envío",
            confirmTitle: "Confirmar envío",
          }
        : {
            icon: Wallet,
            subtitle: "Gastos de la operación",
            title: "Registrar costo",
            history: "Costos registrados",
            cta: "Guardar costo",
            confirmTitle: "Confirmar costo",
          };

  const ViewIcon = view.icon;

  return (
    <div className="mt-7 grid items-start gap-5 xl:grid-cols-[minmax(340px,0.85fr)_minmax(0,1.15fr)]">
      <Toast message={message} onClose={() => setMessage(null)} />

      {isHarvests && (
        <div
          role="group"
          aria-label="Vista de producción"
          className="grid grid-cols-2 gap-1.5 rounded-2xl border border-emerald-900/10 bg-emerald-50/60 p-1.5 dark:border-emerald-100/10 dark:bg-emerald-950/20 xl:col-span-2"
        >
          {(
            [
              ["cosechas", "Cosechas", Sprout],
              ["mermas", "Mermas", TrendingDown],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              aria-pressed={harvestView === id}
              onClick={() => {
                if (harvestView === id) return;
                resetRecordForm();
                clearFilters();
                setHarvestView(id);
              }}
              className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                harvestView === id
                  ? "bg-emerald-700 text-white shadow-sm"
                  : "text-muted-foreground hover:bg-white dark:hover:bg-white/5"
              }`}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </div>
      )}

      {/* ─────────── Formulario ─────────── */}
      <form
        key={`${endpoint}:${editingRecord?.id ?? 'new'}`}
        ref={formRef}
        onSubmit={submit}
        className={`${card} scroll-mt-24 overflow-hidden`}
      >
        <header className="flex items-center gap-3 border-b border-border/60 bg-emerald-50/50 p-5 dark:bg-emerald-950/20">
          <IconBadge icon={ViewIcon} />
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold leading-tight">
              {editingRecord ? (isLosses ? 'Editar merma' : isHarvests ? 'Editar cosecha' : 'Editar costo') : view.title}
            </h3>
            <p className="text-xs text-muted-foreground">{view.subtitle}</p>
          </div>
        </header>

        <div className="p-5">
          {(editingShipmentId || editingRecord) && (
            <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300/70 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-200">
              <span className="inline-flex items-center gap-2">
                <Info className="size-4 shrink-0" />
                Estás modificando un registro del historial.
              </span>
              <button
                type="button"
                disabled={saving}
                onClick={() => setDiscardOpen(true)}
                className="font-semibold underline underline-offset-2 disabled:opacity-60"
              >
                Cancelar edición
              </button>
            </div>
          )}

          {(cropsError || unitsError || harvestOptionsError) && (
            <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
              {(cropsError || unitsError || harvestOptionsError).message}
            </p>
          )}

          <div className="grid gap-4">
            <Field label="Fecha">
              <div className="relative">
                <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  required
                  type="date"
                  name="date"
                  value={formDate}
                  onChange={(event) => setFormDate(event.target.value)}
                  className={`${inputCls} pl-9`}
                />
              </div>
            </Field>

            {isLosses && (
              <>
                <Field label="Buscar cosecha" hint="Busca por cultivo, variedad o lote.">
                  <input type="search" value={harvestSearch} onChange={(event) => setHarvestSearch(event.target.value)} className={inputCls} />
                </Field>
                <Field label="Cosecha asociada">
                  <select required name="harvestId" value={lossHarvestId} onChange={(event) => {
                    const harvest = harvestOptions.find((item) => item.id === event.target.value);
                    setLossHarvestId(event.target.value);
                    setLinkedHarvest(harvest ?? null);
                  }} className={inputCls}>
                    <option value="">Seleccionar cosecha</option>
                    {harvestOptions.map((harvest) => (
                      <option key={harvest.id} value={harvest.id}>
                        {harvest.crop?.name || "Cultivo"} —{" "}
                        {formatDate(harvest.date)} — {harvest.quantity}{" "}
                        {harvest.unit?.name || ""}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Cantidad de merma">
                  <input
                    required
                    min="0.01"
                    step="0.01"
                    type="number"
                    name="quantity"
                    defaultValue={editingRecord?.quantity ?? ''}
                    className={inputCls}
                  />
                </Field>

                <fieldset className={`${innerBox} grid gap-2 p-3`}>
                  <legend className="px-1 text-sm font-medium">
                    ¿La merma afecta a la producción útil?
                  </legend>

                  {[
                    {
                      value: "true",
                      title: "Sí, afecta.",
                      text: "Se descontará de la producción útil disponible.",
                    },
                    {
                      value: "false",
                      title: "No afecta.",
                      text: "Se registrará como pérdida, sin descontarla de la producción útil.",
                    },
                  ].map((option) => (
                    <label
                      key={option.value}
                      className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-background p-3 text-sm transition hover:border-emerald-600/60 has-[:checked]:border-emerald-600 has-[:checked]:bg-emerald-50 dark:has-[:checked]:bg-emerald-950/30"
                    >
                      <input
                        required
                        type="radio"
                        name="affectsHarvest"
                        value={option.value}
                        defaultChecked={typeof editingRecord?.affectsHarvest === 'boolean' && String(editingRecord.affectsHarvest) === option.value}
                        className="mt-1 accent-emerald-700"
                      />
                      <span>
                        <span className="font-medium">{option.title}</span>
                        <span className="block text-xs text-muted-foreground">
                          {option.text}
                        </span>
                      </span>
                    </label>
                  ))}
                </fieldset>

                <Field label="Motivo">
                  <input
                    required
                    name="reason"
                    defaultValue={editingRecord?.reason?.name ?? ''}
                    maxLength={120}
                    placeholder="Ej. producto dañado"
                    className={inputCls}
                  />
                </Field>

                <Field label="Observaciones">
                  <textarea name="notes" rows={2} maxLength={2000} defaultValue={editingRecord?.notes ?? ''} className={inputCls} />
                </Field>
              </>
            )}

            {isHarvests && !isLosses && (
              <>
                <Field label="Cultivo">
                  <select
                    required
                    value={cropId}
                    onChange={(event) => {
                      setCropId(event.target.value);
                      setUnitId("");
                    }}
                    className={inputCls}
                  >
                    <option value="">Seleccionar cultivo</option>
                    {selectedCrop && !crops.some((crop) => crop.id === cropId) && (
                      <option value={cropId}>{selectedCrop.name}</option>
                    )}
                    {crops.map((crop) => (
                      <option key={crop.id} value={crop.id}>
                        {crop.name}
                      </option>
                    ))}
                  </select>
                </Field>

                {((selectedCrop?.varieties?.length ?? 0) > 0 || (editingRecord?.cropId === cropId && editingRecord?.varietyId) ||
                  (selectedCrop?.productionAreas?.length ?? 0) > 0 || (editingRecord?.cropId === cropId && editingRecord?.productionAreaId)) && (
                  <div key={cropId} className={`${innerBox} grid gap-4 p-3`}>
                    {((selectedCrop?.varieties?.length ?? 0) > 0 || (editingRecord?.cropId === cropId && editingRecord?.varietyId)) && (
                      <Field label="Variedad">
                        <select name="varietyId" defaultValue={editingRecord?.cropId === cropId ? editingRecord?.varietyId ?? '' : ''} className={inputCls}>
                          <option value="">Sin especificar</option>
                          {editingRecord?.cropId === cropId && editingRecord?.varietyId && !selectedCrop?.varieties?.some((item) => item.id === editingRecord.varietyId) && (
                            <option value={editingRecord.varietyId}>{editingRecord.variety?.name ?? 'Variedad registrada'}</option>
                          )}
                          {selectedCrop?.varieties?.map((variety) => (
                            <option key={variety.id} value={variety.id}>
                              {variety.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                    )}

                    {((selectedCrop?.productionAreas?.length ?? 0) > 0 || (editingRecord?.cropId === cropId && editingRecord?.productionAreaId)) && (
                      <Field label="Lote o zona">
                        <select name="productionAreaId" defaultValue={editingRecord?.cropId === cropId ? editingRecord?.productionAreaId ?? '' : ''} className={inputCls}>
                          <option value="">Sin especificar</option>
                          {editingRecord?.cropId === cropId && editingRecord?.productionAreaId && !selectedCrop?.productionAreas?.some((item) => item.id === editingRecord.productionAreaId) && (
                            <option value={editingRecord.productionAreaId}>{editingRecord.productionArea?.name ?? 'Área registrada'}</option>
                          )}
                          {selectedCrop?.productionAreas?.map((area) => (
                            <option key={area.id} value={area.id}>
                              {area.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                    )}
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Cantidad cosechada">
                    <input
                      required
                      min="0.01"
                      step="0.01"
                      type="number"
                      name="quantity"
                      defaultValue={editingRecord?.quantity ?? ''}
                      className={inputCls}
                    />
                  </Field>

                  <Field label="Unidad">
                    <select
                      required
                      value={unitId || selectedCrop?.unit?.id || ""}
                      onChange={(event) => setUnitId(event.target.value)}
                      name="unitId"
                      className={inputCls}
                    >
                      <option value="">Seleccionar unidad</option>
                      {editingRecord?.unit?.id === unitId && !units.some((unit) => unit.id === unitId) && (
                        <option value={unitId}>{editingRecord.unit.name}</option>
                      )}
                      {units.map((unit) => (
                        <option key={unit.id} value={unit.id}>
                          {unit.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                <Field
                  label="Precio estimado por unidad (USD)"
                  hint="Precio de referencia del mercado, no costo de producción."
                >
                  <input
                    min="0.01"
                    step="0.01"
                    type="number"
                    name="estimatedUnitPrice"
                    defaultValue={editingRecord?.estimatedUnitPrice ?? ''}
                    placeholder="Opcional"
                    className={inputCls}
                  />
                </Field>

                <Field label="Observaciones de la cosecha">
                  <textarea name="notes" rows={2} maxLength={2000} defaultValue={editingRecord?.notes ?? ''} className={inputCls} />
                </Field>
              </>
            )}

            {isCosts && (
              <>
                <Field label="Descripción del gasto">
                  <input
                    required
                    name="description"
                    defaultValue={editingRecord?.description ?? ''}
                    maxLength={200}
                    placeholder="Ej. compra de fertilizantes"
                    className={inputCls}
                  />
                </Field>

                <Field label="Categoría">
                  <input
                    required
                    name="category"
                    defaultValue={editingRecord?.category?.name ?? ''}
                    maxLength={120}
                    placeholder="Ej. insumos, transporte, mano de obra"
                    className={inputCls}
                  />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Importe (USD)">
                    <input
                      required
                      min="0.01"
                      step="0.01"
                      type="number"
                      name="amountUsd"
                      defaultValue={editingRecord?.amountUsd ?? ''}
                      className={inputCls}
                    />
                  </Field>

                  <Field label="Aplicación">
                    <select
                      name="applicationType"
                      value={costApplication}
                      onChange={(event) => setCostApplication(event.target.value)}
                      className={inputCls}
                    >
                      <option value="GENERAL">General</option>
                      <option value="CROP">Cultivo específico</option>
                    </select>
                  </Field>
                </div>

                {costApplication === 'CROP' && (
                  <Field label="Cultivo del costo">
                    <select name="costCropId" required={(editingRecord?.allocations?.length ?? 0) <= 1} value={costCropId} onChange={(event) => setCostCropId(event.target.value)} className={inputCls}>
                      <option value="">{(editingRecord?.allocations?.length ?? 0) > 1 ? 'Conservar distribución actual' : 'Seleccionar cultivo'}</option>
                      {editingRecord?.allocations?.length === 1 && editingRecord.allocations[0].crop?.id === costCropId && !crops.some((crop) => crop.id === costCropId) && (
                        <option value={costCropId}>{editingRecord.allocations[0].crop.name}</option>
                      )}
                      {crops.map((crop) => <option key={crop.id} value={crop.id}>{crop.name}</option>)}
                    </select>
                  </Field>
                )}

                <Field label="Observaciones">
                  <textarea name="notes" rows={2} maxLength={2000} defaultValue={editingRecord?.notes ?? ''} className={inputCls} />
                </Field>
              </>
            )}

            {isShipments && (
              <>
                {/* 1. Existencias disponibles */}
                <section className={`${innerBox} p-4`}>
                  <SectionTitle
                    step={1}
                    title="Existencias disponibles"
                    hint="Se asignan de las cosechas más antiguas a las más recientes."
                    action={
                      <button
                        type="button"
                        onClick={() => prepareAllAvailableHarvests()}
                        disabled={availableStock.length === 0 || availabilityLoading || Boolean(availabilityError)}
                        className={`${btnBase} bg-emerald-700 px-3 py-2 text-xs text-white hover:bg-emerald-800`}
                      >
                        <Plus className="size-4" />
                        Preparar todo
                      </button>
                    }
                  />

                  {availabilityError ? (
                    <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300">
                      {availabilityError.message}
                    </p>
                  ) : availabilityLoading ? (
                    <div className="mt-3 grid gap-2" aria-busy="true">
                      {[0, 1].map((n) => (
                        <div
                          key={n}
                          className="h-12 animate-pulse rounded-lg bg-muted"
                        />
                      ))}
                    </div>
                  ) : availableStock.length === 0 ? (
                    <div className="mt-3 flex items-center gap-3 rounded-lg border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
                      <Package className="size-5 shrink-0" />
                      No hay existencias disponibles para enviar.
                    </div>
                  ) : (
                    <ul className="mt-3 grid max-h-48 gap-1.5 overflow-y-auto pr-1">
                      {availableStock.map((item) => {
                        const { title, detail } = describeStock(item);
                        return (
                          <li
                            key={stockKey(
                              item.cropId,
                              item.varietyId,
                              item.productionAreaId,
                              item.unitId,
                            )}
                            className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background px-3 py-2 text-xs"
                          >
                            <span className="flex min-w-0 items-center gap-2.5">
                              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                                <Sprout className="size-3.5" />
                              </span>
                              <span className="min-w-0">
                                <span className="block truncate font-medium">
                                  {title}
                                </span>
                                {detail && (
                                  <span className="block truncate text-muted-foreground">
                                    {detail}
                                  </span>
                                )}
                              </span>
                            </span>
                            <span className="flex shrink-0 items-center gap-2">
                              <strong className="whitespace-nowrap rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                                {Number(item.available).toFixed(2)}{" "}
                                {item.unitName ?? ""}
                              </strong>
                              <button
                                type="button"
                                onClick={() => addStockLine(item)}
                                disabled={shipmentLines.some((line) => keyOf(line) === stockKey(item.cropId, item.varietyId, item.productionAreaId, item.unitId)) ||
                                  (shipmentLines.length >= 100 && shipmentLines.every(lineHasData))}
                                aria-label={`Agregar ${title} al envío`}
                                className="rounded-md border border-border p-1.5 transition hover:border-emerald-600 hover:bg-emerald-50 disabled:opacity-50 dark:hover:bg-emerald-950/30"
                              >
                                <Plus className="size-3.5" />
                              </button>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>

                {/* 2. Productos del envío */}
                <SectionTitle
                  step={2}
                  title={`Productos del envío (${shipmentLines.length})`}
                  action={
                    <button
                      type="button"
                      onClick={addShipmentLine}
                      disabled={shipmentLines.length >= 100}
                      className={btnSmall}
                    >
                      <Plus className="size-4" />
                      Agregar producto
                    </button>
                  }
                />

                {shipmentLines.map((line, index) => {
                  const crop = crops.find((item) => item.id === line.cropId);
                  const key = shipmentCheck.lineKeys[index];
                  const stock = stockByKey.get(key);
                  const availableNow = shipmentCheck.availableFor(key);
                  const exceeds = shipmentCheck.exceeds[index];
                  const unitName = unitNameFor(line);

                  return (
                    <div
                      key={line.uid}
                      className={`overflow-hidden rounded-xl border bg-background ${
                        exceeds
                          ? "border-red-400 dark:border-red-700"
                          : "border-border"
                      }`}
                    >
                      <div className="flex items-center justify-between border-b border-border/60 bg-muted/40 px-3 py-2">
                        <p className="inline-flex items-center gap-2 text-sm font-semibold">
                          <Package className="size-4 text-emerald-700 dark:text-emerald-300" />
                          Producto {index + 1}
                        </p>

                        <button
                          type="button"
                          onClick={() => requestRemoveLine(index)}
                          aria-label={`Quitar producto ${index + 1}`}
                          className="rounded-lg p-1.5 text-red-600 transition hover:bg-red-50 dark:hover:bg-red-950/30"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>

                      <div className="grid gap-3 p-3">
                        <label className="grid gap-1 text-xs font-medium">
                          Cultivo
                          <select
                            required
                            value={line.cropId}
                            onChange={(event) => {
                              const nextCrop = crops.find(
                                (item) => item.id === event.target.value,
                              );

                              updateShipmentLine(index, {
                                cropId: event.target.value,
                                varietyId: "",
                                productionAreaId: "",
                                unitId: nextCrop?.unit?.id || "",
                              });
                            }}
                            className={inputCls}
                          >
                            <option value="">Seleccionar cultivo</option>
                            {crops.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name}
                              </option>
                            ))}
                          </select>
                        </label>

                        {((crop?.varieties?.length ?? 0) > 0 || line.varietyId ||
                          (crop?.productionAreas?.length ?? 0) > 0 || line.productionAreaId) && (
                          <div className="grid gap-3 sm:grid-cols-2">
                            {((crop?.varieties?.length ?? 0) > 0 || line.varietyId) && (
                              <label className="grid gap-1 text-xs font-medium">
                                Variedad
                                <select
                                  value={line.varietyId}
                                  onChange={(event) =>
                                    updateShipmentLine(index, {
                                      varietyId: event.target.value,
                                    })
                                  }
                                  className={inputCls}
                                >
                                  <option value="">Sin especificar</option>
                                  {line.varietyId && !crop?.varieties?.some((item) => item.id === line.varietyId) && (
                                    <option value={line.varietyId}>{stock?.varietyName ?? 'Variedad registrada'}</option>
                                  )}
                                  {crop?.varieties?.map((item) => (
                                    <option key={item.id} value={item.id}>
                                      {item.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            )}

                            {((crop?.productionAreas?.length ?? 0) > 0 || line.productionAreaId) && (
                              <label className="grid gap-1 text-xs font-medium">
                                Lote o zona
                                <select
                                  value={line.productionAreaId}
                                  onChange={(event) =>
                                    updateShipmentLine(index, {
                                      productionAreaId: event.target.value,
                                    })
                                  }
                                  className={inputCls}
                                >
                                  <option value="">Sin especificar</option>
                                  {line.productionAreaId && !crop?.productionAreas?.some((item) => item.id === line.productionAreaId) && (
                                    <option value={line.productionAreaId}>{stock?.productionAreaName ?? 'Área registrada'}</option>
                                  )}
                                  {crop?.productionAreas?.map((item) => (
                                    <option key={item.id} value={item.id}>
                                      {item.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            )}
                          </div>
                        )}

                        <div className="grid gap-3 sm:grid-cols-3">
                          <label className="grid gap-1 text-xs font-medium">
                            Unidad
                            <select
                              required
                              value={lineUnitId(line)}
                              onChange={(event) =>
                                updateShipmentLine(index, {
                                  unitId: event.target.value,
                                })
                              }
                              className={inputCls}
                            >
                              <option value="">Unidad</option>
                              {units.map((unit) => (
                                <option key={unit.id} value={unit.id}>
                                  {unit.name}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="grid gap-1 text-xs font-medium">
                            Cantidad
                            <input
                              required
                              min="0.01"
                              step="0.01"
                              type="number"
                              value={line.quantity}
                              onChange={(event) =>
                                updateShipmentLine(index, {
                                  quantity: event.target.value,
                                })
                              }
                              className={`${inputCls} ${
                                exceeds
                                  ? "border-red-500 focus:border-red-500 focus:ring-red-500/20"
                                  : ""
                              }`}
                            />
                          </label>

                          <label className="grid gap-1 text-xs font-medium">
                            Precio unit. (USD)
                            <input
                              required
                              min="0.01"
                              step="0.01"
                              type="number"
                              value={line.unitPrice}
                              onChange={(event) =>
                                updateShipmentLine(index, {
                                  unitPrice: event.target.value,
                                })
                              }
                              className={inputCls}
                            />
                          </label>
                        </div>

                        {line.cropId && (
                          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3 text-xs">
                            {availabilityLoading ? (
                              <span className="text-muted-foreground">
                                Cargando existencias…
                              </span>
                            ) : exceeds ? (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 font-medium text-red-700 dark:bg-red-950/30 dark:text-red-300">
                                <TriangleAlert className="size-3.5" />
                                Supera las existencias ({availableNow.toFixed(2)}{" "}
                                {unitName})
                              </span>
                            ) : !stock && availableNow <= 0 ? (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                                <Info className="size-3.5" />
                                Sin existencias para esta combinación
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                                <CheckCircle2 className="size-3.5" />
                                Disponible: {availableNow.toFixed(2)} {unitName}
                              </span>
                            )}

                            <span className="text-muted-foreground">
                              Subtotal:{" "}
                              <strong className="text-foreground">
                                {formatAmount(
                                  Number(line.quantity || 0) *
                                    Number(line.unitPrice || 0),
                                )}
                              </strong>
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* 3. Total y observaciones generales */}
                <SectionTitle step={3} title="Total y observaciones" />

                <div className="flex items-end justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/30">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Total estimado del envío
                    </p>
                    <p className="mt-1 text-2xl font-semibold text-emerald-900 dark:text-emerald-200">
                      {formatAmount(totalShipment)}
                    </p>
                  </div>
                  <p className="rounded-full bg-white px-3 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                    {shipmentLines.filter((line) => line.cropId).length}{" "}
                    producto(s)
                  </p>
                </div>

                <Field label="Observaciones generales del envío">
                  <textarea
                    name="notes"
                    maxLength={2000}
                    rows={2}
                    value={shipmentNotes}
                    onChange={(event) => setShipmentNotes(event.target.value)}
                    className={inputCls}
                  />
                </Field>
              </>
            )}
          </div>

          {isShipments && !shipmentCheck.canSubmit && !availabilityLoading && (
            <p
              className={`mt-4 flex items-center gap-2 rounded-xl px-3 py-2 text-xs ${
                shipmentCheck.hasStockError
                  ? "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {shipmentCheck.hasStockError ? (
                <TriangleAlert className="size-4 shrink-0" />
              ) : (
                <Info className="size-4 shrink-0" />
              )}
              {shipmentCheck.hasStockError
                ? "Ajusta las cantidades que superan las existencias."
                : "Completa cultivo, cantidad y precio de cada producto."}
            </p>
          )}

          <button
            type="submit"
            disabled={saving || Boolean(cropsError || unitsError || harvestOptionsError) || (isShipments && !shipmentCheck.canSubmit)}
            className={`${btnPrimary} mt-5 w-full`}
          >
            {saving && <Loader2 className="size-4 animate-spin" />}
            {saving ? "Guardando…" : editingRecord ? 'Revisar y guardar cambios' : view.cta}
          </button>

        </div>
      </form>

      {/* ─────────── Historial ─────────── */}
      <section className={`${card} overflow-hidden`}>
        <header className="flex items-center justify-between gap-3 border-b border-border/60 bg-emerald-50/50 p-5 dark:bg-emerald-950/20">
          <div className="flex items-center gap-3">
            <IconBadge icon={ViewIcon} />
            <div>
              <h3 className="text-lg font-semibold leading-tight">
                {view.history}
              </h3>
              <p className="text-xs text-muted-foreground">
                {rowsLoading
                  ? "Cargando…"
                  : `Página ${page} · ${visibleRows.length} registro(s)`}
              </p>
            </div>
          </div>

          {hasFilters && (
            <button type="button" onClick={clearFilters} className={btnSmall}>
              <X className="size-3.5" />
              Limpiar filtros
            </button>
          )}
        </header>

        <div className="p-5">
          <div className={`${innerBox} grid gap-3 p-3`}>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                Desde
                <input
                  type="date"
                  value={from}
                  onChange={(event) => { setPage(1); setFrom(event.target.value); }}
                  className={`${inputCls} text-foreground`}
                />
              </label>

              <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                Hasta
                <input
                  type="date"
                  value={to}
                  min={from || undefined}
                  onChange={(event) => { setPage(1); setTo(event.target.value); }}
                  className={`${inputCls} text-foreground`}
                />
              </label>
            </div>

            {isHarvests && (
              <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                Filtrar por cultivo
                <select
                  value={filterCropId}
                  onChange={(event) => { setPage(1); setFilterCropId(event.target.value); }}
                  className={`${inputCls} text-foreground`}
                >
                  <option value="">Todos los cultivos</option>
                  {crops.map((crop) => (
                    <option key={crop.id} value={crop.id}>
                      {crop.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                aria-label="Buscar registros"
                value={search}
                maxLength={120}
                onChange={(event) => { setPage(1); setSearch(event.target.value); }}
                placeholder="Buscar en el historial"
                className={`${inputCls} pl-9`}
              />
            </div>
          </div>

          {loadError && (
            <p role="alert" className="mt-4 flex items-center gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
              <TriangleAlert className="size-4 shrink-0" />
              {loadError.message}
              <button type="button" className="ml-auto underline" onClick={() => void mutate()}>Reintentar</button>
            </p>
          )}

          <div className="mt-5 grid gap-3">
            {rowsLoading ? (
              [0, 1, 2].map((n) => (
                <div
                  key={n}
                  className="h-28 animate-pulse rounded-xl bg-muted"
                />
              ))
            ) : loadError ? null : visibleRows.length > 0 ? (
              visibleRows.map((row) => (
                <HistoryCard
                  key={row.id}
                  row={row}
                  active={isLosses ? "mermas" : active}
                  isBeingEdited={row.id === (isShipments ? editingShipmentId : editingRecord?.id)}
                  onEdit={() => isShipments ? editShipment(row) : editRecord(row)}
                  onCancel={
                    isShipments ? () => setShipmentToCancel(row) : undefined
                  }
                  onDelete={!isShipments ? () => setRecordToDelete(row) : undefined}
                  onLogLoss={isHarvests && !isLosses ? () => logLossFor(row) : undefined}
                />
              ))
            ) : (
              <div className="flex min-h-56 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border px-5 text-center">
                <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Inbox className="size-6" />
                </span>
                <div>
                  <p className="text-sm font-semibold">
                    {hasFilters
                      ? "Ningún registro coincide con los filtros"
                      : "Aún no hay registros"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {hasFilters
                      ? "Prueba con otras fechas o limpia los filtros."
                      : "Cuando guardes el primero, aparecerá aquí."}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
          {(page > 1 || history?.hasNext) && (
            <nav aria-label="Páginas del historial" className="flex items-center justify-between gap-2 px-5 pb-5">
              <button type="button" className={btnSmall} disabled={page <= 1 || rowsLoading} onClick={() => setPage(page - 1)}>Anterior</button>
              <button type="button" className={btnSmall} disabled={!history?.hasNext || rowsLoading} onClick={() => setPage(page + 1)}>Siguiente</button>
            </nav>
          )}
      </section>

      {/* ─────────── Confirmaciones ─────────── */}

      {/* Guardar cosecha / merma / costo */}
      <ConfirmDialog
        open={simpleConfirm !== null}
        title={view.confirmTitle}
        description="Revisa los datos antes de guardar el registro."
        confirmLabel="Sí, guardar"
        cancelLabel="Volver a modificar"
        loading={saving}
        onConfirm={confirmSimpleSave}
        onClose={() => setSimpleConfirm(null)}
      >
        {simpleConfirm && <SummaryList rows={simpleConfirm} />}
      </ConfirmDialog>

      {/* Confirmación de envío */}
      <ConfirmDialog
        open={confirmOpen}
        title={
          editingShipmentId ? "Confirmar cambios del envío" : "Confirmar envío"
        }
        description={
          editingShipmentId
            ? "Se actualizarán los productos y las existencias del envío."
            : "Se descontarán las existencias disponibles al registrarlo."
        }
        icon={Truck}
        confirmLabel={editingShipmentId ? "Guardar cambios" : "Confirmar envío"}
        cancelLabel="Volver a modificar"
        loading={saving}
        onConfirm={saveShipment}
        onClose={() => setConfirmOpen(false)}
      >
        <p className="flex items-center gap-2 text-muted-foreground">
          <CalendarDays className="size-4" />
          Fecha:{" "}
          <strong className="text-foreground">{formatDate(formDate)}</strong>
        </p>

        <ul className="mt-3 grid gap-2">
          {shipmentLines.map((line) => {
            const crop = crops.find((item) => item.id === line.cropId);
            const variety = crop?.varieties?.find(
              (item) => item.id === line.varietyId,
            )?.name;
            const area = crop?.productionAreas?.find(
              (item) => item.id === line.productionAreaId,
            )?.name;
            const subtotal = shipmentSubtotal(line);

            return (
              <li
                key={line.uid}
                className="rounded-lg border border-border/60 bg-background px-3 py-2"
              >
                <div className="flex justify-between gap-3">
                  <span className="font-medium">
                    {crop?.name ?? "Cultivo"}
                    {variety ? ` · ${variety}` : ""}
                  </span>
                  <strong className="whitespace-nowrap">
                    {Number(line.quantity).toFixed(2)} {unitNameFor(line)}
                  </strong>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {area ?? "Sin lote o zona"} · {formatAmount(line.unitPrice)} ={" "}
                  {formatAmount(subtotal)}
                </p>
              </li>
            );
          })}
        </ul>

        <div className="mt-3 flex justify-between rounded-lg bg-emerald-50 px-3 py-2.5 dark:bg-emerald-950/30">
          <span className="text-muted-foreground">Total estimado</span>
          <strong className="text-emerald-900 dark:text-emerald-200">
            {formatAmount(totalShipment)}
          </strong>
        </div>

        {shipmentNotes.trim() && (
          <p className="mt-3 text-xs text-muted-foreground">
            Observaciones: {shipmentNotes}
          </p>
        )}
      </ConfirmDialog>

      {/* Cancelar envío registrado */}
      <ConfirmDialog
        open={shipmentToCancel !== null}
        title="Cancelar envío"
        description="Esta acción no se puede deshacer."
        icon={Ban}
        confirmLabel="Sí, cancelar envío"
        cancelLabel="Volver"
        tone="danger"
        loading={cancelling}
        onConfirm={cancelShipment}
        onClose={() => setShipmentToCancel(null)}
      >
        <p>
          ¿Seguro que quieres cancelar el envío{" "}
          <strong>{shipmentToCancel?.code || ""}</strong>? Solo es posible
          mientras no tenga recepciones registradas. Las existencias vuelven a
          quedar disponibles.
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={recordToDelete !== null}
        title={isLosses ? 'Eliminar merma' : isHarvests ? 'Eliminar cosecha' : 'Eliminar costo'}
        description={isHarvests && !isLosses ? 'La cosecha y sus mermas asociadas se enviarán a la papelera.' : 'El registro se enviará a la papelera.'}
        icon={Trash2}
        confirmLabel="Sí, eliminar"
        tone="danger"
        loading={deletingRecord}
        onConfirm={deleteRecord}
        onClose={() => setRecordToDelete(null)}
      >
        {recordToDelete && (
          <SummaryList
            rows={[
              {
                label: "Registro",
                value: recordToDelete.harvest?.crop?.name || recordToDelete.crop?.name || recordToDelete.description || 'Registro',
              },
              { label: "Fecha", value: formatDate(recordToDelete.date) },
            ]}
          />
        )}
      </ConfirmDialog>

      {/* Descartar edición */}
      <ConfirmDialog
        open={discardOpen}
        title="Cancelar edición"
        description="Los cambios que hiciste no se guardarán."
        tone="warning"
        confirmLabel="Sí, descartar cambios"
        cancelLabel="Seguir editando"
        onConfirm={() => {
          if (isShipments) resetShipmentForm();
          else resetRecordForm();
          setMessage(null);
          setDiscardOpen(false);
        }}
        onClose={() => setDiscardOpen(false)}
      />

      {/* Reemplazar productos con "Preparar todo" */}
      <ConfirmDialog
        open={prepareOpen}
        title="Reemplazar productos"
        description="Se reemplazarán los productos del envío con todas las existencias y sus precios estimados."
        tone="warning"
        icon={Package}
        confirmLabel="Sí, reemplazar"
        onConfirm={() => prepareAllAvailableHarvests(true)}
        onClose={() => setPrepareOpen(false)}
      />

      {/* Quitar un producto con datos */}
      <ConfirmDialog
        open={lineToRemove !== null}
        title="Quitar producto"
        description={
          lineToRemove !== null
            ? `Se quitará el producto ${lineToRemove + 1} del envío con los datos que ya escribiste.`
            : undefined
        }
        tone="danger"
        icon={Trash2}
        confirmLabel="Sí, quitar"
        onConfirm={() => {
          if (lineToRemove !== null) removeShipmentLine(lineToRemove);
          setLineToRemove(null);
        }}
        onClose={() => setLineToRemove(null)}
      />
    </div>
  );
}

/* ───────────────────── Tarjetas del historial ───────────────────── */

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "danger" | "success";
}) {
  const tones = {
    default: "bg-muted/50",
    danger: "bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-200",
    success:
      "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200",
  };

  return (
    <div className={`rounded-lg px-3 py-2 ${tones[tone]}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-semibold">{value}</p>
    </div>
  );
}

function Chip({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "danger" | "warning";
}) {
  const tones = {
    neutral: "bg-muted text-muted-foreground",
    success:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
    danger: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    warning:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

function CardShell({
  icon,
  iconClass,
  title,
  subtitle,
  date,
  badge,
  highlighted = false,
  children,
}: {
  icon: ElementType;
  iconClass?: string;
  title: string;
  subtitle?: string;
  date?: string;
  badge?: ReactNode;
  highlighted?: boolean;
  children: ReactNode;
}) {
  return (
    <article
      className={`rounded-xl border bg-background p-4 text-sm shadow-sm transition ${
        highlighted
          ? "border-emerald-600 ring-2 ring-emerald-600/20"
          : "border-border/70 hover:border-emerald-600/40"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <IconBadge icon={icon} className={iconClass} />
          <div className="min-w-0">
            <p className="truncate font-semibold">{title}</p>
            {subtitle && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          {date && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <CalendarDays className="size-3.5" />
              {formatDate(date)}
            </span>
          )}
          {badge}
        </div>
      </div>

      <div className="mt-3">{children}</div>
    </article>
  );
}

function HistoryCard({
  row,
  active,
  isBeingEdited = false,
  onDelete,
  onEdit,
  onCancel,
  onLogLoss,
}: {
  row: HistoryRow;
  active: string;
  isBeingEdited?: boolean;
  onDelete?: () => void;
  onEdit?: () => void;
  onCancel?: () => void;
  onLogLoss?: () => void;
}) {
  const actions = (onEdit || onDelete || onLogLoss) && (
    <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-border/70 pt-3">
      {onLogLoss && <button type="button" onClick={onLogLoss} className={btnSmall}><Plus className="size-3.5" /> Registrar merma</button>}
      {onEdit && <button type="button" onClick={onEdit} className={btnSmall}><Pencil className="size-3.5" /> Editar</button>}
      {onDelete && <button type="button" onClick={onDelete} className={`${btnSmall} text-red-700 dark:text-red-300`}><Trash2 className="size-3.5" /> Eliminar</button>}
    </div>
  );

  if (active === "mermas") {
    const harvest = row.harvest;
    const unit = harvest?.unit?.name || "";

    return (
      <CardShell
        icon={TrendingDown}
        iconClass="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
        title={harvest?.crop?.name || "Cultivo"}
        subtitle={`${harvest?.variety?.name ? `${harvest.variety.name} · ` : ""}${
          harvest?.productionArea?.name || "Sin lote o zona"
        }`}
        date={row.date}
        highlighted={isBeingEdited}
      >
        <div className="grid grid-cols-2 gap-2">
          <Stat
            label="Cantidad perdida"
            value={`${Number(row.quantity || 0).toFixed(2)} ${unit}`}
            tone="danger"
          />
          <Stat label="Motivo" value={row.reason?.name || "Sin motivo"} />
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          {row.affectsHarvest === true ? (
            <Chip tone="warning">Descuenta producción útil</Chip>
          ) : row.affectsHarvest === false ? (
            <Chip>Solo registro estadístico</Chip>
          ) : (
            <Chip>Sin clasificar (registro anterior)</Chip>
          )}
          <span className="text-muted-foreground">
            Cosecha del {formatDate(harvest?.date)}
          </span>
        </div>

        {row.notes && (
          <p className="mt-3 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            {row.notes}
          </p>
        )}

        {actions}
      </CardShell>
    );
  }

  if (active === "cosechas") {
    const losses = row.losses || [];
    const unit = row.unit?.name || "";

    const lossTotal = losses.reduce(
      (sum, loss) => sum + Number(loss.quantity || 0),
      0,
    );

    const affectingLossTotal = losses
      .filter((loss) => loss.affectsHarvest === true)
      .reduce((sum, loss) => sum + Number(loss.quantity || 0), 0);

    const usefulProduction = Math.max(
      0,
      Number(row.quantity || 0) - affectingLossTotal,
    );

    return (
      <CardShell
        icon={Sprout}
        title={row.crop?.name || "Cultivo"}
        subtitle={`${row.variety?.name ? `${row.variety.name} · ` : ""}${
          row.productionArea?.name || "Sin lote o zona"
        }`}
        date={row.date}
        highlighted={isBeingEdited}
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat
            label="Cosechado"
            value={`${Number(row.quantity).toFixed(2)} ${unit}`}
          />
          <Stat
            label="Merma"
            value={`${lossTotal.toFixed(2)} ${unit}`}
            tone={lossTotal > 0 ? "danger" : "default"}
          />
          <div className="col-span-2 sm:col-span-1">
            <Stat
              label="Producción útil"
              value={`${usefulProduction.toFixed(2)} ${unit}`}
              tone="success"
            />
          </div>
        </div>

        {row.estimatedUnitPrice != null && (
          <p className="mt-3 text-xs text-muted-foreground">
            Precio estimado:{" "}
            <strong className="text-foreground">
              {formatAmount(row.estimatedUnitPrice)}
            </strong>{" "}
            por {row.unit?.name || "unidad"}
          </p>
        )}

        {losses.length > 0 && (
          <div className="mt-4 border-t border-border/70 pt-3">
            <p className="mb-2 text-xs font-semibold">
              Mermas asociadas ({losses.length})
            </p>
            <div className="grid gap-2">
              {losses.map((loss) => (
                <div
                  key={loss.id}
                  className="grid gap-1.5 rounded-lg border-l-4 border-red-300 bg-muted/40 px-3 py-2 text-xs dark:border-red-800"
                >
                  <div className="flex flex-wrap justify-between gap-2">
                    <span>
                      {loss.reason?.name || "Sin motivo"} ·{" "}
                      {formatDate(loss.date)}
                    </span>
                    <strong>
                      {Number(loss.quantity).toFixed(2)} {unit}
                    </strong>
                  </div>

                  <span>
                    {loss.affectsHarvest === true ? (
                      <Chip tone="warning">Descuenta producción útil</Chip>
                    ) : loss.affectsHarvest === false ? (
                      <Chip>No descuenta producción útil</Chip>
                    ) : (
                      <Chip>Sin clasificar (registro anterior)</Chip>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {row.notes && (
          <p className="mt-3 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            {row.notes}
          </p>
        )}
        {actions}
      </CardShell>
    );
  }

  if (active === "envios") {
    const items = row.items || [];
    const receptionsCount: number = row.receptions?.length ?? 0;
    const receipts = row.receptions?.flatMap((receipt) => receipt.receiptNumber === undefined ? [] : [receiptCode(receipt.receiptNumber)]) ?? [];
    const isCancelled = row.status === "CANCELLED";
    const canModify = editableShipmentStatuses.includes(row.status ?? '') && receptionsCount === 0;
    const receivedByItem = new Map<string, number>();
    for (const reception of row.receptions ?? []) {
      for (const item of reception.items ?? []) {
        receivedByItem.set(item.shipmentItemId, (receivedByItem.get(item.shipmentItemId) ?? 0) + Number(item.receivedQuantity));
      }
    }

    const total = items.reduce(
      (sum, item) =>
        sum +
        Number(
          item.estimatedTotalAmount ??
            Number(item.quantity || 0) * Number(item.estimatedUnitPrice || 0),
        ),
      0,
    );

    return (
      <CardShell
        icon={Truck}
        iconClass={
          isCancelled
            ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
            : undefined
        }
        title={row.code || "Envío"}
        subtitle={`${items.length} producto(s)`}
        date={row.date}
        highlighted={isBeingEdited}
        badge={
          <Chip tone={isCancelled ? "danger" : row.status === 'RECEIVED' ? 'success' : 'warning'}>
            {shipmentStatusLabels[row.status ?? ''] ?? 'Registrado'}
          </Chip>
        }
      >
        <div className="grid gap-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2"
            >
              <div className="flex flex-wrap justify-between gap-2">
                <span className="min-w-0 break-words font-medium">
                  {item.crop?.name || "Cultivo"}
                  {item.variety?.name ? ` · ${item.variety.name}` : ""}
                </span>
                <strong className="whitespace-nowrap">
                  {Number(item.quantity).toFixed(2)} {item.unit?.name || ""}
                </strong>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {item.productionArea?.name || "Sin lote"} · Precio:{" "}
                {item.estimatedUnitPrice == null ? 'Sin estimar' : formatAmount(item.estimatedUnitPrice)}
              </p>
              {receptionsCount > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Recibido {Number(receivedByItem.get(item.id) ?? 0).toFixed(2)} · Pendiente {Math.max(0, Number(item.quantity) - (receivedByItem.get(item.id) ?? 0)).toFixed(2)} {item.unit?.name}
                </p>
              )}
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2.5 dark:bg-emerald-950/30">
          <span className="text-xs text-muted-foreground">Total estimado</span>
          <strong className="text-emerald-900 dark:text-emerald-200">
            {formatAmount(total)}
          </strong>
        </div>

        {receptionsCount > 0 && (
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            {receptionsCount === 1 ? '1 recepción registrada' : `${receptionsCount} recepciones registradas`} en Agro Market{receipts.length ? ` · ${receipts.join(' · ')}` : ''}.
          </p>
        )}

        {row.notes && (
          <p className="mt-3 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            {row.notes}
          </p>
        )}

        {canModify && (onEdit || onCancel) && (
          <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-border/70 pt-3">
            {onEdit && (
              <button type="button" onClick={onEdit} className={btnSmall}>
                <Pencil className="size-3.5" />
                Editar envío
              </button>
            )}
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/30"
              >
                <Ban className="size-3.5" />
                Cancelar envío
              </button>
            )}
          </div>
        )}
      </CardShell>
    );
  }

  return (
    <CardShell
      icon={Wallet}
      title={row.description || "Costo"}
      subtitle={row.category?.name || "Sin categoría"}
      date={row.date}
      highlighted={isBeingEdited}
    >
      <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2.5">
        <span className="text-xs text-muted-foreground">Importe</span>
        <strong className="text-base">{formatAmount(row.amountUsd)}</strong>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {row.allocations?.length ? row.allocations.map((item) => item.crop?.name ?? 'Cultivo').join(' · ') : row.applicationType === 'CROP' ? 'Cultivo sin asignar' : 'Costo general'}
      </p>
      {row.notes && (
        <p className="mt-3 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {row.notes}
        </p>
      )}
      {actions}
    </CardShell>
  );
}

/* ───────────────────── Resumen de producción ───────────────────── */

type Summary = {
  harvests: { _count: number };
  losses: { _count: number };
  costs: { _sum: { amountUsd: string | null } };
  shipments: { _count: number; pending: number; received: number };
  units: { unitId: string; unitName: string; harvested: string; losses: string; useful: string; shipped: string }[];
};

const quantityFormat = new Intl.NumberFormat('es-EC', { maximumFractionDigits: 2 });

export function ProductionSummary() {
  const { data, error, mutate } = useSWR<Summary>("/api/production-summary", fetcher);
  const cards = [
    { label: "Cosechas", value: data?.harvests._count, icon: Sprout, note: "Cosechas registradas" },
    { label: "Mermas", value: data?.losses._count, icon: TrendingDown, note: "Mermas registradas" },
    { label: "Costos", value: data ? formatAmount(data.costs._sum.amountUsd) : undefined, icon: Wallet, note: "Gastos registrados" },
    {
      label: "Envíos vigentes", value: data?.shipments._count, icon: Truck,
      note: data ? `${data.shipments.pending} pendientes de recepción · ${data.shipments.received} recibidos` : undefined,
    },
  ];

  return (
    <section className="grid gap-5" aria-busy={!data && !error}>
      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
          <TriangleAlert className="size-4 shrink-0" />
          {error.message}
          <button type="button" className="ml-auto underline" onClick={() => void mutate()}>Reintentar</button>
        </div>
      )}

      {(data || !error) && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map(({ label, value, icon, note }) => (
            <div key={label} className={`${card} p-5`}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-muted-foreground">{label}</p>
                <IconBadge icon={icon} />
              </div>
              {data ? (
                <>
                  <p className="mt-4 text-2xl font-semibold tabular-nums">{value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{note}</p>
                </>
              ) : (
                <div className="mt-4 h-8 w-20 animate-pulse rounded-md bg-muted" />
              )}
            </div>
          ))}
        </div>
      )}

      {data && (
        <section className={`${card} overflow-hidden`} aria-labelledby="production-unit-totals">
          <header className="flex items-center gap-3 border-b border-border/60 bg-emerald-50/50 p-5 dark:bg-emerald-950/20">
            <IconBadge icon={Package} />
            <div>
              <h3 id="production-unit-totals" className="text-lg font-semibold">Producción por unidad</h3>
              <p className="text-xs text-muted-foreground">La producción útil descuenta las mermas que afectan al inventario.</p>
            </div>
          </header>
          {data.units.length ? (
            <div className="overflow-x-auto" tabIndex={0} aria-label="Totales por unidad">
              <table className="w-full min-w-[540px] text-sm">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    {['Unidad', 'Cosechada', 'Mermas', 'Útil', 'Enviada'].map((label, index) => (
                      <th key={label} scope="col" className={`px-5 py-3 font-medium ${index ? 'text-right' : 'text-left'}`}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {data.units.map((unit) => (
                    <tr key={unit.unitId}>
                      <th scope="row" className="px-5 py-3 text-left font-medium">{unit.unitName}</th>
                      {[unit.harvested, unit.losses, unit.useful, unit.shipped].map((value, index) => (
                        <td key={index} className={`px-5 py-3 text-right tabular-nums ${index === 2 ? 'font-semibold text-emerald-800 dark:text-emerald-300' : ''}`}>
                          {quantityFormat.format(Number(value))}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="p-5 text-sm text-muted-foreground">Registra una cosecha para consultar los totales por unidad.</p>
          )}
        </section>
      )}
    </section>
  );
}
