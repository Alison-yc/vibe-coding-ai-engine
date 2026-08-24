/**
 * 提交信息规范。与 .cursor/rules/90-git-and-commit.mdc 保持一致，改动时两边同步。
 * 格式：<type>(<scope>): <subject>
 */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat', // 新功能
        'fix', // 修复
        'refactor', // 重构（不改变外部行为）
        'perf', // 性能优化
        'docs', // 文档（含 .plan 与 .cursor/rules）
        'test', // 测试
        'build', // 构建系统、依赖
        'ci', // CI 配置
        'chore', // 杂务
        'revert', // 回滚
      ],
    ],
    'scope-enum': [
      2,
      'always',
      [
        // 应用与包
        'app', // Tauri 桌面壳
        'web', // 浏览器 Web 壳
        'server', // NestJS 服务端
        'ui', // packages/ui
        'contracts', // packages/contracts
        'platform', // packages/platform
        'app-core', // packages/app-core
        // 业务领域
        'workflow',
        'rag',
        'agent',
        'chat',
        'mcp',
        'llm',
        'db',
        // 工程
        'tauri',
        'ci',
        'deps',
        'plan',
        'rules',
        'test',
        'sec',
        'docker',
        'scripts',
      ],
    ],
    'scope-empty': [2, 'never'],
    'subject-empty': [2, 'never'],
    // 中文 subject 不适用大小写规则，关掉
    'subject-case': [0],
    'subject-full-stop': [2, 'never', '。'],
    'header-max-length': [2, 'always', 100],
    'body-leading-blank': [2, 'always'],
    'footer-leading-blank': [2, 'always'],
  },
};
