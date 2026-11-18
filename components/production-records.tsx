"use client";

import useSWR from "swr";
import {
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
  varietyId: string | null;
  productionAreaId: string | null;
  unitId: string;
  unitName?: string;
  available: number | string;
};

type ShipmentLine = {
  uid: string;
  cropId: string;
  varietyId: string;
  productionAreaId: string;
  unitId: string;
  quantity: string;
  unitPrice: string;
};

type Message = {
  kind: "success" | "error";
  text: string;
};

type Tone = "primary" | "danger" | "warning";

/* ───────────────────── Sistema de estilos ─────────────────────
   Una sola paleta: verde (acción principal), ámbar (advertencia)
   y rojo (destructivo). Todo lo demás usa los tokens del tema. */

const card =
  "rounded-2xl border border-emerald-900/10 bg-white shadow-sm dark:border-emerald-100/10 dark:bg-zinc-900/60";

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

const fetcher = async (url: string) => {
  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "No se pudieron cargar los datos.");
  }

  return data;
};

function today() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

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

// Las fechas se guardan como día (medianoche UTC). Si se pasan por
// `new Date()` en Ecuador (UTC-5) se mostrarían un día antes.
function formatDate(value?: string) {
  if (!value) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  return new Date(value).toLocaleDateString("es-EC");
}

