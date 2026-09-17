import fs from "node:fs/promises";
import { geoMercator, geoEquirectangular, geoPath } from "d3-geo";
import { feature } from "topojson-client";
const china = JSON.parse(await fs.readFile("data/china.geojson", "utf8"));
china.features.forEach((f) => {
  const g = f.geometry;
  if (g.type === "MultiPolygon")
    g.coordinates.forEach((p) => p.forEach((r) => r.reverse()));
  else if (g.type === "Polygon") g.coordinates.forEach((r) => r.reverse());
});
const p = geoMercator().fitExtent(
    [
      [30, 20],
      [970, 730],
    ],
    china,
  ),
  path = geoPath(p);
await fs.writeFile(
  "data/map.json",
  JSON.stringify({
    source: "https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json",
    projection: { scale: p.scale(), translate: p.translate() },
    provinces: china.features.map((f) => ({
      code: String(f.properties.adcode),
      name: f.properties.name || "",
      path: path(f),
      center: f.properties.center || f.properties.centroid,
    })),
  }),
);
const world = JSON.parse(await fs.readFile("data/world.topojson", "utf8")),
  features = feature(world, world.objects.features).features.filter(
    (f) => f.properties.id !== "ATA",
  ),
  projection = geoEquirectangular().fitExtent(
    [
      [20, 60],
      [980, 650],
    ],
    { type: "FeatureCollection", features },
  ),
  draw = geoPath(projection),
  cities = JSON.parse(await fs.readFile("data/cities.json", "utf8")),
  countryNames = new Map(cities.map((c) => [c.countryCode, c.countryName]));
await fs.writeFile(
  "data/world-map.json",
  JSON.stringify({
    projection: {
      scale: projection.scale(),
      translate: projection.translate(),
    },
    countries: features.map((f) => ({
      code: f.properties.id,
      name:
        f.properties.id === "TWN"
          ? "台湾"
          : countryNames.get(f.properties.id) ||
            f.properties.name ||
            f.properties.id,
      path: draw(f),
    })),
  }),
);
console.log(
  "China and world map paths regenerated from saved source geometry.",
);
