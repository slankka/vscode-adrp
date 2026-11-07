# ADR Proposals（VS Code 扩展）

在 VS Code 侧边栏浏览工作区里的 ADR 提案（本仓库为 `DBIP-001`，也可配成 `ADR-001` / `RFC-001`），点击标题即可直接打开对应 Markdown 文件并定位到标题行。

## 功能

- 活动栏新增 **ADR提案** 容器（图标为带字母 P 的文档轮廓），内含提案树视图；视图标题为 `ADR提案: <前缀>`，前缀由 `adrp.titlePrefix` 决定（留空则跟随 `adrp.idPrefix`，默认即 `ADR提案: DBIP`）。
- 自动扫描工作区内编号为 `<前缀>-*.md` 的文件，解析提案编号、标题、状态、负责人与更新日期；`<前缀>` 由 `adrp.idPrefix` 决定（默认 `DBIP`，可设为 `ADR` 等）。
- 列表标题以编号开头，如 `DBIP-039 数据库实例入口 IP 白名单`。
- 默认按状态分组（已实施 / 已确定 / 草稿 / 已归档 / 未标注状态），组内按编号倒序。
- 点击提案标题 → 打开该文件并把光标定位到标题行。
- 文件新增、修改、删除后视图自动刷新。
- 视图标题栏提供：快速打开提案（Quick Pick 搜索）、刷新、打开提案索引、生成关系概览。
- **空状态可操作化**：扫描不到提案时，视图内直接给出「打开设置 / 重新扫描 / 新建提案」三个入口，不用翻文档。
- **新建提案**：编号自动递增（按现有最大编号 +1），生成带元信息表的骨架文件并定位到标题行。
- **结构诊断**：打开/保存提案时在「问题」面板给出提示（标题编号、元信息表、状态取值、空章节、Ready 无证据、复核超期）。
- **引用关系**：悬停提案可看到「引用 N 份 / 被 N 份引用」，孤立提案会显式标注。
- **生成关系概览**：`ADR提案: 生成关系概览` 在 `develop/plans/OVERVIEW.md` 写一份可预览的关系表（汇总、清单、孤立提案、悬空引用、超期未复核），零依赖、不引入 webview 面板。
- **Markdown 片段**：在提案里输入 `adrp-meta` / `adrp-evidence` / `adrp-skeleton` 快速补元信息表与章节。
- 资源管理器右键：编号开头的 `.md` 文件可直接「打开提案文件」，`plans` 目录可「新建提案」「打开提案索引」。

## 使用

### 调试运行（推荐用于开发）

```bash
cd tools/vscode-adrp
npm install
npm run build
```

然后用 VS Code 打开 `tools/vscode-adrp` 目录，按 `F5`（或命令行 `code --extensionDevelopmentPath=. <项目根目录>`，需先执行 `npm run build`）启动扩展开发宿主：在新窗口打开本项目根目录，左侧活动栏点击 ADR提案图标即可看到提案列表。

### 安装到本机 VS Code

```bash
cd tools/vscode-adrp
npx @vscode/vsce package
code --install-extension adrp-proposals-0.4.0.vsix --force
```

安装后在任意工作区打开 ADR提案视图即可；升级后需重启 VS Code 才会加载新的命令与配置项。

## 自定义编号前缀（ADR / RFC …）

扩展不假设编号一定叫 `DBIP`。在设置里改 `adrp.idPrefix` 即可切换整套行为（文件扫描、编号解析、标题去前缀、新建递增编号、结构诊断、关系概览标题）。

**这份配置写在工作区**，即仓库根目录的 `.vscode/settings.json`（随仓库提交，团队共享同一套约定）：

```json
{
  "adrp.idPrefix": "ADR",
  "adrp.titlePrefix": "ERP 数据库"
}
```

- 提案文件需命名为 `ADR-001-xxx.md`，一级标题写成 `# ADR-001 标题`。
- 侧边栏标题变为 `ADR提案: ERP 数据库`（`adrp.titlePrefix` 留空则变为 `ADR提案: ADR`）。
- 需要同时扫两种前缀时，手动填写 `adrp.include`，如 `["**/DBIP-*.md", "**/ADR-*.md"]`（但编号解析仍只认 `adrp.idPrefix`）。
- 活动栏容器名称与命令分类是静态贡献点（`ADR提案`），不随设置变化；随设置变化的是视图标题。

### 作用域：仓库约定 vs 个人偏好

| 配置 | 作用域 | 写在哪 |
|---|---|---|
| `adrp.idPrefix`、`adrp.titlePrefix`、`adrp.include`、`adrp.exclude`、`adrp.plansDir`、`adrp.statusAliases` | `resource` | **工作区** `.vscode/settings.json`（描述的是这个仓库的命名约定） |
| `adrp.groupByStatus`、`adrp.showStatusInDescription`、`adrp.lintEnabled` | `window` | 个人偏好，写**用户设置**即可，也可按工作区覆盖 |

