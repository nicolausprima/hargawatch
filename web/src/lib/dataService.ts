import { supabase } from "./supabase";

export interface CommodityPrice {
  id: string;
  komoditas_id?: number;
  category: string;
  tag: string;
  name: string;
  status: string;
  isCritical: boolean;
  isWarning: boolean;
  cheapestBadge: string;
  cheapestSub: string;
  marketName: string;
  marketSub: string;
  price: string;
  numericPrice?: number;
  unit: string;
  cityAvg: string;
  numericCityAvg?: number;
  delta: string;
  deltaIcon: string;
  deltaClass: string;
  sparkPath: string;
  sparkClass: string;
  basketItemName: string;
  basketItemPrice: number;
  savingBadge?: string;
  trend7d?: string;
  hasMarketAlert?: boolean;
  marketAlertNote?: string;
}

export interface EarlyWarningItem {
  komoditas_id: number;
  nama_komoditas: string;
  pasar_id: number;
  nama_pasar: string;
  total_skor: number;
  status_warning: "NORMAL" | "WASPADA" | "TINGGI" | "BELUM_TERSEDIA";
  skor_tren: number;
  skor_volatilitas: number;
  skor_anomali: number;
  skor_prediksi: number;
  harga_terakhir?: number;
  hasEwsData?: boolean;
}

export interface EarlyWarningStats {
  latestDate: string;
  formattedDate: string;
  totalRecords: number;
  highCount: number;
  warningCount: number;
  normalCount: number;
  stabilityPercentage: number;
  maxScore: number;
  overallStatus: "SIAGA" | "WASPADA" | "NORMAL";
  focusText: string;
  subtitle: string;
  anomaliesCount: number;
  criticalCommodities: string[];
  warningCommodities: string[];
}

export interface ForecastHistoryPoint {
  tanggal: string;
  formattedDate: string;
  harga: number;
  isImputed?: boolean;
}

export interface ForecastDayItem {
  horizon: number;
  tanggal: string;
  formattedDate: string;
  weekday: string;
  harga_prediksi: number;
  batas_bawah: number;
  batas_atas: number;
  deltaPct: number;
  deltaRp: number;
  status: "Normal" | "Waspada" | "Tinggi";
  recom: string;
}

export interface CommodityForecastDetails {
  komoditas_id: number;
  nama_komoditas: string;
  satuan: string;
  currentPrice: number;
  latestDate: string;
  formattedLatestDate: string;
  modelCreatedAt?: string;
  formattedModelCreatedAt?: string;
  history: ForecastHistoryPoint[];
  forecast: ForecastDayItem[];
  trendDirection: "naik" | "turun" | "stabil";
  trendPercentage: number;
  minForecast: number;
  maxForecast: number;
  peakDay?: string;
  peakPrice?: number;
}

export type TimeframeOption = "7d" | "14d" | "30d" | "3m" | "6m" | "1y";

export interface TimeframeConfigItem {
  id: TimeframeOption;
  label: string;
  days: number;
}

export const TIMEFRAME_CONFIG: TimeframeConfigItem[] = [
  { id: "7d", label: "7 Hari", days: 7 },
  { id: "14d", label: "14 Hari", days: 14 },
  { id: "30d", label: "30 Hari", days: 30 },
  { id: "3m", label: "3 Bulan", days: 90 },
  { id: "6m", label: "6 Bulan", days: 180 },
  { id: "1y", label: "1 Tahun", days: 365 },
];

export const TIMEFRAME_DAYS: Record<TimeframeOption, number> = {
  "7d": 7,
  "14d": 14,
  "30d": 30,
  "3m": 90,
  "6m": 180,
  "1y": 365,
};

export interface RawMarketPriceRow {
  tanggal: string;
  harga_asli?: number | null;
  harga_imputasi?: number | null;
  is_imputed?: boolean | null;
  pasar_id?: number | null;
}

export interface RawForecastRow {
  tanggal: string;
  pasar_id?: number | null;
  harga_prediksi?: number | null;
  batas_bawah?: number | null;
  batas_atas?: number | null;
}

export const FORECAST_COMMODITIES = [
  { id: 50, name: "Cabai Rawit Merah", unit: "kg" },
  { id: 39, name: "Bawang Merah", unit: "kg" },
  { id: 10, name: "Minyak Goreng Curah", unit: "kg" },
  { id: 2, name: "Beras Premium", unit: "kg" },
  { id: 13, name: "Daging Ayam Ras", unit: "kg" },
  { id: 16, name: "Telur Ayam Ras", unit: "kg" },
  { id: 7, name: "Gula Kristal Putih", unit: "kg" },
];

/**
 * Normalizes commodity names to consistent, uniform Title Case.
 * Eliminates uppercase/screaming entries (e.g. 'KACANG HIJAU' -> 'Kacang Hijau', 'WORTEL' -> 'Wortel').
 * Standardizes spelling to KBBI (e.g. 'Cabe' -> 'Cabai').
 */
export function formatCommodityName(name: string): string {
  if (!name) return "";
  const trimmed = name.trim();

  const overrides: Record<string, string> = {
    "KACANG HIJAU": "Kacang Hijau",
    "KACANG TANAH": "Kacang Tanah",
    "KETELA POHON": "Ketela Pohon",
    "KOL/KUBIS": "Kol / Kubis",
    "KOL / KUBIS": "Kol / Kubis",
    "KENTANG": "Kentang",
    "WORTEL": "Wortel",
    "BUNCIS": "Buncis",
    "Minyak Goreng MINYAKITA": "Minyak Goreng Minyakita",
    "MINYAK GORENG MINYAKITA": "Minyak Goreng Minyakita",
    "MINYAKITA": "Minyakita",
    "Bawang Putih Sinco/Honan": "Bawang Putih Sinco / Honan",
    "BAWANG PUTIH SINCO/HONAN": "Bawang Putih Sinco / Honan",
    "Terigu Protein Sedang (Kemasan)": "Terigu Protein Sedang (Kemasan)",
  };

  if (overrides[trimmed]) {
    return overrides[trimmed];
  }

  return trimmed
    .replace(/\bCabe\b/gi, "Cabai")
    .toLowerCase()
    .replace(/(^|[\s\/\(\)\-])([a-z])/g, (_, boundary, char) => boundary + char.toUpperCase())
    .replace(/\bMinyakita\b/gi, "Minyakita")
    .replace(/\bCabe\b/gi, "Cabai");
}

export interface FoodStabilitySummary {
  stabilityIndex: string;
  targetText: string;
  isNormal: boolean;
  statusLabel: string;
  normalCount: number;
  alertCount: number;
  alertNote: string;
  bannerTitle: string;
  bannerSubtitle: string;
  bannerMessage: string;
  hasAlert: boolean;
}

// 0. Fetch live Food Stability Summary from fact_early_warning
export async function getLiveStabilitySummary(): Promise<FoodStabilitySummary | null> {
  if (!supabase) return null;

  try {
    // 1. Dapatkan tanggal terbaru dari fact_early_warning
    const { data: latestDateRows } = await supabase
      .from("fact_early_warning")
      .select("tanggal")
      .order("tanggal", { ascending: false })
      .limit(1);

    const latestDate = latestDateRows && latestDateRows.length > 0 ? latestDateRows[0].tanggal : null;

    let ewsQuery = supabase.from("fact_early_warning").select("*").order("total_skor", { ascending: false });
    if (latestDate) {
      ewsQuery = ewsQuery.eq("tanggal", latestDate);
    }

    const [komRes, pasarRes, ewsRes] = await Promise.all([
      supabase.from("dim_komoditas").select("komoditas_id, nama_komoditas"),
      supabase.from("dim_pasar").select("pasar_id, nama_pasar"),
      ewsQuery
    ]);

    if (!ewsRes.data || ewsRes.data.length === 0) return null;

    const komMap = new Map(komRes.data?.map(k => [k.komoditas_id, formatCommodityName(k.nama_komoditas)]) || []);
    const pasarMap = new Map(pasarRes.data?.map(p => [p.pasar_id, p.nama_pasar]) || []);

    const total = ewsRes.data.length;
    const normalCount = ewsRes.data.filter(r => r.status_warning === "NORMAL").length;
    const warningItems = ewsRes.data.filter(r => r.status_warning !== "NORMAL");
    const alertCount = warningItems.length;
    const stabilityNum = total > 0 ? (normalCount / total) * 100 : 100;
    const stabilityPct = stabilityNum.toFixed(1);

    // Evaluasi status stabilitas kota secara proporsional terhadap target ketahanan kota (>90%)
    const isCityStable = stabilityNum >= 90;
    const isCityCritical = stabilityNum < 75;
    const statusLabel = isCityCritical
      ? "Kritis"
      : isCityStable
      ? "Terkendali"
      : "Waspada";

    if (alertCount > 0) {
      const top = warningItems[0];
      const komName = komMap.get(top.komoditas_id) || "Komoditas Pangan";
      const pasarName = pasarMap.get(top.pasar_id) || "Pasar Acuan";
      return {
        stabilityIndex: `${stabilityPct}%`,
        targetText: "Target Kota > 90%",
        isNormal: isCityStable,
        statusLabel,
        normalCount,
        alertCount,
        alertNote: `${alertCount} Dalam Pengawasan`,
        bannerTitle: isCityStable ? "Stabilitas Pangan Terkendali (Pengawasan Terfokus)" : "Waspada Fluktuasi Pasar",
        bannerSubtitle: "",
        bannerMessage: `Secara umum stabilitas pangan Surabaya berada dalam kondisi terkendali (${stabilityPct}% dari target >90%). Terdapat ${alertCount} titik pantau dalam pengawasan: ${komName} di ${pasarName} (skor risiko ${top.total_skor}/100). Satgas pangan terus memantau kelancaran pasokan.`,
        hasAlert: true,
      };
    } else {
      return {
        stabilityIndex: `${stabilityPct}%`,
        targetText: "Target Kota > 90%",
        isNormal: true,
        statusLabel: "Kondisi Stabil",
        normalCount,
        alertCount: 0,
        alertNote: "Semua Terkendali",
        bannerTitle: "Stabilitas Harga Pangan Terkendali",
        bannerSubtitle: "",
        bannerMessage: `Seluruh ${total} titik pantau komoditas strategis di pasar Surabaya berada dalam rentang harga normal tanpa indikasi lonjakan harga.`,
        hasAlert: false,
      };
    }
  } catch (err) {
    console.error("Failed to fetch stability summary:", err);
    return null;
  }
}

