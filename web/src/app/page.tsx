"use client";

import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import {
  getLiveCommodities,
  getLiveStabilitySummary,
  getLiveShoppingBasket,
  getLiveMarketComparisonTrends,
  DEFAULT_BASKET_ITEMS,
  COMMODITY_BASKET_META,
  CommodityPrice,
  FoodStabilitySummary,
  BasketItem,
  ShoppingBasketSimulation,
  MarketTrendComparisonResult,
  TREND_MARKET_CONFIGS,
  ALL_CATALOG_COMMODITIES,
  TIMEFRAME_CONFIG,
  TimeframeOption,
} from "@/lib/dataService";
import CommodityIcon from "@/components/CommodityIcon";
import CommoditySearchSelect from "@/components/CommoditySearchSelect";

export default function HomePage() {
  const [selectedCategory, setSelectedCategory] = useState<string>("Semua");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [addedItems, setAddedItems] = useState<{ [key: string]: boolean }>({});
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [commodities, setCommodities] = useState<CommodityPrice[]>([]);
  const [loadingCommodities, setLoadingCommodities] = useState<boolean>(true);
  const [errorCommodities, setErrorCommodities] = useState<boolean>(false);
  const [stabilitySummary, setStabilitySummary] = useState<FoodStabilitySummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState<boolean>(true);

  // Dynamic Real Shopping Basket State
  const [basketList, setBasketList] = useState<BasketItem[]>(DEFAULT_BASKET_ITEMS);
  const [checkedItems, setCheckedItems] = useState<Record<number, boolean>>({});
  const [basketSim, setBasketSim] = useState<ShoppingBasketSimulation | null>(null);
  const [isBasketLoading, setIsBasketLoading] = useState<boolean>(false);
  const [showFloatingBasket, setShowFloatingBasket] = useState<boolean>(false);
  const [isMounted, setIsMounted] = useState<boolean>(false);
  const shoppingFreq = 4;
  const [basketViewMode, setBasketViewMode] = useState<"single" | "split">("single");

  const activeBasketList = useMemo(() => {
    return basketList.filter((b) => checkedItems[b.komoditas_id] !== false);
  }, [basketList, checkedItems]);

  // Mini Price Ticker untuk Hero: 4 komoditas kunci harian Surabaya
  const heroTickerItems = useMemo(() => {
    if (!commodities || commodities.length === 0) return [];
    const targetIds = [50, 16, 2, 39]; // Cabai Rawit Merah, Telur Ayam Ras, Beras Medium, Bawang Merah
    const picked: CommodityPrice[] = [];

    targetIds.forEach((id) => {
      const found = commodities.find((c) => c.komoditas_id === id);
      if (found) picked.push(found);
    });

    if (picked.length < 4) {
      commodities.forEach((c) => {
        if (!picked.some((p) => p.id === c.id) && picked.length < 4) {
          picked.push(c);
        }
      });
    }

    return picked.slice(0, 4);
  }, [commodities]);

  // Multi-Commodity 14-Day Trajectory State
  // Per-Market Trajectory Comparison for Selected Commodity
  const [trendCommodityId, setTrendCommodityId] = useState<number>(50); // Default: Cabai Rawit Merah
  const [trendTimeframe, setTrendTimeframe] = useState<TimeframeOption>("7d");
  const [marketTrendsData, setMarketTrendsData] = useState<MarketTrendComparisonResult | null>(null);
  const [loadingTrends, setLoadingTrends] = useState<boolean>(true);
  const [errorTrends, setErrorTrends] = useState<boolean>(false);
  const [activeMarkets, setActiveMarkets] = useState<Record<string, boolean>>({
    keputran: true,
    wonokromo: true,
    genteng: true,
    pucanganom: true,
    tambahrejo: true,
    soponyono: true,
  });
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);
  const [highlightedMarketId, setHighlightedMarketId] = useState<string | null>(null);

  const loadMainData = async () => {
    setLoadingCommodities(true);
    setLoadingSummary(true);
    setErrorCommodities(false);
    try {
      const [liveData, liveSummary] = await Promise.all([
        getLiveCommodities(),
        getLiveStabilitySummary(),
      ]);
      if (liveData && liveData.length > 0) {
        setCommodities(liveData);
        setErrorCommodities(false);
      } else {
        setErrorCommodities(true);
      }
      if (liveSummary) {
        setStabilitySummary(liveSummary);
      }
    } catch {
      setErrorCommodities(true);
    } finally {
      setLoadingCommodities(false);
      setLoadingSummary(false);
    }
  };

  useEffect(() => {
    setIsMounted(true);
    loadMainData();
  }, []);

  // Monitor scroll: floating basket appears only when truly inside Best Price Finder and disappears once scrolled past (mobile/tablet only)
  useEffect(() => {
    const handleScroll = () => {
      // Pada layar desktop (lg ke atas), keranjang belanja sudah tampil berdampingan di kolom kanan
      if (window.innerWidth >= 1024) {
        setShowFloatingBasket(false);
        return;
      }
      const el = document.getElementById("best-price-finder-section");
      if (!el) return;
      const rect = el.getBoundingClientRect();
      // Baru muncul saat benar-benar masuk ke area Best Price Finder (bagian atas mendekati atas layar)
      // dan otomatis menghilang saat sudah melewati bagian bawahnya
      const hasEntered = rect.top <= 220;
      const hasPassed = rect.bottom <= 120;
      setShowFloatingBasket(hasEntered && !hasPassed);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll, { passive: true });
    handleScroll();

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, []);

  // Fetch live forecast trends comparing all 6 markets for the selected commodity with timeframe
  const loadTrends = (commodityId: number, tf: TimeframeOption = trendTimeframe) => {
    setLoadingTrends(true);
    setErrorTrends(false);
    getLiveMarketComparisonTrends(commodityId, tf)
      .then((liveTrends) => {
        if (liveTrends && liveTrends.series && liveTrends.series.length > 0) {
          setMarketTrendsData(liveTrends);
          setErrorTrends(false);
        } else {
          setErrorTrends(true);
        }
      })
      .catch(() => setErrorTrends(true))
      .finally(() => setLoadingTrends(false));
  };

  useEffect(() => {
    loadTrends(trendCommodityId, trendTimeframe);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trendCommodityId, trendTimeframe]);

  // Compute live basket simulation from Supabase on activeBasketList change
  useEffect(() => {
    let isMounted = true;
    if (activeBasketList.length === 0) {
      setBasketSim(null);
      setIsBasketLoading(false);
      return;
    }
    setIsBasketLoading(true);
    setBasketSim(null);
    getLiveShoppingBasket(activeBasketList)
      .then((sim) => {
        if (isMounted) {
          setBasketSim(sim || null);
          setIsBasketLoading(false);
        }
      })
      .catch((err) => {
        console.error("Failed to load shopping basket simulation:", err);
        if (isMounted) {
          setBasketSim(null);
          setIsBasketLoading(false);
        }
      });
    return () => {
      isMounted = false;
    };
  }, [activeBasketList]);

  const categories = [
    "Semua",
    "Beras",
    "Minyak Goreng",
    "Cabai",
    "Bawang",
    "Telur",
    "Daging",
  ];

  const handleAddToBasket = (item: CommodityPrice) => {
    const fallbackIdMap: Record<string, number> = {
      beras: 2,
      minyak: 10,
      cabai: 50,
      telur: 16,
      ayam: 13,
      bawang: 39,
    };
    const cid: number = item.komoditas_id || fallbackIdMap[item.id] || 2;
    const meta = COMMODITY_BASKET_META[cid] || {
      icon: "shopping_basket",
      unit: item.unit.replace("/", "") || "kg",
      defaultQty: 1,
      name: item.name,
    };

    setBasketList((prev) => {
      const idx = prev.findIndex((b) => b.komoditas_id === cid);
      if (idx >= 0) {
        const updated = [...prev];
        const step = cid === 50 ? 0.5 : 1;
        updated[idx] = {
          ...updated[idx],
          qty: Number((updated[idx].qty + step).toFixed(1)),
        };
        return updated;
      } else {
        return [
          ...prev,
          {
            id: `item_${cid}`,
            komoditas_id: cid,
            name: item.name,
            icon: meta.icon,
            qty: meta.defaultQty || 1,
            unit: meta.unit,
          },
        ];
      }
    });

    setCheckedItems((prev) => ({ ...prev, [cid]: true }));
    setAddedItems((prev) => ({ ...prev, [item.id]: true }));
    setTimeout(() => {
      setAddedItems((prev) => ({ ...prev, [item.id]: false }));
    }, 1200);

    setResetMessage(`"${item.name}" berhasil ditambahkan ke Keranjang Belanja.`);
    setTimeout(() => setResetMessage(null), 3000);
  };

  const allChecked =
    basketList.length > 0 && basketList.every((b) => checkedItems[b.komoditas_id] !== false);

  const handleToggleCheck = (komoditasId: number) => {
    setCheckedItems((prev) => ({
      ...prev,
      [komoditasId]: prev[komoditasId] === false ? true : false,
    }));
  };

  const handleToggleAll = () => {
    const nextVal = !allChecked;
    const newChecked: Record<number, boolean> = {};
    basketList.forEach((b) => {
      newChecked[b.komoditas_id] = nextVal;
    });
    setCheckedItems(newChecked);
  };

  const handleUpdateQty = (komoditasId: number, delta: number) => {
    setBasketList((prev) => {
      return prev
        .map((item) => {
          if (item.komoditas_id === komoditasId) {
            const step = item.komoditas_id === 50 ? 0.5 : 1;
            const newQty = Number((item.qty + delta * step).toFixed(1));
            return newQty > 0 ? { ...item, qty: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as BasketItem[];
    });
  };

  const handleRemoveItem = (komoditasId: number) => {
    setBasketList((prev) => prev.filter((item) => item.komoditas_id !== komoditasId));
  };

  const handleResetBasket = () => {
    setBasketList(DEFAULT_BASKET_ITEMS);
    setCheckedItems({});
    setResetMessage("Simulasi keranjang belanja telah diatur ulang ke formula default konsumsi keluarga.");
    setTimeout(() => setResetMessage(null), 3000);
  };

  const handleShareToWhatsApp = () => {
    if (!basketSim) return;
    const tripSaving = basketSim.tripSaving || (basketSim.rankings[basketSim.rankings.length - 1].totalBelanja - basketSim.rankings[0].totalBelanja);
    const totalSaving = tripSaving * shoppingFreq;

    const itemsText = basketSim.items
      .map(
        (it, idx) =>
          `${idx + 1}. ${it.name} (${it.qty} ${it.unit}) ~ Rp ${it.itemTotal.toLocaleString("id-ID")}`
      )
      .join("\n");

    const rankText = basketSim.rankings
      .map(
        (r) =>
          `#${r.rank}. ${r.nama_pasar} — Rp ${r.totalBelanja.toLocaleString("id-ID")}${
            r.isCheapest ? " (Paling Hemat ⭐)" : r.selisih > 0 ? ` (+Rp ${r.selisih.toLocaleString("id-ID")})` : " (Sama Hemat)"
          }`
      )
      .join("\n");

    const text = encodeURIComponent(
      `🛒 *Simulasi Belanja Cerdas — HargaWatch Surabaya*\n` +
        `📅 Tanggal Pantauan: ${basketSim.tanggal}\n\n` +
        `*Daftar Belanja:*\n${itemsText}\n\n` +
        `*Ranking Total Belanja di 6 Pasar Tradisional:*\n${rankText}\n\n` +
        `💡 *Estimasi Hemat:* Belanja di *${basketSim.cheapestMarket}* vs *${basketSim.mostExpensiveMarket}* menghemat *Rp ${tripSaving.toLocaleString("id-ID")}/kunjungan* atau hingga *Rp ${totalSaving.toLocaleString(
          "id-ID"
        )}/bulan* (pola ${shoppingFreq}x belanja keluarga).\n\n` +
        `Akses data harga pangan riil Surabaya: https://hargawatch.surabaya.go.id`
    );
    window.open(`https://api.whatsapp.com/send?text=${text}`, "_blank");
  };

  const handleDownloadList = () => {
    if (!basketSim) return;
    const tripSaving = basketSim.tripSaving || (basketSim.rankings[basketSim.rankings.length - 1].totalBelanja - basketSim.rankings[0].totalBelanja);
    const totalSaving = tripSaving * shoppingFreq;

    const itemsText = basketSim.items
      .map((it, idx) => `${idx + 1}. ${it.name} (${it.qty} ${it.unit}) ~ Rp ${it.itemTotal.toLocaleString("id-ID")}`)
      .join("\n");

    const rankText = basketSim.rankings
      .map(
        (r) =>
          `#${r.rank} ${r.nama_pasar} (${r.wilayah}): Rp ${r.totalBelanja.toLocaleString("id-ID")}${
            r.isCheapest ? " [REKOMENDASI TERMURAH]" : r.selisih > 0 ? ` (+Rp ${r.selisih.toLocaleString("id-ID")})` : " [SAMA HEMAT]"
          }`
      )
      .join("\n");

    const splitText = basketSim.splitBasket
      ? `\nSKENARIO BELANJA MULTI-PASAR (SUPER HEMAT):\n` +
        basketSim.splitBasket.items
          .map(
            (it, idx) =>
              `${idx + 1}. ${it.name} (${it.qty} ${it.unit}) -> Beli di ${it.cheapestMarket} @ Rp ${it.itemTotal.toLocaleString("id-ID")}`
          )
          .join("\n") +
        `\nTotal Multi-Pasar: Rp ${basketSim.splitBasket.totalBelanja.toLocaleString("id-ID")} (Hemat Ekstra Rp ${basketSim.splitBasket.additionalSaving.toLocaleString("id-ID")} vs 1 pasar)\n`
      : "";

    const content =
      `=======================================================\n` +
      `HARGAWATCH SURABAYA - SIMULASI BELANJA PASAR TRADISIONAL\n` +
      `Tanggal Observasi: ${basketSim.tanggal}\n` +
      `=======================================================\n\n` +
      `RINCIAN ITEM BELANJA:\n${itemsText}\n\n` +
      `RANKING TOTAL BELANJA DI 6 PASAR:\n${rankText}\n` +
      splitText +
      `\nESTIMASI PENGHEMATAN BULANAN (${shoppingFreq}x Belanja):\n` +
      `Rp ${totalSaving.toLocaleString("id-ID")} / bulan\n` +
      `(Hemat Rp ${tripSaving.toLocaleString("id-ID")} per kunjungan di ${basketSim.cheapestMarket} vs ${basketSim.mostExpensiveMarket})\n` +
      `\nCATATAN REALISTIS:\n` +
      `Pertimbangkan jarak tempuh & biaya transportasi/bensin. Bila selisih tipis (< Rp 5.000), prioritaskan pasar terdekat.\n` +
      `=======================================================\n` +
      `Platform Intelijen Harga Pangan Kota Surabaya\n`;

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `daftar-belanja-hargawatch-${basketSim.tanggal}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setResetMessage("Daftar belanja berhasil disalin & diunduh ke perangkat Anda.");
    setTimeout(() => setResetMessage(null), 3000);
  };

  const filteredCommodities = commodities.filter((item) => {
    const q = searchQuery.trim().toLowerCase();
    const matchSearch =
      q === "" ||
      item.name.toLowerCase().includes(q) ||
      item.marketName.toLowerCase().includes(q) ||
      (item.category || "").toLowerCase().includes(q) ||
      (item.tag || "").toLowerCase().includes(q);

    if (!matchSearch) return false;

    if (selectedCategory === "Semua") return true;

    const catLow = selectedCategory.toLowerCase();
    const itemCatLow = (item.category || "").toLowerCase();
    const itemNameLow = (item.name || "").toLowerCase();
    const itemTagLow = (item.tag || "").toLowerCase();

    return (
      itemCatLow.includes(catLow) ||
      itemNameLow.includes(catLow) ||
      itemTagLow.includes(catLow) ||
      (catLow === "cabai" && (itemCatLow.includes("cabe") || itemNameLow.includes("cabe"))) ||
      (catLow === "daging" && (itemCatLow.includes("ayam") || itemNameLow.includes("ayam") || itemNameLow.includes("sapi")))
    );
  });

  return (
    <div className="bg-surface-canvas text-on-surface font-body-md text-body-md antialiased min-h-screen flex flex-col">
      <Header />

      {resetMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-primary text-on-primary px-4 py-3 rounded-lg shadow-xl font-body-md flex items-center gap-2">
          <span className="material-symbols-outlined text-body-md">check</span>
          {resetMessage}
        </div>
      )}

      <main className="w-full pt-20 bg-surface-canvas flex-1">
        <div className="flex flex-col w-full">
          {/* Sub-Hero Section */}
          <section className="relative w-full bg-surface-card shadow-sm overflow-hidden mb-space-lg">
            <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-primary-fixed/20 blur-3xl pointer-events-none"></div>
            <div className="absolute top-1/2 -left-20 w-72 h-72 rounded-full bg-surface-variant/30 blur-2xl pointer-events-none"></div>
            <div className="max-w-[80rem] mx-auto px-space-md lg:px-gutter-desktop py-space-xl relative z-10">
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-space-lg">
                <div className="flex-1 max-w-2xl xl:max-w-3xl">
                  <h1 className="font-headline-xl text-headline-xl text-text-primary tracking-tight mb-space-xs">
                    Pantau Harga Pangan Harian &amp; Belanja Lebih Hemat di Surabaya
                  </h1>
                  <p className="font-body-lg text-body-lg text-text-secondary leading-relaxed">
                    Bandingkan harga harian di 6 pasar tradisional, temukan pasar termurah, dan hitung estimasi pengeluaran dapur hari ini.
                  </p>

                  {/* OPSI A: Mini Price Ticker (Harga Acuan Termurah Hari Ini) */}
                  <div className="mt-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {loadingCommodities ? (
                        Array.from({ length: 4 }).map((_, idx) => (
                          <div
                            key={idx}
                            className="p-2.5 rounded-xl bg-surface-canvas/60 border border-border-subtle/50 animate-pulse h-[82px] flex flex-col justify-between"
                          >
                            <div className="w-16 h-3 bg-surface-subtle rounded" />
                            <div className="w-20 h-4 bg-surface-subtle rounded" />
                            <div className="w-24 h-3 bg-surface-subtle rounded" />
                          </div>
                        ))
                      ) : (
                        heroTickerItems.map((item) => (
                          <a
                            key={item.id}
                            href="#best-price-finder-section"
                            onClick={() => {
                              if (item.komoditas_id) setTrendCommodityId(item.komoditas_id);
                            }}
                            className="group p-2.5 rounded-xl bg-surface-canvas hover:bg-emerald-500/5 border border-border-subtle/80 hover:border-primary/40 transition-all duration-150 flex flex-col justify-between shadow-2xs hover:shadow-xs cursor-pointer"
                            title={`Lihat detail harga ${item.name} (${item.marketName || "Pasar Termurah"})`}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-semibold text-xs text-text-primary group-hover:text-primary transition-colors truncate">
                                {item.name.replace(/(Merah|Ras|Kuning)$/i, "").trim()}
                              </span>
                              <span className="material-symbols-outlined text-text-muted group-hover:text-primary text-[13px] shrink-0 transition-transform group-hover:translate-x-0.5">
                                arrow_forward
                              </span>
                            </div>
                            <div className="flex items-baseline gap-1 my-0.5">
                              <span className="font-extrabold text-sm text-text-primary tracking-tight">
                                {item.price}
                              </span>
                              <span className="text-[10px] text-text-muted">
                                {item.unit}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 text-[10.5px] text-emerald-800 bg-emerald-50 border border-emerald-200/70 px-1.5 py-0.5 rounded-md font-medium truncate">
                              <span className="material-symbols-outlined text-[12px] shrink-0 text-emerald-600">storefront</span>
                              <span className="truncate">{item.marketName || "Pasar Termurah"}</span>
                            </div>
                          </a>
                        ))
                      )}
                    </div>
                  </div>
                </div>
                {/* Quick Health Summary Card */}
                {loadingSummary || !stabilitySummary ? (
                  <div className="w-full lg:w-[390px] xl:w-[420px] shrink-0 bg-surface-canvas rounded-xl p-space-md shadow-sm border border-border-subtle/50 animate-pulse">
                    <div className="flex items-center justify-between gap-space-sm mb-space-xs">
                      <div className="h-3.5 w-36 bg-surface-subtle rounded" />
                      <div className="h-5 w-24 bg-surface-subtle rounded-full" />
                    </div>
                    <div className="h-9 w-28 bg-surface-subtle rounded my-1" />
                    <div className="grid grid-cols-2 gap-space-xs pt-space-xs bg-surface-card rounded-lg p-space-xs mt-2">
                      <div className="flex items-center gap-space-xs">
                        <div className="w-8 h-8 rounded-full bg-surface-subtle shrink-0" />
                        <div className="space-y-1">
                          <div className="h-4 w-16 bg-surface-subtle rounded" />
                          <div className="h-3 w-12 bg-surface-subtle rounded" />
                        </div>
                      </div>
                      <div className="flex items-center gap-space-xs">
                        <div className="w-8 h-8 rounded-full bg-surface-subtle shrink-0" />
                        <div className="space-y-1">
                          <div className="h-4 w-16 bg-surface-subtle rounded" />
                          <div className="h-3 w-12 bg-surface-subtle rounded" />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="w-full lg:w-[390px] xl:w-[420px] shrink-0 bg-surface-canvas rounded-xl p-space-md shadow-sm border border-border-subtle/80">
                    <div className="flex items-center justify-between gap-space-sm mb-space-xs">
                      <div>
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 block">
                          Status Pasokan Kota (TPID)
                        </span>
                        <span className="font-headline-sm text-headline-sm text-text-primary">
                          Indeks Ketahanan Pangan
                        </span>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1 px-space-xs py-space-2xs rounded-full font-label-caps text-label-caps ${
                          stabilitySummary.isNormal
                            ? "bg-status-normal-bg text-status-normal"
                            : "bg-status-warning-bg text-status-warning"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            stabilitySummary.isNormal
                              ? "bg-status-normal animate-pulse"
                              : "bg-status-warning animate-pulse"
                          }`}
                        ></span>
                        {stabilitySummary.statusLabel}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-space-xs mb-space-sm">
                      <span className="font-metric-display text-metric-display text-primary">
                        {stabilitySummary.stabilityIndex}
                      </span>
                      <span className="font-label-caps text-label-caps text-text-muted">
                        {stabilitySummary.targetText}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-space-xs pt-space-xs bg-surface-card rounded-lg p-space-xs">
                      <div className="flex items-center gap-space-xs">
                        <div className="w-8 h-8 rounded-full bg-status-normal-bg flex items-center justify-center text-status-normal">
                          <span className="material-symbols-outlined text-body-md">check_circle</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="font-headline-sm text-headline-sm text-text-primary">
                            {stabilitySummary.normalCount} Titik Pantau
                          </span>
                          <span className="font-label-caps text-label-caps text-text-muted">
                            Harga Terkendali
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-space-xs">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center ${
                            stabilitySummary.alertCount > 0
                              ? "bg-status-warning-bg text-status-warning"
                              : "bg-status-normal-bg text-status-normal"
                          }`}
                        >
                          <span className="material-symbols-outlined text-body-md">
                            {stabilitySummary.alertCount > 0 ? "warning" : "verified"}
                          </span>
                        </div>
                        <div className="flex flex-col">
                          <span
                            className={`font-headline-sm text-headline-sm ${
                              stabilitySummary.alertCount > 0
                                ? "text-status-warning"
                                : "text-status-normal"
                            }`}
                          >
                            {stabilitySummary.alertCount > 0
                              ? `${stabilitySummary.alertCount} Titik Pantau`
                              : "0 Titik Pantau"}
                          </span>
                          <span className="font-label-caps text-[11px] sm:text-label-caps text-text-muted whitespace-nowrap">
                            {stabilitySummary.alertNote}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 pt-2.5 border-t border-border-subtle/60 flex flex-col gap-1.5 text-[11px]">
                      <div className="flex items-center justify-between gap-2 text-text-muted">
                        <span>
                          {stabilitySummary.normalCount} dari {stabilitySummary.normalCount + stabilitySummary.alertCount} indikator pasar stabil
                        </span>
                      </div>
                      {basketSim && (
                        <div className="flex items-center gap-1.5 text-emerald-800 bg-emerald-50/90 px-2.5 py-1 rounded-md border border-emerald-200/70 text-[10.5px]">
                          <span className="material-symbols-outlined text-[14px] text-emerald-700 shrink-0">storefront</span>
                          <span className="truncate">
                            Pasar Termurah: <strong className="font-bold text-emerald-900">{basketSim.cheapestMarket}</strong>
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              {/* Consumer Alert Banner */}
              {loadingSummary || !stabilitySummary ? (
                <div className="mt-space-lg rounded-xl p-space-sm sm:p-space-md bg-surface-card border border-border-subtle/60 flex items-center justify-between gap-space-sm animate-pulse">
                  <div className="flex items-center gap-space-sm">
                    <div className="w-9 h-9 rounded-lg bg-surface-subtle shrink-0" />
                    <div className="space-y-1.5">
                      <div className="h-3 w-36 bg-surface-subtle rounded" />
                      <div className="h-4 w-72 bg-surface-subtle rounded" />
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  className={`mt-space-lg rounded-xl p-space-sm sm:p-space-md flex items-start sm:items-center justify-between gap-space-sm ${
                    stabilitySummary.hasAlert
                      ? stabilitySummary.isNormal
                        ? "bg-amber-50/90 border border-amber-200/80"
                        : "bg-status-warning-bg border border-status-warning/30"
                      : "bg-status-normal-bg/60 border border-status-normal/20"
                  }`}
                >
                  <div className="flex items-start sm:items-center gap-space-sm">
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                        stabilitySummary.hasAlert
                          ? stabilitySummary.isNormal
                            ? "bg-amber-600 text-white"
                            : "bg-status-warning text-white"
                          : "bg-status-normal text-white"
                      }`}
                    >
                      <span className="material-symbols-outlined text-title-md">
                        {stabilitySummary.hasAlert ? "notifications_active" : "verified"}
                      </span>
                    </div>
                    <div>
                      <div className="flex items-center gap-space-xs flex-wrap">
                        <span
                          className={`font-label-caps text-label-caps uppercase font-semibold ${
                            stabilitySummary.hasAlert
                              ? stabilitySummary.isNormal
                                ? "text-amber-800"
                                : "text-status-warning"
                              : "text-status-normal"
                          }`}
                        >
                          {stabilitySummary.bannerTitle}
                        </span>
                      </div>
                      <p className="font-body-md text-body-md text-text-primary mt-0.5 text-justify">
                        {stabilitySummary.bannerMessage}
                      </p>
                    </div>
                  </div>
                  <a
                    className={`hidden md:inline-flex items-center gap-1 font-body-sm text-body-sm font-semibold hover:underline shrink-0 ${
                      stabilitySummary.hasAlert ? "text-status-warning" : "text-status-normal"
                    }`}
                    href={stabilitySummary.hasAlert ? "/early-warning" : "#grafik-tren"}
                  >
                    {stabilitySummary.hasAlert ? "Cek Detail Risiko EWS" : "Cek Tren Harga"}
                    <span className="material-symbols-outlined text-body-sm">arrow_forward</span>
                  </a>
                </div>
              )}
            </div>
          </section>

          {/* Main Content 2-Column Split: Best Price Finder (60%) vs Smart Shopping Basket (40%) */}
          <section className="max-w-[80rem] mx-auto px-space-md lg:px-gutter-desktop w-full mb-space-lg sm:mb-space-xl lg:mb-space-2xl">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start">
              {/* LEFT COLUMN: Best Price Finder (lg:col-span-7) */}
              <div className="lg:col-span-7 flex flex-col gap-space-md" id="best-price-finder-section">
                {/* Filter & Search Toolbar */}
                <div className="bg-surface-card rounded-xl p-space-md shadow-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm mb-space-md">
                    <div>
                      <h2 className="font-headline-md text-headline-md text-text-primary">Best Price Finder</h2>
                      <p className="font-body-sm text-body-sm text-text-secondary">
                        Rekomendasi pasar paling hemat se-Surabaya hari ini
                      </p>
                    </div>
                    <div className="relative w-full sm:w-64">
                      <input
                        className="w-full h-10 bg-surface-subtle text-text-primary placeholder-text-muted font-body-sm text-body-sm pl-9 pr-3 rounded-md focus:outline-none focus:bg-surface-card"
                        id="commodity-search"
                        placeholder="Cari bahan pokok..."
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                      <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted text-body-md">
                        search
                      </span>
                    </div>
                  </div>
                  {/* Category Filter Pills */}
                  <div className="flex items-center gap-space-2xs overflow-x-auto pb-1 no-scrollbar">
                    {categories.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        className={`px-space-sm py-space-2xs rounded-full font-body-sm text-body-sm whitespace-nowrap transition-colors ${
                          selectedCategory === cat
                            ? "bg-primary-container text-on-primary active-category"
                            : "bg-surface-subtle text-text-secondary hover:bg-surface-variant/40"
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Commodity Cards List */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-space-md" id="commodity-grid">
                  {loadingCommodities ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <div
                        key={`commodity-skel-${i}`}
                        className="bg-surface-card rounded-xl p-3 sm:p-space-md shadow-xs border border-border-subtle/50 flex flex-col justify-between animate-pulse"
                      >
                        {/* Mobile Skeleton (Sleek Horizontal) */}
                        <div className="sm:hidden flex flex-col gap-2.5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="w-12 h-12 rounded-xl bg-surface-subtle shrink-0" />
                            <div className="flex-1 space-y-1.5">
                              <div className="h-3 w-16 bg-surface-subtle rounded" />
                              <div className="h-4 w-32 bg-surface-subtle rounded" />
                            </div>
                            <div className="w-20 space-y-1 text-right">
                              <div className="h-4 w-16 bg-surface-subtle rounded ml-auto" />
                              <div className="h-3 w-12 bg-surface-subtle rounded ml-auto" />
                            </div>
                          </div>
                          <div className="flex items-center justify-between pt-2 border-t border-border-subtle/50">
                            <div className="h-3.5 w-32 bg-surface-subtle rounded" />
                            <div className="h-7 w-24 bg-surface-subtle rounded-lg" />
                          </div>
                        </div>

                        {/* Desktop Skeleton */}
                        <div className="hidden sm:block">
                          <div className="flex items-start justify-between gap-1.5 sm:gap-space-xs mb-1.5 sm:mb-space-xs">
                            <div className="flex items-center gap-1.5 sm:gap-space-xs min-w-0">
                              <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg bg-surface-subtle shrink-0" />
                              <div className="space-y-1 min-w-0">
                                <div className="h-2.5 sm:h-3 w-12 sm:w-16 bg-surface-subtle rounded" />
                                <div className="h-3.5 sm:h-5 w-20 sm:w-32 bg-surface-subtle rounded" />
                              </div>
                            </div>
                            <div className="h-4 sm:h-5 w-10 sm:w-16 bg-surface-subtle rounded-full shrink-0" />
                          </div>
                          <div className="p-2 sm:p-space-xs rounded-lg bg-surface-subtle/60 mb-1.5 sm:mb-space-xs">
                            <div className="flex items-center justify-between mb-1 sm:mb-2">
                              <div className="h-2.5 sm:h-3 w-16 sm:w-28 bg-surface-subtle rounded" />
                              <div className="h-2.5 sm:h-3 w-12 sm:w-20 bg-surface-subtle rounded" />
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1">
                              <div className="h-4 sm:h-5 w-20 sm:w-32 bg-surface-subtle rounded" />
                              <div className="h-5 sm:h-6 w-16 sm:w-24 bg-surface-subtle rounded" />
                            </div>
                          </div>
                          <div className="flex items-center justify-between pt-0.5 sm:pt-1 mb-1.5 sm:mb-space-sm">
                            <div className="h-3 sm:h-4 w-16 sm:w-32 bg-surface-subtle rounded" />
                            <div className="h-3 sm:h-4 w-10 sm:w-14 bg-surface-subtle rounded" />
                          </div>
                          <div className="w-full h-5 sm:h-8 bg-surface-subtle/40 rounded mb-1.5 sm:mb-space-sm" />
                          <div className="w-full h-7 sm:h-9 bg-surface-subtle rounded-lg mt-1" />
                        </div>
                      </div>
                    ))
                  ) : errorCommodities ? (
                    <div className="col-span-full bg-surface-card rounded-xl p-8 border border-border-subtle/80 flex flex-col items-center justify-center text-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-status-warning-bg flex items-center justify-center text-status-warning">
                        <span className="material-symbols-outlined text-2xl">cloud_off</span>
                      </div>
                      <div>
                        <h3 className="font-headline-sm text-text-primary text-base">Data Pasar Tidak Tersedia</h3>
                        <p className="font-body-sm text-text-secondary mt-1 max-w-md">
                          Gagal menyinkronkan data pantauan harga pasar dari server. Silakan periksa koneksi internet Anda atau coba lagi.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={loadMainData}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-on-primary font-headline-sm text-body-sm hover:bg-primary-container transition-colors cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-body-sm">refresh</span>
                        Coba Lagi
                      </button>
                    </div>
                  ) : filteredCommodities.length === 0 ? (
                    <div className="col-span-full bg-surface-card rounded-xl p-8 border border-border-subtle/80 text-center text-text-muted">
                      <span className="material-symbols-outlined text-3xl block mb-2">search_off</span>
                      <p className="font-body-md text-text-secondary">Tidak ada komoditas yang cocok dengan pencarian.</p>
                    </div>
                  ) : (
                    filteredCommodities.map((item) => (
                      <div
                        key={item.id}
                        className="bg-surface-card rounded-xl p-3 sm:p-space-md shadow-xs hover:shadow-md transition-[box-shadow,border-color,transform] duration-200 hover:-translate-y-0.5 flex flex-col justify-between relative overflow-hidden group border border-border-subtle/50 will-change-transform"
                      >
                        {item.isCritical && (
                          <div className="absolute top-0 left-0 right-0 h-1 bg-status-critical"></div>
                        )}

                        {/* ========================================================
                            TAMPILAN MOBILE: Desain Bersih, Elegan, dan Terstruktur (Referensi Modern E-Commerce)
                           ======================================================== */}
                        <div className="sm:hidden flex flex-col gap-2.5">
                          {/* Baris Atas: Icon (Kiri), Info Komoditas (Tengah), Harga & Hemat (Kanan) */}
                          <div className="flex items-start justify-between gap-2.5">
                            {/* Icon Kotak Thumbnail Modern */}
                            <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                              <CommodityIcon id={item.komoditas_id || item.id} className="w-6 h-6" />
                            </div>

                            {/* Info Tengah */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <span
                                  className={`text-[9.5px] uppercase tracking-wider truncate font-bold ${
                                    item.isCritical
                                      ? "text-status-critical"
                                      : item.isWarning
                                      ? "text-status-warning"
                                      : "text-slate-500"
                                  }`}
                                >
                                  {item.tag}
                                </span>
                                <span
                                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold shrink-0 ${
                                    item.isCritical
                                      ? "bg-status-critical-bg text-status-critical border border-rose-200"
                                      : item.isWarning
                                      ? "bg-status-warning-bg text-status-warning border border-amber-200"
                                      : "bg-status-normal-bg text-status-normal border border-emerald-200"
                                  }`}
                                >
                                  <span
                                    className={`w-1.5 h-1.5 rounded-full ${
                                      item.isCritical
                                        ? "bg-status-critical"
                                        : item.isWarning
                                        ? "bg-status-warning"
                                        : "bg-status-normal"
                                    }`}
                                  />
                                  {item.status}
                                </span>
                              </div>

                              <h3
                                className="font-bold text-sm text-slate-900 leading-tight truncate"
                                title={item.name}
                              >
                                {item.name}
                              </h3>
                            </div>

                            {/* Harga Kanan */}
                            <div className="flex flex-col items-end shrink-0 text-right">
                              <div className="flex items-baseline gap-0.5">
                                <span className="font-extrabold text-base text-slate-900 tabular-nums">
                                  {item.price}
                                </span>
                                <span className="text-[10px] text-slate-500 font-medium">{item.unit}</span>
                              </div>
                              {item.cheapestSub && (
                                <span
                                  className={`text-[10px] font-bold mt-0.5 ${
                                    item.isCritical ? "text-rose-600" : "text-emerald-700"
                                  }`}
                                >
                                  {item.cheapestSub.replace("/kg", "")}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Alert Fluktuasi Pasar (jika ada) */}
                          {item.hasMarketAlert && item.marketAlertNote && (
                            <div className="px-2 py-1 rounded-md bg-amber-50/90 border border-amber-200/70 flex items-center gap-1 text-[10px] text-amber-800">
                              <span className="material-symbols-outlined text-[13px] text-amber-600 shrink-0">info</span>
                              <span className="truncate">{item.marketAlertNote}</span>
                            </div>
                          )}

                          {/* Baris Bawah: Rerata & Tren (Kiri) + Tombol Keranjang (Kanan) */}
                          <div className="flex items-center justify-between pt-2 border-t border-border-subtle/60 text-[11px]">
                            <div className="flex items-center gap-2 text-text-secondary min-w-0 pr-2">
                              <span className="truncate">
                                Rerata: <strong className="font-semibold text-text-primary">{item.cityAvg}</strong>
                              </span>
                              <span className="text-border-subtle">•</span>
                              <span className="inline-flex items-center gap-0.5 text-text-muted shrink-0">
                                <span className={`material-symbols-outlined text-[13px] ${item.deltaClass}`}>
                                  {item.deltaIcon}
                                </span>
                                {item.trend7d || "Stabil"}
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleAddToBasket(item)}
                              className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1 shrink-0 transition-all cursor-pointer ${
                                addedItems[item.id]
                                  ? "bg-primary text-on-primary shadow-2xs"
                                  : "bg-surface-subtle hover:bg-primary hover:text-on-primary text-text-primary active:scale-95"
                              }`}
                            >
                              <span className="material-symbols-outlined text-sm">
                                {addedItems[item.id] ? "check" : "add_shopping_cart"}
                              </span>
                              <span>{addedItems[item.id] ? "Ditambahkan" : "+ Keranjang"}</span>
                            </button>
                          </div>
                        </div>

                        {/* ========================================================
                            TAMPILAN DESKTOP (Layout Lengkap dengan Grafik Sparkline)
                           ======================================================== */}
                        <div className="hidden sm:flex sm:flex-col sm:justify-between h-full">
                          <div>
                            {/* Top Meta: Icon + Category Tag on Left, Status Pill on Right */}
                            <div className="flex items-center justify-between gap-1 mb-1">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <div className="w-6.5 h-6.5 sm:w-8 sm:h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                                  <CommodityIcon id={item.komoditas_id || item.id} className="w-4 h-4 sm:w-5 sm:h-5" />
                                </div>
                                <span
                                  className={`text-[10px] sm:text-label-caps uppercase tracking-wider truncate font-bold ${
                                    item.isCritical
                                      ? "text-status-critical"
                                      : item.isWarning
                                      ? "text-status-warning"
                                      : "text-slate-500"
                                  }`}
                                >
                                  {item.tag}
                                </span>
                              </div>
                              <span
                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9.5px] sm:text-label-caps shrink-0 font-medium ${
                                  item.isCritical
                                    ? "bg-status-critical-bg text-status-critical border border-rose-200"
                                    : item.isWarning
                                    ? "bg-status-warning-bg text-status-warning border border-amber-200"
                                    : "bg-status-normal-bg text-status-normal border border-emerald-200"
                                }`}
                              >
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    item.isCritical
                                      ? "bg-status-critical"
                                      : item.isWarning
                                      ? "bg-status-warning"
                                      : "bg-status-normal"
                                  }`}
                                ></span>
                                <span>{item.status}</span>
                              </span>
                            </div>

                            {/* Full-width Commodity Name (Never gets truncated by status pill!) */}
                            <h3
                              className="font-bold text-xs sm:text-sm text-slate-900 leading-tight line-clamp-1 mb-2"
                              title={item.name}
                            >
                              {item.name}
                            </h3>

                            {/* Price & Market Focus Box (Shopee-style) */}
                            <div
                              className={`rounded-lg p-2 sm:p-space-xs mb-1.5 sm:mb-space-sm ${
                                item.isCritical ? "bg-rose-50/70 border border-rose-100" : "bg-surface-subtle"
                              }`}
                            >
                              <div className="flex items-center justify-between mb-1 gap-1">
                                <span className="text-[10px] sm:text-label-caps text-slate-500 font-medium truncate">
                                  <span className="sm:hidden">Termurah</span>
                                  <span className="hidden sm:inline">{item.cheapestBadge}</span>
                                </span>
                                <span
                                  className={`text-[10px] sm:text-label-caps font-bold shrink-0 ${
                                    item.isCritical ? "text-rose-600" : "text-emerald-700"
                                  }`}
                                >
                                  {item.cheapestSub.replace("/kg", "")}
                                </span>
                              </div>

                              {/* Responsive layout: mobile stacked (Price prominent, Market below), sm+ side-by-side */}
                              <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-0.5 sm:gap-2">
                                <div className="order-1 sm:order-2 sm:text-right">
                                  <span className="font-extrabold text-sm sm:text-metric-value text-slate-900">
                                    {item.price}
                                  </span>
                                  <span className="text-[10px] sm:text-body-sm text-slate-500 ml-0.5">{item.unit}</span>
                                </div>
                                <div className="order-2 sm:order-1 min-w-0">
                                  <span className="font-semibold text-xs sm:text-body-md text-primary truncate flex items-center gap-1" title={item.marketName}>
                                    <span className="material-symbols-outlined text-[13px] sm:text-[15px] shrink-0 text-primary">
                                      location_on
                                    </span>
                                    <span className="truncate">{item.marketName.replace("Pasar ", "")}</span>
                                  </span>
                                  <p
                                    className={`text-[9.5px] sm:text-label-caps truncate ${
                                      item.isCritical ? "text-rose-600" : "text-slate-500"
                                    }`}
                                  >
                                    {item.marketSub}
                                  </p>
                                </div>
                              </div>
                            </div>

                            {item.hasMarketAlert && item.marketAlertNote && (
                              <div className="mt-1 mb-1.5 px-2 py-0.5 rounded bg-amber-50 border border-amber-200/70 flex items-center gap-1.5 text-[9.5px] sm:text-[10px] text-amber-800">
                                <span className="material-symbols-outlined text-[12px] text-amber-600 shrink-0">info</span>
                                <span className="truncate">{item.marketAlertNote}</span>
                              </div>
                            )}

                            {/* City Average & Savings Badge */}
                            <div className="flex items-center justify-between text-text-secondary text-[10px] sm:text-body-sm mb-1.5 sm:mb-space-sm pt-0.5">
                              <span className="truncate mr-1">
                                <span className="hidden sm:inline">Rata-rata Kota: </span>
                                <span className="sm:hidden">Rerata: </span>
                                <strong className="font-semibold text-text-primary">{item.cityAvg}</strong>
                              </span>
                              <span className="inline-flex items-center font-bold text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200/50 px-1.5 py-0.5 rounded shrink-0">
                                {item.savingBadge || item.delta}
                              </span>
                            </div>

                            {/* Real 7-day Historical Trend & Sparkline */}
                            <div className="mb-1.5 sm:mb-space-sm">
                              <div className="flex items-center justify-between text-[9.5px] text-text-muted mb-0.5">
                                <span>Tren 7 Hari Kota</span>
                                <span className={`inline-flex items-center font-semibold text-[10px] ${item.deltaClass}`}>
                                  <span className="material-symbols-outlined text-[13px] mr-0.5">
                                    {item.deltaIcon}
                                  </span>
                                  {item.trend7d || "Stabil"}
                                </span>
                              </div>
                              <div className="w-full h-5 sm:h-7">
                                <svg
                                  className={`w-full h-full ${item.sparkClass}`}
                                  preserveAspectRatio="none"
                                  viewBox="0 0 200 32"
                                >
                                  <path
                                    d={item.sparkPath}
                                    fill="none"
                                    stroke="currentColor"
                                    strokeLinecap="round"
                                    strokeWidth="2"
                                  ></path>
                                </svg>
                              </div>
                            </div>
                          </div>

                          {/* Button Masukkan Keranjang */}
                          <button
                            className={`w-full py-1.5 sm:py-2 text-xs sm:text-body-sm font-semibold rounded-lg flex items-center justify-center gap-1 sm:gap-1.5 transition-colors cursor-pointer ${
                              addedItems[item.id]
                                ? "bg-primary text-on-primary"
                                : "bg-surface-subtle hover:bg-primary hover:text-on-primary text-text-primary"
                            }`}
                            onClick={() => handleAddToBasket(item)}
                          >
                            <span className="material-symbols-outlined text-sm sm:text-body-md">
                              {addedItems[item.id] ? "check" : "add_shopping_cart"}
                            </span>
                            <span className="hidden sm:inline">
                              {addedItems[item.id] ? "Ditambahkan!" : "+ Masukkan Keranjang"}
                            </span>
                            <span className="sm:hidden">
                              {addedItems[item.id] ? "Ditambahkan" : "+ Keranjang"}
                            </span>
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Banner Akses Lengkap 37 Komoditas */}
                <div className="mt-2 p-3.5 sm:p-4 bg-primary/5 rounded-2xl border border-primary/15 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-2xs">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-xl">query_stats</span>
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-text-primary text-xs sm:text-sm">
                        Ingin Memantau Komoditas Lain?
                      </p>
                      <p className="text-[11px] sm:text-xs text-text-secondary leading-tight mt-0.5">
                        Tersedia riwayat harga dan estimasi tren untuk <strong>seluruh 37 komoditas</strong> pangan Surabaya.
                      </p>
                    </div>
                  </div>
                  <a
                    href="#grafik-tren"
                    className="w-full sm:w-auto px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-xs shrink-0 cursor-pointer"
                  >
                    <span>Buka Grafik 37 Komoditas</span>
                    <span className="material-symbols-outlined text-sm">arrow_downward</span>
                  </a>
                </div>
              </div>

              {/* RIGHT COLUMN: Smart Shopping Basket (lg:col-span-5) */}
              <div className="lg:col-span-5 flex flex-col gap-space-md" id="smart-shopping-basket">
                <div className="bg-surface-card rounded-2xl p-3.5 sm:p-5 shadow-sm border border-border-subtle/80 transition-all">
                  {/* Basket Header (Shopee Style) */}
                  <div className="flex items-center justify-between pb-2.5 sm:pb-3 mb-3 border-b border-border-subtle/60 gap-2">
                    <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
                      <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-primary text-on-primary flex items-center justify-center shadow-xs shrink-0">
                        <span className="material-symbols-outlined text-[19px] sm:text-[22px]">shopping_bag</span>
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-headline-sm text-sm sm:text-base text-text-primary font-bold truncate">
                          Smart Shopping Basket
                        </h3>
                        <p className="font-label-caps text-[10.5px] sm:text-xs text-text-secondary truncate">
                          Kalkulator 6 Pasar Tradisional Surabaya
                        </p>
                      </div>
                    </div>
                    <button
                      className="font-label-caps text-[11px] sm:text-xs text-text-muted hover:text-rose-600 transition-colors flex items-center gap-1 cursor-pointer py-1 px-2 rounded-lg hover:bg-rose-50 shrink-0"
                      onClick={handleResetBasket}
                      title="Atur ulang simulasi keranjang"
                    >
                      <span className="material-symbols-outlined text-sm">restart_alt</span> Reset
                    </button>
                  </div>

                  {/* Select All Checkbox Bar (Ala Shopee Cart Header) */}
                  {basketList.length > 0 && (
                    <div className="flex items-center justify-between px-2.5 sm:px-3 py-1.5 sm:py-2 bg-surface-subtle/80 rounded-xl mb-3 text-xs">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={allChecked}
                          onChange={handleToggleAll}
                          className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded text-primary accent-primary cursor-pointer focus:ring-primary"
                        />
                        <span className="font-bold text-slate-800 text-xs">
                          Pilih Semua ({activeBasketList.length}/{basketList.length})
                        </span>
                      </label>
                      <span className="text-slate-500 text-[10.5px] sm:text-[11px]">
                        {activeBasketList.length === 0 ? "Semua nonaktif" : "Dihitung di ranking"}
                      </span>
                    </div>
                  )}

                  {/* Basket Itemized List */}
                  {basketList.length === 0 ? (
                    <div className="p-6 text-center bg-surface-canvas rounded-xl mb-space-md border border-dashed border-border-subtle">
                      <span className="material-symbols-outlined text-text-muted text-3xl block mb-2">remove_shopping_cart</span>
                      <p className="font-body-sm text-text-muted mb-3">Keranjang belanja kosong.</p>
                      <button
                        onClick={handleResetBasket}
                        className="px-4 py-2 bg-primary text-on-primary rounded-xl text-xs font-semibold shadow-xs hover:bg-primary-container transition-all cursor-pointer"
                      >
                        Muat Ulang Keranjang Default
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-1.5 sm:space-y-2 mb-3.5 sm:mb-4">
                      {basketList.map((item) => {
                        const isChecked = checkedItems[item.komoditas_id] !== false;
                        const simItem = basketSim?.items.find((si) => si.komoditas_id === item.komoditas_id);
                        const itemSubtotal = simItem?.itemTotal || 0;

                        return (
                          <div
                            key={item.id || item.komoditas_id}
                            className={`flex items-center justify-between p-2 sm:p-2.5 rounded-xl border transition-all ${
                              isChecked
                                ? "bg-white border-slate-200/90 shadow-2xs hover:border-slate-300"
                                : "bg-slate-50/70 border-slate-200/50 opacity-60"
                            }`}
                          >
                            <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 pr-1 flex-1">
                              {/* Checkbox item */}
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleCheck(item.komoditas_id)}
                                className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded text-primary accent-primary cursor-pointer shrink-0"
                                title="Sertakan dalam simulasi"
                              />
                              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-surface-subtle flex items-center justify-center shrink-0 text-text-secondary">
                                <span className="material-symbols-outlined text-base sm:text-lg">
                                  {item.icon}
                                </span>
                              </div>
                              <div className="min-w-0 flex-1">
                                <span className="text-slate-900 font-semibold text-xs sm:text-sm truncate block" title={item.name}>
                                  {item.name}
                                </span>
                                {simItem && (
                                  simItem.available === false ? (
                                    <span className="text-[10px] sm:text-[10.5px] font-medium text-amber-600 block">
                                      Harga belum tersedia
                                    </span>
                                  ) : itemSubtotal > 0 && isChecked ? (
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="text-[10.5px] sm:text-[11px] font-bold text-primary block">
                                        Rp {itemSubtotal.toLocaleString("id-ID")}
                                      </span>
                                      {simItem.is_imputed && (
                                        <span className="text-[9px] px-1 py-0.2 rounded bg-amber-50 text-amber-700 border border-amber-200 font-medium">
                                          Estimasi
                                        </span>
                                      )}
                                    </div>
                                  ) : null
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                              {/* Stepper Touch-Friendly Ala Shopee */}
                              <div className="flex items-center bg-slate-100 rounded-lg border border-slate-200 p-0.5">
                                <button
                                  onClick={() => handleUpdateQty(item.komoditas_id, -1)}
                                  className="w-5.5 h-5.5 sm:w-6 sm:h-6 flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-white rounded-md cursor-pointer text-xs font-bold transition-colors shadow-2xs"
                                  title="Kurangi"
                                >
                                  -
                                </button>
                                <span className="px-1 sm:px-2 py-0.5 font-semibold text-slate-800 text-[11px] sm:text-xs min-w-[34px] sm:min-w-[42px] text-center">
                                  {item.qty} {item.unit}
                                </span>
                                <button
                                  onClick={() => handleUpdateQty(item.komoditas_id, 1)}
                                  className="w-5.5 h-5.5 sm:w-6 sm:h-6 flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-white rounded-md cursor-pointer text-xs font-bold transition-colors shadow-2xs"
                                  title="Tambah"
                                >
                                  +
                                </button>
                              </div>

                              {/* Delete button */}
                              <button
                                onClick={() => handleRemoveItem(item.komoditas_id)}
                                className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 p-1 sm:p-1.5 rounded-lg transition-colors cursor-pointer"
                                title="Hapus dari keranjang"
                              >
                                <span className="material-symbols-outlined text-[16px] sm:text-sm">delete_outline</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Market Ranking Comparison List & Multi-Market Strategy */}
                  <div className="mb-3.5 sm:mb-4">
                    <div className="flex items-center justify-between gap-1 mb-2">
                      <span className="font-label-caps text-[11px] sm:text-xs text-text-secondary uppercase tracking-wider font-bold truncate">
                        Strategi Belanja Paling Hemat
                      </span>
                      {activeBasketList.length > 0 && (
                        <span className="text-[10px] sm:text-[11px] text-slate-500 font-medium shrink-0">
                          {activeBasketList.length} item aktif
                        </span>
                      )}
                    </div>

                    {/* Mode Selector Tabs: 1 Pasar vs Multi-Pasar */}
                    <div className="flex items-center bg-surface-subtle p-1 rounded-xl mb-3 border border-border-subtle/70">
                      <button
                        type="button"
                        onClick={() => setBasketViewMode("single")}
                        className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                          basketViewMode === "single"
                            ? "bg-surface-card text-primary shadow-xs"
                            : "text-text-secondary hover:text-text-primary"
                        }`}
                      >
                        <span className="material-symbols-outlined text-sm">storefront</span>
                        <span>1 Pasar (Praktis)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setBasketViewMode("split")}
                        className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                          basketViewMode === "split"
                            ? "bg-surface-card text-primary shadow-xs"
                            : "text-text-secondary hover:text-text-primary"
                        }`}
                      >
                        <span className="material-symbols-outlined text-sm">alt_route</span>
                        <span>Multi-Pasar (Super Hemat)</span>
                      </button>
                    </div>

                    {isBasketLoading ? (
                      <div className="space-y-2 py-6 text-center text-text-muted text-xs bg-surface-canvas rounded-xl">
                        <span className="material-symbols-outlined animate-spin text-lg align-middle mr-1.5 text-primary">sync</span>
                        Menghitung simulasi harga 6 pasar...
                      </div>
                    ) : activeBasketList.length === 0 ? (
                      <div className="text-text-muted text-xs text-center py-4 bg-surface-canvas rounded-xl">
                        Centang minimal 1 barang di atas untuk melihat perbandingan pasar.
                      </div>
                    ) : basketSim?.rankings && basketSim.rankings.length > 0 ? (
                      basketViewMode === "single" ? (
                        <div className="space-y-2">
                          {/* Winners Box (Handles single winner or ties gracefully) */}
                          {(() => {
                            const winners = basketSim.rankings.filter((r) => r.isCheapest);
                            const mostExp = basketSim.rankings[basketSim.rankings.length - 1];
                            const maxSaving = mostExp ? Math.max(0, mostExp.totalBelanja - winners[0].totalBelanja) : 0;
                            const isTie = winners.length > 1;

                            return (
                              <div className="p-3 sm:p-3.5 rounded-xl bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent border-2 border-emerald-500/80 shadow-xs relative overflow-hidden">
                                <div className="flex items-center justify-between gap-2 mb-2">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="bg-emerald-600 text-white text-[9.5px] sm:text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full flex items-center gap-1 shadow-2xs shrink-0">
                                      <span className="material-symbols-outlined text-[12px] sm:text-[13px]">verified</span> Paling Hemat
                                    </span>
                                    <span className="text-emerald-900 font-bold text-xs">
                                      {isTie ? `Pilihan Terbaik Bersama (${winners.length} Pasar)` : "Pilihan Terbaik"}
                                    </span>
                                  </div>
                                  <span className="font-extrabold text-base sm:text-lg text-emerald-700 tracking-tight shrink-0">
                                    Rp {winners[0].totalBelanja.toLocaleString("id-ID")}
                                  </span>
                                </div>

                                <div className="space-y-1.5">
                                  {winners.map((winner) => {
                                    const cleanWilayah = winner.wilayah.replace(/^Surabaya\s+/i, "");
                                    const marketType = winner.pasar_id === 5 ? "Pasar Induk (Grosir)" : "Pasar Tradisional (Ritel)";
                                    return (
                                      <div key={winner.pasar_id} className="flex items-center justify-between text-xs gap-2 pt-1 border-t border-emerald-200/50 first:border-t-0 first:pt-0">
                                        <div className="min-w-0">
                                          <span className="font-bold text-slate-900 text-xs sm:text-sm truncate block">
                                            {winner.nama_pasar}
                                          </span>
                                          <span className="text-slate-500 text-[10.5px] sm:text-[11px] truncate block">
                                            Surabaya {cleanWilayah} • {marketType}
                                          </span>
                                        </div>
                                        {maxSaving > 0 && (
                                          <span className="text-[10.5px] sm:text-[11px] font-bold text-emerald-800 bg-emerald-100/90 px-2 py-0.5 rounded-md border border-emerald-200 shrink-0">
                                            Hemat Rp {maxSaving.toLocaleString("id-ID")}
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })()}

                          {/* Other Markets (#2 to #6) */}
                          <div className="space-y-1.5 pt-1">
                            {basketSim.rankings.filter((r) => !r.isCheapest).map((m) => {
                              const isMostExp = m.rank === basketSim.rankings[basketSim.rankings.length - 1].rank;
                              const cleanWil = m.wilayah.replace(/^Surabaya\s+/i, "");
                              return (
                                <div
                                  key={m.pasar_id}
                                  className={`px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl flex items-center justify-between text-xs border transition-colors ${
                                    isMostExp
                                      ? "bg-rose-50/40 border-rose-200/60"
                                      : "bg-surface-canvas border-slate-200/70"
                                  }`}
                                >
                                  <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 pr-1">
                                    <span className="w-4.5 h-4.5 sm:w-5 sm:h-5 rounded-full bg-surface-subtle text-text-secondary flex items-center justify-center font-bold text-[9.5px] sm:text-[10px] shrink-0">
                                      #{m.rank}
                                    </span>
                                    <div className="min-w-0 flex items-center gap-1">
                                      <span className="font-semibold text-slate-800 text-xs truncate">
                                        {m.nama_pasar}
                                      </span>
                                      <span className="hidden sm:inline text-slate-400 text-[10px] shrink-0">
                                        {cleanWil}
                                      </span>
                                    </div>
                                  </div>

                                  <div className="text-right flex items-center gap-1.5 sm:gap-2 shrink-0">
                                    <span className="font-semibold text-slate-900 text-xs">
                                      Rp {m.totalBelanja.toLocaleString("id-ID")}
                                    </span>
                                    <span
                                      className={`text-[9.5px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                        m.selisih === 0
                                          ? "bg-emerald-100 text-emerald-800"
                                          : isMostExp
                                          ? "bg-rose-100 text-rose-700"
                                          : "bg-slate-100 text-slate-600"
                                      }`}
                                    >
                                      {m.selisih === 0 ? "Sama Hemat" : `+Rp ${m.selisih.toLocaleString("id-ID")}`}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        /* Multi-Market / Split-Basket View */
                        <div className="space-y-2">
                          <div className="p-3 sm:p-3.5 rounded-xl bg-gradient-to-r from-teal-500/10 via-emerald-500/5 to-transparent border-2 border-teal-500/80 shadow-xs">
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="bg-teal-700 text-white text-[9.5px] sm:text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full inline-block shadow-2xs shrink-0">
                                  KERANJANG OPTIMAL
                                </span>
                                <span className="text-teal-950 font-bold text-xs">
                                  Multi-Pasar (Super Hemat)
                                </span>
                              </div>
                              <span className="font-extrabold text-base sm:text-lg text-teal-800 tracking-tight shrink-0 whitespace-nowrap">
                                Rp {basketSim.splitBasket.totalBelanja.toLocaleString("id-ID")}
                              </span>
                            </div>

                            <div className="flex items-center justify-between text-xs gap-2 mb-1.5">
                              <span className="text-slate-500 text-[10.5px] sm:text-[11px] truncate">
                                Beli tiap komoditas di pasar termurahnya masing-masing:
                              </span>
                              {basketSim.splitBasket.additionalSaving > 0 && (
                                <span className="text-[10.5px] sm:text-[11px] font-bold text-teal-800 bg-teal-100/90 px-2 py-0.5 rounded-md border border-teal-200 shrink-0 whitespace-nowrap">
                                  +Hemat Rp {basketSim.splitBasket.additionalSaving.toLocaleString("id-ID")}
                                </span>
                              )}
                            </div>

                            <div className="mt-2.5 pt-2 border-t border-teal-200/60 space-y-1.5">
                              {basketSim.splitBasket.items.map((it) => (
                                <div
                                  key={`split_${it.komoditas_id}`}
                                  className="flex items-center justify-between text-xs py-1 px-2 rounded-lg bg-white/70 border border-teal-100"
                                >
                                  <div className="min-w-0 pr-2">
                                    <span className="font-semibold text-slate-900 block truncate">
                                      {it.name} ({it.qty} {it.unit})
                                    </span>
                                    {it.available === false ? (
                                      <span className="text-[10.5px] text-amber-600 font-medium block">
                                        Harga belum tersedia
                                      </span>
                                    ) : (
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="text-[10.5px] text-teal-700 font-medium block">
                                          📍 Beli di Pasar {it.cheapestMarket}
                                        </span>
                                        {it.is_imputed && (
                                          <span className="text-[9px] px-1 py-0.2 rounded bg-amber-50 text-amber-700 border border-amber-200 font-medium">
                                            Estimasi
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                  <span className="font-bold text-slate-900 shrink-0 text-xs">
                                    {it.available === false ? "-" : `Rp ${it.itemTotal.toLocaleString("id-ID")}`}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )
                    ) : (
                      <div className="text-text-muted text-xs text-center py-2">
                        Pilih item untuk melihat ranking pasar.
                      </div>
                    )}

                    {/* Realistic Transport & Distance Tip Callout */}
                    <div className="mt-3 p-2.5 sm:p-3 rounded-xl bg-amber-50/80 border border-amber-200/70 text-[11px] sm:text-xs text-amber-900 flex items-start gap-2 shadow-2xs">
                      <span className="material-symbols-outlined text-amber-700 text-sm sm:text-base shrink-0 mt-0.5">commute</span>
                      <div className="leading-relaxed">
                        <strong className="font-semibold text-amber-950">Tips Belanja Bijak:</strong> Selisih penghematan sebaiknya disesuaikan dengan jarak tempuh &amp; biaya transportasi/parkir. Bila selisihnya tipis (&lt; Rp 5.000), utamakan pasar tradisional terdekat dari rumah Anda.
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-col gap-2">
                    <button
                      className="w-full py-2.5 sm:py-3 bg-[#25D366] hover:bg-[#20bd5a] text-white rounded-xl font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer"
                      onClick={handleShareToWhatsApp}
                    >
                      <span className="material-symbols-outlined text-base sm:text-lg">share</span>
                      Bagikan Rincian Belanja ke WhatsApp
                    </button>
                    <button
                      className="w-full py-2 sm:py-2.5 bg-surface-subtle hover:bg-slate-200 text-slate-700 rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      onClick={handleDownloadList}
                    >
                      <span className="material-symbols-outlined text-sm sm:text-base">download_for_offline</span>
                      Simpan Catatan Belanja
                    </button>
                    <p className="text-[10px] text-text-muted mt-1 text-center leading-relaxed">
                      *Minyak goreng curah dihitung dalam satuan kg sesuai pencatatan resmi pasar SISKAPERBAPO (1 kg ≈ 1,1 liter).
                    </p>
                  </div>
                </div>
              </div>

            </div>
          </section>

          {/* Bottom Section: Komparasi Harga Antar-Pasar 14 Hari Konsumen */}
          <section className="max-w-[80rem] mx-auto px-space-md lg:px-gutter-desktop w-full mb-space-lg sm:mb-space-xl lg:mb-space-2xl" id="grafik-tren">
            <div className="bg-surface-card rounded-2xl p-space-md lg:p-space-lg shadow-sm border border-border-subtle/80 transition-all">
              {/* Header: Title & Info */}
              <div className="mb-4">
                <h2 className="font-headline-lg text-headline-lg text-text-primary tracking-tight">
                  Dinamika Harga {marketTrendsData?.nama_komoditas || "Komoditas Pangan"}
                </h2>
                <p className="font-body-sm text-body-sm text-text-secondary mt-0.5">
                  Perbandingan pergerakan harga riil &amp; estimasi tren 7 hari ke depan di 6 pasar Surabaya per {marketTrendsData?.satuan || "kg"}
                </p>
              </div>

              {/* Panel Kontrol: Pilihan Komoditas & Rentang Waktu (Bebas Redundansi) */}
              <div className="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-4 bg-surface-subtle/50 p-3.5 rounded-2xl border border-border-subtle/70">
                {/* Left: Searchable Dropdown for 37 Commodities */}
                <div className="w-full md:w-72 lg:w-80 shrink-0">
                  <label className="block mb-1.5 text-[11px] font-bold text-text-muted uppercase tracking-wider">
                    Pilih Komoditas Pokok:
                  </label>
                  <CommoditySearchSelect
                    options={ALL_CATALOG_COMMODITIES}
                    valueId={trendCommodityId}
                    onChange={(id) => {
                      setTrendCommodityId(id);
                      setHighlightedMarketId(null);
                    }}
                    searchPlaceholder="Cari dari 37 komoditas Surabaya..."
                    emptyNoun="komoditas"
                    panelClassName="w-full sm:w-96 lg:w-[26rem]"
                  />
                </div>

                {/* Right: Rentang Waktu (Timeframe Selector) menggantikan chip strategis redundant */}
                <div className="w-full md:flex-1 min-w-0">
                  <label className="block mb-1.5 text-[11px] font-bold text-text-muted uppercase tracking-wider">
                    Rentang Waktu:
                  </label>
                  <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-border-subtle shadow-xs overflow-x-auto no-scrollbar h-11">
                    {TIMEFRAME_CONFIG.map((tf) => (
                      <button
                        key={tf.id}
                        type="button"
                        onClick={() => setTrendTimeframe(tf.id)}
                        className={`h-9 flex-1 min-w-[68px] inline-flex items-center justify-center px-3 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                          trendTimeframe === tf.id
                            ? "bg-primary text-white shadow-xs font-bold"
                            : "text-text-secondary hover:text-text-primary hover:bg-surface-subtle"
                        }`}
                      >
                        {tf.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Dynamic SVG Comparison Chart Canvas with Executive Metrics & Focus Toolbar */}
              {(() => {
                if (loadingTrends) {
                  return (
                    <div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-4 animate-pulse">
                        {Array.from({ length: 4 }).map((_, i) => (
                          <div key={`trend-sum-skel-${i}`} className="bg-surface-canvas border border-border-subtle/80 rounded-xl p-3 shadow-xs">
                            <div className="h-3 w-20 bg-surface-subtle rounded mb-2" />
                            <div className="h-5 w-28 bg-surface-subtle rounded mb-1" />
                            <div className="h-3 w-16 bg-surface-subtle rounded" />
                          </div>
                        ))}
                      </div>
                      <div className="w-full h-72 sm:h-84 bg-surface-card border border-border-subtle/60 rounded-2xl p-6 flex flex-col justify-between animate-pulse mb-space-md">
                        <div className="flex items-center justify-between">
                          <div className="h-4 w-40 bg-surface-subtle rounded" />
                          <div className="h-4 w-28 bg-surface-subtle rounded" />
                        </div>
                        <div className="space-y-4">
                          <div className="h-[1px] w-full bg-border-subtle/60 border-b border-dashed border-border-subtle" />
                          <div className="h-[1px] w-full bg-border-subtle/60 border-b border-dashed border-border-subtle" />
                          <div className="h-[1px] w-full bg-border-subtle/60 border-b border-dashed border-border-subtle" />
                        </div>
                        <div className="flex justify-between">
                          {Array.from({ length: 7 }).map((_, i) => (
                            <div key={`trend-x-skel-${i}`} className="h-3 w-10 bg-surface-subtle rounded" />
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                }

                if (errorTrends || !marketTrendsData || !marketTrendsData.series || marketTrendsData.series.length === 0) {
                  return (
                    <div className="bg-surface-card rounded-2xl p-8 border border-border-subtle/80 flex flex-col items-center justify-center text-center gap-3 mb-space-md">
                      <div className="w-12 h-12 rounded-full bg-status-warning-bg flex items-center justify-center text-status-warning">
                        <span className="material-symbols-outlined text-2xl">timeline</span>
                      </div>
                      <div>
                        <h4 className="font-headline-sm text-text-primary text-base">Data Tren Pasar Belum Tersedia</h4>
                        <p className="font-body-sm text-text-secondary mt-1 max-w-md">
                          Gagal memuat dinamika perbandingan harga 14 hari 6 pasar untuk komoditas ini.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => loadTrends(trendCommodityId)}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-on-primary font-headline-sm text-body-sm hover:bg-primary-container transition-colors cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-body-sm">refresh</span>
                        Muat Ulang Tren
                      </button>
                    </div>
                  );
                }

                const dates = marketTrendsData.dates;
                const formattedDates = marketTrendsData.formattedDates;
                const seriesToRender = marketTrendsData.series.map((s) => ({
                  ...s,
                  points: s.points.map((pt, i) => ({
                    ...pt,
                    formattedDate: formattedDates[i] || pt.tanggal,
                  })),
                }));

                const totalPoints = dates.length;
                const todayIdx = marketTrendsData?.splitIndex !== undefined ? marketTrendsData.splitIndex : Math.min(6, totalPoints - 1);
                
                // SVG dimensions & coordinate transforms
                const chartLeft = 65;
                const chartRight = 790;
                const chartTop = 38;
                const chartBottom = 175;
                const chartWidth = chartRight - chartLeft;
                const chartHeight = chartBottom - chartTop;

                const getX = (idx: number) => chartLeft + (idx / Math.max(1, totalPoints - 1)) * chartWidth;

                // Today stats across active markets
                const todayMarketStats = seriesToRender
                  .map((s) => ({
                    id: s.id,
                    name: s.name,
                    color: s.color,
                    price: s.points[todayIdx]?.price || 0,
                    isActive: !!activeMarkets[s.id],
                  }))
                  .filter((m) => m.price > 0);

                const visibleTodayStats = todayMarketStats.filter((m) => m.isActive);
                const cheapestToday = visibleTodayStats.length > 0
                  ? [...visibleTodayStats].sort((a, b) => a.price - b.price)[0]
                  : null;
                const highestToday = visibleTodayStats.length > 0
                  ? [...visibleTodayStats].sort((a, b) => b.price - a.price)[0]
                  : null;

                const spreadToday = highestToday && cheapestToday ? highestToday.price - cheapestToday.price : 0;
                const spreadTodayPct = cheapestToday && cheapestToday.price > 0
                  ? ((spreadToday / cheapestToday.price) * 100).toFixed(1)
                  : "0";
                const avgToday = visibleTodayStats.length > 0
                  ? Math.round(visibleTodayStats.reduce((acc, m) => acc + m.price, 0) / visibleTodayStats.length)
                  : 0;

                // Dynamic tight Y-Scale from active visible markets
                const activePrices = seriesToRender
                  .filter((s) => activeMarkets[s.id])
                  .flatMap((s) => s.points.map((p) => p.price))
                  .filter((p) => p > 0);

                const dataMin = activePrices.length > 0 ? Math.min(...activePrices) : 25000;
                const dataMax = activePrices.length > 0 ? Math.max(...activePrices) : 38000;
                const rawRange = Math.max(2000, dataMax - dataMin);
                const pad = Math.round(rawRange * 0.08);
                const yMin = 0;
                const yMax = Math.ceil((dataMax + pad) / 500) * 500;
                const yRange = Math.max(1000, yMax - yMin);

                const getY = (price: number) => {
                  const clamped = Math.max(yMin, Math.min(yMax, price));
                  return chartBottom - ((clamped - yMin) / yRange) * chartHeight;
                };

                const gridLevels = [
                  { y: chartTop, val: yMax },
                  { y: chartTop + chartHeight * 0.33, val: Math.round(yMin + yRange * 0.67) },
                  { y: chartTop + chartHeight * 0.67, val: Math.round(yMin + yRange * 0.33) },
                  { y: chartBottom, val: 0 },
                ];

                const formatY = (val: number) => {
                  if (val === 0) return "Rp 0";
                  if (val >= 1000) {
                    const k = val / 1000;
                    return `Rp ${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}k`;
                  }
                  return `Rp ${val}`;
                };

                const todayX = getX(todayIdx);

                // Path kurva adaptif: linear untuk data pendek, spline halus (Catmull-Rom) untuk rentang waktu panjang
                const getLinearPath = (pts: { x: number; y: number }[], isForecast = false) => {
                  if (pts.length === 0) return "";
                  if (pts.length <= 2 || isForecast || totalPoints <= 20) {
                    return pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
                  }
                  let d = `M ${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
                  const tension = 0.12;
                  for (let i = 0; i < pts.length - 1; i++) {
                    const p0 = pts[i === 0 ? 0 : i - 1];
                    const p1 = pts[i];
                    const p2 = pts[i + 1];
                    const p3 = pts[i + 2 < pts.length ? i + 2 : i + 1];

                    const cp1x = p1.x + (p2.x - p0.x) * tension;
                    const cp1y = p1.y + (p2.y - p0.y) * tension;
                    const cp2x = p2.x - (p3.x - p1.x) * tension;
                    const cp2y = p2.y - (p3.y - p1.y) * tension;

                    d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
                  }
                  return d;
                };

                // Active hover point calculations
                const activeHoverPoint = hoveredPointIndex !== null ? {
                  idx: hoveredPointIndex,
                  x: getX(hoveredPointIndex),
                  dateStr: formattedDates[hoveredPointIndex],
                  isForecast: hoveredPointIndex > todayIdx,
                  prices: seriesToRender
                    .filter((s) => activeMarkets[s.id])
                    .map((s) => ({
                      id: s.id,
                      name: s.name,
                      color: s.color,
                      price: s.points[hoveredPointIndex]?.price || 0,
                      isImputed: s.points[hoveredPointIndex]?.isImputed || false,
                      y: getY(s.points[hoveredPointIndex]?.price || 0),
                    }))
                    .sort((a, b) => a.price - b.price),
                } : null;

                const baseCheapestPrice = activeHoverPoint && activeHoverPoint.prices.length > 0
                  ? activeHoverPoint.prices[0].price
                  : 0;

                return (
                  <div>
                    {/* Executive Summary Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-4">
                      <div className="bg-surface-canvas border border-border-subtle/90 rounded-xl p-3 shadow-xs">
                        <div className="flex items-center justify-between text-xs font-medium text-text-secondary">
                          <span>Pasar Termurah</span>
                          <span className="text-status-normal font-semibold text-[11px]">Rekomendasi</span>
                        </div>
                        <div className="text-sm sm:text-base font-bold text-text-primary mt-1 truncate">
                          {cheapestToday?.name || "-"}
                        </div>
                        <div className="text-xs text-status-normal font-bold font-metric-value mt-0.5">
                          Rp {cheapestToday?.price.toLocaleString("id-ID") || "0"}
                          <span className="text-[10px] font-normal text-text-muted ml-1">/ {marketTrendsData?.satuan || "kg"}</span>
                        </div>
                      </div>

                      <div className="bg-surface-canvas border border-border-subtle/90 rounded-xl p-3 shadow-xs">
                        <div className="text-xs font-medium text-text-secondary">
                          Pasar Tertinggi
                        </div>
                        <div className="text-sm sm:text-base font-bold text-text-primary mt-1 truncate">
                          {highestToday?.name || "-"}
                        </div>
                        <div className="text-xs text-status-danger font-bold font-metric-value mt-0.5">
                          Rp {highestToday?.price.toLocaleString("id-ID") || "0"}
                          <span className="text-[10px] font-normal text-text-muted ml-1">/ {marketTrendsData?.satuan || "kg"}</span>
                        </div>
                      </div>

                      <div className="bg-surface-canvas border border-border-subtle/90 rounded-xl p-3 shadow-xs">
                        <div className="flex items-center justify-between text-xs font-medium text-text-secondary">
                          <span>Disparitas Harga</span>
                          <span className="text-[11px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">{spreadTodayPct}%</span>
                        </div>
                        <div className="text-sm sm:text-base font-bold text-text-primary mt-1 font-metric-value">
                          Rp {spreadToday.toLocaleString("id-ID")}
                        </div>
                        <div className="text-[11px] text-text-secondary mt-0.5">
                          Selisih tertinggi vs termurah
                        </div>
                      </div>

                      <div className="bg-surface-canvas border border-border-subtle/90 rounded-xl p-3 shadow-xs">
                        <div className="text-xs font-medium text-text-secondary">
                          Rata-rata 6 Pasar
                        </div>
                        <div className="text-sm sm:text-base font-bold text-text-primary mt-1 font-metric-value">
                          Rp {avgToday.toLocaleString("id-ID")}
                        </div>
                        <div className="text-[11px] text-text-secondary mt-0.5">
                          {formattedDates[todayIdx] || "Hari Ini"} (Surabaya)
                        </div>
                      </div>
                    </div>

                    {/* Interactive Focus Toolbar: Market Chips */}
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 py-2.5 px-3 bg-surface-canvas/60 rounded-xl border border-border-subtle/80 mb-3">
                      {/* Mobile Header: Label & Action */}
                      <div className="flex items-center justify-between md:hidden">
                        <span className="text-xs font-semibold text-text-secondary">
                          Fokus Pasar:
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const allVisible = TREND_MARKET_CONFIGS.reduce((acc, m) => ({ ...acc, [m.id]: true }), {});
                            setActiveMarkets(allVisible);
                            setHighlightedMarketId(null);
                          }}
                          className="text-[11px] text-primary hover:text-primary-dark hover:underline font-semibold cursor-pointer shrink-0"
                        >
                          Tampilkan Semua
                        </button>
                      </div>

                      {/* Market Chips: 2-Col Grid on Mobile, Flex on Desktop */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:flex md:flex-wrap items-center gap-1.5 sm:gap-2">
                        <span className="text-xs font-semibold text-text-secondary mr-1 hidden md:inline">
                          Fokus Pasar:
                        </span>
                        {TREND_MARKET_CONFIGS.map((m) => {
                          const isVisible = !!activeMarkets[m.id];
                          const isHovered = highlightedMarketId === m.id;

                          return (
                            <button
                              key={m.id}
                              type="button"
                              onMouseEnter={() => setHighlightedMarketId(m.id)}
                              onMouseLeave={() => setHighlightedMarketId(null)}
                              onClick={() => setActiveMarkets((prev) => ({ ...prev, [m.id]: !prev[m.id] }))}
                              className={`group inline-flex items-center justify-center md:justify-start gap-1.5 px-2.5 py-1.5 md:py-1 rounded-lg text-xs font-medium transition-all duration-200 cursor-pointer select-none border ${
                                !isVisible
                                  ? "opacity-35 bg-surface-subtle/50 text-text-muted line-through border-transparent"
                                  : isHovered
                                  ? "bg-surface-card text-text-primary shadow-sm scale-[1.02] md:scale-105 border-primary/50 ring-2 ring-primary/20"
                                  : "bg-surface-card hover:bg-surface-card/90 text-text-secondary hover:text-text-primary border-border-subtle shadow-xs"
                              }`}
                              title={`Klik untuk on/off. Sorot kursor untuk isolasi grafik ${m.name}`}
                            >
                              <span
                                className="w-2 h-2 rounded-full shrink-0 transition-transform group-hover:scale-125"
                                style={{ backgroundColor: m.color }}
                              />
                              <span className="truncate">{m.name}</span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Desktop Right Actions */}
                      <div className="hidden md:flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const allVisible = TREND_MARKET_CONFIGS.reduce((acc, m) => ({ ...acc, [m.id]: true }), {});
                            setActiveMarkets(allVisible);
                            setHighlightedMarketId(null);
                          }}
                          className="text-[11px] text-primary hover:text-primary-dark hover:underline font-semibold cursor-pointer shrink-0"
                        >
                          Tampilkan Semua
                        </button>
                      </div>
                    </div>

                    {/* Chart Container Canvas */}
                    <div className="w-full relative bg-white rounded-2xl p-3 sm:p-5 mb-space-md select-none border border-border-subtle/70">
                      {/* Mobile Swipe Affordance */}
                      <div className="sm:hidden flex items-center justify-between text-text-muted text-[11px] font-medium mb-2.5 pb-2 border-b border-border-subtle/50">
                        <span className="flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[15px] text-primary">swipe</span> Geser grafik untuk melihat pergerakan 14 hari
                        </span>
                        <span className="text-primary font-bold text-xs">&rarr;</span>
                      </div>

                      {/* Scrollable Container on Mobile with ample min-width */}
                      <div className="w-full overflow-x-auto no-scrollbar">
                        <div className="min-w-[680px] sm:min-w-full relative">
                          {/* Floating Ranking Leaderboard Tooltip */}
                          {activeHoverPoint && (
                            <div
                              className="absolute z-30 pointer-events-none bg-surface-card/95 backdrop-blur-md border border-border-subtle p-3.5 rounded-xl shadow-xl text-xs min-w-[240px] transition-opacity duration-150 will-change-transform"
                              style={{
                                left: `${Math.min(70, Math.max(8, (activeHoverPoint.x / 820) * 100))}%`,
                                top: "16px",
                              }}
                            >
                              <div className="font-semibold text-text-primary flex items-center justify-between gap-1.5 mb-2 pb-1.5 border-b border-border-subtle">
                                <span className="font-bold">{activeHoverPoint.dateStr}</span>
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    activeHoverPoint.isForecast
                                      ? "bg-primary-container text-on-primary"
                                      : "bg-status-normal-bg text-status-normal"
                                  }`}
                                >
                                  {activeHoverPoint.isForecast ? "Proyeksi model" : "Observasi"}
                                </span>
                              </div>
                              <div className="space-y-1.5">
                                {activeHoverPoint.prices.map((p, rankIdx) => {
                                  const diffVsCheapest = p.price - baseCheapestPrice;
                                  const isFocus = highlightedMarketId === p.id;
                                  return (
                                    <div
                                      key={p.id}
                                      className={`flex items-center justify-between gap-2 px-1.5 py-0.5 rounded ${
                                        isFocus ? "bg-primary/10 font-bold" : "text-text-secondary"
                                      } text-[11px]`}
                                    >
                                      <span className="flex items-center gap-1.5 truncate">
                                        <span className="text-[9px] font-mono text-text-muted font-bold w-3 text-center">
                                          #{rankIdx + 1}
                                        </span>
                                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }}></span>
                                        <span className={`truncate ${isFocus ? "text-primary font-bold" : "text-text-primary"}`}>
                                          {p.name}
                                        </span>
                                      </span>
                                      <div className="text-right shrink-0 flex flex-col items-end">
                                        <div className="flex items-center gap-1">
                                          {p.isImputed && (
                                            <span className="text-[9px] bg-amber-100 text-amber-800 font-semibold px-1 rounded" title="Data hasil estimasi/forward-fill karena laporan pasar tertunda">
                                              Estimasi
                                            </span>
                                          )}
                                          <span className="font-bold text-text-primary font-metric-value">
                                            Rp {p.price.toLocaleString("id-ID")}
                                          </span>
                                        </div>
                                        {rankIdx > 0 && diffVsCheapest > 0 && (
                                          <span className="block text-[9px] text-text-muted font-mono leading-none">
                                            +{diffVsCheapest.toLocaleString("id-ID")}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* SVG Canvas - Tight, responsive, no vertical dead space */}
                          <div
                            className="w-full cursor-crosshair relative"
                            onMouseMove={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              const mouseX = e.clientX - rect.left;
                              const svgX = (mouseX / rect.width) * 820;
                              if (svgX >= chartLeft - 15 && svgX <= chartRight + 15) {
                                const idx = Math.round(((svgX - chartLeft) / chartWidth) * (totalPoints - 1));
                                const clamped = Math.max(0, Math.min(totalPoints - 1, idx));
                                setHoveredPointIndex(clamped);
                              }
                            }}
                            onMouseLeave={() => setHoveredPointIndex(null)}
                          >
                            <svg className="w-full h-auto block" viewBox="0 0 820 215">

                          {/* Dynamic Horizontal Grid Lines & Y-Labels (Clean Solid Style) */}
                          {gridLevels.map((lvl, idx) => (
                            <g key={idx}>
                              <line
                                stroke="#E2E8F0"
                                strokeWidth="1"
                                x1={chartLeft - 10}
                                x2={chartRight}
                                y1={lvl.y}
                                y2={lvl.y}
                              />
                              <text
                                className="fill-[#64748B] font-metric-delta text-[10px] font-medium"
                                x="10"
                                y={lvl.y + 3.5}
                              >
                                {formatY(lvl.val)}
                              </text>
                            </g>
                          ))}

                          {/* Vertical Indicator Line for Today / Split Date */}
                          <line
                            stroke="#94A3B8"
                            strokeDasharray="3 3"
                            strokeWidth="1"
                            opacity="0.6"
                            x1={todayX}
                            x2={todayX}
                            y1={chartTop}
                            y2={chartBottom}
                          />
                          <text
                            className="fill-[#64748B] font-label-caps text-[10px] font-semibold select-none pointer-events-none"
                            textAnchor="middle"
                            x={todayX}
                            y="24"
                          >
                            Data {formattedDates[todayIdx] || "terkini"}
                          </text>

                          {/* Trajectory Paths & Markers for Each Market */}
                          {seriesToRender.map((s) => {
                            if (!activeMarkets[s.id]) return null;
                            const pts = s.points.map((pt, i) => ({ x: getX(i), y: getY(pt.price) }));
                            const histPts = pts.slice(0, todayIdx + 1);
                            const forecastPts = pts.slice(todayIdx);
                            const histPathString = getLinearPath(histPts);
                            const forecastPathString = forecastPts.length > 1 ? getLinearPath(forecastPts) : "";

                            const isHighlighted = highlightedMarketId === s.id;
                            const isDimmed = highlightedMarketId !== null && !isHighlighted;

                            return (
                              <g key={s.id}>
                                {/* Observasi Riil: Solid Line (Clean 2px) */}
                                {histPathString && (
                                  <path
                                    d={histPathString}
                                    fill="none"
                                    stroke={s.color}
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={isHighlighted ? "2.8" : "2"}
                                    opacity={isDimmed ? 0.15 : isHighlighted ? 1 : 0.9}
                                    className="trend-path cursor-pointer"
                                    onMouseEnter={() => setHighlightedMarketId(s.id)}
                                    onMouseLeave={() => setHighlightedMarketId(null)}
                                  />
                                )}

                                {/* Proyeksi Masa Depan: Garis Putus-putus (Dashed Line 1.8px) */}
                                {forecastPathString && (
                                  <path
                                    d={forecastPathString}
                                    fill="none"
                                    stroke={s.color}
                                    strokeDasharray="4 3"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={isHighlighted ? "2.4" : "1.8"}
                                    opacity={isDimmed ? 0.12 : isHighlighted ? 1 : 0.7}
                                    className="trend-path cursor-pointer transition-opacity duration-200"
                                    onMouseEnter={() => setHighlightedMarketId(s.id)}
                                    onMouseLeave={() => setHighlightedMarketId(null)}
                                  />
                                )}

                                {/* Data Markers on Key Dates (Solid Dot Markers) */}
                                {s.points.map((pt, i) => {
                                  const isToday = i === todayIdx;
                                  const isHovered = hoveredPointIndex === i;
                                  // Untuk rentang waktu panjang (>35 hari / bulan / tahun), jangan render titik statis bertumpuk di sepanjang garis
                                  // Cukup tampilkan titik jangkar Hari Ini (Today) agar kurva tetap bersih dan mulus
                                  const shouldRenderCircle =
                                    totalPoints <= 35
                                      ? true
                                      : isToday || isHovered;

                                  if (!shouldRenderCircle) return null;

                                  const cx = getX(i);
                                  const cy = getY(pt.price);

                                  return (
                                    <circle
                                      key={i}
                                      cx={cx}
                                      cy={cy}
                                      r={isHighlighted ? (isToday ? 4.5 : 3.5) : (isToday ? 3.8 : 3)}
                                      fill={s.color}
                                      opacity={isDimmed ? 0.2 : 1}
                                      className="trend-dot cursor-pointer transition-transform hover:scale-150"
                                      onMouseEnter={() => setHighlightedMarketId(s.id)}
                                      onMouseLeave={() => setHighlightedMarketId(null)}
                                    >
                                      <title>{`${s.name} (${pt.formattedDate}): Rp ${pt.price.toLocaleString("id-ID")}${pt.isImputed ? " (Estimasi / Laporan Tertunda)" : ""}`}</title>
                                    </circle>
                                  );
                                })}
                              </g>
                            );
                          })}

                          {/* Invisible Interactive Hit-Test Columns for each Date */}
                          {dates.map((_, i) => {
                            const colWidth = chartWidth / Math.max(1, totalPoints - 1);
                            const xStart = i === 0 ? chartLeft - 15 : getX(i) - colWidth / 2;
                            const w = i === 0 || i === totalPoints - 1 ? colWidth / 2 + 15 : colWidth;
                            return (
                              <rect
                                key={`hit-${i}`}
                                x={xStart}
                                y="0"
                                width={w}
                                height={chartBottom}
                                fill="transparent"
                                className="cursor-crosshair"
                                onMouseEnter={() => setHoveredPointIndex(i)}
                                onClick={() => setHoveredPointIndex(i)}
                              />
                            );
                          })}

                          {/* Interactive Tracking Hover Crosshair & Dots */}
                          {activeHoverPoint && (
                            <g>
                              <line
                                stroke="#475569"
                                strokeDasharray="3 3"
                                strokeWidth="1"
                                x1={activeHoverPoint.x}
                                x2={activeHoverPoint.x}
                                y1={chartTop - 5}
                                y2={chartBottom}
                              />
                              {activeHoverPoint.prices.map((p) => {
                                const isFocus = highlightedMarketId === p.id;
                                return (
                                  <circle
                                    key={p.id}
                                    cx={activeHoverPoint.x}
                                    cy={p.y}
                                    fill={p.color}
                                    r={isFocus ? "6" : "4.5"}
                                    stroke="#FFFFFF"
                                    strokeWidth="2"
                                    className="transition-[r] duration-150"
                                  />
                                );
                              })}
                            </g>
                          )}

                          {/* X-Axis Timeline Labels inside SVG: dynamically spaced without collisions */}
                          <g className="font-label-caps text-[10px] select-none pointer-events-none">
                            {(() => {
                              const minGapPx = 85;
                              const histSpanPx = getX(todayIdx) - getX(0);
                              const histIntervals = Math.max(1, Math.round(histSpanPx / 160));
                              const histStep = todayIdx / histIntervals;
                              const histTicks = Array.from({ length: histIntervals }, (_, i) => Math.round(i * histStep));

                              const fcSpanPx = getX(totalPoints - 1) - getX(todayIdx);
                              let fcTicks: number[] = [];
                              if (fcSpanPx >= minGapPx) {
                                const fcIntervals = Math.max(1, Math.round(fcSpanPx / 160));
                                const fcStep = (totalPoints - 1 - todayIdx) / fcIntervals;
                                fcTicks = Array.from({ length: fcIntervals }, (_, i) => todayIdx + Math.round((i + 1) * fcStep));
                              }

                              const rawTicks = Array.from(new Set([...histTicks, todayIdx, ...fcTicks])).sort((a, b) => a - b);
                              
                              // Enforce strictly that no neighbor tick is closer than minGapPx to todayIdx
                              const sortedIndices = rawTicks.filter((t) => {
                                if (t === todayIdx) return true;
                                return Math.abs(getX(t) - getX(todayIdx)) >= minGapPx;
                              });

                              const todayWIB = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
                              const isAnchorToday = marketTrendsData?.anchorDate === todayWIB;

                              return sortedIndices.map((idx, i) => {
                                const isAnchor = idx === todayIdx;
                                const isFirst = i === 0;
                                const isLast = i === sortedIndices.length - 1;
                                const isForecastEnd = isLast && idx > todayIdx;
                                const anchor = isFirst ? "start" : isLast ? "end" : "middle";
                                const xPos = getX(idx);
                                const hasSub = isAnchor || isForecastEnd;

                                return (
                                  <text
                                    key={`tick-${idx}`}
                                    x={xPos}
                                    y={hasSub ? "190" : "196"}
                                    textAnchor={anchor}
                                    className={isAnchor ? "fill-[#16A34A] font-bold" : "fill-[#64748B] font-medium"}
                                  >
                                    <tspan x={xPos}>{formattedDates[idx]}</tspan>
                                    {isAnchor && (
                                      <tspan x={xPos} dy="11" className="text-[9px] fill-[#16A34A] font-semibold">
                                        {isAnchorToday ? "(Hari Ini)" : "(Data Terakhir)"}
                                      </tspan>
                                    )}
                                    {isForecastEnd && (
                                      <tspan x={xPos} dy="11" className="text-[9px] fill-[#64748B] font-medium">
                                        (Proyeksi)
                                      </tspan>
                                    )}
                                  </text>
                                );
                              });
                            })()}
                          </g>
                        </svg>
                      </div>
                    </div>

                    {/* Disclaimer Metodologi & Model AI dengan Navigasi Terhubung */}
                    <div className="mt-4 pt-3.5 border-t border-border-subtle/80 text-[11px] text-text-muted leading-relaxed">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full">
                        <div className="flex items-start gap-2 flex-1">
                          <span className="material-symbols-outlined text-[17px] text-primary shrink-0 mt-0.5">info</span>
                          <p>
                            <strong className="text-text-secondary font-semibold">Catatan Metodologi:</strong> Proyeksi harga dihitung menggunakan model Machine Learning (LightGBM/GBDT) berbasis dinamika harga historis, transmisi Pasar Induk Keputran, dan pola musiman kalender. Data bersifat estimasi statistik dini, bukan penetapan harga resmi pemerintah.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
              })()}


            </div>
          </section>
        </div>
      </main>

      {/* Floating Sticky Cart Bar (Portal langsung ke document.body agar tidak terjebak container transform, otomatis menghilang saat scroll lewat Best Price Finder, dan disembunyikan pada layar desktop) */}
      {isMounted && typeof document !== "undefined" && basketList.length > 0 && createPortal(
        <aside
          aria-label="Keranjang Belanja Mengambang"
          className={`lg:hidden fixed bottom-5 left-0 right-0 mx-auto w-[calc(100%-24px)] max-w-md z-[9999] transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-[transform,opacity] transform ${
            showFloatingBasket
              ? "opacity-100 translate-y-0 pointer-events-auto"
              : "opacity-0 translate-y-8 pointer-events-none"
          }`}
        >
          <div className="bg-white/95 text-slate-900 backdrop-blur-md rounded-2xl p-2.5 sm:p-3 shadow-2xl shadow-slate-900/25 border border-slate-200/90 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="relative shrink-0">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200/80 flex items-center justify-center shadow-xs">
                  <span className="material-symbols-outlined text-[20px]">shopping_bag</span>
                </div>
                {activeBasketList.length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-emerald-600 text-white text-[10px] font-extrabold w-4.5 h-4.5 rounded-full flex items-center justify-center shadow-xs border-2 border-white">
                    {activeBasketList.length}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[11px] text-slate-500 font-medium">Termurah:</span>
                  <span className="font-extrabold text-sm text-slate-900">
                    {basketSim && basketSim.rankings.length > 0
                      ? `Rp ${basketSim.rankings[0].totalBelanja.toLocaleString("id-ID")}`
                      : "Rp 0"}
                  </span>
                </div>
                <p className="text-[11px] text-emerald-700 font-medium truncate flex items-center gap-1">
                  <span className="material-symbols-outlined text-[13px] text-emerald-600">verified</span>
                  {basketSim && basketSim.rankings.length > 0
                    ? `${basketSim.rankings[0].nama_pasar} (Paling Hemat)`
                    : "Pilih komoditas"}
                </p>
              </div>
            </div>

            <button
              onClick={() => {
                const el = document.getElementById("smart-shopping-basket");
                if (el) {
                  el.scrollIntoView({ behavior: "smooth", block: "start" });
                  el.classList.add("ring-4", "ring-primary/40");
                  setTimeout(() => el.classList.remove("ring-4", "ring-primary/40"), 1800);
                }
              }}
              className="px-3.5 py-2 bg-primary hover:bg-primary-container text-white text-xs font-bold rounded-xl flex items-center gap-1 shrink-0 shadow-xs hover:shadow-sm transition-all active:scale-95 cursor-pointer"
            >
              <span>Lihat Keranjang</span>
              <span className="material-symbols-outlined text-sm">arrow_downward</span>
            </button>
          </div>
        </aside>,
        document.body
      )}

      <Footer />
    </div>
  );
}
