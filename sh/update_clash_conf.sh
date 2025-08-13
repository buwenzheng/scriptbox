#!/bin/bash

# ================== 用户配置区 ==================
# 1. Clash 订阅链接 (请务必使用您那个完整的、带 token 的私密链接)
CLASH_URL="在此处完整粘贴您的Clash订阅链接"

# 2. Clash 配置文件在宿主机上的最终存放路径
#    例如: /mnt/user/appdata/clash/config.yaml
#    或者: /volume1/docker/clash/config.yaml
CLASH_CONFIG_FILE="/path/to/your/clash/config.yaml"
# ===============================================

# --- 以下为脚本主体，请勿修改 ---
echo "================================================================"
echo "=========== Clash 配置文件更新脚本 (最终修正版) ==========="
echo "================================================================"
echo ""

# 【关键修正 ①】将临时文件创建在 /tmp 目录下。
# /tmp 是一个通用的临时目录，任何程序都有权限在此写入文件，从而避免所有路径和权限问题。
TEMP_CONFIG_FILE="/tmp/clash_config_$(date +%s).tmp"
echo "将在安全的临时路径创建文件: $TEMP_CONFIG_FILE"
echo ""

echo "步骤 1: 正在从订阅链接下载最新配置文件..."
# 【关键修正 ②】使用正确的 "-o" 选项，并将下载内容保存到安全的临时文件。
# 我去掉了 -s (静默模式)，这样如果 curl 依然出错，您可以在日志中看到更详细的 curl 自身错误信息。
curl -L --connect-timeout 45 --max-time 90 \
-A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36" \
-o "$TEMP_CONFIG_FILE" "$CLASH_URL"

# 步骤 2: 对下载结果进行健壮性检查
if [ $? -ne 0 ]; then
    echo "错误(1/3): curl 命令执行失败！请检查上方 curl 的输出日志以获取详细错误信息。常见原因包括网络问题或URL错误。"
    # 清理可能产生的0字节文件
    rm -f "$TEMP_CONFIG_FILE"
    exit 1
fi

if [ ! -s "$TEMP_CONFIG_FILE" ]; then
    echo "错误(2/3): 配置文件下载成功，但文件为空！请检查您的订阅链接是否已过期或流量耗尽。"
    rm -f "$TEMP_CONFIG_FILE"
    exit 1
fi

if ! grep -qi "proxies:" "$TEMP_CONFIG_FILE"; then
    echo "错误(3/3): 下载的文件内容格式不正确，缺少'proxies:'关键字。文件可能是一个HTML错误页面，请尝试在浏览器中打开订阅链接查看。"
    rm -f "$TEMP_CONFIG_FILE"
    exit 1
fi

echo "✅ 下载成功，且文件内容校验通过！"
echo ""

echo "步骤 3: 正在比较新旧配置文件，判断是否有更新..."
# 使用 diff 命令比较新旧文件是否有变化
if [ -f "$CLASH_CONFIG_FILE" ] && diff -q "$CLASH_CONFIG_FILE" "$TEMP_CONFIG_FILE" >/dev/null 2>&1; then
    echo "🔄 配置文件无变化，无需更新。"
    rm -f "$TEMP_CONFIG_FILE" # 清理临时文件
else
    echo "🆕 检测到配置文件有更新！"
    echo ""
    echo "步骤 4: 正在备份旧的配置文件..."
    # 【关键修正 ③】在移动文件之前，使用 mkdir -p 确保最终的目标目录一定存在。
    mkdir -p "$(dirname "$CLASH_CONFIG_FILE")"
    if [ -f "$CLASH_CONFIG_FILE" ]; then
        cp "$CLASH_CONFIG_FILE" "${CLASH_CONFIG_FILE}.bak_$(date +"%Y%m%d_%H%M%S")"
        echo "备份完成！"
    else
         echo "旧配置文件不存在，跳过备份。"
    fi
    echo ""
    echo "步骤 5: 正在用新文件覆盖旧文件..."
    mv "$TEMP_CONFIG_FILE" "$CLASH_CONFIG_FILE"
    echo "✅ 新配置文件已成功更新至: $CLASH_CONFIG_FILE"
    echo ""
    # 如果您需要，可以在此处添加重启Clash容器的命令
    # echo "正在重启Clash容器..."
    # docker restart clash
fi

echo "======================= 脚本执行完毕 ======================="