// 1. Fetch live commodity cards for Public Dashboard
export async function getLiveCommodities(): Promise<CommodityPrice[] | null> {
  if (!supabase) return null;

  try {
    const priorityIds = [2, 10, 50, 16, 39, 13, 7, 49]; // Beras, Minyak, Cabai, Telur, Bawang Merah, Ayam, Gula Pasir, Bawang Putih

    const [komRes, pasarRes, priceRes, ewsRes] = await Promise.all([
      supabase.from("dim_komoditas").select("komoditas_id, nama_komoditas, grup, satuan"),
      supabase.from("dim_pasar").select("pasar_id, nama_pasar"),
      supabase
        .from("fact_harga_pasar")
        .select("komoditas_id, pasar_id, harga_imputasi, tanggal")
        .in("komoditas_id", priorityIds)
        .not("harga_imputasi", "eq", "NaN")
        .order("tanggal", { ascending: false })
        .limit(500),
      supabase
        .from("fact_early_warning")
        .select("komoditas_id, pasar_id, total_skor, status_warning, tanggal")
        .in("komoditas_id", priorityIds)
        .order("tanggal", { ascending: false })
        .limit(150)
    ]);

    if (!komRes.data || !pasarRes.data || !priceRes.data || priceRes.data.length === 0) {
      return null;
    }

    const komMap = new Map(komRes.data.map(k => [k.komoditas_id, k]));
    const pasarMap = new Map(pasarRes.data.map(p => [p.pasar_id, p.nama_pasar]));

    // Tanggal terbaru transaksi
    const latestDate = priceRes.data[0].tanggal;
    const latestPrices = priceRes.data.filter(p => p.tanggal === latestDate && !isNaN(Number(p.harga_imputasi)));

    // EWS records untuk tanggal terbaru
    const latestEwsDate = ewsRes.data && ewsRes.data.length > 0 ? ewsRes.data[0].tanggal : null;
    const ewsList = latestEwsDate && ewsRes.data ? ewsRes.data.filter(e => e.tanggal === latestEwsDate) : [];

    const result: CommodityPrice[] = [];

    for (const cid of priorityIds) {
      const komMeta = komMap.get(cid);
      if (!komMeta) continue;

      const items = latestPrices.filter(p => p.komoditas_id === cid && Number(p.harga_imputasi) > 0);
      if (items.length === 0) continue;

      // Temukan pasar termurah di Surabaya
      items.sort((a, b) => Number(a.harga_imputasi) - Number(b.harga_imputasi));
      const cheapest = items[0];
      const cheapestPrice = Number(cheapest.harga_imputasi);
      const marketName = pasarMap.get(cheapest.pasar_id) || "Pasar Surabaya";

      // Rata-rata harga kota
      const sum = items.reduce((acc, curr) => acc + Number(curr.harga_imputasi), 0);
      const avg = Math.round(sum / items.length);

      // Selisih hemat terhadap rata-rata kota
      const diff = avg - cheapestPrice;
      const savingPct = avg > 0 ? Math.round((diff / avg) * 100) : 0;
      const savingBadge = diff > 0 ? `${savingPct}% lebih hemat` : "Sesuai rerata";

      // Evaluasi status EWS untuk komoditas ini lintas pasar (Harmonisasi Kontrak Sprint 2)
      const commodityEws = ewsList.filter(e => e.komoditas_id === cid);
      const alertMarkets = commodityEws.filter(e => e.status_warning !== "NORMAL");
      const hasMarketAlert = alertMarkets.length > 0;

      // Evaluasi tingkat risiko tertinggi komoditas di Kota Surabaya (Worst-case market risk)
      const isCritical = commodityEws.some(e => e.status_warning === "TINGGI");
      const isWarning = !isCritical && commodityEws.some(e => e.status_warning === "WASPADA");
      const status: "Tinggi" | "Waspada" | "Normal" = isCritical ? "Tinggi" : isWarning ? "Waspada" : "Normal";

      const alertMarketNames = alertMarkets.map(m => (pasarMap.get(m.pasar_id) || "Pasar").replace("Pasar ", "")).join(", ");
      const marketAlertNote = hasMarketAlert ? `Fluktuasi di ${alertMarkets.length} pasar lain (${alertMarketNames})` : undefined;

      // Hitung tren historis 7 hari sebenarnya untuk komoditas ini
      const cidAllRows = priceRes.data.filter(r => r.komoditas_id === cid && Number(r.harga_imputasi) > 0);
      const dateMap = new Map<string, number[]>();
      for (const r of cidAllRows) {
        if (!dateMap.has(r.tanggal)) dateMap.set(r.tanggal, []);
        dateMap.get(r.tanggal)!.push(Number(r.harga_imputasi));
      }
      const sortedDates = Array.from(dateMap.keys()).sort().slice(-7);
      const dayAvgs = sortedDates.map(d => {
        const vals = dateMap.get(d)!;
        return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
      });

      let trend7d = "Stabil";
      let deltaIcon = "horizontal_rule";
      let deltaClass = "text-status-normal";
      let sparkPath = "M0,16 L200,16";
      let sparkClass = "text-status-normal";

      if (dayAvgs.length > 1) {
        const oldestAvg = dayAvgs[0];
        const newestAvg = dayAvgs[dayAvgs.length - 1];
        const pctChange = oldestAvg > 0 ? ((newestAvg - oldestAvg) / oldestAvg) * 100 : 0;

        if (pctChange > 0.5) {
          trend7d = `+${pctChange.toFixed(1)}% (7 hari)`;
          deltaIcon = "trending_up";
          deltaClass = pctChange > 3 ? "text-status-critical" : "text-status-warning";
          sparkClass = pctChange > 3 ? "text-status-critical" : "text-status-warning";
        } else if (pctChange < -0.5) {
          trend7d = `${pctChange.toFixed(1)}% (7 hari)`;
          deltaIcon = "trending_down";
          deltaClass = "text-status-normal";
          sparkClass = "text-status-normal";
        } else {
          trend7d = "Stabil (7 hari)";
          deltaIcon = "horizontal_rule";
          deltaClass = "text-text-secondary";
          sparkClass = "text-text-muted";
        }

        const minVal = Math.min(...dayAvgs);
        const maxVal = Math.max(...dayAvgs);
        const range = maxVal - minVal;

        if (range > 0) {
          sparkPath = dayAvgs.map((v, i) => {
            const x = Math.round((i / (dayAvgs.length - 1)) * 200);
            const y = Math.round(28 - ((v - minVal) / range) * 24);
            return `${i === 0 ? "M" : "L"}${x},${y}`;
          }).join(" ");
        }
      }

      result.push({
        id: `kom_${cid}`,
        komoditas_id: cid,
        category: komMeta.grup || "Pangan Pokok",
        tag: komMeta.grup || "Pangan Strategis",
        name: formatCommodityName(komMeta.nama_komoditas),
        status,
        isCritical,
        isWarning,
        cheapestBadge: "Termurah di Surabaya",
        cheapestSub: diff > 0 ? `Hemat Rp ${diff.toLocaleString("id-ID")}/${komMeta.satuan || "kg"}` : "Harga Terkendali",
        marketName,
        marketSub: "Kota Surabaya",
        price: `Rp ${cheapestPrice.toLocaleString("id-ID")}`,
        numericPrice: cheapestPrice,
        unit: `/${komMeta.satuan || "kg"}`,
        cityAvg: `Rp ${avg.toLocaleString("id-ID")}`,
        numericCityAvg: avg,
        delta: savingBadge,
        deltaIcon,
        deltaClass,
        sparkPath,
        sparkClass,
        basketItemName: formatCommodityName(komMeta.nama_komoditas),
        basketItemPrice: cheapestPrice,
        savingBadge,
        trend7d,
        hasMarketAlert,
        marketAlertNote,
      });
    }

    return result.length > 0 ? result : null;
  } catch (err) {
    console.error("Failed to load live commodities from Supabase:", err);
    return null;
  }
}

