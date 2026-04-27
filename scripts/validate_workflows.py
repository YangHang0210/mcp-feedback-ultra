#!/usr/bin/env python3
"""
GitHub Actions 工作流程验证腳本

此腳本验证 GitHub Actions 工作流程文件的語法和配置正確性。
"""

import sys
from pathlib import Path

import yaml


def validate_yaml_syntax(file_path: Path) -> bool:
    """验证 YAML 文件語法"""
    try:
        with open(file_path, encoding="utf-8") as f:
            yaml.safe_load(f)
        print(f"✅ {file_path.name}: YAML 語法正確")
        return True
    except yaml.YAMLError as e:
        print(f"❌ {file_path.name}: YAML 語法错误 - {e}")
        return False
    except Exception as e:
        print(f"❌ {file_path.name}: 讀取文件失敗 - {e}")
        return False


def validate_workflow_structure(file_path: Path) -> bool:
    """验证工作流程結構"""
    try:
        with open(file_path, encoding="utf-8") as f:
            workflow = yaml.safe_load(f)

        # 检查是否成功解析
        if workflow is None:
            print(f"❌ {file_path.name}: 文件為空或解析失敗")
            return False

        # 检查必需的頂級字段
        # 注意：YAML 會將 'on' 解析為 True，所以我們需要特殊处理
        required_fields = ["name", "jobs"]
        for field in required_fields:
            if field not in workflow:
                print(f"❌ {file_path.name}: 缺少必需字段 '{field}'")
                print(f"   實際字段: {list(workflow.keys())}")
                return False

        # 检查 'on' 字段（可能被解析為 True）
        if "on" not in workflow and True not in workflow:
            print(f"❌ {file_path.name}: 缺少觸發條件 'on'")
            print(f"   實際字段: {list(workflow.keys())}")
            return False

        # 检查 jobs 結構
        if not isinstance(workflow["jobs"], dict):
            print(f"❌ {file_path.name}: 'jobs' 必須是字典")
            return False

        if not workflow["jobs"]:
            print(f"❌ {file_path.name}: 'jobs' 不能為空")
            return False

        print(f"✅ {file_path.name}: 工作流程結構正確")
        return True

    except Exception as e:
        print(f"❌ {file_path.name}: 結構验证失敗 - {e}")
        return False


def validate_build_desktop_workflow(file_path: Path) -> bool:
    """验证桌面构建工作流程的特定配置"""
    try:
        with open(file_path, encoding="utf-8") as f:
            workflow = yaml.safe_load(f)

        # 检查 matrix 配置
        build_job = workflow["jobs"].get("build-desktop", {})
        strategy = build_job.get("strategy", {})
        matrix = strategy.get("matrix", {})

        if "include" not in matrix:
            print(f"❌ {file_path.name}: 缺少 matrix.include 配置")
            return False

        # 检查平台配置
        platforms = matrix["include"]
        expected_platforms = {"windows", "macos-intel", "macos-arm64", "linux"}
        actual_platforms = {item.get("name") for item in platforms}

        if not expected_platforms.issubset(actual_platforms):
            missing = expected_platforms - actual_platforms
            print(f"❌ {file_path.name}: 缺少平台配置: {missing}")
            return False

        print(f"✅ {file_path.name}: 桌面构建配置正確")
        return True

    except Exception as e:
        print(f"❌ {file_path.name}: 桌面构建验证失敗 - {e}")
        return False


def validate_publish_workflow(file_path: Path) -> bool:
    """验证發佈工作流程的特定配置"""
    try:
        with open(file_path, encoding="utf-8") as f:
            workflow = yaml.safe_load(f)

        # 检查輸入參數 - 注意 'on' 可能被解析為 True
        on_section = workflow.get("on") or workflow.get(True)
        if not on_section:
            print(f"❌ {file_path.name}: 找不到觸發條件")
            return False

        workflow_dispatch = on_section.get("workflow_dispatch", {})
        inputs = workflow_dispatch.get("inputs", {})

        required_inputs = {"version_type", "include_desktop"}
        actual_inputs = set(inputs.keys())

        if not required_inputs.issubset(actual_inputs):
            missing = required_inputs - actual_inputs
            print(f"❌ {file_path.name}: 缺少輸入參數: {missing}")
            print(f"   實際輸入參數: {actual_inputs}")
            return False

        # 检查是否有桌面应用处理步驟
        release_job = workflow["jobs"].get("release", {})
        steps = release_job.get("steps", [])

        has_desktop_steps = any(
            "desktop" in step.get("name", "").lower() for step in steps
        )

        if not has_desktop_steps:
            print(f"❌ {file_path.name}: 缺少桌面应用处理步驟")
            return False

        print(f"✅ {file_path.name}: 發佈工作流程配置正確")
        return True

    except Exception as e:
        print(f"❌ {file_path.name}: 發佈工作流程验证失敗 - {e}")
        return False


def main():
    """主函數"""
    print("🔍 验证 GitHub Actions 工作流程...")
    print()

    # 獲取工作流程目錄
    workflows_dir = Path(__file__).parent.parent / ".github" / "workflows"

    if not workflows_dir.exists():
        print(f"❌ 工作流程目錄不存在: {workflows_dir}")
        sys.exit(1)

    # 查找所有工作流程文件
    workflow_files = list(workflows_dir.glob("*.yml")) + list(
        workflows_dir.glob("*.yaml")
    )

    if not workflow_files:
        print(f"❌ 在 {workflows_dir} 中沒有找到工作流程文件")
        sys.exit(1)

    print(f"📁 找到 {len(workflow_files)} 個工作流程文件")
    print()

    # 验证每個文件
    all_valid = True

    for workflow_file in sorted(workflow_files):
        print(f"🔍 验证 {workflow_file.name}...")

        # 基本語法验证
        if not validate_yaml_syntax(workflow_file):
            all_valid = False
            continue

        # 結構验证
        if not validate_workflow_structure(workflow_file):
            all_valid = False
            continue

        # 特定工作流程验证
        if workflow_file.name == "build-desktop.yml":
            if not validate_build_desktop_workflow(workflow_file):
                all_valid = False
        elif workflow_file.name == "publish.yml":
            if not validate_publish_workflow(workflow_file):
                all_valid = False

        print()

    # 總結
    if all_valid:
        print("🎉 所有工作流程文件验证通過！")
        print()
        print("📋 下一步:")
        print("  1. 提交並推送更改到 GitHub")
        print("  2. 测试 'Build Desktop Applications' 工作流程")
        print("  3. 测试 'Build Desktop & Release' 工作流程")
        print("  4. 验证桌面应用是否正確包含在發佈中")
    else:
        print("❌ 部分工作流程文件验证失敗")
        print("請修復上述問題後重新运行验证")
        sys.exit(1)


if __name__ == "__main__":
    main()
