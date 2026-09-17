"use client";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  Flower2,
  Plus,
  MapPin,
  Archive,
  Download,
  ChevronRight,
  ChevronLeft,
  ImagePlus,
  Pencil,
  Trash2,
  RotateCcw,
  X,
  Check,
  ChevronsUpDown,
  LoaderCircle,
  Upload,
  LogIn,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandItem,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Toaster, toast } from "sonner";
import map from "@/data/map.json";
import worldMap from "@/data/world-map.json";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import cities from "@/data/cities.json";
import { preparePhoto } from "@/lib/images";
import { importBackup } from "@/lib/backup";
import type { FlowerRecord, RecordDraft } from "@/lib/types";
const cityByCode = new Map(cities.map((c) => [c.code, c]));
const countryNames = new Map(worldMap.countries.map((c) => [c.code, c.name]));
for (const c of cities)
  if (!countryNames.has(c.countryCode))
    countryNames.set(c.countryCode, c.countryName);
const countryOptions = [...countryNames]
  .map(([code, name]) => ({ code, name }))
  .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
const today = () =>
  new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
const emptyDraft = (): RecordDraft => ({
  id: crypto.randomUUID(),
  cityCode: "",
  date: today(),
  title: "",
  flower: "",
  meaning: "",
  story: "",
  keepPhotos: [],
});
const photoUrl = (id: string) => "/api/photos/" + id;
function point(xy: number[]) {
  const [lon, lat] = xy,
    scale = map.projection.scale,
    [x, y] = map.projection.translate;
  return [
    x + (scale * lon * Math.PI) / 180,
    y - scale * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)),
  ];
}
async function api(url: string, init?: RequestInit) {
  const r = await fetch(url, { ...init, cache: "no-store" }),
    v = (await r.json()) as {
      error?: string;
      records: FlowerRecord[];
      user?: { email: string };
    };
  if (!r.ok) throw new Error(v.error || "操作未完成，请重试。");
  return v;
}
function CityPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState("");
  const matches = cities
    .filter((c) =>
      (c.name + " " + c.provinceName + " " + c.countryName)
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
    )
    .slice(0, 60);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id="city-picker"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="选择城市"
          className="city-picker"
        >
          {cityByCode.get(value)?.name || "选择城市"}
          <ChevronsUpDown size={16} />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(360px,calc(100vw-3rem))] p-0"
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="城市、省份或国家；海外城市用英文"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>没有找到城市</CommandEmpty>
            {matches.map((c) => (
              <CommandItem
                key={c.code}
                value={c.provinceName + " " + c.name + " " + c.code}
                onSelect={() => {
                  onChange(c.code);
                  setOpen(false);
                }}
              >
                <Check
                  className={value === c.code ? "opacity-100" : "opacity-0"}
                />
                <span>{c.name}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {c.provinceName}
                </span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
export default function FlowerMap() {
  const [records, setRecords] = useState<FlowerRecord[]>([]),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState(""),
    [authenticated, setAuthenticated] = useState(false),
    [collectionPage, setCollectionPage] = useState(0),
    [view, setView] = useState("china"),
    [country, setCountry] = useState("all"),
    [province, setProvince] = useState("all"),
    [city, setCity] = useState(""),
    [unlock, setUnlock] = useState("");
  const [formOpen, setFormOpen] = useState(false),
    [draft, setDraft] = useState<RecordDraft | null>(null),
    [editing, setEditing] = useState<FlowerRecord | null>(null),
    [files, setFiles] = useState<File[]>([]),
    [fileUrls, setFileUrls] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [preparing, setPreparing] = useState(false),
    [formError, setFormError] = useState("");
  const [detail, setDetail] = useState<FlowerRecord | null>(null),
    [photoIndex, setPhotoIndex] = useState(0),
    [deleting, setDeleting] = useState<FlowerRecord | null>(null),
    [trashOpen, setTrashOpen] = useState(false),
    [backupOpen, setBackupOpen] = useState(false),
    [importing, setImporting] = useState(false),
    [backupError, setBackupError] = useState(""),
    [progress, setProgress] = useState(0);
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/records", { cache: "no-store" }),
        v = (await r.json()) as {
          error?: string;
          records: FlowerRecord[];
          user?: { email: string };
          canEdit?: boolean;
        };
      if (r.status === 401) {
        setAuthenticated(false);
        setLoadError("");
        return;
      }
      if (!r.ok) throw new Error(v.error);
      setRecords(v.records);
      setAuthenticated(v.canEdit === true);
      setLoadError("");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "记录加载失败。");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setFileUrls(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);
  useEffect(() => {
    if (!unlock) return;
    const t = setTimeout(() => setUnlock(""), 1500);
    return () => clearTimeout(t);
  }, [unlock]);
  const active = useMemo(() => records.filter((r) => !r.deletedAt), [records]),
    trash = records.filter((r) => r.deletedAt),
    litCities = useMemo(
      () =>
        [...new Set(active.map((r) => r.cityCode))]
          .map((id) => cityByCode.get(id))
          .filter((c): c is (typeof cities)[number] => !!c),
      [active],
    ),
    litProvinces = new Set(litCities.map((c) => c.provinceCode)),
    litCountries = new Set(litCities.map((c) => c.countryCode)),
    mapCities = litCities.filter(
      (c) => view === "world" || c.countryCode === "CHN",
    );
  const inScope = (c: (typeof cities)[number] | undefined) =>
    !!c &&
    (view === "world"
      ? country === "all" || c.countryCode === country
      : c.countryCode === "CHN" &&
        (province === "all" || c.provinceCode === province));
  const counts = useMemo(() => {
    const cityCounts = new Map<string, number>();
    const provinceCounts = new Map<string, number>();
    const countryCounts = new Map<string, number>();
    const increment = (m: Map<string, number>, key: string) =>
      m.set(key, (m.get(key) ?? 0) + 1);
    for (const record of active) {
      const c = cityByCode.get(record.cityCode);
      if (!c) continue;
      increment(cityCounts, c.code);
      increment(countryCounts, c.countryCode);
      if (c.countryCode === "CHN") increment(provinceCounts, c.provinceCode);
    }
    return {
      cities: cityCounts,
      provinces: provinceCounts,
      countries: countryCounts,
    };
  }, [active]);
  const provinceRecords = active.filter((r) =>
      inScope(cityByCode.get(r.cityCode)),
    ),
    provinceCities = litCities.filter(inScope),
    visible = provinceRecords.filter((r) => !city || r.cityCode === city),
    name =
      view === "world"
        ? country === "all"
          ? "全部城市"
          : countryNames.get(country) || "城市记录"
        : province === "all"
          ? "全部城市"
          : map.provinces.find((p) => p.code === province)?.name || "城市记录";
  function selectProvince(value: string) {
    setProvince(value);
    setCity("");
  }
  useEffect(() => {
    setCollectionPage(0);
  }, [view, province, country, city]);
  const currentPage = Math.min(collectionPage, Math.max(0, visible.length - 1));
  function add() {
    setEditing(null);
    setDraft({ ...emptyDraft(), cityCode: city });
    setFiles([]);
    setFormError("");
    setFormOpen(true);
  }
  function edit(r: FlowerRecord) {
    setDetail(null);
    setEditing(r);
    setDraft({ ...r, keepPhotos: r.photos.map((p) => p.id) });
    setFiles([]);
    setFormError("");
    setFormOpen(true);
  }
  function field(key: keyof RecordDraft, value: string) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }
  async function chooseFiles(list: FileList | null) {
    if (!list || !draft) return;
    if (files.length + draft.keepPhotos.length + list.length > 8) {
      setFormError("每条记录最多8张照片。");
      return;
    }
    setPreparing(true);
    setFormError("");
    try {
      const next: File[] = [];
      for (const f of Array.from(list)) next.push(await preparePhoto(f));
      setFiles((old) => [...old, ...next]);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "照片处理失败。");
    } finally {
      setPreparing(false);
    }
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!draft || busy || preparing) return;
    if (!draft.cityCode) {
      setFormError("请选择城市。");
      return;
    }
    setBusy(true);
    setFormError("");
    const before = active.some((r) => r.cityCode === draft.cityCode),
      form = new FormData();
    form.set("record", JSON.stringify(draft));
    files.forEach((f) => form.append("photos", f));
    try {
      await api("/api/records" + (editing ? "/" + editing.id : ""), {
        method: editing ? "PUT" : "POST",
        body: form,
      });
      await load();
      const savedCity = cityByCode.get(draft.cityCode)!;
      if (savedCity.countryCode === "CHN") {
        setView("china");
        setProvince(savedCity.provinceCode);
      } else {
        setView("world");
        setCountry(savedCity.countryCode);
      }
      setCity(draft.cityCode);
      if (!before) setUnlock(draft.cityCode);
      setFormOpen(false);
      setFiles([]);
      toast.success(editing ? "记录已更新" : "记录已保存");
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "保存失败，请重试。");
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!deleting || busy) return;
    setBusy(true);
    try {
      await api(
        "/api/records/" + deleting.id + "?version=" + deleting.version,
        { method: "DELETE" },
      );
      setDetail(null);
      setDeleting(null);
      await load();
      toast.success("已移入回收站");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败。");
    } finally {
      setBusy(false);
    }
  }
  async function restore(r: FlowerRecord) {
    setBusy(true);
    try {
      await api("/api/records/" + r.id + "/restore", { method: "POST" });
      await load();
      toast.success("记录已恢复");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "恢复失败。");
    } finally {
      setBusy(false);
    }
  }
  async function importFile(file: File | undefined) {
    if (!file) return;
    setImporting(true);
    setBackupError("");
    setProgress(0);
    try {
      const result = await importBackup(file, setProgress);
      await load();
      toast.success(
        "已导入" + result.added + "条，跳过已有记录" + result.skipped + "条",
      );
    } catch (e) {
      setBackupError(e instanceof Error ? e.message : "导入失败。");
      await load();
    } finally {
      setImporting(false);
    }
  }
  useEffect(() => {
    const context = (
      document as unknown as {
        modelContext?: {
          registerTool: (
            tool: unknown,
            options: { signal: AbortSignal },
          ) => void | Promise<void>;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const controller = new AbortController();
    try {
      Promise.resolve(
        context.registerTool(
          {
            name: "select_flower_map_province",
            title: "查看省份送花记录",
            description: "选择省级区域查看当前地图记录，仅改变浏览状态。",
            inputSchema: {
              type: "object",
              properties: { provinceCode: { type: "string" } },
              required: ["provinceCode"],
              additionalProperties: false,
            },
            annotations: { readOnlyHint: true, untrustedContentHint: false },
            execute: (input: unknown) => {
              const code = (input as { provinceCode?: string })?.provinceCode;
              if (
                code !== "all" &&
                !map.provinces.some((p) => p.code === code && p.name)
              )
                throw new Error("无效省份代码");
              setView("china");
              selectProvince(code!);
              return { provinceCode: code };
            },
          },
          { signal: controller.signal },
        ),
      ).catch(() => {});
    } catch {}
    return () => controller.abort();
  }, []);
  function removeNewPhoto(i: number) {
    setDraft((d) => {
      if (!d?.coverPhoto?.startsWith("new-")) return d;
      const selected = Number(d.coverPhoto.slice(4));
      return {
        ...d,
        coverPhoto:
          selected === i
            ? undefined
            : "new-" + (selected > i ? selected - 1 : selected),
      };
    });
    setFiles((old) => old.filter((_, j) => j !== i));
  }
  const cover =
    draft?.coverPhoto ||
    (draft?.keepPhotos[0] ?? (files.length ? "new-0" : ""));
  return (
    <main className="flower-app">
      <Toaster richColors position="top-center" />
      <header className="app-header">
        <div className="logo">
          <span className="logo-icon">
            <Flower2 size={23} />
          </span>
          <span className="brand-label">THE FLOWER JOURNAL</span>
        </div>
        <div className="header-actions">
          {authenticated && (
            <Button
              variant="ghost"
              onClick={() => setBackupOpen(true)}
              disabled={!authenticated}
            >
              <Download />
              备份
            </Button>
          )}
          {authenticated && (
            <Button
              variant="ghost"
              onClick={() => setTrashOpen(true)}
              disabled={!authenticated}
            >
              <Archive />
              回收站
              {trash.length > 0 && (
                <span className="small-count">{trash.length}</span>
              )}
            </Button>
          )}
          {authenticated ? (
            <Button onClick={add}>
              <Plus />
              添加记录
            </Button>
          ) : (
            <Button asChild>
              <a href="/signin-with-chatgpt?return_to=%2F" target="_top">
                <LogIn />
                管理登录
              </a>
            </Button>
          )}
        </div>
      </header>
      <section className="journal-intro" aria-labelledby="journal-title">
        <div>
          <p className="intro-eyebrow">花束收藏 · 城市记录</p>
          <h1 id="journal-title">
            FLOWERS,
            <br />
            <em>WHEREVER I GO</em>
          </h1>
        </div>
        <div className="intro-note">
          <img src="/floral-still-life.jpg" alt="" className="intro-flowers" />
          <Flower2 size={22} strokeWidth={1} aria-hidden="true" />
          <p>关于花，也关于一起记得的地方。</p>
          <span>照片、日期，还有每一束的意义。</span>
        </div>
      </section>
      <section className="workspace">
        <div className="map-panel">
          <div className="map-heading">
            <div>
              <p className="section-kicker">
                {view === "china" ? "01 / CHINA" : "02 / WORLD"}
              </p>
              <h2>{view === "china" ? "中国足迹" : "世界足迹"}</h2>
            </div>
            <div className="map-stats">
              {mapCities.length} 个城市 <span>/</span>
              {
                active.filter(
                  (r) =>
                    view === "world" ||
                    cityByCode.get(r.cityCode)?.countryCode === "CHN",
                ).length
              }{" "}
              次送花
            </div>
          </div>
          <div className="map-controls">
            <Tabs
              value={view}
              onValueChange={(v) => {
                setView(v);
                setCity("");
                setCountry("all");
                setProvince("all");
              }}
            >
              <TabsList aria-label="地图范围">
                <TabsTrigger value="china">中国</TabsTrigger>
                <TabsTrigger value="world">世界</TabsTrigger>
              </TabsList>
            </Tabs>
            <Select
              value={view === "china" ? province : country}
              onValueChange={(v) => {
                if (view === "china") selectProvince(v);
                else {
                  setCountry(v);
                  setCity("");
                }
              }}
            >
              <SelectTrigger
                aria-label={
                  view === "china" ? "选择省级区域" : "选择国家或地区"
                }
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {view === "china" ? "全部省级区域" : "全部国家和地区"}
                </SelectItem>
                {(view === "china" ? map.provinces : countryOptions)
                  .filter((p) => p.name)
                  .map((p) => (
                    <SelectItem key={p.code} value={p.code}>
                      {p.name}
                      {(view === "china" ? litProvinces : litCountries).has(
                        p.code,
                      )
                        ? " · 已点亮"
                        : ""}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <svg
            viewBox={view === "china" ? "0 0 1000 760" : "0 100 1000 560"}
            className="china-map"
            role="group"
            aria-label={
              view === "china"
                ? "点击省份查看送花记录"
                : "点击国家或地区查看送花记录"
            }
          >
            <title>{view === "china" ? "中国送花地图" : "世界送花地图"}</title>
            {(view === "china" ? map.provinces : worldMap.countries).map(
              (p) => (
                <path
                  key={p.code}
                  d={p.path || ""}
                  style={(() => {
                    const count =
                      (view === "china"
                        ? counts.provinces
                        : counts.countries
                      ).get(p.code) ?? 0;
                    return count
                      ? {
                          fill: `hsl(350  ${26 + (30 * count) / (count + 3)}% ${85 - (22 * count) / (count + 3)}%)`,
                        }
                      : undefined;
                  })()}
                  className={
                    "region" +
                    ((view === "china" ? litProvinces : litCountries).has(
                      p.code,
                    )
                      ? " lit"
                      : "") +
                    (p.code === (view === "china" ? province : country)
                      ? " selected"
                      : "")
                  }
                  onClick={() => {
                    if (view === "china") selectProvince(p.code);
                    else {
                      setCountry(p.code);
                      setCity("");
                    }
                  }}
                >
                  <title>
                    {(p.name || "边界") + (p.name
                      ? ` · ${(view === "china" ? counts.provinces : counts.countries).get(p.code) ?? 0} 束花`
                      : "")}
                  </title>
                </path>
              ),
            )}
            {mapCities.map((c) => {
              const count = counts.cities.get(c.code) ?? 0;
              const strength = count / (count + 3);
              const [x, y] =
                view === "china"
                  ? point(c.center)
                  : [
                      worldMap.projection.translate[0] +
                        (worldMap.projection.scale * c.center[0] * Math.PI) /
                          180,
                      worldMap.projection.translate[1] -
                        (worldMap.projection.scale * c.center[1] * Math.PI) /
                          180,
                    ];
              return (
                <g
                  key={c.code}
                  className="map-city"
                  style={{
                    filter: `drop-shadow(0 0 ${2 + 9 * strength}px rgba(231, 154, 135, ${0.3 + 0.6 * strength}))`,
                  }}
                  transform={"translate(" + x + "," + y + ")"}
                  onClick={() => {
                    if (view === "china") setProvince(c.provinceCode);
                    else setCountry(c.countryCode);
                    setCity(c.code);
                  }}
                >
                  <title>{c.name + " · " + count + "次送花"}</title>
                  {unlock === c.code && (
                    <circle r="13" className="unlock-ring" />
                  )}
                  <circle
                    r={12 + 14 * strength}
                    className="city-halo"
                    style={{
                      fill: `rgba(221, 137, 143, ${0.12 + 0.24 * strength})`,
                    }}
                  />
                  <circle
                    r={(city === c.code ? 8 : 6) + 3 * strength}
                    className="city-dot"
                    style={{
                      fill: `hsl(350 ${40 + 40 * strength}% ${62 + 18 * strength}%)`,
                    }}
                  />
                  <circle r={1.5 + 2 * strength} className="city-light" />
                  {(city === c.code || mapCities.length <= 8) && (
                    <text
                      x={c.name === "杭州市" ? -12 : 10}
                      y={
                        c.name === "上海市"
                          ? -14
                          : c.name === "宁波市"
                            ? 25
                            : 18
                      }
                      textAnchor={c.name === "杭州市" ? "end" : "start"}
                      className="city-label"
                    >
                      {c.name.replace(/市$/, "")} · {count}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
          <div className="map-bottom">
            <div className="map-legend">
              <span>
                <i />
                暂无记录
              </span>
              <span>
                <i className="glow-one" />1 束
              </span>
              <span>
                <i className="glow-few" />
                2–5 束
              </span>
              <span>
                <i className="glow-many" />6 束以上
              </span>
            </div>
            <span className="brightness-note">
              送得越多，城市越亮 · 区域按总束数着色
            </span>
            <span className="map-source">
              地图数据：{view === "china" ? "DataV GeoAtlas" : "Natural Earth"}
            </span>
          </div>
        </div>
        <aside className="records-panel">
          <p className="collection-label">
            THE COLLECTION{" "}
            <Flower2 size={15} strokeWidth={1.2} aria-hidden="true" />
          </p>
          <div className="panel-top">
            <span>
              {view === "china" ? "中国" : "世界"} <ChevronRight size={14} />
              {name}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                selectProvince("all");
                setCountry("all");
              }}
            >
              全部城市
            </Button>
          </div>
          <h2>{city ? cityByCode.get(city)?.name : name}</h2>
          <p className="panel-count">
            {provinceCities.length} 个城市 · {provinceRecords.length} 束花
          </p>
          {provinceCities.length > 0 && (
            <div className="city-tabs">
              <Button
                variant={!city ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setCity("")}
              >
                全部
              </Button>
              {provinceCities.map((c) => (
                <Button
                  key={c.code}
                  size="sm"
                  variant={city === c.code ? "secondary" : "ghost"}
                  onClick={() => setCity(c.code)}
                >
                  {c.name.replace(/市$/, "")}
                  <span className="small-count">
                    {active.filter((r) => r.cityCode === c.code).length}
                  </span>
                </Button>
              ))}
            </div>
          )}
          <div aria-live="polite">
            {loading ? (
              <div className="loading-state">
                <LoaderCircle className="animate-spin" />
                正在读取记录
              </div>
            ) : loadError ? (
              <div className="empty-state error-state">
                <h3>记录暂时无法读取</h3>
                <p>{loadError}</p>
                <Button variant="outline" onClick={() => void load()}>
                  重试
                </Button>
              </div>
            ) : visible.length === 0 ? (
              <div className="empty-state">
                <div className="journal-photo">
                  <img src="/floral-still-life.jpg" alt="" />
                  <span>YOUR FLOWER JOURNAL</span>
                </div>
                <span className="empty-icon">
                  <MapPin size={30} />
                </span>
                <h3>这里还没有花束</h3>
                <p>
                  {authenticated
                    ? "添加城市、照片和寓意，点亮这座城市。"
                    : "有新的花束记录后，会在这里展示。"}
                </p>
                {authenticated && (
                  <Button variant="outline" onClick={add}>
                    <Plus />
                    添加第一条记录
                  </Button>
                )}
              </div>
            ) : (
              <div className="record-list">
                <nav className="collection-pager" aria-label="花束相册翻页">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="上一束花"
                    disabled={currentPage === 0}
                    onClick={() => setCollectionPage(currentPage - 1)}
                  >
                    <ChevronLeft />
                  </Button>
                  <span aria-live="polite">
                    <strong>{String(currentPage + 1).padStart(2, "0")}</strong>{" "}
                    / {String(visible.length).padStart(2, "0")}{" "}
                    <small>束花</small>
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="下一束花"
                    disabled={currentPage >= visible.length - 1}
                    onClick={() => setCollectionPage(currentPage + 1)}
                  >
                    <ChevronRight />
                  </Button>
                </nav>
                {visible.slice(currentPage, currentPage + 1).map((r) => (
                  <article key={r.id} className="record-card">
                    <button
                      className="record-open"
                      onClick={() => {
                        setDetail(r);
                        setPhotoIndex(0);
                      }}
                    >
                      {r.photos.length ? (
                        <div className="cover">
                          <img
                            src={photoUrl(r.photos[0].id)}
                            alt={r.title}
                            loading="lazy"
                          />
                          {r.photos.length > 1 && (
                            <span>{r.photos.length} 张照片</span>
                          )}
                        </div>
                      ) : (
                        <div className="no-photo">
                          <ImagePlus size={28} />
                          <span>未添加照片</span>
                        </div>
                      )}
                      <div className="record-body">
                        <div className="record-meta">
                          <span>{r.date}</span>
                          <span>{cityByCode.get(r.cityCode)?.name}</span>
                        </div>
                        <h3>{r.title}</h3>
                        {r.flower && <p className="flower-kind">{r.flower}</p>}
                        {r.meaning && (
                          <p className="record-meaning">{r.meaning}</p>
                        )}
                        {r.story && <p className="record-excerpt">{r.story}</p>}
                      </div>
                    </button>
                    {authenticated && (
                      <div className="record-actions">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => edit(r)}
                        >
                          <Pencil />
                          编辑
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDeleting(r)}
                          aria-label={"删除" + r.title}
                        >
                          <Trash2 />
                          删除
                        </Button>
                      </div>
                    )}
                  </article>
                ))}
                <p className="collection-hint">
                  点击照片，查看这束花的完整记录
                </p>
              </div>
            )}
          </div>
        </aside>
      </section>
      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          if (!busy && !preparing) setFormOpen(open);
        }}
      >
        <DialogContent className="record-dialog sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "编辑记录" : "添加送花记录"}</DialogTitle>
            <DialogDescription>
              每次送花单独保存，同一城市可以有多条记录。
            </DialogDescription>
          </DialogHeader>
          {draft && (
            <form onSubmit={save} className="record-form">
              <div className="form-grid">
                <div className="form-field">
                  <label htmlFor="city-picker">城市 *</label>
                  <CityPicker
                    value={draft.cityCode}
                    onChange={(v) => field("cityCode", v)}
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="date">送花日期 *</label>
                  <Input
                    id="date"
                    type="date"
                    value={draft.date}
                    max={today()}
                    onChange={(e) => field("date", e.target.value)}
                    required
                  />
                </div>
                <div className="form-field full">
                  <label htmlFor="title">记录名称 *</label>
                  <Input
                    id="title"
                    value={draft.title}
                    maxLength={100}
                    placeholder="例如：杭州的郁金香"
                    onChange={(e) => field("title", e.target.value)}
                    required
                  />
                </div>
                <div className="form-field full">
                  <label htmlFor="flower">花材与颜色</label>
                  <Input
                    id="flower"
                    value={draft.flower}
                    maxLength={150}
                    placeholder="例如：粉色郁金香、白色洋桔梗"
                    onChange={(e) => field("flower", e.target.value)}
                  />
                </div>
                <div className="form-field full">
                  <label htmlFor="meaning">这束花的寓意</label>
                  <Textarea
                    id="meaning"
                    value={draft.meaning}
                    maxLength={500}
                    rows={2}
                    placeholder="写下你选择它的理由"
                    onChange={(e) => field("meaning", e.target.value)}
                  />
                </div>
                <div className="form-field full">
                  <label htmlFor="story">当天的记录</label>
                  <Textarea
                    id="story"
                    value={draft.story}
                    maxLength={5000}
                    rows={3}
                    onChange={(e) => field("story", e.target.value)}
                  />
                </div>
                <div className="form-field full">
                  <label htmlFor="photos">照片</label>
                  <div className="photo-editor">
                    {draft.keepPhotos.map((id, i) => (
                      <div key={id} className="photo-tile">
                        <img src={photoUrl(id)} alt={"照片" + (i + 1)} />
                        {cover === id && (
                          <span className="cover-label">封面</span>
                        )}
                        <Button
                          type="button"
                          size="icon"
                          variant="secondary"
                          aria-label={"移除照片" + (i + 1)}
                          onClick={() =>
                            setDraft((d) =>
                              d
                                ? {
                                    ...d,
                                    keepPhotos: d.keepPhotos.filter(
                                      (p) => p !== id,
                                    ),
                                    coverPhoto:
                                      d.coverPhoto === id
                                        ? undefined
                                        : d.coverPhoto,
                                  }
                                : d,
                            )
                          }
                        >
                          <X />
                        </Button>
                        {cover !== id && (
                          <button
                            type="button"
                            className="set-cover"
                            onClick={() =>
                              setDraft((d) =>
                                d ? { ...d, coverPhoto: id } : d,
                              )
                            }
                          >
                            设为封面
                          </button>
                        )}
                      </div>
                    ))}
                    {fileUrls.map((url, i) => (
                      <div key={url} className="photo-tile">
                        <img src={url} alt={"新照片" + (i + 1)} />
                        {cover === "new-" + i && (
                          <span className="cover-label">封面</span>
                        )}
                        <Button
                          type="button"
                          size="icon"
                          variant="secondary"
                          aria-label={"移除新照片" + (i + 1)}
                          onClick={() => removeNewPhoto(i)}
                        >
                          <X />
                        </Button>
                        {cover !== "new-" + i && (
                          <button
                            type="button"
                            className="set-cover"
                            onClick={() =>
                              setDraft((d) =>
                                d ? { ...d, coverPhoto: "new-" + i } : d,
                              )
                            }
                          >
                            设为封面
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <Input
                    id="photos"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    disabled={busy || preparing}
                    onChange={(e) => {
                      void chooseFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                  <p className="field-hint">
                    最多8张。上传前会压缩照片并移除图片中的定位信息。
                  </p>
                  {preparing && <p className="field-hint">正在处理照片…</p>}
                </div>
              </div>
              {formError && (
                <p role="alert" className="form-error">
                  {formError}
                </p>
              )}
              <div className="form-footer">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || preparing}
                  onClick={() => setFormOpen(false)}
                >
                  取消
                </Button>
                <Button type="submit" disabled={busy || preparing}>
                  {busy && <LoaderCircle className="animate-spin" />}
                  {busy ? "正在保存" : "保存记录"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!detail}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
      >
        <DialogContent className="detail-dialog sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{detail?.title}</DialogTitle>
            <DialogDescription>
              {detail?.date} · {detail && cityByCode.get(detail.cityCode)?.name}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <>
              {detail.photos.length > 0 && (
                <div className="gallery">
                  <img
                    className="gallery-main"
                    src={photoUrl(
                      detail.photos[photoIndex]?.id || detail.photos[0].id,
                    )}
                    alt={detail.title + " · 照片" + (photoIndex + 1)}
                  />
                  {detail.photos.length > 1 && (
                    <>
                      <div className="gallery-nav">
                        <Button
                          size="icon"
                          variant="outline"
                          aria-label="上一张照片"
                          onClick={() =>
                            setPhotoIndex(
                              (i) =>
                                (i + detail.photos.length - 1) %
                                detail.photos.length,
                            )
                          }
                        >
                          <ChevronLeft />
                        </Button>
                        <span>
                          {photoIndex + 1} / {detail.photos.length}
                        </span>
                        <Button
                          size="icon"
                          variant="outline"
                          aria-label="下一张照片"
                          onClick={() =>
                            setPhotoIndex((i) => (i + 1) % detail.photos.length)
                          }
                        >
                          <ChevronRight />
                        </Button>
                      </div>
                      <div className="gallery-thumbs">
                        {detail.photos.map((p, i) => (
                          <button
                            key={p.id}
                            aria-label={"查看照片" + (i + 1)}
                            aria-pressed={i === photoIndex}
                            onClick={() => setPhotoIndex(i)}
                          >
                            <img src={photoUrl(p.id)} alt="" />
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
              {detail.flower && (
                <div className="detail-field">
                  <h3>花材与颜色</h3>
                  <p>{detail.flower}</p>
                </div>
              )}
              {detail.meaning && (
                <div className="detail-field">
                  <h3>这束花的寓意</h3>
                  <p>{detail.meaning}</p>
                </div>
              )}
              {detail.story && (
                <div className="detail-field">
                  <h3>当天的记录</h3>
                  <p>{detail.story}</p>
                </div>
              )}
              {authenticated && (
                <div className="form-footer">
                  <Button variant="outline" onClick={() => edit(detail)}>
                    <Pencil />
                    编辑记录
                  </Button>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open && !busy) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>将这条记录移入回收站？</AlertDialogTitle>
            <AlertDialogDescription>
              记录和照片可以恢复。移除城市最后一条记录后，该城市会恢复为未点亮。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void remove();
              }}
            >
              移入回收站
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={trashOpen} onOpenChange={setTrashOpen}>
        <DialogContent className="record-dialog sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>回收站</DialogTitle>
            <DialogDescription>
              删除的记录和照片保留在这里，可以随时恢复。
            </DialogDescription>
          </DialogHeader>
          {trash.length === 0 ? (
            <p className="blank-message">回收站是空的。</p>
          ) : (
            trash.map((r) => (
              <div key={r.id} className="trash-row">
                <div>
                  <h3>{r.title}</h3>
                  <p>
                    {r.date} · {cityByCode.get(r.cityCode)?.name}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => void restore(r)}
                >
                  <RotateCcw />
                  恢复
                </Button>
              </div>
            ))
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={backupOpen}
        onOpenChange={(open) => {
          if (!importing) setBackupOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>备份与恢复</DialogTitle>
            <DialogDescription>
              备份包含全部记录、回收站内容和已保存的照片。
            </DialogDescription>
          </DialogHeader>
          <div className="backup-section">
            <h3>下载备份</h3>
            <p>保存到自己的设备。备份文件中包含私人照片，请妥善保管。</p>
            <Button asChild variant="outline">
              <a href="/api/backup" download>
                <Download />
                下载完整备份
              </a>
            </Button>
          </div>
          <div className="backup-section">
            <h3>从备份恢复</h3>
            <p>只添加未存在的记录，已有记录会跳过。不会覆盖当前内容。</p>
            <label className="import-control">
              <Upload size={16} />
              {importing ? "已处理 " + progress + " 条记录" : "选择备份文件"}
              <input
                aria-label="选择备份文件"
                type="file"
                accept=".ndjson"
                disabled={importing}
                onChange={(e) => {
                  void importFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          {backupError && (
            <p role="alert" className="form-error">
              {backupError}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