// 2. Fetch live Early Warning Risk Matrix
export async function getLiveEarlyWarning(): Promise<{ items: EarlyWarningItem[]; stats: EarlyWarningStats } | null> {
  if (!supabase) return null;

  try {
    // 1. Dapatkan tanggal terbaru yang tersedia di fact_early_warning
    const { data: latestDateRows, error: dateErr } = await supabase
      .from("fact_early_warning")
      .select("tanggal")
      .order("tanggal", { ascending: false })
      .limit(1);

    if (dateErr || !latestDateRows || latestDateRows.length === 0) return null;

    const latestDate = latestDateRows[0].tanggal;

    // 2. Ambil data dimensi dan record EWS untuk tanggal terbaru tersebut
    const [komRes, pasarRes, ewsRes, hargaRes] = await Promise.all([
      supabase.from("dim_komoditas").select("komoditas_id, nama_komoditas"),
      supabase.from("dim_pasar").select("pasar_id, nama_pasar"),
      supabase
        .from("fact_early_warning")
        .select("*")
        .eq("tanggal", latestDate)
        .order("total_skor", { ascending: false }),
      supabase
        .from("fact_harga_pasar")
        .select("komoditas_id, pasar_id, harga_imputasi")
        .eq("tanggal", latestDate)
    ]);

    if (hargaRes.error || !hargaRes.data || hargaRes.data.length === 0) {
      console.warn("getLiveEarlyWarning: price records unavailable from fact_harga_pasar");
      return null;
    }

    if (ewsRes.error || !ewsRes.data || ewsRes.data.length === 0) {
      console.warn("getLiveEarlyWarning: ews records unavailable from fact_early_warning");
      return null;
    }

    const hargaMap = new Map<string, number>();
    if (hargaRes.data) {
      for (const h of hargaRes.data) {
        hargaMap.set(`${h.komoditas_id}_${h.pasar_id}`, Number(h.harga_imputasi));
      }
    }

    const ewsMap = new Map<string, Partial<EarlyWarningItem>>();
    if (ewsRes.data) {
      for (const e of ewsRes.data) {
        ewsMap.set(`${e.komoditas_id}_${e.pasar_id}`, e as Partial<EarlyWarningItem>);
      }
    }

    const items: EarlyWarningItem[] = [];
    const pasarList = pasarRes.data || [];
    const komList = komRes.data || [];

    for (const kom of komList) {
      for (const pas of pasarList) {
        const key = `${kom.komoditas_id}_${pas.pasar_id}`;
        const e = ewsMap.get(key);
        const harga = hargaMap.get(key);
        if (harga !== undefined || e !== undefined) {
          const hasEws = e !== undefined;
          items.push({
            komoditas_id: kom.komoditas_id,
            nama_komoditas: formatCommodityName(kom.nama_komoditas),
            pasar_id: pas.pasar_id,
            nama_pasar: pas.nama_pasar,
            total_skor: e?.total_skor || 0,
            status_warning: hasEws ? (e?.status_warning || "NORMAL") : "BELUM_TERSEDIA",
            skor_tren: e?.skor_tren || 0,
            skor_volatilitas: e?.skor_volatilitas || 0,
            skor_anomali: e?.skor_anomali || 0,
            skor_prediksi: e?.skor_prediksi || 0,
            harga_terakhir: harga !== undefined ? harga : e?.harga_terakhir,
            hasEwsData: hasEws,
          });
        }
      }
    }

    // Urutkan item berdasarkan total_skor tertinggi agar perankingan konsisten
    items.sort((a, b) => b.total_skor - a.total_skor);

    // Hanya evaluasi statistik stabilitas dari record yang benar-benar memiliki asesmen EWS (F-02 Fix)
    const evaluatedItems = items.filter(i => i.hasEwsData);
    if (evaluatedItems.length === 0) {
      console.warn("getLiveEarlyWarning: zero evaluated EWS items found");
      return null;
    }

    // Komoditas risiko TINGGI (skor >= 70 pada setidaknya satu pasar)
    const highRiskItems = evaluatedItems.filter(i => i.status_warning === "TINGGI");
    const highRiskCommodities = Array.from(new Set(highRiskItems.map(i => i.nama_komoditas)));

    // Komoditas WASPADA (skor 40-69, dan belum berstatus TINGGI)
    const warningItems = evaluatedItems.filter(i => i.status_warning === "WASPADA" && !highRiskCommodities.includes(i.nama_komoditas));
    const warningCommodities = Array.from(new Set(warningItems.map(i => i.nama_komoditas)));

    const highCount = highRiskCommodities.length;
    const warningCount = warningCommodities.length;
    const normalCount = evaluatedItems.filter(i => i.status_warning === "NORMAL").length;
    const totalRecords = evaluatedItems.length; // 208 record riil ter-evaluasi
    const stabilityPercentage = totalRecords > 0 ? Number(((normalCount / totalRecords) * 100).toFixed(1)) : 0;
    const anomaliesCount = evaluatedItems.filter(i => (i.skor_anomali || 0) > 0).length;

    // Format tanggal Indonesia: misal "10 Okt 2026"
    let formattedDate = latestDate;
    try {
      const d = new Date(latestDate);
      formattedDate = d.toLocaleDateString("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric"
      });
    } catch {
      formattedDate = latestDate;
    }

    let overallStatus: "SIAGA" | "WASPADA" | "NORMAL" = "NORMAL";
    let focusText = "Kondisi Terkendali di 6 Pasar";
    let subtitle = "Seluruh komoditas pokok di 6 pasar pantauan berada dalam rentang harga aman dan terkendali.";

    if (highCount > 0) {
      overallStatus = "SIAGA";
      focusText = `Fokus: ${highRiskCommodities.slice(0, 3).join(", ")}`;
      const topNames = highRiskCommodities.slice(0, 2).join(" & ");
      subtitle = `Terdeteksi lonjakan harga & risiko tinggi pada ${topNames}. Rekomendasi intervensi operasi pasar disiapkan.`;
    } else if (warningCount > 0) {
      overallStatus = "WASPADA";
      focusText = `Fokus: ${warningCommodities.slice(0, 3).join(", ")}`;
      const topNames = warningCommodities.slice(0, 2).join(" & ");
      subtitle = `Pantau pergerakan harga dan deviasi pasar untuk komoditas ${topNames}.`;
    }

    return {
      items,
      stats: {
        latestDate,
        formattedDate,
        totalRecords: items.length,
        highCount,
        warningCount,
        normalCount,
        stabilityPercentage,
        maxScore: items.length > 0 ? items[0].total_skor : 0,
        overallStatus,
        focusText,
        subtitle,
        anomaliesCount,
        criticalCommodities: highRiskCommodities,
        warningCommodities,
      }
    };
  } catch (err) {
    console.error("Failed to load live EWS data:", err);
    return null;
  }
}

