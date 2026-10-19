# PLACES WE'VE BEEN

记录两个人一起去过的地方。中国地图与世界地图共用一套行程记录，支持同城多次到访、多张照片、旅途文字和日常维护。

## 使用

登录后点击「添加旅行记录」，选择城市，填写到访日期、标题、记得的事和旅途故事，并上传照片。

- 中国地图按省级区域浏览，城市第一次有记录时点亮；世界地图按国家和地区浏览。
- 同一座城市可以保存多次行程。地图会按记录数量逐渐变亮。
- 一条记录最多 8 张照片，第一张作为封面；已有照片和新照片都能调整封面。
- 修改或移动记录后，两张地图的统计会自动更新。重复提交不会创建重复记录。
- 删除只会移入回收站，照片仍然保留，可以随时恢复。
- 「备份」会下载包含全部记录、回收站内容和照片的 `.ndjson` 文件。恢复前会检查文件完整性，只新增尚未存在的记录。

记录使用 Cloudflare D1 持久保存，照片使用私有 R2 保存，不依赖浏览器缓存。照片上传前会缩放至最长边 1600 像素、转为 JPEG 并移除 EXIF 信息；原始高清文件请自行保留。

旧版送花记录和备份继续兼容。数据库中的旧字段名称没有改动，原来的照片、文字和日期不会丢失，只在界面上以旅行记录的方式呈现。

## 隐私与访问

网站是公开只读相册：匿名访客可以浏览所有未删除的记录及照片。只有运行环境 `FLOWER_MAP_OWNER_EMAIL` 指定的所有者经 ChatGPT 登录后，才能添加、编辑、删除、恢复、导入或导出备份。所有者邮箱只存放在 Sites 环境变量中，不写入公开仓库。回收站内容不会向访客开放。

访客直接输入网站网址即可查看，无需登录。维护者身份由可信登录网关注入，客户端无法自行指定相册所有者。

## 本地运行

环境要求：Node.js >= 22.13.0。

```sh
npm ci
npm run build
npm run dev -- --port 5173
```

打开 `http://localhost:5173`，点击登录即可进入本地模拟账号。`.wrangler/state` 中保留开发数据库和照片，它不会进入 Git。GitHub 仓库只保存程序和地图数据，不保存线上行程记录或照片。

首次创建空白本地数据库时，按顺序执行 `drizzle/` 中的迁移。生产迁移由 Sites 发布流程处理。

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

新增城市时，为其分配不会变化的 `code`，并填写 `name`、`countryCode`、`countryName`、`provinceCode`、`provinceName`、`country2` 和 `center`。不要改动已有代码，否则旧记录无法关联城市。

## 验证

```sh
npx tsc --noEmit
npm run test:integration
npm run build
```

## 地图数据来源

- 中国省界与城市：阿里云 DataV GeoAtlas；全国源文件保存在 `data/china.geojson`。
- 世界边界：`@d3-maps/atlas@1.0.0` 的 `countries-110m`；源文件保存在 `data/world.topojson`。
- 海外城市：Natural Earth 10m populated places simple，数据为 public domain。

地图运行时不依赖外部地图服务密钥。更新城市目录时必须保留旧城市代码及名称映射。

## 公开站点配置

Sites 生产环境需将秘密变量 `FLOWER_MAP_OWNER_EMAIL` 配置为所有者的登录邮箱，并在更新环境后重新发布。本地预览在忽略的 `.dev.vars` 中使用模拟账号；生产环境不能使用本地模拟身份。
