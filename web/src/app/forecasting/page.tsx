"use client";

import { useState, useEffect, useMemo } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CommoditySearchSelect from "@/components/CommoditySearchSelect";
import TimeframeSelect from "@/components/TimeframeSelect";
import HorizonSelect from "@/components/HorizonSelect";
import {
  getLiveForecastDetails,
  CommodityForecastDetails,
  FORECAST_COMMODITIES,
  ALL_CATALOG_COMMODITIES,
  TimeframeOption,
} from "@/lib/dataService";
import {
  OFFICIAL_REGULATORY_BENCHMARKS,
  OFFICIAL_MODEL_CHAMPIONS,
} from "@/lib/regulatoryData";

// Batas acuan regulasi pemerintah dimuat dari OFFICIAL_REGULATORY_BENCHMARKS (Single Source of Truth)

// Karakteristik & Jalur Pasokan Faktual Sentra Jawa Timur per Komoditas (Dinamis)
interface CommoditySupplyInsight {
  characteristics: string;
  distribution: string;
}

const COMMODITY_SUPPLY_INSIGHTS: Record<number, CommoditySupplyInsight> = {
  50: {
    characteristics:
      "Komoditas hortikultura (cabai rawit merah) tergolong cepat busuk (perishable) dan sangat sensitif terhadap gangguan anomali cuaca serta curah hujan di sentra Jawa Timur, sehingga model Machine Learning (LightGBM/CatBoost) menyertakan toleransi variansi lebih adaptif dibanding pangan pokok bersubsidi.",
    distribution:
      "Stabilitas harga pasar di Surabaya ditopang arus bongkar muat harian dari sentra Kediri, Malang, Probolinggo, dan Blitar yang masuk melalui Pasar Induk Keputran dan Pasar Osowilangun sebelum didistribusikan ke pasar-pasar lingkungan.",
  },
  39: {
    characteristics:
      "Bawang merah rentan terhadap kelembapan tinggi saat musim hujan yang memicu pembusukan di gudang simpan petani, sehingga pemantauan curah hujan dan siklus tanam sentra menjadi indikator vital stabilitas harga.",
    distribution:
      "Pasokan utama mengalir lancar dari sentra Nganjuk, Probolinggo, dan Demak melalui jalur logistik darat Pantura dan arteri Jatim menuju pasar induk grosir Surabaya.",
  },
  2: {
    characteristics:
      "Beras merupakan komoditas pangan pokok strategis dengan ketahanan simpan tinggi, dipengaruhi masa panen raya gadu/rendeng serta ketersediaan stok cadangan beras pemerintah (CBP) di gudang Bulog Jatim.",
    distribution:
      "Didukung sentra lumbung padi Jawa Timur seperti Lamongan, Ngawi, Bojonegoro, dan Sidoarjo melalui jaringan distributor beras grosir dan ritel modern/tradisional Surabaya.",
  },
  10: {
    characteristics:
      "Minyak goreng curah dan Minyakita merupakan produk industri turunan kelapa sawit yang sangat dipengaruhi pasokan DMO (Domestic Market Obligation) produsen dan kepatuhan pagu HET Kemendag.",
    distribution:
      "Didistribusikan dari kawasan industri pengolahan minyak nabati di kawasan Rungkut dan Gresik melalui distributor D1/D2 ke pedagang pasar tradisional di Surabaya.",
  },
  13: {
    characteristics:
      "Daging ayam ras memiliki siklus budidaya broiler pendek (30-35 hari), dengan fluktuasi biaya produksi yang sangat dipengaruhi komponen harga pakan ternak (jagung dan konsentrat) serta bibit DOC.",
    distribution:
      "Disuplai dari peternakan kemitraan di Blitar, Jombang, Mojokerto, dan Lamongan, dipotong di Rumah Potong Unggas (RPU) resmi sebelum dipasok pagi hari ke pasar basah Surabaya.",
  },
  16: {
    characteristics:
      "Telur ayam ras memiliki masa simpan optimal 14-21 hari pada suhu ruang. Harga sangat ditentukan oleh stabilitas populasi ayam petelur (layer) aktif dan produktivitas harian di tingkat peternak.",
    distribution:
      "Sekitar 70% pasokan telur Surabaya dipasok harian dari sentra peternakan Blitar dan Tulungagung melalui armada logistik darat ke agen grosir pasar kota.",
  },
  7: {
    characteristics:
      "Gula pasir konsumsi dipengaruhi musim giling tebu pabrik gula (PG) Jawa Timur pada periode Mei-Oktober serta alokasi impor raw sugar untuk menjaga ketersediaan stok penyangga.",
    distribution:
      "Dipasok dari pabrik gula di Sidoarjo, Mojokerto, Madiun, dan pergudangan logistik penyangga di koridor Margomulyo dan Tanjung Perak Surabaya.",
  },
};

// Metrik model champion dimuat dari OFFICIAL_MODEL_CHAMPIONS (selaras dengan models/forecasting/registry.json)