// 3. Fetch comprehensive 14-day Forecasting & Historical Trajectory with dynamic timeframe
export async function getLiveForecastDetails(
  komoditasId: number = 50,
  timeframe: TimeframeOption = "14d"
): Promise<CommodityForecastDetails | null> {
  if (!supabase) return null;

  try {
    // 1. Ambil info komoditas
    const { data: komData } = await supabase
      .from("dim_komoditas")
      .select("komoditas_id, nama_komoditas, satuan")
      .eq("komoditas_id", komoditasId)
      .single();

    const matchedPreset = FORECAST_COMMODITIES.find((c) => c.id === komoditasId);
    const nama_komoditas = formatCommodityName(komData?.nama_komoditas || matchedPreset?.name || `Komoditas ${komoditasId}`);
    const satuan = komData?.satuan || matchedPreset?.unit || "kg";

    // 2. Ambil tanggal terbaru dari fact_harga_pasar
    const { data: latestDateRow, error: dateErr } = await supabase
      .from("fact_harga_pasar")
      .select("tanggal")
      .order("tanggal", { ascending: false })
      .limit(1);

    if (dateErr || !latestDateRow || latestDateRow.length === 0 || !latestDateRow[0]?.tanggal) {
      console.warn(`getLiveForecastDetails: latest date unavailable for commodity ${komoditasId}`);
      return null;
    }

    const latestDate = latestDateRow[0].tanggal;
    const targetDays = TIMEFRAME_DAYS[timeframe] || 14;

    // 3. Ambil data historis sesuai timeframe sebelum/pada latestDate
    let histData: RawMarketPriceRow[] = [];
    if (targetDays <= 120) {
      const fetchLimit = Math.max(100, targetDays * 7);
      const { data } = await supabase
        .from("fact_harga_pasar")
        .select("tanggal, harga_asli, harga_imputasi, is_imputed")
        .eq("komoditas_id", komoditasId)
        .lte("tanggal", latestDate)
        .order("tanggal", { ascending: false })
        .limit(Math.min(1000, fetchLimit));
      histData = data || [];
    } else {
      // Ambil data dalam 2 rentang paralel untuk mencakup hingga 1 tahun (>120 hari)
      const [res1, res2] = await Promise.all([
        supabase
          .from("fact_harga_pasar")
          .select("tanggal, harga_asli, harga_imputasi, is_imputed")
          .eq("komoditas_id", komoditasId)
          .lte("tanggal", latestDate)
          .order("tanggal", { ascending: false })
          .range(0, 999),
        supabase
          .from("fact_harga_pasar")
          .select("tanggal, harga_asli, harga_imputasi, is_imputed")
          .eq("komoditas_id", komoditasId)
          .lte("tanggal", latestDate)
          .order("tanggal", { ascending: false })
          .range(1000, 2400),
      ]);
      histData = [...(res1.data || []), ...(res2.data || [])];
    }

    const histByDate = new Map<string, { vals: number[]; imputedCount: number; totalCount: number }>();
    if (histData) {
      for (const row of histData) {
        if (!histByDate.has(row.tanggal)) {
          histByDate.set(row.tanggal, { vals: [], imputedCount: 0, totalCount: 0 });
        }
        const entry = histByDate.get(row.tanggal)!;
        const val = Number(row.harga_asli || row.harga_imputasi || 0);
        if (val > 0) entry.vals.push(val);
        entry.totalCount += 1;
        if (row.is_imputed) entry.imputedCount += 1;
      }
    }

    const sortedHistDates = Array.from(histByDate.keys()).sort().slice(-targetDays);
    const history: ForecastHistoryPoint[] = sortedHistDates.map((tgl) => {
      const entry = histByDate.get(tgl)!;
      const avg = entry.vals.length > 0 ? Math.round(entry.vals.reduce((a, b) => a + b, 0) / entry.vals.length) : 0;
      const d = new Date(tgl);
      return {
        tanggal: tgl,
        formattedDate: d.toLocaleDateString("id-ID", {
          day: "numeric",
          month: "short",
          year: targetDays > 180 ? "2-digit" : undefined,
        }),
        harga: avg,
        isImputed: entry.imputedCount > entry.totalCount / 2,
      };
    });

    const currentPrice = history.length > 0 ? history[history.length - 1].harga : 60000;

    // 4. Ambil proyeksi masa depan dari fact_forecast (tanggal > latestDate)
    const { data: fcData, error: fcErr } = await supabase
      .from("fact_forecast")
      .select("tanggal, pasar_id, harga_prediksi, batas_bawah, batas_atas, created_at")
      .eq("komoditas_id", komoditasId)
      .gt("tanggal", latestDate)
      .order("tanggal", { ascending: true });

    if (fcErr || !fcData || fcData.length === 0) return null;

    const rawCreatedAt = fcData[0]?.created_at || null;
    let formattedModelCreatedAt: string | undefined = undefined;
    if (rawCreatedAt) {
      const dModel = new Date(rawCreatedAt);
      formattedModelCreatedAt =
        dModel.toLocaleDateString("id-ID", {
          day: "numeric",
          month: "short",
          year: "numeric",
        }) +
        ", " +
        dModel.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) +
        " WIB";
    }

    // Agregasi multi-pasar resmi: kelompokkan proyeksi per tanggal dengan pelacakan pasar
    const uniqueDates = Array.from(new Set(fcData.map((r) => r.tanggal))).sort().slice(0, 14);
    const lastKnownMarketPred = new Map<number, { p: number; l: number; u: number }>();
    const strategicMarketIds = [5, 2, 3, 4, 1, 146]; // Keputran, Wonokromo, Genteng, Pucang Anom, Tambahrejo, Soponyono

    const forecast: ForecastDayItem[] = [];
    let h = 1;
    let maxForecast = 0;
    let minForecast = Infinity;
    let peakDay: string | undefined = undefined;
    let peakPrice = 0;

    for (const tgl of uniqueDates) {
      if (h > 14) break;
      const rowsForDate = fcData.filter((r) => r.tanggal === tgl);

      // Perbarui prediksi pasar yang aktif pada tanggal ini
      for (const row of rowsForDate) {
        if (row.pasar_id && Number(row.harga_prediksi) > 0) {
          lastKnownMarketPred.set(row.pasar_id, {
            p: Number(row.harga_prediksi),
            l: Number(row.batas_bawah || row.harga_prediksi),
            u: Number(row.batas_atas || row.harga_prediksi),
          });
        }
      }

      // Kumpulkan nilai pasar: prioritaskan pasar yang hadir, atau gunakan forward-fill jika ada pasar yang bolong
      // untuk mencegah composition shift bias pada kurva rata-rata kota
      const pVals: number[] = [];
      const lVals: number[] = [];
      const uVals: number[] = [];

      for (const mId of strategicMarketIds) {
        const directRow = rowsForDate.find((r) => r.pasar_id === mId && Number(r.harga_prediksi) > 0);
        if (directRow) {
          pVals.push(Number(directRow.harga_prediksi));
          lVals.push(Number(directRow.batas_bawah || directRow.harga_prediksi));
          uVals.push(Number(directRow.batas_atas || directRow.harga_prediksi));
        } else if (lastKnownMarketPred.has(mId)) {
          const cached = lastKnownMarketPred.get(mId)!;
          pVals.push(cached.p);
          lVals.push(cached.l);
          uVals.push(cached.u);
        }
      }

      // Fallback jika komoditas tercatat di pasar di luar 6 acuan standar
      if (pVals.length === 0 && rowsForDate.length > 0) {
        for (const row of rowsForDate) {
          pVals.push(Number(row.harga_prediksi));
          lVals.push(Number(row.batas_bawah || row.harga_prediksi));
          uVals.push(Number(row.batas_atas || row.harga_prediksi));
        }
      }

      if (pVals.length === 0) continue;

      const avgPred = Math.round(pVals.reduce((a, b) => a + b, 0) / pVals.length);
      let avgLow = Math.round(lVals.reduce((a, b) => a + b, 0) / lVals.length);
      let avgHigh = Math.round(uVals.reduce((a, b) => a + b, 0) / uVals.length);

      // Enforce monotonic non-crossing guardrail: avgLow <= avgPred <= avgHigh
      avgLow = Math.min(avgLow, avgPred);
      avgHigh = Math.max(avgHigh, avgPred);

      const deltaRp = avgPred - currentPrice;
      const deltaPct = Number(((deltaRp / currentPrice) * 100).toFixed(1));

      if (avgPred > maxForecast) {
        maxForecast = avgPred;
        peakPrice = avgPred;
        peakDay = `H+${h}`;
      }
      if (avgPred < minForecast) {
        minForecast = avgPred;
      }

      let status: "Normal" | "Waspada" | "Tinggi" = "Normal";
      let recom = "Pasokan stabil dalam batas wajar";

      if (deltaPct >= 8) {
        status = "Tinggi";
        recom = "Waspada lonjakan harga, koordinasikan pemantauan pasokan";
      } else if (deltaPct >= 3) {
        status = "Waspada";
        recom = "Pantau kelancaran pasokan harian";
      }

      const d = new Date(tgl);
      const formattedDate = d.toLocaleDateString("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
      const weekday = d.toLocaleDateString("id-ID", { weekday: "long" });

      forecast.push({
        horizon: h++,
        tanggal: tgl,
        formattedDate,
        weekday,
        harga_prediksi: avgPred,
        batas_bawah: avgLow,
        batas_atas: avgHigh,
        deltaPct,
        deltaRp,
        status,
        recom,
      });
    }

    const lastForecastPrice = forecast.length > 0 ? forecast[forecast.length - 1].harga_prediksi : currentPrice;
    const trendPercentage = Number((((lastForecastPrice - currentPrice) / currentPrice) * 100).toFixed(1));
    const trendDirection = trendPercentage >= 2 ? "naik" : trendPercentage <= -2 ? "turun" : "stabil";

    const dLatest = new Date(latestDate);
    const formattedLatestDate = dLatest.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

    return {
      komoditas_id: komoditasId,
      nama_komoditas,
      satuan,
      currentPrice,
      latestDate,
      formattedLatestDate,
      modelCreatedAt: rawCreatedAt || undefined,
      formattedModelCreatedAt,
      history,
      forecast,
      trendDirection,
      trendPercentage,
      minForecast: minForecast === Infinity ? currentPrice : minForecast,
      maxForecast: maxForecast === 0 ? currentPrice : maxForecast,
      peakDay,
      peakPrice,
    };
  } catch (err) {
    console.error("Failed to load forecast details:", err);
    return null;
  }
}

export async function getLiveForecast(komoditasId: number = 50): Promise<ForecastDayItem[] | null> {
  const details = await getLiveForecastDetails(komoditasId);
  return details ? details.forecast : null;
}

export interface TrendSeriesPoint {
  tanggal: string;
  formattedDate: string;
  price: number;
  isImputed?: boolean;
  isForecast?: boolean;
}

export interface MultiCommodityTrendSeries {
  id: string;
  komoditas_id: number;
  name: string;
  color: string;
  strokeDash?: string;
  points: TrendSeriesPoint[];
}

export interface MultiCommodityTrendResult {
  dates: string[];
  formattedDates: string[];
  series: MultiCommodityTrendSeries[];
  latestSyncDate: string;
}

