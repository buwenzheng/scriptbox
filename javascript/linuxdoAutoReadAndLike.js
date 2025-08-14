// ==UserScript==
// @name         linux.do 阅读量刷新脚本
// @namespace    http://tampermonkey.net/
// @version      1.0.5
// @description  try to take over the world!
// @author       You
// @match        https://linux.do/t/topic/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=linux.do
// @connect      raw.githubusercontent.com
// @updateURL    https://raw.githubusercontent.com/buwenzheng/scriptbox/main/javascript/linuxdoAutoReadAndLike.js
// @downloadURL  https://raw.githubusercontent.com/buwenzheng/scriptbox/main/javascript/linuxdoAutoReadAndLike.js
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  class AutoScroller {
    constructor() {
      this.scrollInterval = null;
      this.isScrolling = false;
      this.scrollDelay = 25000; // 25秒
      this.worker = null;

      // 随机点赞
      this.autoLikeEnabled = false;
      this.autoLikeTimeout = null;
      this.likeMinDelayMs = 30000; // 30秒
      this.likeMaxDelayMs = 90000; // 90秒
      this.likedPostIds = new Set();

      // Page Visibility API相关
      this.isPageVisible = !document.hidden;
      this.forceVisibility = false;
      this.originalDocumentHidden = null;
      this.originalDocumentVisibilityState = null;

      this.initStyles();
      this.createControlPanel();
      this.setupEventListeners();
      this.setupVisibilityHooks();
      this.initWorker();
    }

    initStyles() {
      const style = document.createElement("style");
      style.textContent = `
                  #controlPanel {
                      position: fixed;
                      bottom: 20px;
                      left: 50%;
                      transform: translateX(-50%);
                      z-index: 100;
                      background: rgba(255,255,255,0.9);
                      padding: 10px 20px;
                      border-radius: 20px;
                      box-shadow: 0 4px 10px rgba(0,0,0,0.2);
                      display: flex;
                      gap: 10px;
                      font-size: 14px;
                  }

                  #controlPanel button {
                      padding: 8px 16px;
                      border: none;
                      border-radius: 5px;
                      background: #4a89dc;
                      color: white;
                      cursor: pointer;
                      transition: background 0.3s;
                  }

                  #controlPanel button:hover {
                      background: #3b7dd8;
                  }

                  #controlPanel button:disabled {
                      background: #cccccc;
                      cursor: not-allowed;
                  }

                  #controlPanel .field {
                      display: flex;
                      align-items: center;
                      gap: 6px;
                  }

                  #controlPanel input[type="number"] {
                      width: 80px;
                      padding: 6px 8px;
                      border: 1px solid #ddd;
                      border-radius: 5px;
                      outline: none;
                  }

                  .status {
                      display: flex;
                      align-items: center;
                      padding: 0 10px;
                  }
              `;
      document.head.appendChild(style);
    }

    createControlPanel() {
      this.controlPanel = document.createElement("div");
      this.controlPanel.id = "controlPanel";

      this.startBtn = document.createElement("button");
      this.startBtn.id = "startBtn";
      this.startBtn.textContent = "开始滚动";

      this.pauseBtn = document.createElement("button");
      this.pauseBtn.id = "pauseBtn";
      this.pauseBtn.textContent = "暂停滚动";
      this.pauseBtn.disabled = true;

      this.likeToggleBtn = document.createElement("button");
      this.likeToggleBtn.id = "likeToggleBtn";
      this.likeToggleBtn.textContent = "开启随机点赞";

      this.forceVisibilityBtn = document.createElement("button");
      this.forceVisibilityBtn.id = "forceVisibilityBtn";
      this.forceVisibilityBtn.textContent = "强制可见性: 关闭";

      // 停留时间（秒）设置
      const delayField = document.createElement("div");
      delayField.className = "field";
      const delayLabel = document.createElement("label");
      delayLabel.setAttribute("for", "delayInput");
      delayLabel.textContent = "停留(秒)";
      this.delayInput = document.createElement("input");
      this.delayInput.type = "number";
      this.delayInput.id = "delayInput";
      this.delayInput.min = "1";
      this.delayInput.value = String(Math.floor(this.scrollDelay / 1000));
      delayField.append(delayLabel, this.delayInput);

      const statusContainer = document.createElement("div");
      statusContainer.className = "status";
      statusContainer.innerHTML = '状态: <span id="statusText">暂停中</span>';

      this.statusText = statusContainer.querySelector("#statusText");

      const likeStatusContainer = document.createElement("div");
      likeStatusContainer.className = "status";
      likeStatusContainer.innerHTML =
        '点赞: <span id="likeStatusText">关闭</span>';
      this.likeStatusText =
        likeStatusContainer.querySelector("#likeStatusText");

      this.controlPanel.append(
        this.startBtn,
        this.pauseBtn,
        this.likeToggleBtn,
        this.forceVisibilityBtn,
        delayField,
        statusContainer,
        likeStatusContainer
      );
      document.body.appendChild(this.controlPanel);
    }

    setupEventListeners() {
      this.startBtn.addEventListener("click", () => this.startAutoScroll());
      this.pauseBtn.addEventListener("click", () => this.pauseAutoScroll());
      this.likeToggleBtn.addEventListener("click", () => this.toggleAutoLike());
      this.forceVisibilityBtn.addEventListener("click", () => this.toggleForceVisibility());
      if (this.delayInput) {
        this.delayInput.addEventListener("change", () => this.updateScrollDelayFromInput());
        this.delayInput.addEventListener("blur", () => this.updateScrollDelayFromInput());
      }
    }

    getViewportHeight() {
      return window.innerHeight || document.documentElement.clientHeight;
    }

    isAtBottom() {
      const viewportHeight = this.getViewportHeight();
      const currentScroll =
        window.pageYOffset || document.documentElement.scrollTop;
      return currentScroll + viewportHeight >= document.body.scrollHeight;
    }

    performScroll() {
      if (this.isAtBottom()) {
        this.pauseAutoScroll();
        return;
      }

      const viewportHeight = this.getViewportHeight();
      const currentScroll =
        window.pageYOffset || document.documentElement.scrollTop;
      const nextScroll = currentScroll + viewportHeight;

      window.scrollTo({
        top: nextScroll,
        behavior: "smooth",
      });
    }

    startAutoScroll() {
      if (this.isScrolling) return;

      this.isScrolling = true;
      this.statusText.textContent = "滚动中...";
      this.startBtn.disabled = true;
      this.pauseBtn.disabled = false;

      // 如果页面当前是隐藏的，立即启用强制可见性
      if (!this.isPageVisible) {
        this.enableForceVisibility();
      }

      // 立即执行第一次滚动
      this.performScroll();

      // 设置定时器
      this.scrollInterval = setInterval(
        () => this.performScroll(),
        this.scrollDelay
      );

      // 启动worker
      if (this.worker) {
        this.worker.postMessage({ command: "start" });
      }
    }

    pauseAutoScroll() {
      if (!this.isScrolling) return;

      this.isScrolling = false;
      this.statusText.textContent = "暂停中";
      this.startBtn.disabled = false;
      this.pauseBtn.disabled = true;

      clearInterval(this.scrollInterval);

      // 暂停worker
      if (this.worker) {
        this.worker.postMessage({ command: "pause" });
      }

      // 停止滚动时禁用强制可见性（可选，也可以保持开启）
      // this.disableForceVisibility();
    }

    initWorker() {
      if (typeof Worker === "undefined") {
        console.warn("浏览器不支持Web Workers，页面失焦时自动滚动可能不工作");
        return;
      }

      const workerCode = `
                  let scrollTimeout;
                  let isActive = false;
                  let delay = ${this.scrollDelay};

                  self.onmessage = function(e) {
                      if (e.data.command === 'start') {
                          isActive = true;
                          scheduleScroll();
                      } else if (e.data.command === 'pause') {
                          isActive = false;
                          clearTimeout(scrollTimeout);
                      } else if (e.data.command === 'updateDelay') {
                          if (typeof e.data.delay === 'number' && e.data.delay > 0) {
                              delay = e.data.delay;
                          }
                      }
                  };

                  function scheduleScroll() {
                      scrollTimeout = setTimeout(() => {
                          if (isActive) {
                              self.postMessage({ action: 'scroll' });
                              scheduleScroll();
                          }
                      }, delay);
                  }
              `;

      const blob = new Blob([workerCode], { type: "application/javascript" });
      this.worker = new Worker(URL.createObjectURL(blob));

      this.worker.onmessage = (e) => {
        if (e.data.action === "scroll" && this.isScrolling) {
          this.performScroll();
        }
      };

      // 初始化时同步一次 delay
      this.worker.postMessage({ command: 'updateDelay', delay: this.scrollDelay });
    }

    // =============== 随机点赞功能 ===============
    toggleAutoLike() {
      if (this.autoLikeEnabled) {
        this.stopAutoLike();
      } else {
        this.startAutoLike();
      }
    }

    startAutoLike() {
      if (this.autoLikeEnabled) return;
      this.autoLikeEnabled = true;
      this.likeToggleBtn.textContent = "关闭随机点赞";
      if (this.likeStatusText) this.likeStatusText.textContent = "进行中";
      this.scheduleNextAutoLike();
      console.log("[AutoScroller] 随机点赞已开启");
    }

    stopAutoLike() {
      if (!this.autoLikeEnabled) return;
      this.autoLikeEnabled = false;
      this.likeToggleBtn.textContent = "开启随机点赞";
      if (this.likeStatusText) this.likeStatusText.textContent = "关闭";
      clearTimeout(this.autoLikeTimeout);
      this.autoLikeTimeout = null;
      console.log("[AutoScroller] 随机点赞已关闭");
    }

    scheduleNextAutoLike() {
      if (!this.autoLikeEnabled) return;
      const delayRange = Math.max(
        1000,
        this.likeMaxDelayMs - this.likeMinDelayMs
      );
      const delay =
        this.likeMinDelayMs + Math.floor(Math.random() * delayRange);
      clearTimeout(this.autoLikeTimeout);
      this.autoLikeTimeout = setTimeout(() => this.performRandomLike(), delay);
    }

    performRandomLike() {
      if (!this.autoLikeEnabled) return;

      const candidates = this.getCandidateLikeButtons();
      if (candidates.length === 0) {
        // 没有可点赞的，稍后再试
        this.scheduleNextAutoLike();
        return;
      }

      const randomIndex = Math.floor(Math.random() * candidates.length);
      const btn = candidates[randomIndex];

      // 尝试获取postId用于去重
      const postContainer = btn.closest("[data-post-id]");
      const postId =
        (postContainer && postContainer.getAttribute("data-post-id")) ||
        btn.dataset.postId ||
        null;
      if (postId && this.likedPostIds.has(postId)) {
        this.scheduleNextAutoLike();
        return;
      }

      try {
        btn.click();
        if (postId) this.likedPostIds.add(postId);
        console.log("[AutoScroller] 已点赞 post:", postId || "unknown");
      } catch (e) {
        console.warn("[AutoScroller] 点赞失败:", e);
      }

      this.scheduleNextAutoLike();
    }

    getCandidateLikeButtons() {
      // 兼容原生 Discourse 点赞 + discourse-reactions 插件的点赞按钮
      const nodeList = document.querySelectorAll(
        [
          // 原生 Discourse
          "button.toggle-like",
          "button.like",
          ".toggle-like.button",
          ".toggle-like",
          // discourse-reactions 插件（心形点赞）
          "button.btn-toggle-reaction-like",
          "button.reaction-button",
          ".discourse-reactions-reaction-button button",
        ].join(", ")
      );

      const buttons = Array.from(nodeList);
      const visibleAndEnabled = buttons.filter((btn) => {
        const isVisible = !!(btn.offsetParent !== null);
        const isDisabled = !!btn.disabled;
        const ariaPressed = btn.getAttribute("aria-pressed");
        const btnTitle = (btn.getAttribute("title") || "").toLowerCase();

        // 通过容器上的类名判断是否已点过赞（reactions 插件常见标记）
        const reactedContainer = btn.closest(
          ".discourse-reactions-actions.reacted, .discourse-reactions-actions.has-reaction, .can-toggle-reaction.reacted, .can-toggle-reaction.has-reaction"
        );

        // 综合判断“已点赞”状态（多重兜底，适配不同主题/语言）
        const isAlreadyLiked =
          ariaPressed === "true" ||
          btn.classList.contains("has-like") ||
          btn.classList.contains("liked") ||
          btn.classList.contains("selected") ||
          /取消|unlike/.test(btnTitle) ||
          !!reactedContainer;

        return isVisible && !isDisabled && !isAlreadyLiked;
      });

      // 去掉已经在本脚本记录中过的
      const filtered = visibleAndEnabled.filter((btn) => {
        const postContainer = btn.closest("[data-post-id]");
        const postId =
          (postContainer && postContainer.getAttribute("data-post-id")) ||
          btn.dataset.postId ||
          null;
        return !postId || !this.likedPostIds.has(postId);
      });

      return filtered;
    }

    updateScrollDelayFromInput() {
      if (!this.delayInput) return;
      const seconds = parseInt(this.delayInput.value, 10);
      const safeSeconds = Number.isFinite(seconds) && seconds > 0 ? seconds : Math.ceil(this.scrollDelay / 1000);
      // 回填纠正
      this.delayInput.value = String(safeSeconds);
      this.updateScrollDelay(safeSeconds * 1000);
    }

    updateScrollDelay(newDelayMs) {
      if (typeof newDelayMs !== "number" || newDelayMs <= 0) return;
      this.scrollDelay = newDelayMs;

      // 运行中重置主线程 interval
      if (this.isScrolling) {
        clearInterval(this.scrollInterval);
        this.scrollInterval = setInterval(() => this.performScroll(), this.scrollDelay);
      }

      // 通知 worker 刷新延迟
      if (this.worker) {
        this.worker.postMessage({ command: "updateDelay", delay: this.scrollDelay });
      }
    }

    // =============== Page Visibility API处理 ===============
    setupVisibilityHooks() {
      // 监听页面可见性变化
      document.addEventListener('visibilitychange', () => {
        this.isPageVisible = !document.hidden;
        console.log(`[AutoScroller] 页面可见性变化: ${this.isPageVisible ? '可见' : '隐藏'}`);
        
        // 如果正在滚动且页面变为隐藏，启用强制可见性
        if (this.isScrolling && !this.isPageVisible) {
          this.enableForceVisibility();
        } else if (this.isPageVisible && this.forceVisibility) {
          // 页面重新可见时，可以选择关闭强制模式（但保持开启以防再次切换）
          console.log('[AutoScroller] 页面重新可见，保持强制可见性模式');
        }
      });
    }

    enableForceVisibility() {
      if (this.forceVisibility) return;
      
      console.log('[AutoScroller] 启用强制页面可见性模式');
      this.forceVisibility = true;
      
      // 保存原始的document.hidden和visibilityState
      this.originalDocumentHidden = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden') || 
                                   Object.getOwnPropertyDescriptor(document, 'hidden');
      this.originalDocumentVisibilityState = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState') || 
                                           Object.getOwnPropertyDescriptor(document, 'visibilityState');

      // 重写document.hidden属性，始终返回false
      try {
        Object.defineProperty(document, 'hidden', {
          get: () => false,
          configurable: true
        });
        
        Object.defineProperty(document, 'visibilityState', {
          get: () => 'visible',
          configurable: true
        });
        
        console.log('[AutoScroller] 成功重写document.hidden和visibilityState');
      } catch (e) {
        console.warn('[AutoScroller] 无法重写document属性:', e);
        // 尝试在Document.prototype上重写
        try {
          Object.defineProperty(Document.prototype, 'hidden', {
            get: () => false,
            configurable: true
          });
          
          Object.defineProperty(Document.prototype, 'visibilityState', {
            get: () => 'visible',
            configurable: true
          });
          
          console.log('[AutoScroller] 成功在Document.prototype上重写属性');
        } catch (e2) {
          console.warn('[AutoScroller] 完全无法重写document属性:', e2);
        }
      }

      // 触发一个假的visibilitychange事件来"欺骗"可能监听的代码
      this.dispatchFakeVisibilityEvent();
    }

    disableForceVisibility() {
      if (!this.forceVisibility) return;
      
      console.log('[AutoScroller] 禁用强制页面可见性模式');
      this.forceVisibility = false;
      
      // 恢复原始的document.hidden和visibilityState
      try {
        if (this.originalDocumentHidden) {
          Object.defineProperty(document, 'hidden', this.originalDocumentHidden);
        } else {
          delete document.hidden;
        }
        
        if (this.originalDocumentVisibilityState) {
          Object.defineProperty(document, 'visibilityState', this.originalDocumentVisibilityState);
        } else {
          delete document.visibilityState;
        }
        
        console.log('[AutoScroller] 成功恢复document属性');
      } catch (e) {
        console.warn('[AutoScroller] 恢复document属性失败:', e);
      }
    }

    dispatchFakeVisibilityEvent() {
      // 派发一个假的visibilitychange事件，让页面认为变为可见
      setTimeout(() => {
        try {
          const event = new Event('visibilitychange', { bubbles: true, cancelable: false });
          document.dispatchEvent(event);
          console.log('[AutoScroller] 派发假visibilitychange事件');
        } catch (e) {
          console.warn('[AutoScroller] 派发visibilitychange事件失败:', e);
        }
      }, 100);
    }

    toggleForceVisibility() {
      if (this.forceVisibility) {
        this.disableForceVisibility();
        this.forceVisibilityBtn.textContent = "强制可见性: 关闭";
      } else {
        this.enableForceVisibility();
        this.forceVisibilityBtn.textContent = "强制可见性: 开启";
      }
    }
  }

  (function initAutoScroll() {
    function tryInit() {
      try {
        if (!document.body) {
          setTimeout(tryInit, 50);
          return;
        }
        new AutoScroller();
      } catch (e) {
        console.error("AutoScroll初始化失败:", e);
      }
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", tryInit);
    } else {
      setTimeout(tryInit, 0);
    }
  })();
})();