function formatAmount(value: unknown) {
  const amount = Number(value || 0);
  return `$${amount.toFixed(2)}`;
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
  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !loading) onClose();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, loading, onClose]);

  if (!open) return null;

  const style = toneStyles[tone];
  const Icon = icon ?? style.icon;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(event) => {
        if (event.target === event.currentTarget && !loading) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
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
    </div>
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
  const [originalQty, setOriginalQty] = useState<Record<string, number>>({});
  const [shipmentNotes, setShipmentNotes] = useState("");
  const [shipmentLines, setShipmentLines] = useState<ShipmentLine[]>(() => [
    emptyShipmentLine(),
  ]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [shipmentToCancel, setShipmentToCancel] = useState<any | null>(null);
  const [cancelling, setCancelling] = useState(false);

  // Confirmaciones adicionales
  const [discardOpen, setDiscardOpen] = useState(false);
  const [prepareOpen, setPrepareOpen] = useState(false);
  const [lineToRemove, setLineToRemove] = useState<number | null>(null);
  const [simpleConfirm, setSimpleConfirm] = useState<
    { label: string; value: string }[] | null
  >(null);

  const { data: crops = [] } = useSWR<Crop[]>("/api/crops", fetcher);
  const { data: units = [] } = useSWR<Unit[]>("/api/units", fetcher);
  const { data: harvestOptions = [] } = useSWR<any[]>(
    isLosses ? "/api/harvests" : null,
    fetcher,
  );
  const {
    data: shipmentAvailability = [],
    error: availabilityError,
    isLoading: availabilityLoading,
    mutate: mutateAvailability,
  } = useSWR<Availability[]>(
    isShipments ? "/api/shipments/availability" : null,
    fetcher,
  );

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [filterCropId, setFilterCropId] = useState("");
  const [search, setSearch] = useState("");

  const [cropId, setCropId] = useState("");
  const selectedCrop = crops.find((crop) => crop.id === cropId);
  const [unitId, setUnitId] = useState("");

  const [message, setMessage] = useState<Message | null>(null);
  const [saving, setSaving] = useState(false);
  const [lossToDelete, setLossToDelete] = useState<any | null>(null);
  const [deletingLoss, setDeletingLoss] = useState(false);

  // Los avisos se cierran solos
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(
      () => setMessage(null),
      message.kind === "error" ? 8000 : 5000,
    );
    return () => clearTimeout(timer);
  }, [message]);

  const endpoint = isHarvests
    ? isLosses
      ? "/api/losses"
      : `/api/harvests?${new URLSearchParams({
          ...(from ? { from } : {}),
          ...(to ? { to } : {}),
          ...(filterCropId ? { cropId: filterCropId } : {}),
        }).toString()}`
    : isShipments
      ? "/api/shipments"
      : isCosts
        ? "/api/costs"
        : null;

  const {
    data: rows = [],
    error: loadError,
    isLoading: rowsLoading,
    mutate,
  } = useSWR<any[]>(endpoint, fetcher);

  const visibleRows = useMemo(() => {
    return rows.filter((row) => {
      const textMatches = JSON.stringify(row)
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase());

      if (!textMatches) return false;

      if (!isHarvests || isLosses) {
        const rowDay = row.date ? String(row.date).slice(0, 10) : "";
        if (from && (!rowDay || rowDay < from)) return false;
        if (to && (!rowDay || rowDay > to)) return false;
      }

      if (isLosses && filterCropId) {
        if (row.harvest?.cropId !== filterCropId) {
          return false;
        }
      }

      return true;
    });
  }, [rows, search, from, to, isHarvests, isLosses, filterCropId]);

  const hasFilters = Boolean(from || to || search || filterCropId);

  function clearFilters() {
    setFrom("");
    setTo("");
    setSearch("");
    setFilterCropId("");
  }

  async function deleteLoss() {
    if (!lossToDelete) return;

    setDeletingLoss(true);

    try {
      const response = await fetch("/api/losses", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: lossToDelete.id }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo eliminar la merma.");
      }

      await mutate();
      setLossToDelete(null);
      setMessage({
        kind: "success",
        text: "Merma enviada a la papelera correctamente.",
      });
    } catch (error) {
      setLossToDelete(null);
      setMessage({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "No se pudo eliminar la merma.",
      });
    } finally {
      setDeletingLoss(false);
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
    const crop = crops.find((c) => c.id === item.cropId);
    const variety = crop?.varieties?.find(
      (v) => v.id === item.varietyId,
    )?.name;
    const area = crop?.productionAreas?.find(
      (a) => a.id === item.productionAreaId,
    )?.name;

    return {
      title: crop?.name ?? "Cultivo",
      detail: [variety, area].filter(Boolean).join(" · "),
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

    const availableFor = (key: string) =>
      Number(stockByKey.get(key)?.available ?? 0) + (originalQty[key] ?? 0);

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
        !availabilityLoading,
    };
  }, [shipmentLines, crops, stockByKey, originalQty, availabilityLoading]);

  const totalShipment = shipmentLines.reduce(
    (total, line) =>
      total + Number(line.quantity || 0) * Number(line.unitPrice || 0),
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

  function lineFromStock(item: Availability) {
    return emptyShipmentLine({
      cropId: item.cropId,
      varietyId: item.varietyId ?? "",
      productionAreaId: item.productionAreaId ?? "",
      unitId: item.unitId,
      quantity: String(item.available),
    });
  }

  function applyPrepareAll() {
    setShipmentLines(availableStock.map(lineFromStock));
    setPrepareOpen(false);
    setMessage({
      kind: "success",
      text: `Se cargaron ${availableStock.length} producto(s) con todas las existencias. Indica el precio de cada uno.`,
    });
  }

  function prepareAllAvailableHarvests() {
    if (availableStock.length === 0) {
      setMessage({
        kind: "error",
        text: "No hay existencias disponibles para preparar un envío.",
      });
      return;
    }

    // Si ya hay datos escritos, se pide confirmación antes de reemplazarlos
    if (shipmentLines.some(lineHasData)) {
      setPrepareOpen(true);
      return;
    }

    applyPrepareAll();
  }

  function addStockLine(item: Availability) {
    const key = stockKey(
      item.cropId,
      item.varietyId,
      item.productionAreaId,
      item.unitId,
    );

    setShipmentLines((current) => {
      const base = current.filter((line) => line.cropId);
      if (base.some((line) => keyOf(line) === key)) return current;
      return [...base, lineFromStock(item)];
    });
    setMessage(null);
  }

  function resetShipmentForm() {
    setEditingShipmentId(null);
    setEditingCode("");
    setOriginalQty({});
    setFormDate(today());
    setShipmentNotes("");
    setShipmentLines([emptyShipmentLine()]);
  }

  function editShipment(row: any) {
    const lines: ShipmentLine[] = (row.items || []).map((item: any) =>
      emptyShipmentLine({
        cropId: item.cropId,
        varietyId: item.varietyId || "",
        productionAreaId: item.productionAreaId || "",
        unitId: item.unitId || item.unit?.id || "",
        quantity: String(item.quantity),
        unitPrice: String(item.estimatedUnitPrice ?? ""),
      }),
    );

    const original: Record<string, number> = {};
    for (const line of lines) {
      const key = keyOf(line);
      original[key] = (original[key] ?? 0) + Number(line.quantity || 0);
    }

    setEditingShipmentId(row.id);
    setEditingCode(row.code || "");
    setOriginalQty(original);
    setFormDate(String(row.date).slice(0, 10));
    setShipmentNotes(row.notes || "");
    setShipmentLines(lines.length > 0 ? lines : [emptyShipmentLine()]);
    setMessage(null);

    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function saveShipment() {
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
      }));

      const response = await fetch(
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

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo guardar el envío.");
      }

      setConfirmOpen(false);
      resetShipmentForm();
      setMessage({
        kind: "success",
        text: wasEditing
          ? "Envío actualizado correctamente."
          : `Envío ${data.code || ""} registrado correctamente.`,
      });

      await Promise.all([mutate(), mutateAvailability()]);
    } catch (error) {
      setConfirmOpen(false);
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
    if (!shipmentToCancel) return;

    setCancelling(true);

    try {
      // ⚠ PENDIENTE DE CONFIRMAR: endpoint/método real de cancelación.
      const response = await fetch(`/api/shipments/${shipmentToCancel.id}`, {
        method: "DELETE",
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "No se pudo cancelar el envío.");
      }

      if (editingShipmentId === shipmentToCancel.id) resetShipmentForm();

      setShipmentToCancel(null);
      setMessage({ kind: "success", text: "Envío cancelado correctamente." });
      await Promise.all([mutate(), mutateAvailability()]);
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

  async function submitHarvest(form: HTMLFormElement) {
    const formData = new FormData(form);
    const payload: Record<string, unknown> = Object.fromEntries(
      formData.entries(),
    );

    payload.cropId = cropId;
    payload.unitId = unitId || selectedCrop?.unit?.id;

    return fetch("/api/harvests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  async function submitLoss(form: HTMLFormElement) {
    const formData = new FormData(form);
    const affectsHarvestValue = formData.get("affectsHarvest");

    const payload = {
      date: formData.get("date"),
      harvestId: formData.get("harvestId"),
      quantity: formData.get("quantity"),
      reason: formData.get("reason"),
      notes: formData.get("notes"),
      affectsHarvest:
        affectsHarvestValue === null ? null : affectsHarvestValue === "true",
    };

    return fetch("/api/losses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  async function submitCost(form: HTMLFormElement) {
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());

    return fetch("/api/costs", {
      method: "POST",
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
    if (!form) return;

    setSaving(true);
    setMessage(null);

    try {
      const response = isLosses
        ? await submitLoss(form)
        : isHarvests
          ? await submitHarvest(form)
          : await submitCost(form);

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo guardar el registro.");
      }

      setSimpleConfirm(null);
      setMessage({
        kind: "success",
        text: isLosses
          ? "Merma registrada correctamente."
          : isHarvests
            ? "Cosecha registrada correctamente."
            : "Costo registrado correctamente.",
      });

      form.reset();
      setCropId("");
      setUnitId("");
      setFormDate(today());

      await mutate();
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
          role="tablist"
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
              role="tab"
              aria-selected={harvestView === id}
              onClick={() => setHarvestView(id)}
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
        ref={formRef}
        onSubmit={submit}
        className={`${card} scroll-mt-24 overflow-hidden`}
      >
        <header className="flex items-center gap-3 border-b border-border/60 bg-emerald-50/50 p-5 dark:bg-emerald-950/20">
          <IconBadge icon={ViewIcon} />
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold leading-tight">
              {view.title}
            </h3>
            <p className="text-xs text-muted-foreground">{view.subtitle}</p>
          </div>
        </header>

        <div className="p-5">
          {isShipments && editingShipmentId && (
            <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300/70 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-200">
              <span className="inline-flex items-center gap-2">
                <Info className="size-4 shrink-0" />
                Estás modificando un envío ya registrado.
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
                <Field label="Cosecha asociada">
                  <select required name="harvestId" className={inputCls}>
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
                    placeholder="Ej. producto dañado"
                    className={inputCls}
                  />
                </Field>

                <Field label="Observaciones">
                  <textarea name="notes" rows={2} className={inputCls} />
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
                    {crops.map((crop) => (
                      <option key={crop.id} value={crop.id}>
                        {crop.name}
                      </option>
                    ))}
                  </select>
                </Field>

                {((selectedCrop?.varieties?.length ?? 0) > 0 ||
                  (selectedCrop?.productionAreas?.length ?? 0) > 0) && (
                  <div className={`${innerBox} grid gap-4 p-3`}>
                    {(selectedCrop?.varieties?.length ?? 0) > 0 && (
                      <Field label="Variedad">
                        <select name="varietyId" className={inputCls}>
                          <option value="">Sin especificar</option>
                          {selectedCrop?.varieties?.map((variety) => (
                            <option key={variety.id} value={variety.id}>
                              {variety.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                    )}

                    {(selectedCrop?.productionAreas?.length ?? 0) > 0 && (
                      <Field label="Lote o zona">
                        <select name="productionAreaId" className={inputCls}>
                          <option value="">Sin especificar</option>
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
                    placeholder="Opcional"
                    className={inputCls}
                  />
                </Field>

                <Field label="Observaciones de la cosecha">
                  <textarea name="notes" rows={2} className={inputCls} />
                </Field>
              </>
            )}

            {isCosts && (
              <>
                <Field label="Descripción del gasto">
                  <input
                    required
                    name="description"
                    placeholder="Ej. compra de fertilizantes"
                    className={inputCls}
                  />
                </Field>

                <Field label="Categoría">
                  <input
                    required
                    name="category"
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
                      className={inputCls}
                    />
                  </Field>

                  <Field label="Aplicación">
                    <select
                      name="applicationType"
                      defaultValue="GENERAL"
                      className={inputCls}
                    >
                      <option value="GENERAL">General</option>
                      <option value="CROP">Cultivo específico</option>
                    </select>
                  </Field>
                </div>

                <Field label="Observaciones">
                  <textarea name="notes" rows={2} className={inputCls} />
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
                        onClick={prepareAllAvailableHarvests}
                        disabled={availableStock.length === 0}
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
                                aria-label={`Agregar ${title} al envío`}
                                className="rounded-md border border-border p-1.5 transition hover:border-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
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

                        {((crop?.varieties?.length ?? 0) > 0 ||
                          (crop?.productionAreas?.length ?? 0) > 0) && (
                          <div className="grid gap-3 sm:grid-cols-2">
                            {(crop?.varieties?.length ?? 0) > 0 && (
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
                                  {crop?.varieties?.map((item) => (
                                    <option key={item.id} value={item.id}>
                                      {item.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            )}

                            {(crop?.productionAreas?.length ?? 0) > 0 && (
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
            disabled={saving || (isShipments && !shipmentCheck.canSubmit)}
            className={`${btnPrimary} mt-5 w-full`}
          >
            {saving && <Loader2 className="size-4 animate-spin" />}
            {saving ? "Guardando..." : view.cta}
          </button>

          {isShipments && editingShipmentId && (
            <button
              type="button"
              disabled={saving}
              onClick={() => setDiscardOpen(true)}
              className={`${btnOutline} mt-2 w-full`}
            >
              Cancelar edición
            </button>
          )}
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
                  : `${visibleRows.length} de ${rows.length} registro(s)`}
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
                  onChange={(event) => setFrom(event.target.value)}
                  className={`${inputCls} text-foreground`}
                />
              </label>

              <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                Hasta
                <input
                  type="date"
                  value={to}
                  min={from || undefined}
                  onChange={(event) => setTo(event.target.value)}
                  className={`${inputCls} text-foreground`}
                />
              </label>
            </div>

            {isHarvests && (
              <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                Filtrar por cultivo
                <select
                  value={filterCropId}
                  onChange={(event) => setFilterCropId(event.target.value)}
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
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar en el historial"
                className={`${inputCls} pl-9`}
              />
            </div>
          </div>

          {loadError && (
            <p className="mt-4 flex items-center gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
              <TriangleAlert className="size-4 shrink-0" />
              {loadError.message}
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
            ) : visibleRows.length > 0 ? (
              visibleRows.map((row) => (
                <HistoryCard
                  key={row.id}
                  row={row}
                  active={isLosses ? "mermas" : active}
                  isBeingEdited={isShipments && row.id === editingShipmentId}
                  onEdit={isShipments ? () => editShipment(row) : undefined}
                  onCancel={
                    isShipments ? () => setShipmentToCancel(row) : undefined
                  }
                  onDelete={isLosses ? () => setLossToDelete(row) : undefined}
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
            const subtotal =
              Number(line.quantity || 0) * Number(line.unitPrice || 0);

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

      {/* Eliminar merma */}
      <ConfirmDialog
        open={lossToDelete !== null}
        title="Eliminar merma"
        description="La merma se enviará a la papelera."
        icon={Trash2}
        confirmLabel="Sí, eliminar"
        tone="danger"
        loading={deletingLoss}
        onConfirm={deleteLoss}
        onClose={() => setLossToDelete(null)}
      >
        {lossToDelete && (
          <SummaryList
            rows={[
              {
                label: "Cultivo",
                value: lossToDelete.harvest?.crop?.name || "Cultivo",
              },
              { label: "Fecha", value: formatDate(lossToDelete.date) },
              {
                label: "Cantidad",
                value: `${Number(lossToDelete.quantity || 0).toFixed(2)} ${
                  lossToDelete.harvest?.unit?.name || ""
                }`.trim(),
              },
              {
                label: "Motivo",
                value: lossToDelete.reason?.name || "Sin motivo",
              },
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
          resetShipmentForm();
          setMessage(null);
          setDiscardOpen(false);
        }}
        onClose={() => setDiscardOpen(false)}
      />

      {/* Reemplazar productos con "Preparar todo" */}
      <ConfirmDialog
        open={prepareOpen}
        title="Reemplazar productos"
        description={`Se cargarán ${availableStock.length} producto(s) con todas las existencias y se reemplazará lo que ya escribiste.`}
        tone="warning"
        icon={Package}
        confirmLabel="Sí, reemplazar"
        onConfirm={applyPrepareAll}
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
}: {
  row: any;
  active: string;
  isBeingEdited?: boolean;
  onDelete?: () => void;
  onEdit?: () => void;
  onCancel?: () => void;
}) {
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

        {onDelete && (
          <div className="mt-3 flex justify-end border-t border-border/70 pt-3">
            <button
              type="button"
              onClick={onDelete}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/30"
            >
              <Trash2 className="size-3.5" />
              Eliminar merma
            </button>
          </div>
        )}
      </CardShell>
    );
  }

  if (active === "cosechas") {
    const losses = row.losses || [];
    const unit = row.unit?.name || "";

    const lossTotal = losses.reduce(
      (sum: number, loss: any) => sum + Number(loss.quantity || 0),
      0,
    );

    const affectingLossTotal = losses
      .filter((loss: any) => loss.affectsHarvest === true)
      .reduce((sum: number, loss: any) => sum + Number(loss.quantity || 0), 0);

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
              {losses.map((loss: any) => (
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
      </CardShell>
    );
  }

  if (active === "envios") {
    const items = row.items || [];
    const receptionsCount: number = row.receptions?.length ?? 0;
    const isCancelled = row.status === "CANCELLED";
    const canModify = !isCancelled && receptionsCount === 0;

    const total = items.reduce(
      (sum: number, item: any) =>
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
          <Chip tone={isCancelled ? "danger" : "success"}>
            {isCancelled ? "Cancelado" : row.status || "Registrado"}
          </Chip>
        }
      >
        <div className="grid gap-2">
          {items.map((item: any) => (
            <div
              key={item.id}
              className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2"
            >
              <div className="flex justify-between gap-3">
                <span className="font-medium">
                  {item.crop?.name || "Cultivo"}
                  {item.variety?.name ? ` · ${item.variety.name}` : ""}
                </span>
                <strong className="whitespace-nowrap">
                  {Number(item.quantity).toFixed(2)} {item.unit?.name || ""}
                </strong>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {item.productionArea?.name || "Sin lote"} · Precio:{" "}
                {formatAmount(item.estimatedUnitPrice)}
              </p>
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
            Recepciones registradas: {receptionsCount}. Este envío ya no puede
            editarse ni cancelarse.
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
    >
      <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2.5">
        <span className="text-xs text-muted-foreground">Importe</span>
        <strong className="text-base">{formatAmount(row.amountUsd)}</strong>
      </div>
      {row.notes && (
        <p className="mt-3 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {row.notes}
        </p>
      )}
    </CardShell>
  );
}

/* ───────────────────── Resumen de producción ───────────────────── */

export function ProductionSummary() {
  const { data, error } = useSWR<any>("/api/production-summary", fetcher);

  const cards: {
    label: string;
    value: string | number;
    icon: ElementType;
    tone: string;
  }[] = [
    {
      label: "Cosechas",
      value: data?.harvests?._count ?? 0,
      icon: Sprout,
      tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    },
    {
      label: "Producción útil",
      value: Number(data?.usefulProduction ?? 0).toFixed(2),
      icon: Package,
      tone: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
    },
    {
      label: "Mermas",
      value: data?.losses?._count ?? 0,
      icon: TrendingDown,
      tone: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    },
    {
      label: "Costos",
      value: formatAmount(data?.costs?._sum?.amountUsd),
      icon: Wallet,
      tone: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    },
    {
      label: "Envíos",
      value: data?.shipments?._count ?? 0,
      icon: Truck,
      tone: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
    },
  ];

  return (
    <section className="mt-8">
      {error && (
        <p className="mb-4 flex items-center gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
          <TriangleAlert className="size-4 shrink-0" />
          No se pudo cargar el resumen.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map(({ label, value, icon, tone }) => (
          <div key={label} className={`${card} p-5`}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-muted-foreground">
                {label}
              </p>
              <IconBadge icon={icon} className={tone} />
            </div>
            {data ? (
              <p className="mt-4 text-2xl font-semibold">{value}</p>
            ) : (
              <div className="mt-4 h-8 w-20 animate-pulse rounded-md bg-muted" />
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              {data ? "Datos confirmados en PostgreSQL" : "Cargando datos…"}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}