export async function getLiveMultiCommodityTrends(pasarId?: number): Promise<MultiCommodityTrendResult | null> {
  if (!supabase) return null;

  try {
    const configs = [
      { id: "beras", komoditas_id: 2, name: "Beras Premium", color: "#004328" },
      { id: "cabai", komoditas_id: 50, name: "Cabai Rawit", color: "#DC2626" },
      { id: "bawang", komoditas_id: 39, name: "Bawang Merah", color: "#D97706" },
      { id: "telur", komoditas_id: 16, name: "Telur Ayam", color: "#4F46E5", strokeDash: "5 3" },
    ];

    const cids = configs.map(c => c.komoditas_id);
    let query = supabase
      .from("fact_forecast")
      .select("tanggal, komoditas_id, pasar_id, harga_prediksi")
      .in("komoditas_id", cids);

    if (pasarId && pasarId > 0) {
      query = query.eq("pasar_id", pasarId);
    }

    const { data, error } = await query.order("tanggal", { ascending: true });

    if (error || !data || data.length === 0) return null;

    const dates = Array.from(new Set(data.map(d => d.tanggal))).slice(0, 14);

    const monthNames: Record<string, string> = {
      "01": "Jan", "02": "Feb", "03": "Mar", "04": "Apr", "05": "Mei", "06": "Jun",
      "07": "Jul", "08": "Agu", "09": "Sep", "10": "Okt", "11": "Nov", "12": "Des"
    };

    const formattedDates = dates.map(dt => {
      const parts = dt.split("-");
      if (parts.length === 3) {
        return `${parts[2]} ${monthNames[parts[1]] || parts[1]}`;
      }
      return dt;
    });

    const series: MultiCommodityTrendSeries[] = configs.map(cfg => {
      const rows = data.filter(d => d.komoditas_id === cfg.komoditas_id);
      const byDate: Record<string, number[]> = {};
      for (const r of rows) {
        if (!byDate[r.tanggal]) byDate[r.tanggal] = [];
        byDate[r.tanggal].push(Number(r.harga_prediksi));
      }

      const points: TrendSeriesPoint[] = dates.map((dt, idx) => {
        const arr = byDate[dt] || [];
        const avg = arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
        return {
          tanggal: dt,
          formattedDate: formattedDates[idx],
          price: avg
        };
      });

      return {
        ...cfg,
        points
      };
    });

    return {
      dates,
      formattedDates,
      series,
      latestSyncDate: formattedDates[formattedDates.length - 1] || "Data Terkini"
    };
  } catch (err) {
    console.error("Failed to load multi-commodity trends:", err);
    return null;
  }
}

export interface MarketTrendSeries {
  id: string;
  pasar_id: number;
  name: string;
  tipe: string;
  color: string;
  strokeDash?: string;
  points: TrendSeriesPoint[];
}

export interface CityForecastPoint {
  tanggal: string;
  formattedDate: string;
  hargaPrediksi: number;
  batasBawah: number;
  batasAtas: number;
}

export interface MarketTrendComparisonResult {
  komoditas_id: number;
  nama_komoditas: string;
  satuan: string;
  dates: string[];
  formattedDates: string[];
  splitIndex: number;
  anchorDate?: string;
  series: MarketTrendSeries[];
  cityForecastBand?: CityForecastPoint[];
  latestSyncDate: string;
}

export const TREND_MARKET_CONFIGS = [
  { id: "keputran", pasar_id: 5, name: "Pasar Keputran", tipe: "Grosir (Acuan)", color: "#059669" }, // Emerald Zamrud (Acuan Pasar Induk)
  { id: "wonokromo", pasar_id: 2, name: "Pasar Wonokromo", tipe: "Ritel Tradisional", color: "#0284C7" }, // Ocean Blue / Biru Samudera
  { id: "genteng", pasar_id: 3, name: "Pasar Genteng", tipe: "Ritel Pusat", color: "#D97706" }, // Warm Amber / Oranye Cerah
  { id: "pucanganom", pasar_id: 4, name: "Pasar Pucang Anom", tipe: "Ritel Menengah", color: "#7C3AED" }, // Slate Purple / Violet
  { id: "tambahrejo", pasar_id: 1, name: "Pasar Tambahrejo", tipe: "Ritel Tradisional", color: "#E11D48" }, // Coral Red / Merah Bata
  { id: "soponyono", pasar_id: 146, name: "Pasar Soponyono", tipe: "Ritel Rungkut", color: "#CA8A04" }, // Golden Mustard / Cokelat Emas
];

export interface CatalogCommodity {
  id: number;
  name: string;
  unit: string;
  icon: string;
  shortName: string;
  group: string;
}

export const ALL_CATALOG_COMMODITIES: CatalogCommodity[] = [
  // Cabai & Bumbu
  { id: 50, name: "Cabai Rawit Merah", unit: "kg", icon: "cabai", shortName: "Cabai Rawit", group: "Cabai & Bumbu" },
  { id: 39, name: "Bawang Merah", unit: "kg", icon: "bawang", shortName: "Bawang Merah", group: "Cabai & Bumbu" },
  { id: 37, name: "Cabai Merah Keriting", unit: "kg", icon: "cabai_keriting", shortName: "Cabai Keriting", group: "Cabai & Bumbu" },
  { id: 38, name: "Cabai Merah Besar", unit: "kg", icon: "cabai_besar", shortName: "Cabai Besar", group: "Cabai & Bumbu" },
  { id: 49, name: "Bawang Putih Sinco/Honan", unit: "kg", icon: "bawang_putih", shortName: "Bawang Putih", group: "Cabai & Bumbu" },
  
  // Beras & Gandum
  { id: 2, name: "Beras Premium", unit: "kg", icon: "beras", shortName: "Beras Premium", group: "Beras & Gandum" },
  { id: 4, name: "Beras Medium", unit: "kg", icon: "beras", shortName: "Beras Medium", group: "Beras & Gandum" },
  { id: 30, name: "Terigu Protein Sedang", unit: "kg", icon: "terigu", shortName: "Tepung Terigu", group: "Beras & Gandum" },
  { id: 25, name: "Jagung Pipilan Kering", unit: "kg", icon: "jagung", shortName: "Jagung Pipilan", group: "Beras & Gandum" },
  
  // Minyak & Gula
  { id: 10, name: "Minyak Goreng Curah", unit: "kg", icon: "minyak", shortName: "Minyak Curah", group: "Minyak & Gula" },
  { id: 96, name: "Minyak Goreng Minyakita", unit: "liter", icon: "minyak", shortName: "Minyakita", group: "Minyak & Gula" },
  { id: 92, name: "Minyak Kemasan Premium", unit: "liter", icon: "minyak", shortName: "Minyak Premium", group: "Minyak & Gula" },
  { id: 7, name: "Gula Kristal Putih", unit: "kg", icon: "gula", shortName: "Gula Pasir", group: "Minyak & Gula" },
  
  // Daging & Telur
  { id: 16, name: "Telur Ayam Ras", unit: "kg", icon: "telur", shortName: "Telur Ayam", group: "Daging & Telur" },
  { id: 17, name: "Telur Ayam Kampung", unit: "kg", icon: "telur", shortName: "Telur Kampung", group: "Daging & Telur" },
  { id: 13, name: "Daging Ayam Ras", unit: "kg", icon: "daging_ayam", shortName: "Daging Ayam", group: "Daging & Telur" },
  { id: 14, name: "Daging Ayam Kampung", unit: "ekor", icon: "daging_ayam", shortName: "Ayam Kampung", group: "Daging & Telur" },
  { id: 12, name: "Daging Sapi Paha Belakang", unit: "kg", icon: "daging", shortName: "Daging Sapi", group: "Daging & Telur" },
  
  // Ikan Segar & Olahan
  { id: 58, name: "Ikan Bandeng", unit: "kg", icon: "ikan", shortName: "Ikan Bandeng", group: "Ikan Segar" },
  { id: 59, name: "Ikan Kembung", unit: "kg", icon: "ikan", shortName: "Ikan Kembung", group: "Ikan Segar" },
  { id: 60, name: "Ikan Tongkol", unit: "kg", icon: "ikan", shortName: "Ikan Tongkol", group: "Ikan Segar" },
  { id: 61, name: "Ikan Tuna", unit: "kg", icon: "ikan", shortName: "Ikan Tuna", group: "Ikan Segar" },
  { id: 62, name: "Ikan Cakalang", unit: "kg", icon: "ikan", shortName: "Ikan Cakalang", group: "Ikan Segar" },
  { id: 40, name: "Ikan Asin Teri", unit: "kg", icon: "ikan_teri", shortName: "Ikan Asin Teri", group: "Ikan Segar" },
  
  // Sayur Mayur
  { id: 46, name: "Tomat Merah", unit: "kg", icon: "tomat", shortName: "Tomat Merah", group: "Sayur Mayur" },
  { id: 45, name: "Kentang", unit: "kg", icon: "kentang", shortName: "Kentang", group: "Sayur Mayur" },
  { id: 47, name: "Wortel", unit: "kg", icon: "wortel", shortName: "Wortel", group: "Sayur Mayur" },
  { id: 44, name: "Kol / Kubis", unit: "kg", icon: "kol", shortName: "Kol / Kubis", group: "Sayur Mayur" },
  { id: 48, name: "Buncis", unit: "kg", icon: "buncis", shortName: "Buncis", group: "Sayur Mayur" },
  
  // Palawija & Sembako Lainnya
  { id: 32, name: "Kedelai Impor", unit: "kg", icon: "kedelai", shortName: "Kedelai Impor", group: "Palawija & Lainnya" },
  { id: 41, name: "Kacang Hijau", unit: "kg", icon: "kacang_hijau", shortName: "Kacang Hijau", group: "Palawija & Lainnya" },
  { id: 42, name: "Kacang Tanah", unit: "kg", icon: "kacang_tanah", shortName: "Kacang Tanah", group: "Palawija & Lainnya" },
  { id: 43, name: "Ketela Pohon", unit: "kg", icon: "singkong", shortName: "Ketela Pohon", group: "Palawija & Lainnya" },
  { id: 28, name: "Garam Beryodium Halus", unit: "kg", icon: "garam", shortName: "Garam Halus", group: "Palawija & Lainnya" },
  { id: 20, name: "Susu Kental Manis Bendera", unit: "kl", icon: "susu", shortName: "Susu Bendera", group: "Palawija & Lainnya" },
  { id: 21, name: "Susu Kental Manis Indomilk", unit: "kl", icon: "susu", shortName: "Susu Indomilk", group: "Palawija & Lainnya" },
  { id: 35, name: "Indomie Kari Ayam", unit: "bks", icon: "mie", shortName: "Indomie", group: "Palawija & Lainnya" },
];