优先级固定为 `文件夹设置 > 工作区设置 > 用户设置 > 默认值`。多根工作区下，`resource` 级配置会按目录分别解析（结构诊断已按文档所在目录取值）。

## 配置项

| 配置 | 默认值 | 说明 |
|---|---|---|
| `adrp.idPrefix` | `"DBIP"` | 编号前缀（`DBIP` / `ADR` / `RFC` …），决定文件扫描默认值、编号解析与新建递增 |
| `adrp.titlePrefix` | `""` | 视图标题的展示前缀，显示在静态名称 `ADR提案` 后；留空时跟随 `adrp.idPrefix` |
| `adrp.include` | `[]` | 提案文件匹配规则（相对工作区根的 glob）；留空时自动使用 `["**/<idPrefix>-*.md"]` |
| `adrp.exclude` | `["**/history/**", "**/output/**", "**/.archived/**", "**/node_modules/**"]` | 排除目录，避免历史快照与验证报告混入 |
| `adrp.groupByStatus` | `true` | 按状态分组显示 |
| `adrp.showStatusInDescription` | `true` | 在标题后附加状态说明（编号已包含在标题中） |
| `adrp.statusAliases` | `{}` | 状态别名映射，如 `{"待确认": "Ready", "已上线": "Implemented"}` |
| `adrp.lintEnabled` | `true` | 是否对打开的提案做结构诊断 |
| `adrp.plansDir` | `develop/plans` | 提案目录，供「新建提案」与「打开提案索引」使用 |

## 结构诊断规则

| 规则 | 级别 | 判定 |
|---|---|---|
| `adrp/missing-title` | Error | 没有一级标题 |
| `adrp/title-prefix` | Warning | 一级标题不以 `<idPrefix>-NNN` 开头（会导致排序失准） |
| `adrp/missing-status` | Warning | 元信息表缺少「状态」行 |
| `adrp/unknown-status` | Warning | 状态取值无法识别，且未配置在 `adrp.statusAliases` |
| `adrp/status-without-evidence` | Warning | 状态为 Ready / Implemented，但全文没有「事实 / 证据 / 依据 / 验证 / 验收」类章节 |
| `adrp/missing-owner` | Info | 元信息表缺少「负责人」行 |
| `adrp/empty-section` | Warning | 章节只有标题、既无内容也无子标题 |
| `adrp/overdue-review` | Info | 元信息表「复核日期」早于或等于今天 |

规则刻意保守：不要求统一章节名（现有提案的章节命名差异很大），代码块内的 `#` 与 `|` 不参与判定。
以现有 30 份提案实测，只有 1 条 Info 级提示，无 Warning 级误报。

## 状态解析规则

提案元信息表在各作者之间写法不统一，扩展按“列名包含关键字”匹配，不依赖具体表头：

- 标题：正文首个一级标题，去掉 `<idPrefix>-xxx` 编号前缀。
- 状态：列名含「状态」的单元格；文本中出现 `Draft/Ready/Implemented/Archived` 或对应中文（草稿/已确定/已实施/已归档）时取最先出现的一个；`编号 / 状态` 合并写法同样适用。
- 负责人：列名含「负责人」的单元格。
- 更新日期：列名含「更新」的单元格，取斜杠后的日期。
- 复核日期：列名含「复核 / 复审 / 有效期 / review」的单元格，抽出 `YYYY-MM-DD`。
- 标签：列名含「标签 / tag」的单元格，按 `, ， 、 ; /` 与空格切分。
- 关联提案：列名含「关联 / 相关 / 补充 / 依赖 / 前置 / 取代」的单元格中的全部 `<idPrefix>-NNN`；另单独统计正文中出现过的全部编号（`mentions`），两者合并即「引用」关系。占位值（`-`、`待定`、`待补充`、`TBD`）一律忽略。

## 测试

```bash
npm test
npm run typecheck
npm run test:integration
```

集成测试会在真实 VS Code 实例中展开视图触发激活，断言侧边栏分组与标题内容，执行打开命令并校验活动编辑器与光标位置，并校验提案文件新增/删除后列表同步更新。

## 命令

| 命令 | 作用 |
|---|---|
| `ADR提案: 快速打开提案…` | 搜索并打开提案 |
| `ADR提案: 刷新提案列表` | 重新扫描工作区 |
| `ADR提案: 打开提案索引` | 打开 `develop/plans/README.md` |
| `ADR提案: 新建提案` | 按最大编号 +1 创建骨架文件并打开 |
| `ADR提案: 生成关系概览` | 写 `develop/plans/OVERVIEW.md` 并打开 |
