# FLOWERS, WHEREVER I GO

按城市记录送过的花。中国地图与世界地图共用一套记录，支持同城多次送花、多张照片、个人寓意和日常维护。

## 使用

登录后点击「添加记录」，选择城市，填写送花日期、名称、花材、寓意和当天的故事，上传照片。

- 中国地图按省级区域浏览，城市第一次有记录时点亮；世界地图按国家和地区浏览。
- 国内记录同时出现在世界地图上；海外记录出现在世界地图上。
- 每次送花是一条独立记录，一条记录最多8张照片；第一张为封面。已有照片和新照片均可调整封面。
- 修改或移动记录后，两张地图的统计自动更新。重复提交不会创建重复记录。
- 删除只移入回收站，照片保留，可随时恢复；不设置自动清空。
- 「备份」下载包含全部记录、回收站内容和照片的 `.ndjson` 文件。恢复前会检查文件完整性；只新增尚未存在的记录，不覆盖当前内容。

记录使用 Cloudflare D1 持久保存，照片使用私有 R2 保存，不依赖浏览器缓存。照片上传前缩放至最长边1600像素、转为JPEG并移除EXIF信息；保存的是处理后的照片，原始高清文件请自行保留。

## 隐私与访问

Sites 部署默认仅网站所有者访问。应用额外检查登录身份，所有记录与照片均按用户编号隔离；页面、照片接口和备份接口均不公开数据。

目前是个人维护版本。若要让女朋友在自己的账号下只读查看同一张地图，需要后续配置网站访问权限，并实现共享回忆册的成员授权。不要仅将网站公开来代替成员授权。

本地开发的模拟登录只用于回环地址，生产构建不包含模拟身份。离开 Sites 部署时，必须重新接入可信登录网关；不能把客户端能随意提供的身份请求头作为公开服务的认证依据。

## 本地运行

环境要求：Node.js >=22.13.0。

```sh
npm ci
npm run db:generate  # 仅在修改 db/schema.ts 时需要
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_sleepy_vertigo.sql
npm run dev -- --port 5173
```

只对空白本地数据库执行首次迁移。已有数据库不要重复执行；新增迁移按顺序执行。生产迁移由 Sites 发布流程处理。

打开 `http://localhost:5173`，点击登录即可进入本地模拟账号。`.wrangler/state` 中保留开发数据库和照片；它不进入 Git。GitHub 仓库只保存程序和公共地图数据，不保存私人送花记录或照片。

## 维护入口

| 修改内容 | 位置 |
| --- | --- |
| 名称、文案和界面交互 | `app/flower-map.tsx`、`app/layout.tsx` |
| 颜色与响应式布局 | `app/globals.css` |
| 记录与照片数据模型 | `db/schema.ts` |
| 验证、账号权限、写入流程 | `lib/server.ts` |
| 记录、照片及备份接口 | `app/api/` |
| 备份文件校验与导入 | `lib/backup.ts` |
| 城市名、所属区域与坐标 | `data/cities.json` |
| 地图路径 | `data/map.json`、`data/world-map.json` |

新增城市时为其分配不会变化的 `code`，填写 `name`、`countryCode`（ISO3）、`countryName`、`provinceCode`、`provinceName`、`country2`（ISO2）和 `center`（经度、纬度）。海外城市的 `provinceCode` 为空字符串。国内沿用行政区划代码，海外目录沿用 Natural Earth 的稳定编号 `ne-<ne_id>`。不要改动已有代码，否则旧记录无法关联城市。

地图是从公开地理数据生成的路径，运行时不依赖地图服务密钥。`scripts/generate-maps.mjs` 可由已保存的源几何数据重新生成地图路径。地图数据不是自动更新的行政区划服务；以后更新目录时保留旧城市代码及名称映射。

## 验证

启动本地开发服务并完成本地迁移后：

```sh
npx tsc --noEmit
npm run test:integration
npm run build
```

集成测试仅允许回环地址，验证登录限制、图片访问、幂等保存、同城多条记录、版本冲突、回收站恢复、海外记录、备份完整性和照片恢复。测试用本地模拟账号，生成的文件放在忽略的 `.sites-runtime` 中；成功结束会清理测试记录。

## 地图数据来源

- 中国省界与城市：阿里云 DataV GeoAtlas，2026-09-17获取。全国源文件保存在 `data/china.geojson`。
  - https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json
  - 城市目录取各省 `https://geo.datav.aliyun.com/areas_v3/bound/<省代码>_full.json` 的属性。
- 世界边界：`@d3-maps/atlas@1.0.0` 的 `countries-110m`，源 TopoJSON 保存在 `data/world.topojson`。
- 海外城市：Natural Earth 10m populated places simple，2026-09-17获取。城市目录采用公开地理坐标；英文名称可搜索。
  - https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_10m_populated_places_simple.geojson
  - Natural Earth 数据为 public domain：https://www.naturalearthdata.com/about/terms-of-use/

中国地图使用 Mercator 投影，世界地图使用等距圆柱投影；投影参数保存在地图文件中，城市点用相同参数绘制。国家和地区目录不穷尽所有微型地区边界；小岛城市仍可保存并在其坐标显示花点。
