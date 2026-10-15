# W1 政策信源验证报告（2026-10-15 政策化改造 Task 1）

验证方式：curl 直连（公开站点）+ cheerio 本地解析校验选择器 + 采集器代码（json-list.ts / web-list.ts）格式比对。
验证环境：VPS（127.0.0.1:15432 finhot_w1_test），UA 含 FinHotBot 默认爬虫名实测通过（国务院/金融监管总局 API 均 200）。

## 1. 验证通过的信源（14 条，已全部写入 industry/sources.json）

| 机构 | 栏目 | URL | 格式 | interval | owner_entity_id | 验证结论 |
|---|---|---|---|---|---|---|
| 国务院 | 政策文件库·国务院文件 | https://sousuo.www.gov.cn/search-gov/data?t=zhengcelibrary_gw&q=&searchfield=title:content:summary&sort=timezd&sortType=1&p=1&n=20&timetype=timezd | json_list（itemsPath=searchVO.catMap.gongwen.listVO，pubtime epoch_ms） | 60 | gov | 稳：200；分页 p=2 验证通过；连发 5 请求无频率限制（~1s/次）；sortType=1 时间倒序（最新 2026-10-08 国函〔2026〕105号）；含 id/title/summary/url/puborg/pcode 全字段。接口来源：China-Central-Policy-MCP 仓库 README+源码（sort=timezd&sortType=1 经实测为最新在上，sortType=0 为 1996 年起正序） |
| 国务院 | 政策文件库·部委文件 | 同上，t=zhengcelibrary_bm | json_list（itemsPath=searchVO.catMap.bumenfile.listVO） | 60 | gov | 同上；bumenfile 覆盖全部部委文件（含无专属源的部委），最新 2026-10-14 国家知识产权局 |
| 发改委 | 新闻发布（新闻中心） | https://www.ndrc.gov.cn/xwdt/ | web_list（ul.u-list > li，日期 span YYYY/MM/DD） | 15 | ndrc | 静态列表 25 条，最新在上（2026-10-15）；含政策发布新闻+答记者问。**替换 [待自建RSSHub] 占位** |
| 金融监管总局 | 政策法规 | https://www.nfra.gov.cn/cbircweb/DocInfo/SelectDocByItemUUIdsAndChild?itemUUIds=8401&pageSize=50&orderBy=builddate | json_list（itemsPath=data，docTitle/publishDate，urlTemplate ItemDetail.html?docId=&itemId=） | 60 | nfab | 逆向官网 Angular 站 API（Script.js→/cbircweb），扁平 JSON 数组 18 条（服务端上限~18），最新 2026-10-09《财产保险公司保险产品开发管理规定》通知。**替换 [待自建RSSHub] 占位** |
| 金融监管总局 | 公告通知 | 同上，itemUUIds=910302 | json_list（同上） | 60 | nfab | 18 条，最新 2026-09-24 交强险业务情况公告；含征求意见/公告类 |
| 科技部 | 法规政策（部门规章+规范性文件+法律法规） | https://www.most.gov.cn/xxgk/xinxifenlei/fdzdgknr/fgzc/ | web_list（ul.list_common > li，span.mhide 日期） | 60 | most | 静态列表 17 条；部门规章最新 2026-02-11 科技活动违规行为调查处理规定；规范性文件 2026-03-02。旧 /kjzc/ 已 404，新站结构以 index.html 导航为准 |
| 水利部 | 规范性文件 | http://www.mwr.gov.cn/zw/zcfg/gfxwj/ | web_list（ul.slnewsconlist > li） | 60 | mwr | 静态列表 25 条，最新 2026-04-08；链接落在 /zwgk/gknr/ 前缀（allowUrlPrefixes 已覆盖） |
| 水利部 | 部门规章 | http://www.mwr.gov.cn/zw/zcfg/bmgz/ | web_list（同上） | 120 | mwr | 静态列表 25 条，最新 2026-07-03 招标投标领域信用管理暂行办法 |
| 教育部 | 政策解读 | http://www.moe.gov.cn/jyb_xwfb/s271/ | web_list（#list > li） | 60 | moe | 静态列表 20 条，最新 2026-08-31 特殊教育发展提升"十五五"行动计划答记者问 |
| 国务院国资委 | 政策法规 | http://www.sasac.gov.cn/n2588035/n2588320/index.html | web_list（li:has(> a[href*="content.html"][title])）+ detail 取日期 | 120 | sasac | 静态列表 14 条（含征求意见稿）；列表日期仅 MM-DD 无年份 → detail.publishedAtSelector=meta[name="publishdate"] 补年份（已验证 detail 页有该 meta） |
| 商务部 | 政策发布 | https://www.mofcom.gov.cn/zwgk/zcjd/index.html | web_list（section:has(h3:contains(政策发布)) ul.txtList_02 > li，页内静态组件） | 60 | mofcom | 主列表 JS 渲染，仅"政策发布"侧栏静态 9 条（6 条带日期），最新 2026-10-14 化肥进口关税配额公告；窗口小，把握度 likely |
| 交通运输部 | 政策解读 | https://www.mot.gov.cn/gongkai/zcjd/index.html | web_list（li.news-item，span.news-title/span.news-date） | 60 | mot | 静态列表 18 条，最新 2026-10-14 水运领域人工智能应用场景指引解读；旧 /zhengce/ 已 404 |
| 国家网信办 | 政策法规 | https://www.cac.gov.cn/ | web_list（#policy ul.news-normal > li，日期从 URL 路径正则提取） | 120 | cac | 仅首页"政策法规"组件静态 3 条（栏目页 JS），最新 2026-09-18；把握度 likely |
| 国家林草局 | 林草政策 | http://www.forestry.gov.cn/main/5461/index.html | web_list（div.news_list > ul > li） | 60 | forestry | 静态列表 20 条，最新 2026-09-15 优化自然资源配置推动旅游业发展指导意见 |

