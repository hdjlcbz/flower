# 启用自动检查

自动检查模板位于 `docs/github-actions-ci.yml`。本次上传使用的访问令牌没有创建 GitHub Actions 工作流的权限，因此模板未直接放入 `.github/workflows`。

需要自动检查时，在 GitHub 网页或具备工作流写入权限的连接中，将模板保存为 `.github/workflows/ci.yml`。它会在推送和 pull request 时运行类型检查、构建、数据库初始化及集成测试。

不启用 GitHub Actions 也可以按 README 中的步骤本地运行与维护。访问令牌不应提交进仓库。