export const AVAILABLE_TREND_COMMODITIES = [
  { id: 50, name: "Cabai Rawit Merah", unit: "kg", icon: "cabai", shortName: "Cabai Rawit" },
  { id: 39, name: "Bawang Merah", unit: "kg", icon: "bawang", shortName: "Bawang Merah" },
  { id: 2, name: "Beras Premium", unit: "kg", icon: "beras", shortName: "Beras Premium" },
  { id: 16, name: "Telur Ayam Ras", unit: "kg", icon: "telur", shortName: "Telur Ayam" },
  { id: 10, name: "Minyak Goreng Curah", unit: "kg", icon: "minyak", shortName: "Minyak Curah" },
  { id: 7, name: "Gula Pasir", unit: "kg", icon: "gula", shortName: "Gula Pasir" },
];

export async function getLiveMarketComparisonTrends(
  komoditasId: number = 50,
  timeframe: TimeframeOption = "7d"
): Promise<MarketTrendComparisonResult | null> {
  const meta = ALL_CATALOG_COMMODITIES.find(c => c.id === komoditasId) || AVAILABLE_TREND_COMMODITIES[0];

  if (!supabase) return null;

  try {
    const targetDays = TIMEFRAME_DAYS[timeframe] || 7;
    let histData: RawMarketPriceRow[] = [];
    let fcData: RawForecastRow[] = [];

    // 1. Dapatkan tanggal terbaru dari fact_harga_pasar sebagai jangkar
    const { data: latestDateRows, error: anchorErr } = await supabase
      .from("fact_harga_pasar")
      .select("tanggal")
      .order("tanggal", { ascending: false })
      .limit(1);

    if (anchorErr || !latestDateRows || latestDateRows.length === 0 || !latestDateRows[0]?.tanggal) {
      console.warn(`getLiveMarketComparisonTrends: anchor date unavailable for commodity ${komoditasId}`);
      return null;
    }

    const anchorDate = latestDateRows[0].tanggal;

    // 2. Query data historis (<= anchorDate) dan proyeksi masa depan (> anchorDate) secara paralel (Fix F-01)
    if (targetDays <= 120) {
      const fetchLimit = Math.max(100, targetDays * 7);
      const [histRes, fcRes] = await Promise.all([
        supabase
          .from("fact_harga_pasar")
          .select("tanggal, pasar_id, harga_asli, harga_imputasi, is_imputed")
          .eq("komoditas_id", komoditasId)
          .lte("tanggal", anchorDate)
          .order("tanggal", { ascending: false })
          .limit(Math.min(1000, fetchLimit)),
        supabase
          .from("fact_forecast")
          .select("tanggal, pasar_id, harga_prediksi, batas_bawah, batas_atas")
          .eq("komoditas_id", komoditasId)
          .gt("tanggal", anchorDate)
          .order("tanggal", { ascending: true })
          .limit(100)
      ]);
      histData = histRes.data || [];
      fcData = fcRes.data || [];
    } else {
      const [histRes1, histRes2, fcRes] = await Promise.all([
        supabase
          .from("fact_harga_pasar")
          .select("tanggal, pasar_id, harga_asli, harga_imputasi, is_imputed")
          .eq("komoditas_id", komoditasId)
          .lte("tanggal", anchorDate)
          .order("tanggal", { ascending: false })
          .range(0, 999),
        supabase
          .from("fact_harga_pasar")
          .select("tanggal, pasar_id, harga_asli, harga_imputasi, is_imputed")
          .eq("komoditas_id", komoditasId)
          .lte("tanggal", anchorDate)
          .order("tanggal", { ascending: false })
          .range(1000, 2400),
        supabase
          .from("fact_forecast")
          .select("tanggal, pasar_id, harga_prediksi, batas_bawah, batas_atas")
          .eq("komoditas_id", komoditasId)
          .gt("tanggal", anchorDate)
          .order("tanggal", { ascending: true })
          .limit(100)
      ]);
      histData = [...(histRes1.data || []), ...(histRes2.data || [])];
      fcData = fcRes.data || [];
    }

    // Kumpulkan tanggal observasi unik (sesuai targetDays, diurutkan ascending)
    const histDates = Array.from(new Set(histData.map(d => d.tanggal))).sort().slice(-targetDays);
    
    // Ambil tanggal proyeksi dari DB yang benar-benar berasal dari hasil forecast masa depan
    const fcDates = Array.from(new Set(fcData.map(d => d.tanggal)))
      .sort()
      .slice(0, 7);

    const allDates = [...histDates, ...fcDates];
    const splitIdx = Math.max(0, histDates.length - 1);

    const monthNames: Record<string, string> = {
      "01": "Jan", "02": "Feb", "03": "Mar", "04": "Apr", "05": "Mei", "06": "Jun",
      "07": "Jul", "08": "Agu", "09": "Sep", "10": "Okt", "11": "Nov", "12": "Des"
    };

    const formattedDates = allDates.map(dt => {
      const parts = dt.split("-");
      if (parts.length === 3) {
        if (targetDays > 180) {
          return `${parts[2]} ${monthNames[parts[1]] || parts[1]} '${parts[0].slice(2)}`;
        }
        return `${parts[2]} ${monthNames[parts[1]] || parts[1]}`;
      }
      return dt;
    });

    // Peta harga historis & forecast per pasar: key = `${pasar_id}_${tanggal}`
    const priceMap: Record<string, number> = {};
    const imputedMap: Record<string, boolean> = {};

    for (const h of histData) {
      if (h.harga_imputasi) {
        priceMap[`${h.pasar_id}_${h.tanggal}`] = Number(h.harga_imputasi);
        imputedMap[`${h.pasar_id}_${h.tanggal}`] = !!h.is_imputed;
      }
    }
    for (const f of fcData) {
      if (f.harga_prediksi) {
        priceMap[`${f.pasar_id}_${f.tanggal}`] = Number(f.harga_prediksi);
      }
    }

    // Hitung rata-rata proyeksi agregat kota dan rentang interval keyakinan (P10 - P90) murni dari hasil forecast
    const cityForecastBand: CityForecastPoint[] = fcDates.map((dt, idx) => {
      const rows = fcData.filter(f => f.tanggal === dt);
      const preds = rows.map(r => Number(r.harga_prediksi)).filter(v => v > 0);
      const lowers = rows.map(r => Number(r.batas_bawah)).filter(v => v > 0);
      const uppers = rows.map(r => Number(r.batas_atas)).filter(v => v > 0);

      const avgPred = preds.length > 0 ? Math.round(preds.reduce((a, b) => a + b, 0) / preds.length) : 0;
      let avgLower = lowers.length > 0 ? Math.round(lowers.reduce((a, b) => a + b, 0) / lowers.length) : avgPred;
      let avgUpper = uppers.length > 0 ? Math.round(uppers.reduce((a, b) => a + b, 0) / uppers.length) : avgPred;

      // Enforce monotonic non-crossing bounds on city aggregate band
      avgLower = Math.min(avgLower, avgPred);
      avgUpper = Math.max(avgUpper, avgPred);

      return {
        tanggal: dt,
        formattedDate: formattedDates[splitIdx + 1 + idx] || dt,
        hargaPrediksi: avgPred,
        batasBawah: avgLower,
        batasAtas: avgUpper,
      };
    });

    const series: MarketTrendSeries[] = TREND_MARKET_CONFIGS.map(cfg => {
      // Inisialisasi lastKnownPrice dengan harga valid pertama agar titik awal tidak loncat dari 0
      let firstValidPrice = 0;
      for (const dt of allDates) {
        const val = priceMap[`${cfg.pasar_id}_${dt}`];
        if (val && val > 0) {
          firstValidPrice = val;
          break;
        }
      }

      let lastKnownPrice = firstValidPrice;

      const points: TrendSeriesPoint[] = allDates.map((dt, idx) => {
        const key = `${cfg.pasar_id}_${dt}`;
        let p = priceMap[key];
        let wasSynthesized = false;

        if (!p || p === 0) {
          p = lastKnownPrice;
          wasSynthesized = true;
        } else {
          lastKnownPrice = p;
        }

        const isForecast = idx > splitIdx;
        const isImputed = !isForecast && (wasSynthesized || !!imputedMap[key]);

        return {
          tanggal: dt,
          formattedDate: formattedDates[idx],
          price: p,
          isImputed,
          isForecast,
        };
      });

      return {
        ...cfg,
        points
      };
    });

    // Format tanggal sinkronisasi tanpa hardcode tahun (Fix F-13)
    const syncYear = anchorDate ? anchorDate.split("-")[0] : new Date().getFullYear();
    const latestSyncDate = formattedDates[splitIdx]
      ? `${formattedDates[splitIdx]} ${syncYear}`
      : "Data Terkini";

    return {
      komoditas_id: komoditasId,
      nama_komoditas: meta.name,
      satuan: meta.unit,
      dates: allDates,
      formattedDates,
      splitIndex: splitIdx,
      anchorDate,
      series,
      cityForecastBand,
      latestSyncDate
    };
  } catch (err) {
    console.error("Failed to load market comparison trends:", err);
    return null;
  }
}