统计：国务院 2 + 部委 12 = 14 条新源，覆盖 11 个部委（发改委、金融监管总局×2、科技部、水利部×2、教育部、国资委、商务部、交通运输部、网信办、林草局）。全部 T1 / first_party / editorial / enabled。

## 2. 剔除的候选及原因

| 候选 | 原因 |
|---|---|
| 工信部（候选） | 列表页（/xwfb/zxzc/ 等）JS 渲染；CMS 接口 /api-gateway/jpaas-publish-server/front/page/build/unit 返回 {data:{html:…}} 片段，json_list 需 JSON 数组、web_list 需 HTML 文档，均不兼容；Jina 渲染无 key（403）。列入自建 RSSHub 待办（接口+参数已探明，见下） |
| 市场监管总局（候选） | 同工信部：/zw/zjwj/ 系列页面 JS 渲染，同一 jpaas API 返回 HTML 片段 |
| 能源局（候选） | /policy/zxwj.htm 等为 Vue 应用（datasource 动态加载），无静态列表 |
| 税务总局（候选） | 旧税收政策栏目（/chinatax/n810341/）404；新站 /zcfgk/ 列表 JS 渲染 |
| 住建部（候选） | /zhengcefabu/ 等政策栏目 JS 渲染（TRS CMS，authorizedReadUnitId 接口），无静态列表 |
| 生态环境部（候选） | 部门文件库 JS 渲染；首页仅"政策解读"6 条静态片段（无分页），不足成 feed；"中央有关文件"为国务院镜像（与国务院源重复） |
| 卫健委（候选） | WAF 拦截（HTTP 412 JS 挑战，多 UA 重试无效） |
| 医保局（候选） | 栏目页为 1.8KB JS 壳（/col/col37/），无静态列表 |
| 药监局（备用） | WAF 拦截（HTTP 412） |
| 农业农村部（备用） | /gk/ 为多 tab 门户，列表无完整日期（仅 MM-DD）且内容混杂（项目公示/公报/答复），不干净 |
| 应急管理部（备用） | 政策解读栏目主体为"一图读懂"图片型（detail 正文仅 h2，正文极薄），且列表标题内嵌日期后缀 |
| 国务院·政策解读栏目（www.gov.cn/zhengce/jiedu/） | 列表 JS 渲染，无静态列表；检索接口无解读 tab（t=zhengcelibrary_jiedu 返回空）；spec「验证后定」→ 不定，解读内容改由部委栏目（答记者问）+ 国务院文件库覆盖 |

## 3. 自建 RSSHub 待办（后续，非本任务范围）

1. **工信部**：GET https://www.miit.gov.cn/api-gateway/jpaas-publish-server/front/page/build/unit?parseType=buildstatic&webId=8d828e408d90447786ddbe128d495e9e&tplSetId=209741b2109044b5b7695700b2bec37e&pageType=column&tagId=右侧内容&editType=null&pageId=42cd38164cb6441a84bdfa441909e15e → {data.html} 内 li>a[href][title]+span 日期（已验证返回 2026-10-15 最新政策）；最新政策/政策文件/政策解读各列 pageId 从对应列表页 script 标签取。
2. **市场监管总局**：同 jpaas 接口（/zw/zjwj/index.html 的 script 标签内 webId/tplSetId/pageId/tagId=内容区域），解析总局文件/通知/政策解读。
3. 可选：能源局（Vue datasource API）、税务总局、住建部（TRS authorizedReadUnitId 接口）。

## 4. 风险与备注

- 金融监管总局 API 为逆向所得（/cbircweb/DocInfo/*），非官方公开接口，改版可能失效（已标把握度 likely）；publishDate 格式 "YYYY-MM-DD HH:mm:ss" 按容器本地时区解析（无 +08:00 偏移处理），与北京时间差最多 8 小时，文档型 feed 影响可忽略。
- 国务院检索接口 q 为空时 totalCount=0 属正常（列表仍从 catMap 返回）；sort 必须 timezd+sortType=1（score 序不严格时间倒序）。
- 商务部/网信办源依赖页面内静态组件（9 条 / 3 条窗口），组件改版即失效（把握度 likely，可源级停用）。
- 新增 7 个部委实体（most/mwr/moe/sasac/mot/cac/forestry）暂未建主题页（topics.json 归 W2 泳道），卡片按 entity:<id> 归类不受影响。
