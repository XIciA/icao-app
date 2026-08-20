# 邀请码账户管理

仅在 ECS 上操作；不要直接在 Supabase Dashboard 创建或删除 Auth 用户。

```bash
ssh -i ~/.ssh/icao_app_codex root@47.108.90.19
```

## 创建

名称必须为四个汉字。命令只输出一次完整邀请码，应立即保存到私密登记表。

```bash
docker exec -it icao-api sh -lc \
  'pnpm --filter @icao/api invite:manage create 云淡风轻'
```

## 查看状态

不显示邀请码明文。

```bash
docker exec -it supabase-db psql -U postgres -d postgres -c \
  "select display_name, status, created_at, last_login_at
   from public.invite_accounts order by created_at desc;"
```

## 重置

用于泄露或重新发码：生成新码、旧码立即失效、退出全部设备，学习数据保留。

```bash
docker exec -it icao-api sh -lc \
  'pnpm --filter @icao/api invite:manage reset "云淡风轻-ABCD-2345"'
```

## 停用

用于永久停止内测资格：撤销全部会话，数据保留。停用后当前工具不能重新启用。

```bash
docker exec -it icao-api sh -lc \
  'pnpm --filter @icao/api invite:manage disable "云淡风轻-ABCD-2345"'
```

## 规则

- 一人一号，不共享。
- 私密登记表保存「用户、完整邀请码、发放时间、状态」。服务器不保存明文邀请码。
- 临时换码使用 `reset`；永久移除才使用 `disable`。