export interface MarketComparisonRow {
  komoditas_id: number;
  komoditas: string;
  satuan: string;
  keputran: number;
  wonokromo: number;
  pucang: number;
  genteng: number;
  tambahrejo: number;
  soponyono: number;
  rerata: number;
  disparitasRp: number;
  disparitasPct: number;
  missingMarkets: number[];
  reportedCount: number;
  isRepresentative: boolean;
  tanggal?: string;
}

export async function getLiveMarketComparison(): Promise<MarketComparisonRow[] | null> {
  if (!supabase) return null;

  try {
    // 1. Ambil tanggal pantauan terbaru
    const { data: latestDateRow } = await supabase
      .from("fact_harga_pasar")
      .select("tanggal")
      .order("tanggal", { ascending: false })
      .limit(1);

    if (!latestDateRow || latestDateRow.length === 0) return null;
    const latestDate = latestDateRow[0].tanggal;

    // 2. Tarik master komoditas dan seluruh harga 6 pasar pada tanggal tersebut
    const [komRes, priceRes] = await Promise.all([
      supabase.from("dim_komoditas").select("komoditas_id, nama_komoditas, satuan"),
      supabase
        .from("fact_harga_pasar")
        .select("komoditas_id, pasar_id, harga_imputasi, tanggal")
        .eq("tanggal", latestDate)
        .limit(1000)
    ]);

    if (!priceRes.data || priceRes.data.length === 0) return null;

    const latestPrices = priceRes.data.filter(p => !isNaN(Number(p.harga_imputasi)));
    const komMap = new Map(komRes.data ? komRes.data.map(k => [k.komoditas_id, { ...k, nama_komoditas: formatCommodityName(k.nama_komoditas) }]) : []);

    // 3. Muat seluruh komoditas katalog lengkap (37 komoditas)
    const catalogCids = ALL_CATALOG_COMMODITIES.map(c => c.id);
    const extraCids = (komRes.data || [])
      .map(k => k.komoditas_id)
      .filter(id => !catalogCids.includes(id));
    const allCids = [...catalogCids, ...extraCids];

    const rows: MarketComparisonRow[] = [];

    for (const cid of allCids) {
      const catMeta = ALL_CATALOG_COMMODITIES.find(c => c.id === cid);
      const kMeta = komMap.get(cid);
      if (!catMeta && !kMeta) continue;

      const cPrices = latestPrices.filter((p) => p.komoditas_id === cid);
      const row = buildComparisonRow(
        cid,
        {
          nama_komoditas: formatCommodityName(catMeta?.name || kMeta?.nama_komoditas || "Komoditas"),
          satuan: catMeta?.unit || kMeta?.satuan || "kg"
        },
        cPrices
      );
      if (!row) continue;

      rows.push({ ...row, tanggal: latestDate });
    }

    return rows.length > 0 ? rows : null;
  } catch (err) {
    console.error("Failed to load market comparison data:", err);
    return null;
  }
}

function buildComparisonRow(
  cid: number,
  kMeta: { nama_komoditas: string; satuan?: string | null },
  prices: { pasar_id: number; harga_imputasi: number | string }[]
): MarketComparisonRow | null {
  const pMap: Record<number, number> = {};
  for (const p of prices) {
    if (Number(p.harga_imputasi) > 0) pMap[p.pasar_id] = Number(p.harga_imputasi);
  }

  const validPrices = Object.values(pMap);
  if (validPrices.length === 0) return null;

  const ALL_MARKET_IDS = [5, 2, 4, 3, 1, 146];
  const missingMarkets = ALL_MARKET_IDS.filter((id) => !pMap[id]);
  const reportedCount = ALL_MARKET_IDS.length - missingMarkets.length;
  const isRepresentative = reportedCount >= 3;

  const rerata = Math.round(validPrices.reduce((a, b) => a + b, 0) / validPrices.length);
  const minPrice = Math.min(...validPrices);
  const maxPrice = Math.max(...validPrices);
  const dispRp = maxPrice - minPrice;
  const dispPct = Math.round((dispRp / (minPrice || 1)) * 100);

  // Pasar IDs: 1: Tambahrejo, 2: Wonokromo, 3: Genteng, 4: Pucang, 5: Keputran, 146: Soponyono
  return {
    komoditas_id: cid,
    komoditas: formatCommodityName(kMeta.nama_komoditas),
    satuan: kMeta.satuan || "kg",
    keputran: pMap[5] || rerata,
    wonokromo: pMap[2] || rerata,
    pucang: pMap[4] || rerata,
    genteng: pMap[3] || rerata,
    tambahrejo: pMap[1] || rerata,
    soponyono: pMap[146] || rerata,
    rerata,
    disparitasRp: dispRp,
    disparitasPct: dispPct,
    missingMarkets,
    reportedCount,
    isRepresentative,
  };
}

// Ambil matriks harga 6 pasar untuk satu komoditas tertentu (dipakai pemilih komoditas di halaman peta)
export async function getLiveMarketComparisonForCommodity(
  komoditasId: number
): Promise<MarketComparisonRow | null> {
  if (!supabase) return null;

  try {
    const [komRes, priceRes] = await Promise.all([
      supabase
        .from("dim_komoditas")
        .select("komoditas_id, nama_komoditas, satuan")
        .eq("komoditas_id", komoditasId)
        .limit(1),
      supabase
        .from("fact_harga_pasar")
        .select("komoditas_id, pasar_id, harga_imputasi, tanggal")
        .eq("komoditas_id", komoditasId)
        .order("tanggal", { ascending: false })
        .limit(60),
    ]);

    const kMeta = komRes.data?.[0];
    const priceRows = priceRes.data || [];
    if (!kMeta || priceRows.length === 0) return null;

    const latestDate = priceRows[0].tanggal;
    const latestPrices = priceRows.filter((p) => p.tanggal === latestDate);
    const catMeta = ALL_CATALOG_COMMODITIES.find((c) => c.id === komoditasId);
    const row = buildComparisonRow(
      komoditasId,
      {
        nama_komoditas: formatCommodityName(catMeta?.name || kMeta.nama_komoditas),
        satuan: catMeta?.unit || kMeta.satuan,
      },
      latestPrices
    );
    if (!row) return null;

    return { ...row, tanggal: latestDate };
  } catch (err) {
    console.error("Failed to load commodity comparison:", err);
    return null;
  }
}

export interface MarketLocation {
  pasar_id: number;
  nama_pasar: string;
  tipe_pasar: string;
  latitude: number;
  longitude: number;
  sumber_koordinat?: string;
}

export async function getLiveMarketLocations(): Promise<MarketLocation[] | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("dim_pasar")
      .select("pasar_id, nama_pasar, tipe_pasar, latitude, longitude, sumber_koordinat")
      .order("pasar_id", { ascending: true });

    if (error || !data || data.length === 0) return null;
    return data.map((d) => ({
      pasar_id: d.pasar_id,
      nama_pasar: d.nama_pasar,
      tipe_pasar: d.tipe_pasar,
      latitude: Number(d.latitude),
      longitude: Number(d.longitude),
      sumber_koordinat: d.sumber_koordinat,
    }));
  } catch (err) {
    console.error("Failed to load market locations:", err);
    return null;
  }
}

// 5. Live Smart Shopping Basket Calculation
export interface BasketItem {
  id: string;
  komoditas_id: number;
  name: string;
  icon: string;
  qty: number;
  unit: string;
}

export interface MarketBasketRank {
  rank: number;
  pasar_id: number;
  nama_pasar: string;
  wilayah: string;
  totalBelanja: number;
  selisih: number;
  isCheapest: boolean;
}

export interface SplitBasketItem {
  komoditas_id: number;
  name: string;
  qty: number;
  unit: string;
  cheapestMarket: string;
  cheapestPrice: number;
  itemTotal: number;
  available?: boolean;
  is_imputed?: boolean;
}

export interface BasketSimulationItem extends BasketItem {
  itemTotal: number;
  price?: number;
  available?: boolean;
  is_imputed?: boolean;
}

export interface ShoppingBasketSimulation {
  tanggal: string;
  items: BasketSimulationItem[];
  rankings: MarketBasketRank[];
  tripSaving: number;
  monthlySaving: number;
  cheapestMarket: string;
  mostExpensiveMarket: string;
  splitBasket: {
    totalBelanja: number;
    additionalSaving: number;
    items: SplitBasketItem[];
  };
}

export const COMMODITY_BASKET_META: Record<number, { icon: string; unit: string; defaultQty: number; name: string }> = {
  2: { icon: "inventory_2", unit: "kg", defaultQty: 5, name: "Beras Premium" },
  4: { icon: "inventory_2", unit: "kg", defaultQty: 5, name: "Beras Medium" },
  10: { icon: "water_drop", unit: "kg", defaultQty: 2, name: "Minyak Goreng Curah" },
  16: { icon: "egg", unit: "kg", defaultQty: 1, name: "Telur Ayam Ras" },
  50: { icon: "local_fire_department", unit: "kg", defaultQty: 0.5, name: "Cabai Rawit Merah" },
  39: { icon: "nutrition", unit: "kg", defaultQty: 1, name: "Bawang Merah" },
  13: { icon: "set_meal", unit: "kg", defaultQty: 1, name: "Daging Ayam Ras" },
  12: { icon: "lunch_dining", unit: "kg", defaultQty: 1, name: "Daging Sapi" },
  7: { icon: "cookie", unit: "kg", defaultQty: 1, name: "Gula Pasir" },
  49: { icon: "nutrition", unit: "kg", defaultQty: 1, name: "Bawang Putih Honan" },
  41: { icon: "nutrition", unit: "kg", defaultQty: 1, name: "Bawang Putih" },
};

