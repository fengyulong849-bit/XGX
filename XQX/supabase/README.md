# 小确闲后端（Supabase）

本目录承载小确闲 v1 的数据库迁移、Edge Functions 和后端测试。

当前处于 **M0：工程与安全基线**。`migrations/` 中的 SQL 是唯一可追溯的数据库结构来源；不要在生产控制台手工修改结构后遗漏迁移文件。

## 环境变量约定

前端允许使用的变量：

```text
SUPABASE_URL=
SUPABASE_ANON_KEY=
```

仅在 Supabase Edge Function 密钥环境中可用、绝不能写入 HTML/浏览器脚本或提交到仓库的变量：

```text
SUPABASE_SERVICE_ROLE_KEY=
RECOVERY_CODE_PEPPER=
RATE_LIMIT_SECRET=
CONTENT_MODERATION_API_KEY=
```

## 本地运行前置条件

1. 安装 Supabase CLI；
2. 安装并启动 Docker Desktop；
3. 使用 `supabase init` 初始化配置（不得覆盖本目录现有迁移）；
4. 使用 `supabase start` 启动本地服务；
5. 使用 `supabase db reset` 从迁移重建本地数据库；
6. 运行 SQL/Function 测试后再连接远端开发项目。

## 数据库安全约定

- 所有业务表必须启用 RLS；未明确允许的访问一律拒绝。
- 浏览器使用匿名公钥和用户 JWT；绝不使用 Service Role Key。
- 关键写操作只通过 RPC/Edge Function 执行。
- 每一次积分变化都必须由事务写入 `point_ledger`。
- 公开吐槽只通过专用函数/视图返回安全字段，禁止 `select *`。

详细模块、接口与验收标准见：
`../文档/小确闲_后端开发文档.md`。
