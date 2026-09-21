-- 数据库首次创建时自动执行（仅在数据卷为空时运行一次）。
--
-- 表结构不在这里创建，由 Drizzle 迁移负责（见 .plan/05）。
-- 这里只做扩展安装这类迁移不方便做的事。

CREATE EXTENSION IF NOT EXISTS vector;

-- 用于生成 UUID 主键
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 用于文本相似度（模糊匹配文档名等场景，不用于向量检索）
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 自检：确认 vector 扩展真的装上了。失败会让容器初始化报错，早发现好过运行时才发现。
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    RAISE EXCEPTION 'pgvector 扩展安装失败，检查镜像是否为 pgvector/pgvector';
  END IF;
END $$;