export const DEFAULT_BASKET_ITEMS: BasketItem[] = [
  { id: "beras", komoditas_id: 2, name: "Beras Premium", icon: "inventory_2", qty: 5, unit: "kg" },
  { id: "minyak", komoditas_id: 10, name: "Minyak Goreng Curah", icon: "water_drop", qty: 2, unit: "kg" },
  { id: "telur", komoditas_id: 16, name: "Telur Ayam Ras", icon: "egg", qty: 1, unit: "kg" },
  { id: "cabai", komoditas_id: 50, name: "Cabai Rawit Merah", icon: "local_fire_department", qty: 0.5, unit: "kg" },
  { id: "bawang", komoditas_id: 39, name: "Bawang Merah", icon: "nutrition", qty: 1, unit: "kg" },
];

export async function getLiveShoppingBasket(basketList: BasketItem[] = DEFAULT_BASKET_ITEMS): Promise<ShoppingBasketSimulation | null> {
  if (!supabase || basketList.length === 0) return null;

  try {
    const cids = Array.from(new Set(basketList.map(b => b.komoditas_id)));
    
    // Get latest date from database
    const { data: latestDateRow } = await supabase
      .from("fact_harga_pasar")
      .select("tanggal")
      .order("tanggal", { ascending: false })
      .limit(1);

    const latestDate = latestDateRow?.[0]?.tanggal || new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());

    const [pasarRes, priceRes] = await Promise.all([
      supabase.from("dim_pasar").select("pasar_id, nama_pasar"),
      supabase
        .from("fact_harga_pasar")
        .select("komoditas_id, pasar_id, harga_imputasi, is_imputed, tanggal")
        .eq("tanggal", latestDate)
        .in("komoditas_id", cids)
        .not("harga_imputasi", "eq", "NaN")
    ]);

    if (!pasarRes.data || !priceRes.data || priceRes.data.length === 0) return null;

    const latestPrices = [...priceRes.data];

    // Forward-fill lookback up to 7 days for commodities missing on latestDate
    const foundCids = new Set(latestPrices.map(p => p.komoditas_id));
    const missingCids = cids.filter(cid => !foundCids.has(cid));
    if (missingCids.length > 0) {
      const minDateObj = new Date(latestDate);
      minDateObj.setDate(minDateObj.getDate() - 7);
      const minDateStr = minDateObj.toISOString().slice(0, 10);
      const { data: lookbackPrices } = await supabase
        .from("fact_harga_pasar")
        .select("komoditas_id, pasar_id, harga_imputasi, is_imputed, tanggal")
        .gte("tanggal", minDateStr)
        .lte("tanggal", latestDate)
        .in("komoditas_id", missingCids)
        .not("harga_imputasi", "eq", "NaN")
        .order("tanggal", { ascending: false });

      if (lookbackPrices && lookbackPrices.length > 0) {
        const seen = new Set<string>();
        for (const p of lookbackPrices) {
          const key = `${p.pasar_id}_${p.komoditas_id}`;
          if (!seen.has(key)) {
            seen.add(key);
            latestPrices.push({
              ...p,
              is_imputed: true
            });
          }
        }
      }
    }

    const marketRegion: Record<number, string> = {
      1: "Surabaya Utara",
      2: "Surabaya Selatan",
      3: "Surabaya Pusat",
      4: "Surabaya Tengah",
      5: "Surabaya Pusat (Induk)",
      146: "Surabaya Timur"
    };

    const marketMap: Record<number, { pasar_id: number; nama_pasar: string; wilayah: string; totalBelanja: number }> = {};
    for (const m of pasarRes.data) {
      marketMap[m.pasar_id] = {
        pasar_id: m.pasar_id,
        nama_pasar: m.nama_pasar,
        wilayah: marketRegion[m.pasar_id] || "Kota Surabaya",
        totalBelanja: 0
      };
    }

    const avgPrices: Record<number, { price: number; is_imputed: boolean; available: boolean }> = {};
    for (const item of basketList) {
      const valid = latestPrices.filter(p => p.komoditas_id === item.komoditas_id && Number(p.harga_imputasi) > 0);
      if (valid.length > 0) {
        const sum = valid.reduce((acc, curr) => acc + Number(curr.harga_imputasi), 0);
        const hasImputed = valid.some(p => p.is_imputed === true);
        avgPrices[item.komoditas_id] = {
          price: Math.round(sum / valid.length),
          is_imputed: hasImputed,
          available: true
        };
      } else {
        avgPrices[item.komoditas_id] = {
          price: 0,
          is_imputed: false,
          available: false
        };
      }
    }

    for (const pid in marketMap) {
      let total = 0;
      for (const item of basketList) {
        const match = latestPrices.find(p => p.pasar_id === Number(pid) && p.komoditas_id === item.komoditas_id);
        const price = match && Number(match.harga_imputasi) > 0 ? Number(match.harga_imputasi) : (avgPrices[item.komoditas_id]?.available ? avgPrices[item.komoditas_id].price : 0);
        if (price > 0) {
          total += price * item.qty;
        }
      }
      marketMap[pid].totalBelanja = Math.round(total);
    }

    const sorted = Object.values(marketMap).filter(m => m.totalBelanja > 0).sort((a, b) => a.totalBelanja - b.totalBelanja);
    if (sorted.length === 0) return null;

    const minTotal = sorted[0].totalBelanja;
    const maxTotal = sorted[sorted.length - 1].totalBelanja;
    const tripSaving = Math.max(0, maxTotal - minTotal);
    const monthlySaving = tripSaving * 4;

    // Handle ties gracefully: identical totalBelanja gets identical rank and isCheapest: true
    let currentRank = 1;
    const rankings: MarketBasketRank[] = sorted.map((m, idx) => {
      if (idx > 0 && m.totalBelanja > sorted[idx - 1].totalBelanja) {
        currentRank = idx + 1;
      }
      return {
        rank: currentRank,
        pasar_id: m.pasar_id,
        nama_pasar: m.nama_pasar,
        wilayah: m.wilayah,
        totalBelanja: m.totalBelanja,
        selisih: m.totalBelanja - minTotal,
        isCheapest: m.totalBelanja === minTotal
      };
    });

    // Multi-Market / Split-Basket scenario:
    // User buys each basket item at its individual cheapest market across Surabaya
    const splitItems: SplitBasketItem[] = [];
    let splitTotal = 0;

    for (const item of basketList) {
      const itemPrices = latestPrices
        .filter(p => p.komoditas_id === item.komoditas_id && Number(p.harga_imputasi) > 0)
        .map(p => ({
          pasar_id: p.pasar_id,
          nama_pasar: (marketMap[p.pasar_id]?.nama_pasar || "Pasar").replace(/^Pasar\s+/i, ""),
          price: Number(p.harga_imputasi),
          is_imputed: Boolean(p.is_imputed)
        }))
        .sort((a, b) => a.price - b.price);

      if (itemPrices.length > 0) {
        const best = itemPrices[0];
        const itemCost = Math.round(best.price * item.qty);
        splitTotal += itemCost;
        splitItems.push({
          komoditas_id: item.komoditas_id,
          name: item.name,
          qty: item.qty,
          unit: item.unit,
          cheapestMarket: best.nama_pasar,
          cheapestPrice: best.price,
          itemTotal: itemCost,
          available: true,
          is_imputed: best.is_imputed
        });
      } else {
        splitItems.push({
          komoditas_id: item.komoditas_id,
          name: item.name,
          qty: item.qty,
          unit: item.unit,
          cheapestMarket: "-",
          cheapestPrice: 0,
          itemTotal: 0,
          available: false,
          is_imputed: false
        });
      }
    }

    const additionalSaving = Math.max(0, minTotal - splitTotal);
    const cheapestMarkets = sorted.filter(s => s.totalBelanja === minTotal).map(s => s.nama_pasar);
    const cheapestMarketStr = cheapestMarkets.join(" & ");

    const itemized: BasketSimulationItem[] = basketList.map(item => {
      const avgInfo = avgPrices[item.komoditas_id];
      const isAvailable = Boolean(avgInfo && avgInfo.available && avgInfo.price > 0);
      const unitPrice = isAvailable ? avgInfo.price : 0;
      return {
        ...item,
        price: unitPrice,
        itemTotal: Math.round(unitPrice * item.qty),
        available: isAvailable,
        is_imputed: avgInfo?.is_imputed ?? false
      };
    });

    return {
      tanggal: latestDate,
      items: itemized,
      rankings,
      tripSaving,
      monthlySaving,
      cheapestMarket: cheapestMarketStr,
      mostExpensiveMarket: sorted[sorted.length - 1].nama_pasar,
      splitBasket: {
        totalBelanja: splitTotal,
        additionalSaving,
        items: splitItems
      }
    };
  } catch (err) {
    console.error("Failed to calculate live basket:", err);
    return null;
  }
}

