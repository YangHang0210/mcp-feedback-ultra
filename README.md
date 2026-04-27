# MCP Feedback Ultra

MCP Feedback Ultra 是一个用于 AI 辅助开发的交互式反馈服务器，支持 Web UI 和桌面应用双界面模式。

**原始项目:** [noopstudios/interactive-feedback-mcp](https://github.com/noopstudios/interactive-feedback-mcp)

## 核心特性

- **双界面支持**：Web UI（浏览器）+ 桌面应用（原生应用）
- **智能环境检测**：自动识别 SSH Remote、WSL 等特殊环境
- **交互式反馈**：AI 完成任务后主动收集用户反馈
- **跨平台支持**：Windows、macOS、Linux

## 快速开始

### 安装

```bash
uvx mcp-feedback-ultra@latest
```

### MCP 配置

在 Cursor 的 MCP 配置文件中添加：

```json
{
  "mcpServers": {
    "mcp-feedback-ultra": {
      "command": "uvx",
      "args": ["mcp-feedback-ultra@latest"],
      "timeout": 600,
      "autoApprove": ["interactive_feedback"]
    }
  }
}
```

### 环境变量（可选）

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `MCP_DEBUG` | 调试模式 | `false` |
| `MCP_WEB_HOST` | Web UI 绑定地址 | `127.0.0.1` |
| `MCP_WEB_PORT` | Web UI 端口 | `8765` |
| `MCP_DESKTOP_MODE` | 启用桌面应用模式 | `false` |

## 使用方式

### Web UI 模式（默认）

```json
{
  "mcpServers": {
    "mcp-feedback-ultra": {
      "command": "uvx",
      "args": ["mcp-feedback-ultra@latest"]
    }
  }
}
```

### 桌面应用模式

```json
{
  "mcpServers": {
    "mcp-feedback-ultra": {
      "command": "uvx",
      "args": ["mcp-feedback-ultra@latest"],
      "env": {
        "MCP_DESKTOP_MODE": "true"
      }
    }
  }
}
```

## 开发

### 本地测试

```bash
# 克隆项目
git clone https://github.com/YangHang0210/mcp-feedback-ultra.git
cd mcp-feedback-ultra

# 安装依赖
uv sync --dev

# 测试 Web UI
uv run python -m mcp_feedback_ultra test --web

# 测试桌面应用
uv run python -m mcp_feedback_ultra test --desktop
```

## 常见问题

### SSH Remote 环境无法访问？

设置 `MCP_WEB_HOST` 为 `0.0.0.0` 允许远程访问：

```json
{
  "env": {
    "MCP_WEB_HOST": "0.0.0.0",
    "MCP_WEB_PORT": "8765"
  }
}
```

然后在本地浏览器访问：`http://[远程IP]:8765`

## 许可证

MIT License

## 链接

- **PyPI**: https://pypi.org/project/mcp-feedback-ultra/
- **GitHub**: https://github.com/YangHang0210/mcp-feedback-ultra
- **原始项目**: https://github.com/noopstudios/interactive-feedback-mcp