export default function ForecastingPage() {
  const [selectedCommodity, setSelectedCommodity] = useState<number>(50);
  const [horizon, setHorizon] = useState<7 | 14>(14);
  const [timeframe, setTimeframe] = useState<TimeframeOption>("14d");
  const [statusFilter, setStatusFilter] = useState<"all" | "alert">("all");
  const [loading, setLoading] = useState<boolean>(true);
  const [showAllMobileCards, setShowAllMobileCards] = useState<boolean>(false);
  const [forecastData, setForecastData] = useState<CommodityForecastDetails | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<{
    date: string;
    label: string;
    price: number;
    lower?: number;
    upper?: number;
    isForecast: boolean;
    screenX?: number;
    screenY?: number;
  } | null>(null);
  const [exportState, setExportState] = useState<"idle" | "downloading" | "success">("idle");

  // Reset expand/collapse saat pengguna berganti komoditas, timeframe, atau filter status
  useEffect(() => {
    setShowAllMobileCards(false);
  }, [selectedCommodity, statusFilter, timeframe]);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    getLiveForecastDetails(selectedCommodity, timeframe).then((res) => {
      if (isMounted) {
        setForecastData(res);
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [selectedCommodity, timeframe]);

  // Sinkronisasi data guard: memastikan data forecast benar-benar milik komoditas aktif
  const isDataInSync = useMemo(() => {
    return !loading && forecastData !== null && forecastData.komoditas_id === selectedCommodity;
  }, [loading, forecastData, selectedCommodity]);

  const activeCommodityMeta = useMemo(() => {
    return (
      ALL_CATALOG_COMMODITIES.find((c) => c.id === selectedCommodity) ||
      FORECAST_COMMODITIES.find((c) => c.id === selectedCommodity) ||
      ALL_CATALOG_COMMODITIES[0]
    );
  }, [selectedCommodity]);

  const benchmarkMeta = useMemo(() => {
    return OFFICIAL_REGULATORY_BENCHMARKS[selectedCommodity];
  }, [selectedCommodity]);

  const modelMeta = useMemo(() => {
    return OFFICIAL_MODEL_CHAMPIONS[selectedCommodity] || null;
  }, [selectedCommodity]);

  const activeForecastRows = useMemo(() => {
    if (!isDataInSync || !forecastData) return [];
    const sliced = forecastData.forecast.slice(0, horizon);
    if (statusFilter === "alert") {
      return sliced.filter((r) => r.status !== "Normal");
    }
    return sliced;
  }, [isDataInSync, forecastData, horizon, statusFilter]);

  // Batas default kartu proyeksi di mobile sebelum user klik 'View All'
  const INITIAL_MOBILE_COUNT = 5;
  const displayedMobileRows = useMemo(() => {
    if (showAllMobileCards) return activeForecastRows;
    return activeForecastRows.slice(0, INITIAL_MOBILE_COUNT);
  }, [showAllMobileCards, activeForecastRows]);

  const hasMoreMobileCards = activeForecastRows.length > INITIAL_MOBILE_COUNT;

  const targetHorizonRow = useMemo(() => {
    if (!isDataInSync || !forecastData || forecastData.forecast.length === 0) return null;
    const idx = Math.min(horizon, forecastData.forecast.length) - 1;
    return forecastData.forecast[idx];
  }, [isDataInSync, forecastData, horizon]);

  const actualHorizon = useMemo(() => {
    return targetHorizonRow?.horizon || horizon;
  }, [targetHorizonRow, horizon]);

  // Evaluasi status harga vs benchmark pemerintah (hanya jika data sudah sinkron)
  const isAboveBenchmark = useMemo(() => {
    if (!isDataInSync || !forecastData || !benchmarkMeta) return false;
    return forecastData.currentPrice > benchmarkMeta.price;
  }, [isDataInSync, forecastData, benchmarkMeta]);

  const deltaHapPercent = useMemo(() => {
    if (!isDataInSync || !forecastData || !benchmarkMeta) return 0;
    return Number(
      (((forecastData.currentPrice - benchmarkMeta.price) / benchmarkMeta.price) * 100).toFixed(1)
    );
  }, [isDataInSync, forecastData, benchmarkMeta]);

  // Rekomendasi Satgas TPID dinamis berbasis status regulasi dan tren proyeksi
  const satgasRecommendation = useMemo(() => {
    if (!benchmarkMeta) {
      return "Pasokan terpantau seimbang dalam mekanisme pasar. Tetap lakukan pemantauan berkala.";
    }
    const deltaProj = targetHorizonRow?.deltaPct || 0;
    const benchmarkShortLabel = benchmarkMeta.label.split(" ")[0] || "HAP";

    if (isAboveBenchmark && deltaHapPercent >= 20) {
      return `Harga saat ini telah melampaui ${benchmarkShortLabel} sebesar +${deltaHapPercent}%. Direkomendasikan koordinasi Satgas Pangan untuk Operasi Pasar Terfokus dan audit distribusi pasokan dari sentra produksi.`;
    } else if (isAboveBenchmark) {
      return `Harga berada di atas ${benchmarkShortLabel} (+${deltaHapPercent}%). Direkomendasikan fasilitasi kelancaran logistik antar-daerah dan pengawasan margin pedagang eceran.`;
    } else if (deltaProj >= 6) {
      return `Harga saat ini aman di bawah ${benchmarkShortLabel}, namun diproyeksikan melonjak +${deltaProj}% dalam ${actualHorizon} hari. Tingkatkan pemantauan volume masuk di Pasar Induk Keputran & Osowilangun.`;
    } else {
      return `Harga aman di bawah acuan ${benchmarkMeta.label} dan tren proyeksi terpantau terkendali. Cukup pemantauan pasokan rutin tanpa alokasi intervensi pasar darurat.`;
    }
  }, [isAboveBenchmark, deltaHapPercent, benchmarkMeta, targetHorizonRow, actualHorizon]);

  // Saran belanja konsumen & UMKM dinamis
  const consumerAdvice = useMemo(() => {
    const deltaProj = targetHorizonRow?.deltaPct || 0;
    if (deltaProj >= 5) {
      return `Harga diproyeksikan cenderung naik (+${deltaProj}%). Konsumen disarankan berbelanja sesuai kebutuhan wajar dan membandingkan harga antar-pasar di halaman Peta untuk menemukan pasar termurah.`;
    } else if (deltaProj <= -5) {
      return `Harga diproyeksikan mengalami penurunan (${deltaProj}%). Pasokan berangsur normal, waktu yang baik untuk belanja berkala bagi kebutuhan rumah tangga dan UMKM.`;
    } else {
      return "Harga diproyeksikan relatif stabil dalam rentang normal. Konsumen dan pelaku usaha kuliner dapat berbelanja secara wajar sesuai kebutuhan harian.";
    }
  }, [targetHorizonRow]);

  // Karakteristik & Jalur Pasokan Sentra Dinamis per Komoditas
  const supplyInsight = useMemo(() => {
    if (COMMODITY_SUPPLY_INSIGHTS[selectedCommodity]) {
      return COMMODITY_SUPPLY_INSIGHTS[selectedCommodity];
    }
    return {
      characteristics: `Komoditas ${activeCommodityMeta.name} dipantau stabilitas harganya berdasarkan keseimbangan pasokan musiman di wilayah sentra Jawa Timur dan fluktuasi konsumsi harian masyarakat di Kota Surabaya.`,
      distribution: `Rantai pasok ${activeCommodityMeta.name} mengalir dari wilayah sentra produksi Jawa Timur melalui jaringan pasar induk grosir sebelum disalurkan ke pasar-pasar pantauan utama TPID Surabaya.`,
    };
  }, [selectedCommodity, activeCommodityMeta.name]);

  // Export CSV riil berdasarkan data aktif
  const handleExportCSV = () => {
    if (!forecastData || !isDataInSync) return;
    setExportState("downloading");

    setTimeout(() => {
      const rows = forecastData.forecast.slice(0, horizon);
      const csvHeader =
        "Horizon,Tanggal,Hari,Batas Bawah (Rp),Proyeksi Rata-rata (Rp),Batas Atas (Rp),Perubahan (%),Status,Catatan Pemantauan\n";
      const csvBody = rows
        .map(
          (r) =>
            `"H+${r.horizon}","${r.tanggal}","${r.weekday}","${r.batas_bawah}","${r.harga_prediksi}","${r.batas_atas}","${r.deltaPct}%","${r.status}","${r.recom}"`
        )
        .join("\n");

      const blob = new Blob([csvHeader + csvBody], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute(
        "download",
        `proyeksi_harga_${activeCommodityMeta.name.toLowerCase().replace(/\s+/g, "_")}_${horizon}hari.csv`
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setExportState("success");
      setTimeout(() => setExportState("idle"), 2000);
    }, 600);
  };

  // Kalkulasi koordinat SVG Chart secara matematis dari data riil
  const chartMetrics = useMemo(() => {
    if (!isDataInSync || !forecastData || forecastData.history.length === 0) return null;

    const historyPoints = forecastData.history;
    const forecastPoints = forecastData.forecast.slice(0, horizon);

    const benchmark = OFFICIAL_REGULATORY_BENCHMARKS[selectedCommodity];

    const allPrices = [
      ...historyPoints.map((h) => h.harga),
      ...forecastPoints.flatMap((f) => [f.harga_prediksi, f.batas_bawah, f.batas_atas]),
      ...(benchmark ? [benchmark.price] : []),
    ];

    const rawMin = Math.min(...allPrices);
    const rawMax = Math.max(...allPrices);
    const padding = (rawMax - rawMin) * 0.12 || 1000;
    const minY = Math.floor((rawMin - padding) / 500) * 500;
    const maxY = Math.ceil((rawMax + padding) / 500) * 500;

    const svgWidth = 920;
    const svgHeight = 270;
    const padX = 64;
    const padTop = 36;
    const padBottom = 44;
    const plotWidth = svgWidth - padX * 2;
    const plotHeight = svgHeight - padTop - padBottom;

    const totalSteps = historyPoints.length + forecastPoints.length - 1;

    const getX = (index: number) => {
      return padX + (index / totalSteps) * plotWidth;
    };

    const getY = (val: number) => {
      return svgHeight - padBottom - ((val - minY) / (maxY - minY)) * plotHeight;
    };

    // Koordinat historis
    const histCoords = historyPoints.map((h, i) => ({
      x: getX(i),
      y: getY(h.harga),
      data: h,
    }));

    const todayIdx = historyPoints.length - 1;
    const todayCoord = histCoords[todayIdx];

    // Cek apakah terdapat rentang variansi nyata pada forecast (batas_bawah !== batas_atas)
    const hasSpread = forecastPoints.some((f) => f.batas_atas > f.batas_bawah);

    // Koordinat proyeksi
    const fcCoords = forecastPoints.map((f, i) => ({
      x: getX(todayIdx + 1 + i),
      y: getY(f.harga_prediksi),
      yLow: getY(Math.max(f.batas_bawah, forecastData.currentPrice * 0.7)),
      yHigh: getY(f.batas_atas),
      data: f,
    }));

    // Path kurva histori adaptif: spline halus (Catmull-Rom) untuk timeframe panjang (>20 hari)
    const isSmooth = historyPoints.length > 20;
    const histPath = (() => {
      if (histCoords.length === 0) return "";
      if (histCoords.length <= 2 || !isSmooth) {
        return histCoords.map((c, idx) => `${idx === 0 ? "M" : "L"} ${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
      }
      let d = `M ${histCoords[0].x.toFixed(1)},${histCoords[0].y.toFixed(1)}`;
      const tension = 0.12;
      for (let i = 0; i < histCoords.length - 1; i++) {
        const p0 = histCoords[i === 0 ? 0 : i - 1];
        const p1 = histCoords[i];
        const p2 = histCoords[i + 1];
        const p3 = histCoords[i + 2 < histCoords.length ? i + 2 : i + 1];

        const cp1x = p1.x + (p2.x - p0.x) * tension;
        const cp1y = p1.y + (p2.y - p0.y) * tension;
        const cp2x = p2.x - (p3.x - p1.x) * tension;
        const cp2y = p2.y - (p3.y - p1.y) * tension;

        d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
      }
      return d;
    })();

    const histArea = `${histPath} L ${todayCoord.x.toFixed(1)},${svgHeight - padBottom} L ${padX},${
      svgHeight - padBottom
    } Z`;

    // Path kurva proyeksi
    const fcPath = [todayCoord, ...fcCoords].reduce((acc, curr, idx) => {
      return idx === 0 ? `M ${curr.x.toFixed(1)},${curr.y.toFixed(1)}` : `${acc} L ${curr.x.toFixed(1)},${curr.y.toFixed(1)}`;
    }, "");

    // Path Batas Toleransi (Shaded Band) - hanya dibuat bila hasSpread true
    let ciPolygonPoints = "";
    if (hasSpread) {
      const upperPoints = [todayCoord, ...fcCoords.map((c) => ({ x: c.x, y: c.yHigh }))];
      const lowerPointsReversed = [
        ...fcCoords.map((c) => ({ x: c.x, y: c.yLow })),
        todayCoord,
      ].reverse();

      ciPolygonPoints = [
        ...upperPoints.map((p) => `${p.x},${p.y}`),
        ...lowerPointsReversed.map((p) => `${p.x},${p.y}`),
      ].join(" ");
    }

    // Grid garis referensi harga horizontal
    const midPrice = Math.round((minY + maxY) / 2);
    const gridLines = [
      { price: maxY, y: getY(maxY) },
      { price: midPrice, y: getY(midPrice) },
      { price: minY, y: getY(minY) },
    ];

    // Garis benchmark HAP pemerintah jika ada
    const benchmarkY = benchmark ? getY(benchmark.price) : null;

    // 5 Penanda label sumbu X (Timeline Dinamis Berbasis Data Aktual)
    const histLen = historyPoints.length;
    const midHistIdx = Math.floor(histLen / 2);
    const midFcIdx = Math.floor(forecastPoints.length / 2);

    const formatTimeframeTitle = (daysAgo: number) => {
      if (daysAgo >= 300) return `${Math.round(daysAgo / 365)} Thn Lalu`;
      if (daysAgo >= 60) return `${Math.round(daysAgo / 30)} Bln Lalu`;
      return `${daysAgo} Hari Lalu`;
    };

    const todayWIB = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
    const isAnchorToday = forecastData.latestDate === todayWIB;

    const xLabels = [
      {
        x: histCoords[0]?.x || padX,
        title: formatTimeframeTitle(histLen),
        sub: historyPoints[0]?.formattedDate || "",
        anchor: "start",
      },
      {
        x: histCoords[midHistIdx]?.x || getX(midHistIdx),
        title: formatTimeframeTitle(histLen - 1 - midHistIdx),
        sub: historyPoints[midHistIdx]?.formattedDate || "",
        anchor: "middle",
      },
      {
        x: todayCoord.x,
        title: isAnchorToday ? "Hari Ini" : "Data Terakhir",
        sub: forecastData.formattedLatestDate,
        anchor: "middle",
        isToday: isAnchorToday,
      },
      {
        x: fcCoords[midFcIdx]?.x || getX(todayIdx + 1 + midFcIdx),
        title: `H+${forecastPoints[midFcIdx]?.horizon || Math.round(horizon / 2)}`,
        sub: forecastPoints[midFcIdx]?.formattedDate.slice(0, 6) || "",
        anchor: "middle",
      },
      {
        x: fcCoords[fcCoords.length - 1]?.x || svgWidth - padX,
        title: `H+${forecastPoints[forecastPoints.length - 1]?.horizon || horizon}`,
        sub: forecastPoints[forecastPoints.length - 1]?.formattedDate.slice(0, 6) || "",
        anchor: "end",
      },
    ];

    return {
      svgWidth,
      svgHeight,
      padX,
      padBottom,
      minY,
      maxY,
      histCoords,
      todayCoord,
      fcCoords,
      histPath,
      histArea,
      fcPath,
      ciPolygonPoints,
      hasSpread,
      gridLines,
      benchmarkY,
      benchmarkLabel: benchmark?.label,
      benchmarkPrice: benchmark?.price,
      xLabels,
    };
  }, [isDataInSync, forecastData, horizon, selectedCommodity]);

  return (
    <div className="bg-surface-canvas text-on-surface font-body-md text-body-md antialiased min-h-screen flex flex-col">
      <Header />

      <main className="w-full pt-20 bg-surface-canvas min-h-screen">
        <div className="flex flex-col w-full">
          <div className="w-full max-w-[80rem] mx-auto px-space-md lg:px-gutter-desktop py-space-md flex flex-col gap-space-lg">
            {/* 1. Header & Konteks Halaman */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-md">
              <div className="flex flex-col gap-1">
                <h1 className="font-headline-lg text-headline-lg text-text-primary tracking-tight">
                  Proyeksi Harga Pangan &amp; Tren Pasar
                </h1>
                <p className="font-body-sm text-body-sm text-text-secondary max-w-2xl">
                  Prakiraan harga 7 hingga 14 hari ke depan di pasar Kota Surabaya untuk panduan belanja masyarakat dan bahan evaluasi kebijakan TPID.
                </p>
              </div>

              {/* Tombol Unduh CSV */}
              <div className="flex items-center gap-space-xs shrink-0">
                <button
                  type="button"
                  onClick={handleExportCSV}
                  disabled={loading || !isDataInSync}
                  className="inline-flex items-center gap-2 px-space-md py-2.5 rounded-lg bg-primary text-on-primary font-headline-sm text-body-sm hover:bg-primary-container transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-body-md">
                    {exportState === "downloading"
                      ? "sync"
                      : exportState === "success"
                      ? "check"
                      : "download"}
                  </span>
                  <span>
                    {exportState === "downloading"
                      ? "Menyiapkan CSV..."
                      : exportState === "success"
                      ? "Berhasil Diunduh"
                      : `Unduh CSV (${activeCommodityMeta.name})`}
                  </span>
                </button>
              </div>
            </div>

            {/* 2. Ringkasan Metrik Cepat */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-md">
              {/* Metrik 1: Harga Riil Saat Ini */}
              <div className="bg-surface-card rounded-xl p-space-md shadow-sm border border-border-subtle/70 flex flex-col justify-between">
                <span className="font-label-caps text-label-caps text-text-secondary uppercase">
                  Harga Rata-rata Terkini
                </span>
                <div className="my-1">
                  {loading || !isDataInSync || !forecastData ? (
                    <div className="space-y-1.5 animate-pulse">
                      <div className="w-28 h-7 bg-surface-subtle rounded"></div>
                      <div className="w-36 h-3 bg-surface-subtle rounded"></div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-baseline gap-1">
                        <span className="font-metric-display text-metric-display text-text-primary font-bold">
                          Rp {forecastData.currentPrice.toLocaleString("id-ID")}
                        </span>
                        <span className="font-body-sm text-body-sm text-text-secondary">
                          /{activeCommodityMeta.unit}
                        </span>
                      </div>
                      <span className="font-body-sm text-body-sm text-text-muted">
                        Rata-rata 6 pasar per {forecastData.formattedLatestDate}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Metrik 2: Estimasi Akhir Periode */}
              <div className="bg-surface-card rounded-xl p-space-md shadow-sm border border-border-subtle/70 flex flex-col justify-between">
                <span className="font-label-caps text-label-caps text-text-secondary uppercase">
                  Prakiraan Hari ke-{actualHorizon}
                </span>
                <div className="my-1">
                  {loading || !isDataInSync || !targetHorizonRow ? (
                    <div className="space-y-1.5 animate-pulse">
                      <div className="w-28 h-7 bg-surface-subtle rounded"></div>
                      <div className="w-32 h-3 bg-surface-subtle rounded"></div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-baseline gap-1">
                        <span className="font-metric-display text-metric-display text-text-primary font-bold">
                          Rp {targetHorizonRow.harga_prediksi.toLocaleString("id-ID")}
                        </span>
                        <span className="font-body-sm text-body-sm text-text-secondary">
                          /{activeCommodityMeta.unit}
                        </span>
                      </div>
                      <span className="font-body-sm text-body-sm text-text-muted">
                        {targetHorizonRow.weekday}, {targetHorizonRow.formattedDate}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Metrik 3: Arah Tren Perubahan */}
              <div className="bg-surface-card rounded-xl p-space-md shadow-sm border border-border-subtle/70 flex flex-col justify-between">
                <span className="font-label-caps text-label-caps text-text-secondary uppercase">
                  Arah Perubahan Harga
                </span>
                <div className="my-1">
                  {loading || !isDataInSync || !targetHorizonRow ? (
                    <div className="space-y-1.5 animate-pulse">
                      <div className="w-32 h-7 bg-surface-subtle rounded"></div>
                      <div className="w-40 h-3 bg-surface-subtle rounded"></div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-metric-display text-metric-display font-bold ${
                            targetHorizonRow.deltaPct >= 3
                              ? "text-status-warning"
                              : targetHorizonRow.deltaPct <= -3
                              ? "text-status-normal"
                              : "text-text-primary"
                          }`}
                        >
                          {targetHorizonRow.deltaPct >= 0 ? "+" : ""}{targetHorizonRow.deltaPct}%
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full font-label-caps text-label-caps font-semibold ${
                            targetHorizonRow.deltaPct >= 3
                              ? "bg-status-warning-bg text-status-warning"
                              : targetHorizonRow.deltaPct <= -3
                              ? "bg-status-normal-bg text-status-normal"
                              : "bg-surface-subtle text-text-secondary"
                          }`}
                        >
                          {targetHorizonRow.deltaPct >= 3
                            ? "Cenderung Naik"
                            : targetHorizonRow.deltaPct <= -3
                            ? "Cenderung Turun"
                            : "Stabil"}
                        </span>
                      </div>
                      <span className="font-body-sm text-body-sm text-text-muted">
                        Selisih Rp {Math.abs(targetHorizonRow.deltaRp).toLocaleString("id-ID")} dibanding saat ini
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Metrik 4: Akurasi & Model */}
              <div className="bg-surface-card rounded-xl p-space-md shadow-sm border border-border-subtle/70 flex flex-col hover:shadow-md transition-shadow">
                <span className="font-label-caps text-label-caps text-text-secondary uppercase">
                  Model &amp; Akurasi
                </span>
                <div className="flex-1 flex flex-col justify-center py-2">
                  {modelMeta ? (
                    <>
                      <div className="flex items-baseline gap-2">
                        <span className="font-metric-display text-metric-display text-status-normal font-bold">
                          {modelMeta.accuracy.toFixed(1)}%
                        </span>
                        <span className="font-label-caps text-label-caps text-text-secondary">
                          Akurasi (WAPE {modelMeta.wape.toFixed(2)}%)
                        </span>
                      </div>
                      <span className="text-[11px] text-text-muted mt-1 block">
                        Model: {modelMeta.modelName} • H+7 Walk-Forward Backtest
                      </span>
                    </>
                  ) : (
                    <div className="flex items-baseline gap-2">
                      <span className="font-metric-display text-metric-display text-text-muted font-bold">
                        —
                      </span>
                      <span className="font-label-caps text-label-caps text-text-secondary">
                        Tidak Tersedia
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 3. Grafik Riwayat & Proyeksi Mendatang */}
            <div className="bg-surface-card rounded-xl p-space-md shadow-sm border border-border-subtle/70 flex flex-col gap-space-md">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex flex-col gap-2">
                  <div>
                    <h2 className="font-headline-sm text-headline-sm text-text-primary">
                      Grafik Riwayat &amp; Proyeksi
                    </h2>
                    <p className="font-body-sm text-body-sm text-text-secondary mt-0.5">
                      Menampilkan {forecastData?.history.length || 14} hari data historis transaksi pasar dan {actualHorizon} hari proyeksi ke depan
                      {forecastData?.formattedModelCreatedAt ? ` • Diperbarui: ${forecastData.formattedModelCreatedAt}` : ""}.
                    </p>
                  </div>

                  {/* Legenda Simbol di Bawah Judul (Panjang Sama di Mobile: Grid 2-Kolom) */}
                  <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-1.5 sm:gap-2 pt-0.5">
                    <div className="inline-flex items-center justify-center sm:justify-start gap-1.5 px-2 sm:px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200/80 text-emerald-900 text-[10.5px] sm:text-xs font-medium w-full sm:w-auto">
                      <span className="w-2 h-2 rounded-full bg-emerald-600 shrink-0"></span>
                      <span className="truncate">Rata-rata Pasar</span>
                    </div>

                    <div className="inline-flex items-center justify-center sm:justify-start gap-1.5 px-2 sm:px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200/80 text-amber-900 text-[10.5px] sm:text-xs font-medium w-full sm:w-auto">
                      <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0"></span>
                      <span className="truncate">Proyeksi Model</span>
                    </div>

                    <div className="inline-flex items-center justify-center sm:justify-start gap-1.5 px-2 sm:px-2.5 py-1 rounded-full bg-amber-50/60 border border-amber-200/60 text-amber-900/80 text-[10.5px] sm:text-xs font-medium w-full sm:w-auto">
                      <span className="w-2.5 h-1.5 rounded-xs bg-amber-300/50 border border-amber-400 shrink-0"></span>
                      <span className="truncate">
                        {chartMetrics?.hasSpread ? "Rentang Toleransi" : "Varians Stabil"}
                      </span>
                    </div>

                    {chartMetrics?.benchmarkLabel && (
                      <div className="inline-flex items-center justify-center sm:justify-start gap-1.5 px-2 sm:px-2.5 py-1 rounded-full bg-rose-50 border border-rose-200/80 text-rose-800 text-[10.5px] sm:text-xs font-semibold w-full sm:w-auto">
                        <span className="w-2 h-2 rounded-full bg-rose-600 shrink-0"></span>
                        <span className="truncate">{chartMetrics.benchmarkLabel}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Controls Berdampingan: Dropdown Komoditas + Dropdown Riwayat Waktu (Grid 2-Kolom di Mobile) */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full lg:w-auto shrink-0">
                  {/* Dropdown Komoditas */}
                  <div className="w-full sm:w-60 md:w-64">
                    <CommoditySearchSelect
                      options={ALL_CATALOG_COMMODITIES}
                      valueId={selectedCommodity}
                      onChange={(id) => {
                        setSelectedCommodity(id);
                        setHoveredPoint(null);
                      }}
                      searchPlaceholder="Cari komoditas..."
                      emptyNoun="komoditas"
                      className="w-full"
                      panelClassName="w-full sm:w-80 right-0 left-auto"
                    />
                  </div>

                  {/* Dropdown Riwayat & Horizon: Grid 2-Kolom Berdampingan di Mobile agar Tidak Bertumpuk */}
                  <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 w-full sm:w-auto">
                    <TimeframeSelect
                      value={timeframe}
                      onChange={setTimeframe}
                      className="w-full sm:w-auto"
                      panelClassName="w-56 left-0 sm:left-auto sm:right-0"
                    />

                    {/* Dropdown Horizon Proyeksi (7 Hari / 14 Hari) */}
                    <HorizonSelect
                      value={horizon}
                      onChange={setHorizon}
                      className="w-full sm:w-auto"
                      panelClassName="w-56 right-0 left-auto"
                    />
                  </div>
                </div>
              </div>

              {/* Area SVG Visualizer */}
              <div
                className="w-full relative bg-white rounded-xl p-2 sm:p-4 border border-border-subtle/70 select-none overflow-hidden"
                role="region"
                aria-label="Grafik Tren dan Proyeksi Harga Pangan"
                onMouseLeave={() => setHoveredPoint(null)}
              >
                {/* Mobile Swipe Affordance */}
                <div className="sm:hidden flex items-center justify-between text-text-muted text-[11px] font-medium mb-2 pb-2 border-b border-border-subtle/50">
                  <span className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[15px] text-primary">swipe</span> Geser grafik untuk melihat detail 14 hari proyeksi
                  </span>
                  <span className="text-primary font-bold text-xs">&rarr;</span>
                </div>

                {/* Scrollable Container on Mobile to prevent squishing */}
                <div className="w-full overflow-x-auto no-scrollbar pb-1">
                  <div className="min-w-[720px] sm:min-w-full relative">

                {/* Tooltip Hover Display Dinamis Mengikuti Titik */}
                {hoveredPoint && (
                  <div
                    className="absolute z-30 bg-white/95 backdrop-blur-md px-3.5 py-2.5 rounded-xl shadow-xl border border-border-subtle text-left pointer-events-none transition-opacity duration-150 will-change-transform text-xs"
                    style={{
                      left: hoveredPoint.screenX ? `${Math.min(Math.max(hoveredPoint.screenX, 100), 820)}px` : undefined,
                      top: hoveredPoint.screenY ? `${Math.max(hoveredPoint.screenY - 70, 10)}px` : undefined,
                      right: !hoveredPoint.screenX ? "16px" : undefined,
                      transform: hoveredPoint.screenX ? "translateX(-50%)" : undefined,
                    }}
                  >
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <span className="font-semibold text-text-muted text-[11px]">
                        {hoveredPoint.label}
                      </span>
                      <span className="text-[10px] text-text-muted font-medium">
                        {hoveredPoint.date}
                      </span>
                    </div>
                    <div className="font-bold text-text-primary text-sm">
                      Rp {hoveredPoint.price.toLocaleString("id-ID")}
                      <span className="text-xs font-normal text-text-secondary">/{activeCommodityMeta.unit}</span>
                    </div>
                    {hoveredPoint.lower !== undefined && hoveredPoint.upper !== undefined && (
                      <div className="mt-1 pt-1 border-t border-border-subtle/80 text-[11px] text-text-secondary">
                        {hoveredPoint.lower === hoveredPoint.upper ? (
                          <span className="text-emerald-700 font-medium">Rentang Toleransi: Stabil (Varians 0%)</span>
                        ) : (
                          <span>
                            Rentang Wajar: Rp {hoveredPoint.lower.toLocaleString("id-ID")} - {hoveredPoint.upper.toLocaleString("id-ID")}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {loading ? (
                  <div className="relative w-full h-[240px] sm:h-[260px] animate-pulse select-none flex flex-col justify-between py-2">
                    <svg className="w-full h-[200px]" viewBox="0 0 1000 200" preserveAspectRatio="none">
                      {/* Grid Lines */}
                      <line x1="60" y1="30" x2="940" y2="30" stroke="currentColor" strokeOpacity="0.08" strokeDasharray="4 4" />
                      <line x1="60" y1="85" x2="940" y2="85" stroke="currentColor" strokeOpacity="0.08" strokeDasharray="4 4" />
                      <line x1="60" y1="140" x2="940" y2="140" stroke="currentColor" strokeOpacity="0.08" strokeDasharray="4 4" />
                      <line x1="60" y1="185" x2="940" y2="185" stroke="currentColor" strokeOpacity="0.12" />

                      {/* Today divider */}
                      <line x1="500" y1="15" x2="500" y2="185" stroke="currentColor" strokeOpacity="0.15" strokeDasharray="3 3" />

                      {/* Simulated Historical & Projection Wave */}
                      <path
                        d="M 60,120 Q 180,95 320,115 T 500,90 Q 650,75 780,82 T 940,65"
                        fill="none"
                        stroke="currentColor"
                        strokeOpacity="0.25"
                        strokeWidth="3"
                      />
                      {/* Simulated Confidence Band Area */}
                      <path
                        d="M 500,90 Q 650,55 780,62 T 940,45 L 940,95 Q 780,105 650,100 T 500,90 Z"
                        fill="currentColor"
                        fillOpacity="0.08"
                      />
                    </svg>
                    {/* Bottom Date Labels Skeleton */}
                    <div className="flex justify-between px-6 pt-1">
                      <div className="w-16 h-3 bg-surface-subtle rounded"></div>
                      <div className="w-16 h-3 bg-surface-subtle rounded"></div>
                      <div className="w-20 h-3 bg-surface-subtle rounded"></div>
                      <div className="w-16 h-3 bg-surface-subtle rounded"></div>
                      <div className="w-16 h-3 bg-surface-subtle rounded"></div>
                    </div>
                  </div>
                ) : !isDataInSync || !chartMetrics ? (
                  <div className="h-[280px] flex flex-col items-center justify-center gap-3 text-text-muted text-center p-6">
                    <span className="material-symbols-outlined text-4xl text-status-warning">error_outline</span>
                    <div className="max-w-md">
                      <h3 className="font-headline-sm text-text-primary text-base">Data Proyeksi Belum Tersedia</h3>
                      <p className="text-body-sm text-text-secondary mt-1">
                        Model belum menghasilkan data forecast aktif untuk komoditas {activeCommodityMeta.name}. Silakan pilih komoditas lain.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setLoading(true);
                        getLiveForecastDetails(selectedCommodity).then((res) => {
                          setForecastData(res);
                          setLoading(false);
                        });
                      }}
                      className="mt-1 px-4 py-2 rounded-lg bg-primary text-on-primary font-headline-sm text-body-sm hover:bg-primary-container transition-colors cursor-pointer"
                    >
                      Muat Ulang
                    </button>
                  </div>
                ) : (
                  <div className="relative w-full aspect-[920/270]">
                    {/* 1. Vector Graph Canvas */}
                    <svg
                      className="w-full h-full overflow-visible"
                      viewBox={`0 0 ${chartMetrics.svgWidth} ${chartMetrics.svgHeight}`}
                      preserveAspectRatio="none"
                      role="img"
                      aria-label={`Grafik Tren dan Proyeksi Harga ${activeCommodityMeta.name}`}
                      onMouseLeave={() => setHoveredPoint(null)}
                    >
                        <title>Grafik Proyeksi Harga {activeCommodityMeta.name}</title>
                        <defs>
                          <linearGradient id="histAreaGrad" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor="#004328" stopOpacity="0.18" />
                            <stop offset="100%" stopColor="#004328" stopOpacity="0.01" />
                          </linearGradient>
                          <linearGradient id="ciBandGrad" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor="#d97706" stopOpacity="0.22" />
                            <stop offset="100%" stopColor="#d97706" stopOpacity="0.04" />
                          </linearGradient>
                        </defs>

                        {/* Garis Grid Horizontal (Subtle & Clean) */}
                        {chartMetrics.gridLines.map((gl, i) => (
                          <line
                            key={`gl-line-${i}`}
                            x1={chartMetrics.padX}
                            x2={chartMetrics.svgWidth - chartMetrics.padX}
                            y1={gl.y}
                            y2={gl.y}
                            stroke="#E2E8F0"
                            strokeWidth="1"
                          />
                        ))}

                        {/* Garis Acuan Regulasi Pemerintah (HAP / HET Bapanas) */}
                        {chartMetrics.benchmarkY !== null && chartMetrics.benchmarkPrice && (
                          <g>
                            <line
                              x1={chartMetrics.padX}
                              x2={chartMetrics.svgWidth - chartMetrics.padX}
                              y1={chartMetrics.benchmarkY}
                              y2={chartMetrics.benchmarkY}
                              stroke="#DC2626"
                              strokeDasharray="5 4"
                              strokeWidth="1.5"
                              opacity="0.8"
                            />
                            <text
                              x={chartMetrics.svgWidth - chartMetrics.padX + 5}
                              y={chartMetrics.benchmarkY + 3.5}
                              fill="#DC2626"
                              fontSize="10"
                              fontWeight="bold"
                              textAnchor="start"
                              className="select-none font-sans"
                            >
                              {chartMetrics.benchmarkLabel.split(" ")[0]}
                            </text>
                          </g>
                        )}

                        {/* Shading Rentang Batas Toleransi (Subtle Band) */}
                        {chartMetrics.hasSpread && chartMetrics.ciPolygonPoints && (
                          <polygon fill="url(#ciBandGrad)" points={chartMetrics.ciPolygonPoints} opacity="0.6" />
                        )}

                        {/* Garis Histori Riil (Sleek Linear Style, Stroke Width 2px) */}
                        <path
                          d={chartMetrics.histPath}
                          fill="none"
                          stroke="#004328"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />

                        {/* Garis Proyeksi (Sleek Dashed Style, Stroke Width 2px) */}
                        <path
                          d={chartMetrics.fcPath}
                          fill="none"
                          stroke="#D97706"
                          strokeWidth="2"
                          strokeDasharray="5 4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />

                        {/* Garis Vertikal Pembatas: Hari Ini */}
                        <line
                          x1={chartMetrics.todayCoord.x}
                          x2={chartMetrics.todayCoord.x}
                          y1={24}
                          y2={chartMetrics.svgHeight - chartMetrics.padBottom}
                          stroke="#94A3B8"
                          strokeDasharray="3 3"
                          strokeWidth="1"
                          opacity="0.5"
                        />

                        {/* Titik-titik data historis (Solid Dot Markers) */}
                        {chartMetrics.histCoords.map((pt, i) => {
                          const isLast = i === chartMetrics.histCoords.length - 1;
                          // Untuk rentang waktu panjang (>35 hari / 3 bulan / 6 bulan / 1 tahun), hindari tumpukan titik statis
                          // Cukup tampilkan titik jangkar Hari Ini (isLast) agar kurva tetap bersih dan mulus
                          const isLongTimeframe = chartMetrics.histCoords.length > 35;
                          const shouldRenderDot =
                            !isLongTimeframe
                              ? true
                              : isLast;

                          if (!shouldRenderDot) return null;

                          return (
                            <circle
                              key={`hist-${i}`}
                              cx={pt.x}
                              cy={pt.y}
                              r={isLast ? 3.8 : 3}
                              fill="#004328"
                              className="cursor-pointer transition-transform hover:scale-150"
                              onMouseEnter={() => {
                                const todayWIB = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
                                const isAnchorToday = forecastData?.latestDate === todayWIB;
                                setHoveredPoint({
                                  date: pt.data.formattedDate,
                                  label:
                                    isLast
                                      ? isAnchorToday
                                        ? "Hari Ini (Terkini)"
                                        : "Data Terakhir"
                                      : pt.data.isImputed
                                      ? "Estimasi Pasar (Forward-fill)"
                                      : "Observasi Pasar",
                                  price: pt.data.harga,
                                  isForecast: false,
                                  screenX: pt.x,
                                  screenY: pt.y,
                                });
                              }}
                            />
                          );
                        })}

                        {/* Titik-titik proyeksi (Solid Dot Markers) */}
                        {chartMetrics.fcCoords.map((pt, i) => (
                          <circle
                            key={`fc-${i}`}
                            cx={pt.x}
                            cy={pt.y}
                            r={3}
                            fill="#D97706"
                            className="cursor-pointer transition-transform hover:scale-150"
                            onMouseEnter={() =>
                              setHoveredPoint({
                                date: `${pt.data.weekday}, ${pt.data.formattedDate}`,
                                label: `Proyeksi H+${pt.data.horizon}`,
                                price: pt.data.harga_prediksi,
                                lower: pt.data.batas_bawah,
                                upper: pt.data.batas_atas,
                                isForecast: true,
                                screenX: pt.x,
                                screenY: pt.y,
                              })
                            }
                          />
                        ))}
                      </svg>

                      {/* 2. HTML Typography Overlay */}

                      {/* Label Sumbu Y (Tingkat Harga) */}
                      {chartMetrics.gridLines.map((gl, i) => (
                        <div
                          key={`gl-lbl-${i}`}
                          className="absolute -translate-y-1/2 text-[11px] font-medium text-slate-500 tabular-nums pointer-events-none select-none font-sans"
                          style={{
                            left: 0,
                            top: `${(gl.y / chartMetrics.svgHeight) * 100}%`,
                            width: `${(chartMetrics.padX / chartMetrics.svgWidth) * 100}%`,
                            paddingRight: "8px",
                            textAlign: "right",
                          }}
                        >
                          Rp {gl.price.toLocaleString("id-ID")}
                        </div>
                      ))}

                      {/* Callout Badge: Hari Ini */}
                      <div
                        className="absolute -translate-x-1/2 -translate-y-full -mt-2.5 pointer-events-none select-none z-10 transition-[left,top,opacity] duration-200 ease-out will-change-transform"
                        style={{
                          left: `${(chartMetrics.todayCoord.x / chartMetrics.svgWidth) * 100}%`,
                          top: `${(chartMetrics.todayCoord.y / chartMetrics.svgHeight) * 100}%`,
                        }}
                      >
                        <div className="inline-flex items-center px-2.5 py-1 rounded-full bg-primary text-on-primary text-[11px] font-bold shadow-md whitespace-nowrap font-sans">
                          Rp {forecastData ? forecastData.currentPrice.toLocaleString("id-ID") : ""}
                        </div>
                      </div>

                      {/* Callout Badge: Titik Akhir Proyeksi */}
                      {chartMetrics.fcCoords.length > 0 && targetHorizonRow && (
                        <div
                          className="absolute -translate-x-1/2 -translate-y-full -mt-2.5 pointer-events-none select-none z-10 transition-[left,top,opacity] duration-200 ease-out will-change-transform"
                          style={{
                            left: `${(chartMetrics.fcCoords[chartMetrics.fcCoords.length - 1].x / chartMetrics.svgWidth) * 100}%`,
                            top: `${(chartMetrics.fcCoords[chartMetrics.fcCoords.length - 1].y / chartMetrics.svgHeight) * 100}%`,
                          }}
                        >
                          <div className="inline-flex items-center px-2.5 py-1 rounded-full bg-status-warning text-white text-[11px] font-bold shadow-md whitespace-nowrap font-sans">
                            H+{actualHorizon}: Rp {targetHorizonRow.harga_prediksi.toLocaleString("id-ID")}
                          </div>
                        </div>
                      )}

                      {/* Label Sumbu X Dinamis — dikurung di dalam pita padBottom supaya tidak terpotong overflow-x-auto */}
                      <div
                        className="absolute left-0 right-0 bottom-0 pointer-events-none select-none"
                        style={{ top: `${((chartMetrics.svgHeight - chartMetrics.padBottom) / chartMetrics.svgHeight) * 100}%` }}
                      >
                        {chartMetrics.xLabels.map((lbl, idx) => (
                          <div
                            key={`xlbl-${idx}`}
                            className={`absolute text-center ${
                              lbl.anchor === "start"
                                ? "translate-x-0"
                                : lbl.anchor === "end"
                                ? "-translate-x-full"
                                : "-translate-x-1/2"
                            }`}
                            style={{
                              left: `${(lbl.x / chartMetrics.svgWidth) * 100}%`,
                            }}
                          >
                            <span
                              className={`block text-[11px] leading-tight font-sans ${
                                lbl.isToday
                                  ? "text-text-primary font-bold"
                                  : "text-text-secondary font-semibold"
                              }`}
                            >
                              {lbl.title}
                            </span>
                            <span
                              className={`block text-[10px] leading-tight mt-0.5 font-sans ${
                                lbl.isToday
                                  ? "text-primary font-bold"
                                  : "text-text-muted font-normal"
                              }`}
                            >
                              {lbl.sub}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                )}
                  </div>
                </div>
              </div>
            </div>

            {/* 5. Kotak Panduan Interpretasi Praktis bagi Stakeholder */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
              {/* Card 1: Bagi Masyarakat & Konsumen */}
              <div className="bg-surface-card rounded-xl p-space-md shadow-sm border border-border-subtle/70 flex flex-col justify-between gap-space-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold shrink-0">
                      <span className="material-symbols-outlined text-body-lg">shopping_basket</span>
                    </span>
                    <span className="font-headline-sm text-xs sm:text-body-md text-text-primary font-bold">
                      Panduan bagi Masyarakat &amp; UMKM
                    </span>
                  </div>
                  <span
                    className={`px-2.5 py-0.5 rounded-full font-label-caps text-[10px] sm:text-label-caps font-semibold whitespace-nowrap shrink-0 ${
                      (targetHorizonRow?.deltaPct || 0) >= 5
                        ? "bg-status-warning-bg text-status-warning"
                        : "bg-status-normal-bg text-status-normal"
                    }`}
                  >
                    {(targetHorizonRow?.deltaPct || 0) >= 5
                      ? "Perlu Perhatian"
                      : "Kondisi Belanja Aman"}
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  <p className="font-body-sm text-body-sm text-text-secondary leading-relaxed text-justify">
                    Harga {activeCommodityMeta.name} diprediksi{" "}
                    <strong>
                      {(targetHorizonRow?.deltaPct || 0) >= 3
                        ? `mengalami kenaikan sekitar +${targetHorizonRow?.deltaPct}%`
                        : (targetHorizonRow?.deltaPct || 0) <= -3
                        ? `mengalami penurunan sekitar ${targetHorizonRow?.deltaPct}%`
                        : "relatif stabil di kisaran harga saat ini"}
                    </strong>{" "}
                    dalam {actualHorizon} hari ke depan.
                  </p>
                  <div className="bg-surface-subtle p-2.5 rounded-lg flex items-start gap-2 text-text-primary font-body-sm text-body-sm border border-border-subtle/50">
                    <span className="material-symbols-outlined text-primary text-body-md shrink-0 mt-0.5">
                      lightbulb
                    </span>
                    <span className="text-justify">
                      <strong>Saran Belanja:</strong> {consumerAdvice}
                    </span>
                  </div>
                </div>
              </div>

              {/* Card 2: Bagi Pemerintah Kota Surabaya & TPID */}
              <div className="bg-surface-card rounded-xl p-space-md shadow-sm border border-border-subtle/70 flex flex-col justify-between gap-space-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-8 h-8 rounded-lg bg-status-warning-bg text-status-warning flex items-center justify-center font-bold shrink-0">
                      <span className="material-symbols-outlined text-body-lg">account_balance</span>
                    </span>
                    <span className="font-headline-sm text-xs sm:text-body-md text-text-primary font-bold">
                      Panduan bagi Pemkot Surabaya &amp; TPID
                    </span>
                  </div>
                  <span
                    className={`px-2.5 py-0.5 rounded-full font-label-caps text-[10px] sm:text-label-caps font-semibold whitespace-nowrap shrink-0 ${
                      isAboveBenchmark
                        ? "bg-status-critical-bg text-status-critical"
                        : "bg-status-normal-bg text-status-normal"
                    }`}
                  >
                    {benchmarkMeta
                      ? isAboveBenchmark
                        ? `Di Atas ${benchmarkMeta.label.split(" ")[0]} (+${deltaHapPercent}%)`
                        : `Sesuai ${benchmarkMeta.label.split(" ")[0]}`
                      : "Stabil"}
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  <p className="font-body-sm text-body-sm text-text-secondary leading-relaxed text-justify">
                    {benchmarkMeta && isDataInSync && forecastData ? (
                      <>
                        Harga rata-rata pasar saat ini berada{" "}
                        <strong>
                          {isAboveBenchmark
                            ? `Rp ${(forecastData.currentPrice - benchmarkMeta.price).toLocaleString("id-ID")} di atas ${benchmarkMeta.label}`
                            : `dalam batas aman regulasi ${benchmarkMeta.label}`}
                        </strong>{" "}
                        (Rp {benchmarkMeta.price.toLocaleString("id-ID")}/{activeCommodityMeta.unit}).
                      </>
                    ) : (
                      "Harga komoditas berada dalam koridor ekuilibrium pasar yang terpantau terkendali."
                    )}
                  </p>
                  <div className="bg-surface-subtle p-2.5 rounded-lg flex items-start gap-2 text-text-primary font-body-sm text-body-sm border border-border-subtle/50">
                    <span className="material-symbols-outlined text-status-warning text-body-md shrink-0 mt-0.5">
                      policy
                    </span>
                    <span className="text-justify">
                      <strong>Rekomendasi Satgas:</strong> {satgasRecommendation}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 6. Tabel Rincian Proyeksi Harian */}
            <div className="bg-surface-card rounded-xl p-space-md shadow-sm border border-border-subtle/70 flex flex-col gap-space-md">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm">
                <div>
                  <h2 className="font-headline-sm text-headline-sm text-text-primary">
                    Rincian Proyeksi Harian
                  </h2>
                  <p className="font-body-sm text-body-sm text-text-secondary mt-0.5">
                    Taksiran harga rata-rata, rentang toleransi, dan catatan pemantauan harian.
                  </p>
                </div>

                {/* Filter Status Tabel */}
                <div className="flex items-center gap-space-xs">
                  <span className="font-label-caps text-label-caps text-text-muted mr-1">Status:</span>
                  <button
                    type="button"
                    aria-pressed={statusFilter === "all"}
                    onClick={() => setStatusFilter("all")}
                    className={`px-3 py-1 rounded-md font-label-caps text-label-caps transition-colors cursor-pointer ${
                      statusFilter === "all"
                        ? "bg-primary text-on-primary"
                        : "bg-surface-subtle text-text-secondary hover:text-text-primary"
                    }`}
                  >
                    Semua ({actualHorizon})
                  </button>
                  <button
                    type="button"
                    aria-pressed={statusFilter === "alert"}
                    onClick={() => setStatusFilter("alert")}
                    className={`px-3 py-1 rounded-md font-label-caps text-label-caps transition-colors cursor-pointer ${
                      statusFilter === "alert"
                        ? "bg-status-warning text-on-primary"
                        : "bg-surface-subtle text-text-secondary hover:text-text-primary"
                    }`}
                  >
                    Waspada / Perhatian
                  </button>
                </div>
              </div>

              {/* Table Container */}
              {/* 1. Tampilan Desktop & Tablet: Data Table */}
              <div className="hidden md:block w-full overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-surface-subtle font-label-caps text-label-caps text-text-secondary uppercase">
                      <th scope="col" className="py-3 px-4 rounded-l-lg">Horizon</th>
                      <th scope="col" className="py-3 px-4">Tanggal</th>
                      <th scope="col" className="py-3 px-4">Batas Bawah</th>
                      <th scope="col" className="py-3 px-4">Proyeksi Rata-rata</th>
                      <th scope="col" className="py-3 px-4">Batas Atas</th>
                      <th scope="col" className="py-3 px-4">Perubahan vs Saat Ini</th>
                      <th scope="col" className="py-3 px-4">Status</th>
                      <th scope="col" className="py-3 px-4 rounded-r-lg">Catatan Pemantauan</th>
                    </tr>
                  </thead>
                  <tbody className="font-body-sm text-body-sm divide-y divide-surface-subtle">
                    {loading ? (
                      Array.from({ length: 7 }).map((_, idx) => (
                        <tr key={idx} className="border-b border-surface-subtle/40 animate-pulse">
                          <td className="py-3 px-4">
                            <div className="w-10 h-4 bg-surface-subtle rounded"></div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="space-y-1">
                              <div className="w-16 h-3.5 bg-surface-subtle rounded"></div>
                              <div className="w-20 h-2.5 bg-surface-subtle rounded"></div>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="w-20 h-4 bg-surface-subtle rounded"></div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="w-20 h-4 bg-surface-subtle rounded"></div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="w-20 h-4 bg-surface-subtle rounded"></div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="w-14 h-4 bg-surface-subtle rounded"></div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="w-16 h-5 bg-surface-subtle rounded-full"></div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="w-48 h-4 bg-surface-subtle rounded"></div>
                          </td>
                        </tr>
                      ))
                    ) : activeForecastRows.length > 0 ? (
                      activeForecastRows.map((row) => (
                        <tr key={row.horizon} className="hover:bg-surface-subtle/50 transition-colors">
                          <td className="py-3 px-4 font-headline-sm text-body-md text-text-primary">
                            H+{row.horizon}
                          </td>
                          <td className="py-3 px-4 text-text-secondary">
                            <span className="font-semibold text-text-primary block">
                              {row.weekday}
                            </span>
                            <span className="text-[12px] text-text-muted">{row.formattedDate}</span>
                          </td>
                          <td className="py-3 px-4 text-text-secondary">
                            Rp {row.batas_bawah.toLocaleString("id-ID")}
                          </td>
                          <td className="py-3 px-4 font-semibold text-text-primary">
                            Rp {row.harga_prediksi.toLocaleString("id-ID")}
                          </td>
                          <td className="py-3 px-4 text-text-secondary">
                            Rp {row.batas_atas.toLocaleString("id-ID")}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`font-semibold ${
                                row.deltaPct >= 3
                                  ? "text-status-warning"
                                  : row.deltaPct <= -3
                                  ? "text-status-normal"
                                  : "text-text-secondary"
                              }`}
                            >
                              {row.deltaPct >= 0 ? `+${row.deltaPct}%` : `${row.deltaPct}%`}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full font-label-caps text-label-caps font-semibold ${
                                row.status === "Tinggi"
                                  ? "bg-status-critical-bg text-status-critical"
                                  : row.status === "Waspada"
                                  ? "bg-status-warning-bg text-status-warning"
                                  : "bg-status-normal-bg text-status-normal"
                              }`}
                            >
                              {row.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-text-secondary max-w-xs">{row.recom}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-text-muted">
                          Tidak ada baris yang memenuhi kriteria filter.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* 2. Tampilan HP (< md / < 768px): Card View List sesuai Desain Referensi Mobile */}
              <div className="block md:hidden space-y-3">
                {loading ? (
                  Array.from({ length: 4 }).map((_, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-xl bg-surface-card border border-border-subtle/80 shadow-xs animate-pulse space-y-3"
                    >
                      <div className="flex justify-between items-center">
                        <div className="w-28 h-4 bg-surface-subtle rounded"></div>
                        <div className="w-20 h-5 bg-surface-subtle rounded-full"></div>
                      </div>
                      <div className="flex justify-between items-baseline">
                        <div className="w-36 h-6 bg-surface-subtle rounded"></div>
                        <div className="w-14 h-4 bg-surface-subtle rounded"></div>
                      </div>
                      <div className="pt-2 border-t border-border-subtle/40 space-y-2">
                        <div className="w-full h-3 bg-surface-subtle rounded"></div>
                        <div className="w-2/3 h-3 bg-surface-subtle rounded"></div>
                      </div>
                    </div>
                  ))
                ) : displayedMobileRows.length > 0 ? (
                  <>
                    {displayedMobileRows.map((row) => (
                      <div
                        key={row.horizon}
                        className="p-4 rounded-xl bg-white border border-slate-200 hover:border-slate-300 transition-all shadow-xs flex flex-col gap-3"
                      >
                        {/* Baris Atas: Kode Horizon & Tanggal vs Status Badge */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 font-mono text-xs text-slate-500">
                            <span className="font-bold text-slate-900 tracking-wide">H+{row.horizon}</span>
                            <span>•</span>
                            <span className="text-slate-600 font-medium">{row.weekday}, {row.formattedDate}</span>
                          </div>
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full font-label-caps text-xs font-bold tracking-wide shrink-0 ${
                              row.status === "Tinggi"
                                ? "bg-rose-100 text-rose-800 border border-rose-300"
                                : row.status === "Waspada"
                                ? "bg-amber-100 text-amber-900 border border-amber-300"
                                : "bg-emerald-100 text-emerald-800 border border-emerald-300"
                            }`}
                          >
                            {row.status}
                          </span>
                        </div>

                        {/* Baris Utama: Proyeksi Rata-rata & Perubahan */}
                        <div className="flex items-baseline justify-between gap-2 pt-1">
                          <div>
                            <span className="text-[10px] uppercase tracking-wider text-slate-500 block font-label-caps font-bold">
                              Proyeksi Rata-rata
                            </span>
                            <span className="text-xl font-extrabold font-headline-sm text-slate-900 tracking-tight">
                              Rp {row.harga_prediksi.toLocaleString("id-ID")}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] uppercase tracking-wider text-slate-500 block font-label-caps font-bold">
                              vs Saat Ini
                            </span>
                            <span
                              className={`font-bold text-sm inline-flex items-center gap-0.5 ${
                                row.deltaPct >= 3
                                  ? "text-rose-600"
                                  : row.deltaPct <= -3
                                  ? "text-emerald-600"
                                  : "text-slate-600"
                              }`}
                            >
                              {row.deltaPct >= 0 ? `+${row.deltaPct}%` : `${row.deltaPct}%`}
                              {row.deltaPct > 0 ? " ▲" : row.deltaPct < 0 ? " ▼" : ""}
                            </span>
                          </div>
                        </div>

                        {/* Baris Detail: Toleransi & Catatan */}
                        <div className="pt-2 border-t border-slate-100 flex flex-col gap-2 font-body-sm text-xs">
                          <div className="flex items-center justify-between text-slate-600">
                            <span className="font-medium text-slate-500">Rentang Toleransi</span>
                            <span className="font-bold text-slate-900">
                              Rp {row.batas_bawah.toLocaleString("id-ID")} – Rp {row.batas_atas.toLocaleString("id-ID")}
                            </span>
                          </div>

                          {row.recom && (
                            <div className="bg-slate-50 rounded-lg p-2.5 text-slate-700 leading-relaxed border border-slate-200/80 flex items-start gap-2">
                              <span className="material-symbols-outlined text-[16px] text-emerald-700 shrink-0 mt-0.5">
                                info
                              </span>
                              <span className="text-xs font-medium text-justify">{row.recom}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}

                    {/* Tombol View All / Tampilkan Lebih Sedikit (Khusus Mobile) */}
                    {hasMoreMobileCards && (
                      <div className="pt-1 flex flex-col items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setShowAllMobileCards((prev) => !prev)}
                          className="w-full py-2.5 px-4 rounded-xl bg-slate-100/90 hover:bg-slate-200 active:scale-[0.99] text-slate-800 font-bold text-xs sm:text-sm border border-slate-300/80 transition-all flex items-center justify-center gap-2 shadow-2xs cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[19px] text-primary">
                            {showAllMobileCards ? "expand_less" : "expand_more"}
                          </span>
                          <span>
                            {showAllMobileCards
                              ? `Tampilkan Lebih Sedikit (${INITIAL_MOBILE_COUNT} Hari Terdekat)`
                              : `Lihat Semua Proyeksi (${activeForecastRows.length} Hari)`}
                          </span>
                          {!showAllMobileCards && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-primary/10 text-primary border border-primary/20">
                              +{activeForecastRows.length - INITIAL_MOBILE_COUNT} Lagi
                            </span>
                          )}
                        </button>
                        <span className="text-[11px] text-slate-500 font-medium">
                          {showAllMobileCards
                            ? `Menampilkan seluruh ${activeForecastRows.length} hari proyeksi`
                            : `Menampilkan ${INITIAL_MOBILE_COUNT} dari ${activeForecastRows.length} hari proyeksi harian`}
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="p-6 rounded-xl bg-surface-card border border-border-subtle/60 text-center text-text-muted text-body-sm">
                    Tidak ada baris yang memenuhi kriteria filter.
                  </div>
                )}
              </div>
            </div>

            {/* 7. Karakteristik Komoditas & Jalur Pasokan (Faktual Dinamis Sesuai Temuan Riset & Komoditas) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
              <div className="bg-surface-card rounded-xl p-space-md shadow-sm border border-border-subtle/70 flex flex-col gap-2">
                <div className="flex items-center gap-2 text-primary font-headline-sm text-body-md">
                  <span className="material-symbols-outlined text-body-lg">insights</span>
                  <span>Karakteristik &amp; Sensitivitas Pasokan</span>
                </div>
                <p className="font-body-sm text-body-sm text-text-secondary leading-relaxed">
                  {supplyInsight.characteristics}
                </p>
              </div>

              <div className="bg-surface-card rounded-xl p-space-md shadow-sm border border-border-subtle/70 flex flex-col gap-2">
                <div className="flex items-center gap-2 text-primary font-headline-sm text-body-md">
                  <span className="material-symbols-outlined text-body-lg">local_shipping</span>
                  <span>Jalur Distribusi Sentra ke Surabaya</span>
                </div>
                <p className="font-body-sm text-body-sm text-text-secondary leading-relaxed">
                  {supplyInsight.distribution}
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
