const tg = window.Telegram?.WebApp;
      const APP_VERSION = "v2.8";
      if (tg) {
        tg.ready();
        tg.expand();
        const isTouchTelegramClient =
          window.matchMedia?.("(pointer: coarse)")?.matches ||
          /android|iphone|ipad|mobile/i.test(navigator.userAgent || "");
        if (isTouchTelegramClient) {
          tg.disableVerticalSwipes?.();
        }
      }

      document.addEventListener(
        "dblclick",
        (event) => {
          const isTouchDevice =
            window.matchMedia?.("(pointer: coarse)")?.matches ||
            navigator.maxTouchPoints > 0;
          if (isTouchDevice) event.preventDefault();
        },
        { passive: false }
      );

      document.addEventListener(
        "wheel",
        (event) => {
          if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
          const openModals = [...document.querySelectorAll(".modal:not(.hidden)")];
          const openModal = openModals[openModals.length - 1] || null;
          const pinOverlay = document.querySelector(".pin-gate-overlay");
          let scrollTarget = null;

          if (pinOverlay) {
            scrollTarget = pinOverlay;
          } else if (openModal?.classList.contains("fullscreen-modal")) {
            scrollTarget = openModal;
          } else if (openModal) {
            scrollTarget = openModal.querySelector(":scope > .panel") || openModal;
          } else {
            scrollTarget = document.scrollingElement;
          }

          if (!scrollTarget || scrollTarget.scrollHeight <= scrollTarget.clientHeight) return;
          const deltaMultiplier =
            event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
          scrollTarget.scrollTop += event.deltaY * deltaMultiplier;
          event.preventDefault();
        },
        { passive: false, capture: true }
      );

      const dayNames = [
        "Воскресенье",
        "Понедельник",
        "Вторник",
        "Среда",
        "Четверг",
        "Пятница",
        "Суббота"
      ];

      const positions = {
        owner: "Владелец",
        owner_manager: "Управляющий",
        senior_manager: "Старший менеджер",
        manager: "Менеджер",
        intern: "Стажер"
      };

      const reliabilities = {
        reliable: "Надежный",
        checking: "Проверяется",
        borderline: "На грани увольнения"
      };
      const userRoles = {
        SUPERADMIN: "Гл. Админ",
        ADMIN: "Админ",
        PARTICIPANT: "Участник"
      };
      const monthNamesRu = [
        "Январь",
        "Февраль",
        "Март",
        "Апрель",
        "Май",
        "Июнь",
        "Июль",
        "Август",
        "Сентябрь",
        "Октябрь",
        "Ноябрь",
        "Декабрь"
      ];
      const monthNamesGenitiveRu = [
        "января",
        "февраля",
        "марта",
        "апреля",
        "мая",
        "июня",
        "июля",
        "августа",
        "сентября",
        "октября",
        "ноября",
        "декабря"
      ];
      const deductionRules = [
        { code: "mess", title: "Беспорядок", fixed: -300, hint: "-300 рублей" },
        { code: "acceptance", title: "Приёмка", variable: true, hint: "Введите сумму удержания" },
        { code: "returns", title: "Возвраты", variable: true, hint: "Введите сумму удержания" },
        { code: "defect", title: "Брак", variable: true, hint: "Введите сумму удержания" },
        { code: "swap", title: "Подмена", variable: true, hint: "Введите сумму удержания" }
      ];
      const bonusRules = [
        { code: "urgent", title: "Экстренная замена", variable: true, hint: "Введите сумму доплаты" },
        { code: "inventory", title: "Инвентаризация", variable: true, hint: "Введите сумму доплаты" },
        { code: "general_cleaning", title: "Генеральная уборка", variable: true, hint: "Введите сумму доплаты" },
        { code: "basic_cleaning", title: "Базовая уборка после другого сотрудника", fixed: 300, hint: "+300 рублей" }
      ];

      const state = {
        telegramUser: null,
        user: null,
        telegramId: null,
        sessionId: "",
        locations: [],
        employees: [],
        employeeLocationOptions: [],
        currentEmployee: null,
        selectedLocation: null,
        selectedMonth: "",
        avatarNonce: String(Date.now()),
        scheduleViewMode: null,
        scheduleHeaderCleanup: null,
        activeTab: "home",
        theme: window.__PVZ_INITIAL_THEME__ === "dark" ? "dark" : "light",
        participantPreview: false,
        security: {
          pinState: null
        }
      };

      const screen = document.getElementById("screen");
      const appTitle = document.getElementById("appTitle");
      const bottomNav = document.getElementById("bottomNav");
      const globalImageViewer = document.getElementById("globalImageViewer");
      const globalImageViewerImage = document.getElementById("globalImageViewerImage");
      const globalDocumentViewerFrame = document.getElementById("globalDocumentViewerFrame");
      const closeGlobalImageViewer = () => {
        globalImageViewer.classList.add("hidden");
        globalImageViewerImage.removeAttribute("src");
        globalImageViewerImage.classList.remove("hidden");
        globalDocumentViewerFrame.removeAttribute("src");
        globalDocumentViewerFrame.classList.add("hidden");
      };
      document.getElementById("closeGlobalImageViewer").addEventListener("click", closeGlobalImageViewer);
      globalImageViewer.addEventListener("click", (event) => {
        if (event.target === globalImageViewer) closeGlobalImageViewer();
      });
      document.addEventListener("click", (event) => {
        const preview = event.target instanceof Element
          ? event.target.closest("[data-image-preview], [data-document-preview]")
          : null;
        if (!preview) return;
        const previewUrl = String(preview.dataset.imagePreview || preview.dataset.documentPreview || "").trim();
        if (!previewUrl) return;
        event.preventDefault();
        if (preview.dataset.documentPreview) {
          globalImageViewerImage.classList.add("hidden");
          globalDocumentViewerFrame.src = previewUrl;
          globalDocumentViewerFrame.classList.remove("hidden");
        } else {
          globalDocumentViewerFrame.classList.add("hidden");
          globalImageViewerImage.src = previewUrl;
          globalImageViewerImage.alt = String(preview.dataset.imageAlt || "Изображение документа");
          globalImageViewerImage.classList.remove("hidden");
        }
        globalImageViewer.classList.remove("hidden");
      });
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !globalImageViewer.classList.contains("hidden")) {
          closeGlobalImageViewer();
        }
      });
      const syncBottomNavClearance = () => {
        const hasNavigation = bottomNav.childElementCount > 0;
        const height = hasNavigation ? Math.ceil(bottomNav.getBoundingClientRect().height) : 0;
        document.body.classList.toggle("has-bottom-nav", hasNavigation);
        document.documentElement.style.setProperty("--bottom-nav-height", `${height}px`);
      };
      if (typeof ResizeObserver === "function") {
        new ResizeObserver(syncBottomNavClearance).observe(bottomNav);
      }
      if (typeof MutationObserver === "function") {
        new MutationObserver(() => requestAnimationFrame(syncBottomNavClearance)).observe(bottomNav, {
          childList: true
        });
      }
      window.addEventListener("resize", syncBottomNavClearance, { passive: true });
      const THEME_STORAGE_KEY = "pvz_theme";
      const SESSION_STORAGE_KEY = "pvz_session_id";
      const AUTH_ID_STORAGE_KEY = "pvz_auth_id";
      const ACTIVE_TAB_STORAGE_KEY = "pvz_active_tab";
      const PERSONAL_DATA_CONSENT_VERSION = "2026-08-08-v2";
      const interfaceIconPaths = [
        "/icons/back-arrow.png",
        "/icons/chevron_double_down_icon_143818.png",
        "/icons/chevron_double_up_icon_143815.png",
        "/icons/copy.png",
        "/icons/delete-bin.png",
        "/icons/employee-add.png",
        "/icons/employee-edit.png",
        "/icons/nav-employees.png",
        "/icons/nav-home.png",
        "/icons/nav-profile.png",
        "/icons/nav-schedule.png",
        "/icons/pin-delete.png",
        "/icons/pin-help.png",
        "/icons/pin-protection.png",
        "/icons/refresh-new.png",
        "/icons/right-arrow.png",
        "/icons/session-desktop.png",
        "/icons/session-mobile.png",
        "/icons/theme-night.png",
        "/icons/avatar-emojis/package.png",
        "/icons/avatar-emojis/store.png",
        "/icons/avatar-emojis/star.png",
        "/icons/avatar-emojis/rocket.png",
        "/icons/avatar-emojis/sunglasses.png",
        "/icons/avatar-emojis/bear.png",
        "/icons/avatar-emojis/fox.png",
        "/icons/avatar-emojis/panda.png",
        "/icons/avatar-emojis/briefcase.png",
        "/icons/avatar-emojis/crown.png",
        "/icons/avatar-emojis/coffee.png",
        "/icons/avatar-emojis/lightning.png"
      ];
      const preloadedInterfaceIcons = [];
      let interfaceIconPreloadScheduled = false;

      function scheduleInterfaceIconPreload() {
        if (interfaceIconPreloadScheduled) return;
        interfaceIconPreloadScheduled = true;
        const preload = () => {
          for (const path of interfaceIconPaths) {
            const image = new Image();
            image.decoding = "async";
            image.src = path;
            preloadedInterfaceIcons.push(image);
          }
        };
        if ("requestIdleCallback" in window) {
          window.requestIdleCallback(preload, { timeout: 2500 });
        } else {
          window.setTimeout(preload, 1200);
        }
      }

      function syncModalScrollLock() {
        const hasOpenModal = !!document.querySelector(".modal:not(.hidden), #securityPinFlowModal");
        document.body.classList.toggle("modal-open", hasOpenModal);
      }

      const modalLockObserver = new MutationObserver(() => {
        syncModalScrollLock();
      });
      modalLockObserver.observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["class"]
      });
      syncModalScrollLock();

      function applyTheme() {
        const isDark = state.theme === "dark";
        document.body.classList.toggle("theme-dark", isDark);
        document.documentElement.style.colorScheme = isDark ? "dark" : "light";
        document
          .getElementById("themeColorMeta")
          ?.setAttribute("content", isDark ? "#0a111d" : "#f8faff");
      }

      function setTheme(nextTheme, { persist = true } = {}) {
        state.theme = nextTheme === "dark" ? "dark" : "light";
        applyTheme();
        if (persist) {
          try {
            localStorage.setItem(THEME_STORAGE_KEY, state.theme);
          } catch {}
        }
      }

      function toggleTheme() {
        setTheme(state.theme === "dark" ? "light" : "dark");
      }

      const systemThemeQuery = window.matchMedia?.("(prefers-color-scheme: dark)");
      const syncUnsavedSystemTheme = (event) => {
        try {
          const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
          if (savedTheme === "dark" || savedTheme === "light") return;
        } catch {}
        setTheme(event.matches ? "dark" : "light", { persist: false });
      };
      if (typeof systemThemeQuery?.addEventListener === "function") {
        systemThemeQuery.addEventListener("change", syncUnsavedSystemTheme);
      } else if (typeof systemThemeQuery?.addListener === "function") {
        systemThemeQuery.addListener(syncUnsavedSystemTheme);
      }

      function setAppTitle(value) {
        if (!value) {
          appTitle.textContent = "";
          appTitle.classList.add("hidden");
          return;
        }
        appTitle.textContent = value;
        appTitle.classList.remove("hidden");
      }

      function showSavedFeedback(el, text = "Сохранено") {
        if (!el) return;
        el.textContent = text;
        el.classList.add("visible");
        if (el._saveFeedbackTimer) {
          window.clearTimeout(el._saveFeedbackTimer);
        }
        el._saveFeedbackTimer = window.setTimeout(() => {
          el.classList.remove("visible");
          el.textContent = "";
        }, 1600);
      }

      function showTextNotice(message, type = "info", duration = 3000) {
        let notice = document.getElementById("siteTextNotice");
        if (!notice) {
          notice = document.createElement("div");
          notice.id = "siteTextNotice";
          notice.setAttribute("role", "status");
          notice.setAttribute("aria-live", "polite");
          document.body.appendChild(notice);
        }
        notice.className = `site-text-notice ${type === "error" ? "error" : ""}`;
        notice.textContent = String(message || "");
        window.requestAnimationFrame(() => notice.classList.add("visible"));
        if (notice._hideTimer) window.clearTimeout(notice._hideTimer);
        notice._hideTimer = window.setTimeout(() => {
          notice.classList.remove("visible");
        }, duration);
      }

      function showAccessDenied() {
        showTextNotice("Недостаточно прав для раздела Сотрудники", "error");
      }

      function confirmAction(message, options = {}) {
        return new Promise((resolve) => {
          const modal = document.createElement("div");
          modal.className = "modal action-confirm-modal";
          modal.innerHTML = `
            <div class="action-confirm-card" role="dialog" aria-modal="true" aria-labelledby="actionConfirmTitle" aria-describedby="actionConfirmMessage">
              <h2 id="actionConfirmTitle" class="action-confirm-title"></h2>
              <p id="actionConfirmMessage" class="action-confirm-message"></p>
              <div class="action-confirm-actions">
                <button class="action-confirm-btn" type="button" data-confirm-result="cancel"></button>
                <button class="action-confirm-btn confirm ${options.danger ? "danger" : ""}" type="button" data-confirm-result="confirm"></button>
              </div>
            </div>
          `;
          modal.querySelector("#actionConfirmTitle").textContent = String(options.title || "Подтвердите действие");
          modal.querySelector("#actionConfirmMessage").textContent = String(message || "");
          const cancelButton = modal.querySelector('[data-confirm-result="cancel"]');
          const confirmButton = modal.querySelector('[data-confirm-result="confirm"]');
          cancelButton.textContent = String(options.cancelText || "Нет");
          confirmButton.textContent = String(options.confirmText || "Да");

          let finished = false;
          const finish = (result) => {
            if (finished) return;
            finished = true;
            document.removeEventListener("keydown", handleKeydown);
            modal.remove();
            syncModalScrollLock();
            resolve(result);
          };
          const handleKeydown = (event) => {
            if (event.key === "Escape") finish(false);
          };

          cancelButton.addEventListener("click", () => finish(false));
          confirmButton.addEventListener("click", () => finish(true));
          modal.addEventListener("click", (event) => {
            if (event.target === modal) finish(false);
          });
          document.addEventListener("keydown", handleKeydown);
          document.body.appendChild(modal);
          syncModalScrollLock();
          window.requestAnimationFrame(() => cancelButton.focus());
        });
      }

      let activePinKeyboardCleanup = null;

      function clearPinKeyboard() {
        activePinKeyboardCleanup?.();
        activePinKeyboardCleanup = null;
      }

      function bindPinKeyboard({ onDigit, onBackspace, onEnter }) {
        clearPinKeyboard();
        const handleKeydown = (event) => {
          if (event.ctrlKey || event.metaKey || event.altKey) return;
          const target = event.target;
          if (
            target instanceof HTMLElement &&
            (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
          ) {
            return;
          }
          if (/^\d$/.test(event.key)) {
            event.preventDefault();
            onDigit?.(event.key);
            return;
          }
          if (event.key === "Backspace" || event.key === "Delete") {
            event.preventDefault();
            onBackspace?.();
            return;
          }
          if (event.key === "Enter") {
            event.preventDefault();
            onEnter?.();
          }
        };
        document.addEventListener("keydown", handleKeydown);
        activePinKeyboardCleanup = () => document.removeEventListener("keydown", handleKeydown);
      }

      function openMonthPicker({ value, title = "Выберите месяц", onSelect }) {
        const selectedMatch = String(value || "").match(/^(\d{4})-(\d{2})$/);
        const now = new Date();
        const selectedYear = selectedMatch ? Number(selectedMatch[1]) : now.getFullYear();
        const selectedMonth = selectedMatch ? Number(selectedMatch[2]) : now.getMonth() + 1;
        let visibleYear = selectedYear;

        const modal = document.createElement("div");
        modal.className = "modal month-picker-modal";
        modal.innerHTML = `
          <div class="panel month-picker-panel" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
            <div class="month-picker-head">
              <h3 class="month-picker-title">${escapeHtml(title)}</h3>
              <button class="month-picker-close" type="button" aria-label="Закрыть">×</button>
            </div>
            <div class="month-picker-year-nav">
              <button class="month-picker-year-btn" type="button" data-year-step="-1" aria-label="Предыдущий год">‹</button>
              <div class="month-picker-year"></div>
              <button class="month-picker-year-btn" type="button" data-year-step="1" aria-label="Следующий год">›</button>
            </div>
            <div class="month-picker-grid"></div>
          </div>
        `;

        const close = () => {
          document.removeEventListener("keydown", handleKeydown);
          modal.remove();
        };
        const handleKeydown = (event) => {
          if (event.key === "Escape") close();
        };
        const renderMonths = () => {
          modal.querySelector(".month-picker-year").textContent = String(visibleYear);
          modal.querySelector(".month-picker-grid").innerHTML = monthNamesRu
            .map((name, index) => {
              const month = index + 1;
              const isSelected = visibleYear === selectedYear && month === selectedMonth;
              const isCurrent = visibleYear === now.getFullYear() && month === now.getMonth() + 1;
              return `
                <button
                  class="month-picker-option ${isCurrent ? "current" : ""} ${isSelected ? "selected" : ""}"
                  type="button"
                  data-month="${month}"
                >${escapeHtml(name)}</button>
              `;
            })
            .join("");

          for (const button of modal.querySelectorAll("[data-month]")) {
            button.addEventListener("click", () => {
              const month = String(Number(button.dataset.month)).padStart(2, "0");
              const nextValue = `${visibleYear}-${month}`;
              close();
              onSelect?.(nextValue);
            });
          }
        };

        modal.querySelector(".month-picker-close").addEventListener("click", close);
        for (const button of modal.querySelectorAll("[data-year-step]")) {
          button.addEventListener("click", () => {
            visibleYear += Number(button.dataset.yearStep || 0);
            renderMonths();
          });
        }
        modal.addEventListener("click", (event) => {
          if (event.target === modal) close();
        });
        document.addEventListener("keydown", handleKeydown);
        document.body.appendChild(modal);
        renderMonths();
      }

      function renderBottomNav(active = state.activeTab) {
        document.body.classList.remove("personal-finance-view");
        state.activeTab = active;
        if (["home", "schedule", "employees", "profile"].includes(active)) {
          try {
            localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, active);
          } catch {}
        }
        state.scheduleHeaderCleanup?.();
        state.scheduleHeaderCleanup = null;
        document.body.classList.remove("schedule-table-view");
        const showEmployeesTab = canManageEmployees();
        bottomNav.classList.toggle("three-tabs", !showEmployeesTab);
        bottomNav.innerHTML = `
          <button class="bottom-nav-btn ${active === "home" ? "active" : ""}" data-tab="home">
            <img class="bottom-nav-icon" src="/icons/nav-home.png" alt="Главная" />
            <span class="bottom-nav-label">Главная</span>
          </button>
          <button class="bottom-nav-btn ${active === "schedule" ? "active" : ""}" data-tab="schedule">
            <img class="bottom-nav-icon" src="/icons/nav-schedule.png" alt="График" />
            <span class="bottom-nav-label">График</span>
          </button>
          ${
            showEmployeesTab
              ? `<button class="bottom-nav-btn ${active === "employees" ? "active" : ""}" data-tab="employees">
                  <img class="bottom-nav-icon employees" src="/icons/nav-employees.png" alt="Сотрудники" />
                  <span class="bottom-nav-label">Сотрудники</span>
                </button>`
              : ""
          }
          <button class="bottom-nav-btn ${active === "profile" ? "active" : ""}" data-tab="profile">
            <img class="bottom-nav-icon" src="/icons/nav-profile.png" alt="Профиль" />
            <span class="bottom-nav-label">Профиль</span>
          </button>
        `;
        for (const btn of bottomNav.querySelectorAll("[data-tab]")) {
          btn.addEventListener("click", () => {
            const tab = btn.dataset.tab;
            if (tab === "home") {
              renderMain();
              return;
            }
            if (tab === "schedule") {
              renderLocations();
              return;
            }
            if (tab === "employees") {
              if (!canManageEmployees()) {
                showAccessDenied();
                return;
              }
              renderEmployeesBase();
              return;
            }
            if (tab === "profile") {
              renderProfile();
            }
          });
        }
      }

      function canManageEmployees() {
        if (state.participantPreview) return false;
        return state.user?.role === "ADMIN" || state.user?.role === "SUPERADMIN";
      }

      function canEditSchedule() {
        if (state.participantPreview) return false;
        return state.user?.role === "ADMIN" || state.user?.role === "SUPERADMIN";
      }

      function currentEmployeePosition() {
        return String(getCurrentEmployeeFromState()?.position || state.user?.position || "");
      }

      function isParticipantView() {
        return state.participantPreview || state.user?.role === "PARTICIPANT";
      }

      function canAccessFinance() {
        if (state.participantPreview) return false;
        return ["owner", "owner_manager"].includes(currentEmployeePosition());
      }

      function isPhoneClient() {
        const platform = String(tg?.platform || "").toLowerCase();
        if (platform === "ios" || platform === "android") return true;
        return window.matchMedia("(max-width: 860px)").matches;
      }

      async function ensureDesktopFullscreenForSchedule() {
        return;
      }

      function canEditEmployeeFromList(employee) {
        if (!state.user) return false;
        if (state.participantPreview) return false;
        if (state.user.role === "SUPERADMIN") return true;
        if (state.user.role === "ADMIN") {
          const normalize = (value) =>
            String(value || "")
              .replace(/\u00a0/g, " ")
              .replace(/\s+/g, " ")
              .trim()
              .toLowerCase();
          const isSelf =
            String(employee?.telegramId || "").trim() !== "" &&
            String(employee?.telegramId || "").trim() === String(state.user.telegramId || "").trim();
          const isSelfByName = normalize(employee?.fullName) && normalize(employee?.fullName) === normalize(state.user?.fullName);
          if (isSelf || isSelfByName) return true;
          return (employee?.accessRole || "PARTICIPANT") === "PARTICIPANT";
        }
        return false;
      }

      function getCurrentEmployeeFromState() {
        if (state.currentEmployee) return state.currentEmployee;
        const ownTelegramId = String(state.user?.telegramId || "").trim();
        if (!ownTelegramId) return null;
        const ownPhoneDigits = ownTelegramId.startsWith("phone:") ? ownTelegramId.slice("phone:".length) : "";
        const fromList = (state.employees || []).find(
          (emp) =>
            String(emp?.telegramId || "").trim() === ownTelegramId ||
            (ownPhoneDigits && onlyDigits(emp?.phone || "") === ownPhoneDigits)
        );
        return fromList || null;
      }

      function buildEmployeeAliases(employee) {
        const normalize = (value) =>
          String(value || "")
            .trim()
            .replace(/\s+/g, " ")
            .toLowerCase();
        const aliases = new Set();
        const fullName = normalize(employee?.fullName);
        const firstName = normalize(employee?.firstName);
        const lastName = normalize(employee?.lastName);
        const firstLast = normalize([firstName, lastName].filter(Boolean).join(" "));
        const lastFirst = normalize([lastName, firstName].filter(Boolean).join(" "));
        if (fullName) aliases.add(fullName);
        if (firstLast) aliases.add(firstLast);
        if (lastFirst) aliases.add(lastFirst);
        return aliases;
      }

      function employeeAssignedToShift(aliases, shiftRow) {
        const normalize = (value) =>
          String(value || "")
            .trim()
            .replace(/\s+/g, " ")
            .toLowerCase();
        const e1 = normalize(shiftRow?.executor1);
        const e2 = normalize(shiftRow?.executor2);
        return (e1 && aliases.has(e1)) || (e2 && aliases.has(e2));
      }

      function withAvatarCacheBust(url, nonce = state.avatarNonce) {
        const raw = String(url || "").trim();
        if (!raw) return "";
        const sep = raw.includes("?") ? "&" : "?";
        return `${raw}${sep}v=${encodeURIComponent(nonce)}`;
      }

      const CUSTOM_AVATAR_PREFIX = "pvz-avatar:";
      const avatarBackgrounds = ["ocean", "sunset", "forest", "violet", "graphite", "gold", "ice", "berry"];
      const avatarEmojis = ["📦", "🏪", "⭐", "🚀", "😎", "🐻", "🦊", "🐼", "💼", "👑", "☕", "⚡"];
      const avatarEmojiAssets = {
        "📦": "/icons/avatar-emojis/package.png",
        "🏪": "/icons/avatar-emojis/store.png",
        "⭐": "/icons/avatar-emojis/star.png",
        "🚀": "/icons/avatar-emojis/rocket.png",
        "😎": "/icons/avatar-emojis/sunglasses.png",
        "🐻": "/icons/avatar-emojis/bear.png",
        "🦊": "/icons/avatar-emojis/fox.png",
        "🐼": "/icons/avatar-emojis/panda.png",
        "💼": "/icons/avatar-emojis/briefcase.png",
        "👑": "/icons/avatar-emojis/crown.png",
        "☕": "/icons/avatar-emojis/coffee.png",
        "⚡": "/icons/avatar-emojis/lightning.png"
      };

      function renderAvatarEmojiImage(emoji) {
        const assetPath = avatarEmojiAssets[emoji] || avatarEmojiAssets["📦"];
        return `<img class="custom-avatar-emoji" src="${escapeHtml(assetPath)}" alt="${escapeHtml(emoji)}" draggable="false" />`;
      }

      function parseCustomAvatar(value) {
        const raw = String(value || "").trim();
        if (!raw.startsWith(CUSTOM_AVATAR_PREFIX)) return null;
        try {
          const parsed = JSON.parse(raw.slice(CUSTOM_AVATAR_PREFIX.length));
          if (!avatarBackgrounds.includes(parsed?.background) || !avatarEmojis.includes(parsed?.emoji)) {
            return null;
          }
          return { background: parsed.background, emoji: parsed.emoji };
        } catch {
          return null;
        }
      }

      function employeeAvatarAccent(avatarUrl) {
        const customAvatar = parseCustomAvatar(avatarUrl);
        if (customAvatar) return customAvatar.background;
        return String(avatarUrl || "").trim() ? "photo" : "ocean";
      }

      function renderUserAvatar({ avatarUrl, initials = "?", className, alt = "avatar", nonce = state.avatarNonce }) {
        const customAvatar = parseCustomAvatar(avatarUrl);
        if (customAvatar) {
          return `<div class="${escapeHtml(className)} custom-avatar avatar-bg-${escapeHtml(customAvatar.background)}" role="img" aria-label="${escapeHtml(alt)}">${renderAvatarEmojiImage(customAvatar.emoji)}</div>`;
        }
        const photo = withAvatarCacheBust(avatarUrl, nonce);
        if (photo) {
          return `<img class="${escapeHtml(className)}" src="${escapeHtml(photo)}" alt="${escapeHtml(alt)}" />`;
        }
        return `<div class="${escapeHtml(className)} placeholder">${escapeHtml(initials || "?")}</div>`;
      }

      function monthNow() {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      }

      function getTelegramUser() {
        const user = tg?.initDataUnsafe?.user;
        if (!user?.id) return null;
        const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
        return {
          telegramId: String(user.id),
          fullName: fullName || user.username || "Unknown User",
          username: user.username ? `@${user.username}` : "",
          photoUrl: user.photo_url || ""
        };
      }

      function escapeHtml(value) {
        return String(value ?? "")
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#39;");
      }

      function formatDateTime(value) {
        const raw = String(value || "").trim();
        if (!raw) return "—";
        const dt = new Date(raw);
        if (!Number.isFinite(dt.getTime())) return raw;
        return dt.toLocaleString("ru-RU", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit"
        });
      }

      function formatSessionDateTime(value) {
        const raw = String(value || "").trim();
        if (!raw) return "—";
        const dt = new Date(raw);
        if (!Number.isFinite(dt.getTime())) return raw;
        const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
        const today = startOfDay(new Date());
        const target = startOfDay(dt);
        const dayDiff = Math.round((today - target) / 86400000);
        const time = dt.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
        if (dayDiff === 0) return `Сегодня, ${time}`;
        if (dayDiff === 1) return `Вчера, ${time}`;
        return dt.toLocaleString("ru-RU", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit"
        });
      }

      function getSessionDeviceType(item) {
        const value = `${item?.platform || ""} ${item?.deviceName || ""} ${item?.userAgent || ""}`.toLowerCase();
        return /android|iphone|ipad|ios|mobile/.test(value) ? "mobile" : "desktop";
      }

      function renderLocationLabelHtml(value) {
        const raw = String(value || "");
        if (!raw.trim()) return "";
        return raw
          .split(",")
          .map((chunk) => {
            const part = chunk.trim();
            if (!part) return "";
            const lower = part.toLowerCase();
            if (lower.startsWith("ozon")) {
              const match = part.match(/^(ozon)\s+(.*)$/i);
              if (!match) return `<span class="location-label"><span class="brand-ozon">ozon</span></span>`;
              return `<span class="location-label"><span class="brand-ozon">${escapeHtml(match[1])}</span> ${escapeHtml(match[2])}</span>`;
            }
            if (lower.startsWith("wb")) {
              const match = part.match(/^(wb)\s+(.*)$/i);
              if (!match) return `<span class="location-label"><span class="brand-wb">wb</span></span>`;
              return `<span class="location-label"><span class="brand-wb">${escapeHtml(match[1])}</span> ${escapeHtml(match[2])}</span>`;
            }
            return escapeHtml(part);
          })
          .filter(Boolean)
          .join(", ");
      }

      async function api(path, options = {}) {
        const isFormData = options.body instanceof FormData;
        const headers = {
          ...(isFormData ? {} : { "Content-Type": "application/json" }),
          ...(options.headers || {})
        };
        if (state.telegramId) headers["x-auth-id"] = state.telegramId;
        if (state.sessionId) headers["x-session-id"] = state.sessionId;

        const response = await fetch(path, { ...options, headers });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          if (response.status === 423 && data?.pinRequired) {
            throw new Error("Требуется PIN-код");
          }
          throw new Error(data?.message || data?.error || "Ошибка API");
        }
        return data;
      }

      async function loadEmployees() {
        const data = await api("/api/employees");
        state.employees = data.employees || [];
        state.employeeLocationOptions = data.locations || state.employeeLocationOptions || [];
      }

      async function loadEmployeesSafe() {
        try {
          await loadEmployees();
        } catch (error) {
          const message = String(error?.message || "");
          if (
            message.includes("Недостаточно прав") ||
            message.includes("Insufficient permissions") ||
            message.includes("Forbidden")
          ) {
            state.employees = [];
            return;
          }
          throw error;
        }
      }

      async function bootstrapAfterAuth() {
        clearPinKeyboard();
        const todayIso = new Date(Date.now() - new Date().getTimezoneOffset() * 60 * 1000)
          .toISOString()
          .slice(0, 10);
        const overviewData = await api(`/api/schedule/me/overview?date=${todayIso}&limit=4`);
        state.locations = overviewData.locations || [];
        state.currentEmployee = overviewData.employee || null;
        let savedTab = "home";
        try {
          const storedTab = String(localStorage.getItem(ACTIVE_TAB_STORAGE_KEY) || "");
          if (["home", "schedule", "employees", "profile"].includes(storedTab)) {
            savedTab = storedTab;
          }
        } catch {}
        if (savedTab === "schedule") {
          renderLocations();
          return;
        }
        if (savedTab === "employees" && canManageEmployees()) {
          await renderEmployeesBase();
          return;
        }
        if (savedTab === "profile") {
          await renderProfile();
          return;
        }
        await renderMain(overviewData);
      }

      function renderEmailLogin() {
        clearPinKeyboard();
        setAppTitle("PVZ Group");
        bottomNav.innerHTML = "";
        let requestedEmail = "";
        let consentSessionId = "";
        screen.innerHTML = `
          <div class="login-panel">
            <div class="login-card">
              <h2 class="login-title">Вход для сотрудников</h2>
              <div id="siteLoginSubtitle" class="login-subtitle">Введите почту, которая указана в базе сотрудников.</div>
              <label for="siteLoginEmailInput">Электронная почта</label>
              <input id="siteLoginEmailInput" type="email" inputmode="email" autocomplete="email" placeholder="name@yandex.ru" />
              <div id="siteLoginCodeWrap" class="hidden">
                <label for="siteLoginCodeInput">Код из письма</label>
                <input id="siteLoginCodeInput" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6 цифр" />
              </div>
              <div id="siteLoginConsentWrap" class="login-consent">
                <input id="siteLoginConsentInput" class="login-consent-checkbox" type="checkbox" autocomplete="off" />
                <label class="login-consent-text" for="siteLoginConsentInput">
                  Я даю согласие на обработку моих персональных данных в целях регистрации, авторизации, защиты аккаунта, подтверждения действий и получения сервисных писем с кодами подтверждения в соответствии с
                  <a href="/privacy-consent.html" target="_blank" rel="noopener noreferrer">Согласием на обработку персональных данных</a>.
                </label>
              </div>
              <button id="siteLoginBtn" class="login-button" type="button">Получить код</button>
              <div id="siteLoginCodeActions" class="login-code-actions hidden">
                <button id="siteLoginResendBtn" class="login-code-action" type="button">Отправить код повторно</button>
                <button id="siteLoginChangeEmailBtn" class="login-code-action" type="button">Изменить почту</button>
              </div>
              <p id="siteLoginStatus" class="status mt12"></p>
            </div>
          </div>
        `;
        const input = document.getElementById("siteLoginEmailInput");
        const codeInput = document.getElementById("siteLoginCodeInput");
        const codeWrap = document.getElementById("siteLoginCodeWrap");
        const consentWrap = document.getElementById("siteLoginConsentWrap");
        const consentInput = document.getElementById("siteLoginConsentInput");
        const subtitle = document.getElementById("siteLoginSubtitle");
        const button = document.getElementById("siteLoginBtn");
        const codeActions = document.getElementById("siteLoginCodeActions");
        const resendButton = document.getElementById("siteLoginResendBtn");
        const changeEmailButton = document.getElementById("siteLoginChangeEmailBtn");
        const status = document.getElementById("siteLoginStatus");
        let step = "email";
        let resendTimerId = 0;
        let resendAvailableAt = 0;

        input?.addEventListener("input", () => {
          status.className = "status";
          status.textContent = "";
        });
        codeInput?.addEventListener("input", () => {
          codeInput.value = onlyDigits(codeInput.value).slice(0, 6);
          status.className = "status";
          status.textContent = "";
        });

        const setStep = (nextStep) => {
          step = nextStep;
          const isCode = step === "code";
          codeWrap?.classList.toggle("hidden", !isCode);
          consentWrap?.classList.toggle("hidden", isCode);
          codeActions?.classList.toggle("hidden", !isCode);
          input.disabled = isCode;
          button.textContent = isCode ? "Подтвердить" : "Получить код";
          subtitle.textContent = isCode
            ? `Введите код из письма, отправленного на ${requestedEmail}.`
            : "Введите почту, которая указана в базе сотрудников.";
          if (isCode) codeInput?.focus();
        };

        const stopResendTimer = () => {
          if (resendTimerId) window.clearInterval(resendTimerId);
          resendTimerId = 0;
        };

        const updateResendButton = () => {
          const seconds = Math.max(0, Math.ceil((resendAvailableAt - Date.now()) / 1000));
          resendButton.disabled = seconds > 0;
          resendButton.textContent = seconds > 0
            ? `Отправить повторно через ${seconds} сек.`
            : "Отправить код повторно";
          if (!seconds) stopResendTimer();
        };

        const startResendTimer = (seconds = 60) => {
          stopResendTimer();
          resendAvailableAt = Date.now() + seconds * 1000;
          updateResendButton();
          resendTimerId = window.setInterval(updateResendButton, 1000);
        };

        const requestCode = async () => {
          const isResend = step === "code";
          const email = String(input?.value || "").trim().toLowerCase();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            status.className = "status error";
            status.textContent = "Введите корректный адрес электронной почты";
            return;
          }
          if (!consentInput?.checked) {
            status.className = "status error";
            status.textContent = "Подтвердите согласие на обработку персональных данных";
            return;
          }
          button.disabled = true;
          if (isResend) resendButton.disabled = true;
          status.className = "status";
          status.textContent = "Отправляем код...";
          try {
            const data = await api("/api/auth/request-code", {
              method: "POST",
              body: JSON.stringify({
                email,
                consentAccepted: true,
                consentVersion: PERSONAL_DATA_CONSENT_VERSION,
                deviceName: navigator.platform || "device",
                platform: isPhoneClient() ? "mobile-web" : "desktop-web"
              })
            });
            requestedEmail = email;
            consentSessionId = String(data?.consentSessionId || "");
            setStep("code");
            startResendTimer(60);
            status.className = data?.devCode ? "status ok" : "status";
            status.textContent = data?.devCode
              ? `Тестовый код: ${data.devCode}`
              : "Код отправлен на почту";
          } catch (error) {
            status.className = "status error";
            status.textContent = String(error?.message || "Не удалось отправить код");
          } finally {
            button.disabled = false;
            if (isResend && Date.now() >= resendAvailableAt) {
              resendButton.disabled = false;
            }
          }
        };

        resendButton?.addEventListener("click", () => {
          if (Date.now() < resendAvailableAt) return;
          requestCode();
        });

        changeEmailButton?.addEventListener("click", () => {
          stopResendTimer();
          requestedEmail = "";
          consentSessionId = "";
          codeInput.value = "";
          setStep("email");
          input.disabled = false;
          status.className = "status";
          status.textContent = "";
          input.focus();
        });

        const confirmCode = async () => {
          const emailCode = onlyDigits(codeInput?.value || "");
          if (emailCode.length !== 6) {
            status.className = "status error";
            status.textContent = "Введите 6 цифр из письма";
            return;
          }
          button.disabled = true;
          status.className = "status";
          status.textContent = "Проверяем код...";
          try {
            const login = await api("/api/auth/login", {
              method: "POST",
              body: JSON.stringify({
                email: requestedEmail,
                emailCode,
                deviceName: navigator.platform || "device",
                platform: isPhoneClient() ? "mobile-web" : "desktop-web",
                consentSessionId
              })
            });
            state.user = login.user;
            state.telegramUser = null;
            state.telegramId = login.user.telegramId;
            state.sessionId = String(login?.session?.id || "");
            try {
              localStorage.setItem(SESSION_STORAGE_KEY, state.sessionId);
              localStorage.setItem(AUTH_ID_STORAGE_KEY, state.telegramId);
            } catch {}
            state.selectedMonth = monthNow();
            state.avatarNonce = String(Date.now());
            state.security.pinState = login?.security?.pinState || null;
            if (login?.security?.pinRequired) {
              renderPinGate(login?.security?.pinState || null);
              return;
            }
            if (!login?.security?.pinEnabled) {
              renderInitialPinSetup();
              return;
            }
            await bootstrapAfterAuth();
          } catch (error) {
            status.className = "status error";
            status.textContent = String(error?.message || "Не удалось войти");
          } finally {
            button.disabled = false;
          }
        };

        button?.addEventListener("click", () => {
          if (step === "code") {
            confirmCode();
            return;
          }
          requestCode();
        });
        input?.addEventListener("keydown", (event) => {
          if (event.key === "Enter") requestCode();
        });
        codeInput?.addEventListener("keydown", (event) => {
          if (event.key === "Enter") confirmCode();
        });
      }

      function renderInitialPinSetup() {
        setAppTitle("");
        bottomNav.innerHTML = "";
        let step = "new";
        let firstPin = "";
        let pinValue = "";
        let statusText = "";
        let statusClass = "";
        let busy = false;
        let shaking = false;

        const meta = () =>
          step === "new"
            ? {
                title: "Создайте PIN-код",
                subtitle: "Придумайте код из 4 цифр. Он будет запрашиваться при входе.",
                progress: "Шаг 1 из 2",
                button: "Продолжить",
                dotCount: 4
              }
            : {
                title: "Повторите PIN",
                subtitle: "Введите PIN ещё раз, чтобы мы точно не ошиблись.",
                progress: "Шаг 2 из 2",
                button: "Создать PIN",
                dotCount: 4
              };

        const renderDots = (dotCount) =>
          Array.from({ length: dotCount }, (_, index) => {
            const classes = ["pin-gate-dot"];
            if (index < pinValue.length) classes.push("filled");
            return `<span class="${classes.join(" ")}"></span>`;
          }).join("");

        const render = () => {
          const current = meta();
          const canContinue = isPinLengthValidGlobal(pinValue) && !busy;
          screen.innerHTML = `
            <div class="login-panel">
              <div class="login-card pin-setup-card">
                <div class="pin-gate-shield">
                  <img src="/icons/pin-protection.png" alt="Защита" />
                </div>
                <h2 class="login-title">${escapeHtml(current.title)}</h2>
                <div class="login-subtitle">${escapeHtml(current.subtitle)}</div>
                <div class="pin-modal-progress">${escapeHtml(current.progress)}</div>
                <div id="initialPinDots" class="pin-gate-dots ${shaking ? "shake" : ""}">
                  ${renderDots(current.dotCount)}
                </div>
                ${statusText ? `<p class="status ${statusClass} mt12" style="text-align:center;">${escapeHtml(statusText)}</p>` : ""}
                <div class="pin-gate-keypad">
                  <button class="pin-gate-key" data-initial-pin-key="1" type="button">1</button>
                  <button class="pin-gate-key" data-initial-pin-key="2" type="button">2</button>
                  <button class="pin-gate-key" data-initial-pin-key="3" type="button">3</button>
                  <button class="pin-gate-key" data-initial-pin-key="4" type="button">4</button>
                  <button class="pin-gate-key" data-initial-pin-key="5" type="button">5</button>
                  <button class="pin-gate-key" data-initial-pin-key="6" type="button">6</button>
                  <button class="pin-gate-key" data-initial-pin-key="7" type="button">7</button>
                  <button class="pin-gate-key" data-initial-pin-key="8" type="button">8</button>
                  <button class="pin-gate-key" data-initial-pin-key="9" type="button">9</button>
                  <div class="pin-gate-spacer" aria-hidden="true"></div>
                  <button class="pin-gate-key" data-initial-pin-key="0" type="button">0</button>
                  <button class="pin-gate-key" id="initialPinBackspaceBtn" type="button" aria-label="Удалить символ">
                    <img src="/icons/pin-delete.png" alt="" />
                  </button>
                </div>
                <button id="initialPinContinueBtn" class="login-button pin-modal-continue" type="button" ${canContinue ? "" : "disabled"}>
                  ${busy ? "Сохраняем..." : escapeHtml(current.button)}
                </button>
                <button id="initialPinSkipBtn" class="login-skip-button" type="button" ${busy ? "disabled" : ""}>
                  Ввести позже
                </button>
              </div>
            </div>
          `;

          for (const btn of screen.querySelectorAll("[data-initial-pin-key]")) {
            btn.addEventListener("click", () => {
              if (busy || pinValue.length >= 4) return;
              pinValue = normalizePinDigitsGlobal(pinValue + btn.dataset.initialPinKey);
              statusText = "";
              statusClass = "";
              render();
            });
          }

          document.getElementById("initialPinBackspaceBtn")?.addEventListener("click", () => {
            if (busy) return;
            pinValue = pinValue.slice(0, -1);
            statusText = "";
            statusClass = "";
            render();
          });

          document.getElementById("initialPinContinueBtn")?.addEventListener("click", continueSetup);
          document.getElementById("initialPinSkipBtn")?.addEventListener("click", async () => {
            if (busy) return;
            busy = true;
            render();
            try {
              await bootstrapAfterAuth();
            } catch (error) {
              busy = false;
              showError(String(error?.message || "Не удалось открыть приложение"));
            }
          });
          bindPinKeyboard({
            onDigit: (digit) =>
              screen.querySelector(`[data-initial-pin-key="${digit}"]`)?.click(),
            onBackspace: () => document.getElementById("initialPinBackspaceBtn")?.click(),
            onEnter: () => document.getElementById("initialPinContinueBtn")?.click()
          });
        };

        const showError = (message) => {
          statusText = message;
          statusClass = "error";
          shaking = true;
          render();
          window.setTimeout(() => {
            shaking = false;
            render();
          }, 340);
        };

        const continueSetup = async () => {
          if (busy) return;
          if (!isPinLengthValidGlobal(pinValue)) {
            showError("PIN должен состоять ровно из 4 цифр");
            return;
          }
          if (step === "new") {
            firstPin = pinValue;
            pinValue = "";
            statusText = "";
            statusClass = "";
            step = "repeat";
            render();
            return;
          }
          if (pinValue !== firstPin) {
            pinValue = "";
            step = "new";
            firstPin = "";
            showError("PIN и повтор не совпадают. Создайте PIN заново");
            return;
          }
          busy = true;
          render();
          try {
            const data = await api("/api/security/pin/enable", {
              method: "POST",
              body: JSON.stringify({ pin: firstPin })
            });
            state.security.pinState = data?.pinState || null;
            await bootstrapAfterAuth();
          } catch (error) {
            busy = false;
            showError(String(error?.message || "Не удалось создать PIN"));
          }
        };

        render();
      }

      function renderPinRecovery(maskedEmail = "") {
        clearPinKeyboard();
        setAppTitle("");
        let step = "code";
        let recoveryToken = "";
        let firstPin = "";
        let pinValue = "";
        let busy = false;
        let message = "";
        let messageClass = "";

        const recoveryMeta = () => {
          if (step === "new") {
            return { title: "Новый PIN", subtitle: "Придумайте код из 4 цифр", progress: "Шаг 2 из 3" };
          }
          return { title: "Повторите PIN", subtitle: "Введите новый PIN ещё раз", progress: "Шаг 3 из 3" };
        };

        const showError = (text) => {
          message = String(text || "Ошибка");
          messageClass = "error";
          render();
        };

        const completeRecovery = async () => {
          busy = true;
          render();
          try {
            const data = await api("/api/security/pin/recovery/complete", {
              method: "POST",
              body: JSON.stringify({ recoveryToken, newPin: firstPin })
            });
            state.security.pinState = data?.pinState || null;
            await bootstrapAfterAuth();
          } catch (error) {
            busy = false;
            pinValue = "";
            firstPin = "";
            step = "new";
            showError(error?.message || "Не удалось сохранить новый PIN");
          }
        };

        const acceptPinDigit = (digit) => {
          if (busy || !/^\d$/.test(String(digit || "")) || pinValue.length >= 4) return;
          message = "";
          messageClass = "";
          pinValue += digit;
          render();
          if (pinValue.length !== 4) return;
          window.setTimeout(async () => {
            if (step === "new") {
              firstPin = pinValue;
              pinValue = "";
              step = "repeat";
              render();
              return;
            }
            if (pinValue !== firstPin) {
              pinValue = "";
              firstPin = "";
              step = "new";
              showError("PIN-коды не совпадают. Введите новый PIN заново");
              return;
            }
            await completeRecovery();
          }, 180);
        };

        const bindRecoveryKeyboard = () => {
          bindPinKeyboard({
            onDigit: (digit) => acceptPinDigit(digit),
            onBackspace: () => {
              if (busy) return;
              pinValue = pinValue.slice(0, -1);
              render();
            }
          });
        };

        const render = () => {
          clearPinKeyboard();
          if (step === "code") {
            screen.innerHTML = `
              <div class="pin-gate-overlay">
                <div class="pin-gate-card pin-recovery-card">
                  <div class="pin-gate-head">
                    <span class="pin-recovery-progress">Шаг 1 из 3</span>
                    <button id="closePinRecoveryBtn" class="open-arrow-btn" type="button" aria-label="Назад">
                      <img src="/icons/back-arrow.png" alt="Назад" />
                    </button>
                  </div>
                  <div class="pin-gate-shield"><img src="/icons/pin-protection.png" alt="Защита" /></div>
                  <h3 class="pin-gate-title">Код из письма</h3>
                  <div class="pin-gate-subtitle">Отправили 6-значный код на ${escapeHtml(maskedEmail || "вашу почту")}</div>
                  <div class="pin-recovery-code-wrap">
                    <input id="pinRecoveryCodeInput" class="pin-recovery-code-input" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" />
                  </div>
                  <button id="verifyPinRecoveryCodeBtn" class="button pin-primary-btn pin-recovery-main-btn" type="button" ${busy ? "disabled" : ""}>Продолжить</button>
                  <button id="resendPinRecoveryCodeBtn" class="pin-gate-recovery-link pin-recovery-resend" type="button" ${busy ? "disabled" : ""}>Отправить код повторно</button>
                  <p class="status ${messageClass} mt12" style="text-align:center;">${escapeHtml(message)}</p>
                </div>
              </div>`;
            const input = document.getElementById("pinRecoveryCodeInput");
            input?.addEventListener("input", () => {
              input.value = onlyDigits(input.value).slice(0, 6);
            });
            input?.addEventListener("keydown", (event) => {
              if (event.key === "Enter") document.getElementById("verifyPinRecoveryCodeBtn")?.click();
            });
            input?.focus();
            document.getElementById("verifyPinRecoveryCodeBtn")?.addEventListener("click", async () => {
              const code = onlyDigits(input?.value || "");
              if (code.length !== 6) {
                showError("Введите 6 цифр из письма");
                return;
              }
              busy = true;
              message = "Проверяем код…";
              messageClass = "";
              render();
              try {
                const data = await api("/api/security/pin/recovery/verify-code", {
                  method: "POST",
                  body: JSON.stringify({ code })
                });
                recoveryToken = String(data?.recoveryToken || "");
                busy = false;
                message = "";
                step = "new";
                render();
              } catch (error) {
                busy = false;
                showError(error?.message || "Неверный код из письма");
              }
            });
            document.getElementById("resendPinRecoveryCodeBtn")?.addEventListener("click", async () => {
              busy = true;
              message = "Отправляем новый код…";
              messageClass = "";
              render();
              try {
                const data = await api("/api/security/pin/recovery/request", { method: "POST" });
                maskedEmail = String(data?.maskedEmail || maskedEmail);
                busy = false;
                message = "Новый код отправлен";
                messageClass = "ok";
                render();
              } catch (error) {
                busy = false;
                showError(error?.message || "Не удалось отправить код");
              }
            });
            document.getElementById("closePinRecoveryBtn")?.addEventListener("click", () => renderPinGate(state.security.pinState));
            return;
          }

          const meta = recoveryMeta();
          screen.innerHTML = `
            <div class="pin-gate-overlay">
              <div class="pin-gate-card pin-recovery-card">
                <div class="pin-gate-head">
                  <span class="pin-recovery-progress">${meta.progress}</span>
                  <button id="closePinRecoveryBtn" class="open-arrow-btn" type="button" aria-label="Назад"><img src="/icons/back-arrow.png" alt="Назад" /></button>
                </div>
                <div class="pin-gate-shield"><img src="/icons/pin-protection.png" alt="Защита" /></div>
                <h3 class="pin-gate-title">${meta.title}</h3>
                <div class="pin-gate-subtitle">${meta.subtitle}</div>
                <div class="pin-gate-dots">${Array.from({ length: 4 }).map((_, index) => `<span class="pin-gate-dot ${index < pinValue.length ? "filled" : ""}"></span>`).join("")}</div>
                <div class="pin-gate-keypad">
                  ${[1,2,3,4,5,6,7,8,9].map((digit) => `<button class="pin-gate-key" data-recovery-pin-key="${digit}" type="button" ${busy ? "disabled" : ""}>${digit}</button>`).join("")}
                  <div class="pin-gate-spacer" aria-hidden="true"></div>
                  <button class="pin-gate-key" data-recovery-pin-key="0" type="button" ${busy ? "disabled" : ""}>0</button>
                  <button class="pin-gate-key" id="pinRecoveryBackspaceBtn" type="button" aria-label="Удалить символ" ${busy ? "disabled" : ""}><img src="/icons/pin-delete.png" alt="Удалить" /></button>
                </div>
                <p class="status ${messageClass} mt12" style="text-align:center;">${escapeHtml(message)}</p>
              </div>
            </div>`;
          for (const button of screen.querySelectorAll("[data-recovery-pin-key]")) {
            button.addEventListener("click", () => acceptPinDigit(button.dataset.recoveryPinKey));
          }
          document.getElementById("pinRecoveryBackspaceBtn")?.addEventListener("click", () => {
            if (busy) return;
            pinValue = pinValue.slice(0, -1);
            render();
          });
          document.getElementById("closePinRecoveryBtn")?.addEventListener("click", () => renderPinGate(state.security.pinState));
          bindRecoveryKeyboard();
        };

        render();
      }

      function renderPinGate(pinState = null) {
        setAppTitle("");
        const pinLength = 4;
        const lockText = pinState?.lockedUntil
          ? `Вход заблокирован до ${formatDateTime(pinState.lockedUntil)}`
          : "";
        let pinValue = "";
        let verifying = false;
        let dotsState = "idle";
        screen.innerHTML = `
          <div class="pin-gate-overlay">
            <div class="pin-gate-card">
              <div class="pin-gate-head">
                <div style="width:24px;height:24px;"></div>
                <button id="pinGateCloseBtn" class="open-arrow-btn" type="button" aria-label="Закрыть">
                  <img src="/icons/back-arrow.png" alt="Закрыть" />
                </button>
              </div>
              <div class="pin-gate-shield">
                <img src="/icons/pin-protection.png" alt="Защита" />
              </div>
              <h3 class="pin-gate-title">Введите PIN-код</h3>
              <div class="pin-gate-subtitle">Для доступа к приложению введите ваш PIN-код</div>
              ${lockText ? `<p class="status error mt8" style="text-align:center;">${escapeHtml(lockText)}</p>` : ""}
              <div id="pinGateDots" class="pin-gate-dots"></div>
              <div class="pin-gate-keypad">
                <button class="pin-gate-key" data-pin-key="1" type="button">1</button>
                <button class="pin-gate-key" data-pin-key="2" type="button">2</button>
                <button class="pin-gate-key" data-pin-key="3" type="button">3</button>
                <button class="pin-gate-key" data-pin-key="4" type="button">4</button>
                <button class="pin-gate-key" data-pin-key="5" type="button">5</button>
                <button class="pin-gate-key" data-pin-key="6" type="button">6</button>
                <button class="pin-gate-key" data-pin-key="7" type="button">7</button>
                <button class="pin-gate-key" data-pin-key="8" type="button">8</button>
                <button class="pin-gate-key" data-pin-key="9" type="button">9</button>
                <div class="pin-gate-spacer" aria-hidden="true"></div>
                <button class="pin-gate-key" data-pin-key="0" type="button">0</button>
                <button class="pin-gate-key" id="pinGateBackspaceBtn" type="button" aria-label="Удалить символ">
                  <img src="/icons/pin-delete.png" alt="Удалить" />
                </button>
              </div>
              <p id="pinGateStatus" class="status mt12" style="text-align:center;"></p>
              <div class="pin-gate-foot">
                <button id="pinRecoveryRequestBtn" class="pin-gate-recovery-link" type="button">
                  <img src="/icons/pin-help.png" alt="Помощь" />
                  <span>Забыли PIN-код?</span>
                </button>
              </div>
            </div>
          </div>
        `;
        const dots = document.getElementById("pinGateDots");
        const status = document.getElementById("pinGateStatus");

        const setKeypadDisabled = (disabled) => {
          for (const btn of screen.querySelectorAll(".pin-gate-key")) {
            btn.disabled = disabled;
          }
          const recoveryBtn = document.getElementById("pinRecoveryRequestBtn");
          if (recoveryBtn) recoveryBtn.disabled = disabled;
        };

        const renderDots = () => {
          if (!dots) return;
          dots.innerHTML = Array.from({ length: pinLength })
            .map((_, index) => {
              const classes = ["pin-gate-dot"];
              if (index < pinValue.length) {
                classes.push("filled");
                if (dotsState === "success") classes.push("success");
                if (dotsState === "error") classes.push("error");
              }
              return `<span class="${classes.join(" ")}"></span>`;
            })
            .join("");
        };

        const verify = async () => {
          if (verifying) return;
          if (pinValue.length !== pinLength) {
            status.className = "status error";
            status.textContent = `Введите ${pinLength} цифры PIN`;
            return;
          }
          verifying = true;
          setKeypadDisabled(true);
          try {
            const data = await api("/api/security/pin/verify", {
              method: "POST",
              body: JSON.stringify({ pin: pinValue })
            });
            state.security.pinState = data?.pinState || null;
            dotsState = "success";
            renderDots();
            await new Promise((resolve) => setTimeout(resolve, 240));
            await bootstrapAfterAuth();
            return;
          } catch (error) {
            dotsState = "error";
            renderDots();
            status.className = "status error";
            status.textContent = String(error?.message || "Неверный PIN");
            await new Promise((resolve) => setTimeout(resolve, 360));
            pinValue = "";
            dotsState = "idle";
            renderDots();
            try {
              const stateData = await api("/api/security/state");
              state.security.pinState = stateData?.pinState || null;
            } catch {}
          } finally {
            verifying = false;
            setKeypadDisabled(false);
          }
        };

        for (const btn of screen.querySelectorAll("[data-pin-key]")) {
          btn.addEventListener("click", () => {
            if (verifying) return;
            const digit = btn.getAttribute("data-pin-key");
            if (!/^\d$/.test(String(digit || ""))) return;
            if (pinValue.length >= pinLength) return;
            dotsState = "idle";
            pinValue += digit;
            renderDots();
            status.className = "status";
            status.textContent = "";
            if (pinValue.length === pinLength) {
              verify();
            }
          });
        }
        document.getElementById("pinGateBackspaceBtn")?.addEventListener("click", () => {
          if (verifying) return;
          dotsState = "idle";
          pinValue = pinValue.slice(0, -1);
          renderDots();
        });
        bindPinKeyboard({
          onDigit: (digit) => screen.querySelector(`[data-pin-key="${digit}"]`)?.click(),
          onBackspace: () => document.getElementById("pinGateBackspaceBtn")?.click()
        });
        document.getElementById("pinRecoveryRequestBtn")?.addEventListener("click", async () => {
          try {
            setKeypadDisabled(true);
            status.className = "status";
            status.textContent = "Отправляем код на почту…";
            const data = await api("/api/security/pin/recovery/request", { method: "POST" });
            renderPinRecovery(String(data?.maskedEmail || ""));
          } catch (error) {
            setKeypadDisabled(false);
            status.className = "status error";
            status.textContent = String(error?.message || "Ошибка");
          }
        });
        document.getElementById("pinGateCloseBtn")?.addEventListener("click", async () => {
          await api("/api/auth/logout", { method: "POST" }).catch(() => {});
          state.sessionId = "";
          state.telegramId = "";
          try {
            localStorage.removeItem(SESSION_STORAGE_KEY);
            localStorage.removeItem(AUTH_ID_STORAGE_KEY);
            localStorage.removeItem(ACTIVE_TAB_STORAGE_KEY);
          } catch {}
          renderEmailLogin();
        });
        renderDots();
      }

      async function initApp() {
        try {
          try {
            const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
            if (savedTheme === "dark" || savedTheme === "light") {
              state.theme = savedTheme;
            }
          } catch {}
          applyTheme();
          setAppTitle("");
          screen.classList.remove("mt12");
          screen.innerHTML = `
            <div class="app-loader">
              <div class="app-loader-content">
                <img class="app-loader-logo" src="/icons/pvz-group-app-icon-192.png" alt="" />
                <div class="app-loader-brand">PVZ Group</div>
                <div class="app-loader-status">
                  <span class="app-loader-spinner" aria-hidden="true"></span>
                  <span>Подключаемся…</span>
                </div>
              </div>
            </div>
          `;
          state.telegramUser = null;

          try {
            const savedSessionId = String(localStorage.getItem(SESSION_STORAGE_KEY) || "").trim();
            const savedAuthId = String(localStorage.getItem(AUTH_ID_STORAGE_KEY) || "").trim();
            if (savedSessionId && savedAuthId) {
              state.telegramId = savedAuthId;
              state.sessionId = savedSessionId;
            }
            const sessionData = await api("/api/auth/session");
            state.user = sessionData?.user || null;
            state.security.pinState = sessionData?.security?.pinState || null;
            if (state.user) {
              state.telegramId = String(state.user.telegramId || "");
              state.sessionId = String(sessionData?.session?.id || "");
              try {
                localStorage.setItem(AUTH_ID_STORAGE_KEY, state.telegramId);
                localStorage.setItem(SESSION_STORAGE_KEY, state.sessionId);
              } catch {}
              state.selectedMonth = monthNow();
              state.avatarNonce = String(Date.now());
              if (sessionData?.security?.pinRequired) {
                renderPinGate(sessionData?.security?.pinState || null);
                return;
              }
              await bootstrapAfterAuth();
              return;
            }
          } catch {
            state.telegramId = "";
            state.sessionId = "";
            try {
              localStorage.removeItem(SESSION_STORAGE_KEY);
              localStorage.removeItem(AUTH_ID_STORAGE_KEY);
            } catch {}
          }
          renderEmailLogin();
        } catch (error) {
          screen.innerHTML = `<p class="status error">Ошибка: ${escapeHtml(error.message)}</p>`;
        }
      }

      async function renderMain(prefetchedOverview = null) {
        setAppTitle("");
        const currentEmployee = getCurrentEmployeeFromState();
        const avatarUrl = currentEmployee?.avatarUrl || "";
        const initials = (state.user?.fullName || "?")
          .split(" ")
          .filter(Boolean)
          .slice(0, 2)
          .map((w) => w[0]?.toUpperCase() || "")
          .join("");
        const todayIso = new Date(Date.now() - new Date().getTimezoneOffset() * 60 * 1000)
          .toISOString()
          .slice(0, 10);
        let shiftText = "Выходной";
        let overviewShift = "—";
        let overviewStatus = "Выходной";
        let todayCardTitle = "Сегодня выходной";
        let upcomingLines = ["Нет запланированных смен"];
        let todayTeamTitle = "";
        let todayTeamSub = "Пока вы не назначены на смену";
        let todayAssignments = [];
        let emptyShiftLines = ["Свободных смен на ближайшие 3 дня нет"];
        let positionLabel = positions[getCurrentEmployeeFromState()?.position] || "Сотрудник";
        let shiftDotClass = "off";
        const formatCountdown = (shiftDate, shiftStart) => {
          const dateValue = String(shiftDate || "").trim();
          const timeValue = String(shiftStart || "14:00").slice(0, 5);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue) || !/^\d{2}:\d{2}$/.test(timeValue)) {
            return "";
          }
          const target = new Date(`${dateValue}T${timeValue}:00`);
          const diff = target.getTime() - Date.now();
          if (!Number.isFinite(diff) || diff <= 0) return "";
          const totalHours = Math.floor(diff / (1000 * 60 * 60));
          const days = Math.floor(totalHours / 24);
          const hours = totalHours % 24;
          return `${days} д ${hours} ч`;
        };
        const formatUpcomingDate = (isoDate) => {
          const value = String(isoDate || "").trim();
          if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
          if (value === todayIso) return "Сегодня";
          const tomorrow = new Date(`${todayIso}T00:00:00`);
          tomorrow.setDate(tomorrow.getDate() + 1);
          const tomorrowIso = tomorrow.toISOString().slice(0, 10);
          if (value === tomorrowIso) {
            const [, month, day] = value.match(/^(\d{4})-(\d{2})-(\d{2})$/) || [];
            return `Завтра (${day}.${month})`;
          }
          const dateObj = new Date(`${value}T00:00:00`);
          return dateObj.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
        };
        const getCoworkerScheduleText = (assignment, withTodayPrefix = true) => {
          const coworker = String(assignment?.coworkerName || "").trim();
          if (!coworker) {
            return withTodayPrefix ? "Сегодня вы одни на смене" : "Вы одни на смене";
          }
          const ownStart = scheduleTimeToMinutes(assignment?.workStart);
          const ownEnd = scheduleTimeToMinutes(assignment?.workEnd);
          const coworkerStart = scheduleTimeToMinutes(assignment?.coworkerWorkStart);
          const coworkerEnd = scheduleTimeToMinutes(assignment?.coworkerWorkEnd);
          if (
            !Number.isFinite(ownStart) ||
            !Number.isFinite(ownEnd) ||
            !Number.isFinite(coworkerStart) ||
            !Number.isFinite(coworkerEnd)
          ) {
            return `${withTodayPrefix ? "Сегодня ваша смена" : "Смена"} с ${coworker}`;
          }
          const overlapStart = Math.max(ownStart, coworkerStart);
          const overlapEnd = Math.min(ownEnd, coworkerEnd);
          if (overlapStart >= overlapEnd) {
            if (ownEnd <= coworkerStart) {
              return `Вас сменит ${coworker} в ${scheduleMinutesToTime(coworkerStart)}`;
            }
            if (coworkerEnd <= ownStart) {
              return `Вы смените ${coworker} в ${scheduleMinutesToTime(ownStart)}`;
            }
            return withTodayPrefix ? "Сегодня вы работаете одни" : "В это время вы работаете одни";
          }
          if (overlapStart === ownStart && overlapEnd === ownEnd) {
            return `${withTodayPrefix ? "Сегодня ваша смена" : "Смена"} с ${coworker}`;
          }
          return `С ${scheduleMinutesToTime(overlapStart)} до ${scheduleMinutesToTime(overlapEnd)} с ${coworker}`;
        };
        try {
          const overviewData =
            prefetchedOverview ||
            (await api(`/api/schedule/me/overview?date=${todayIso}&limit=4`));
          if (Array.isArray(overviewData?.locations)) {
            state.locations = overviewData.locations;
          }
          const todayData = {
            employee: overviewData?.employee || null,
            assignments: overviewData?.assignments || []
          };
          const upcomingData = {
            shifts: overviewData?.upcomingShifts || []
          };
          if (todayData?.employee) {
            state.currentEmployee = todayData.employee;
            positionLabel = positions[todayData.employee?.position] || positionLabel;
          }
          todayAssignments = (Array.isArray(todayData.assignments) ? todayData.assignments : [])
            .slice()
            .sort((a, b) => {
              const aStart = scheduleTimeToMinutes(a?.workStart);
              const bStart = scheduleTimeToMinutes(b?.workStart);
              const startDiff =
                (Number.isFinite(aStart) ? aStart : Number.MAX_SAFE_INTEGER) -
                (Number.isFinite(bStart) ? bStart : Number.MAX_SAFE_INTEGER);
              if (startDiff) return startDiff;
              const aEnd = scheduleTimeToMinutes(a?.workEnd);
              const bEnd = scheduleTimeToMinutes(b?.workEnd);
              const endDiff =
                (Number.isFinite(aEnd) ? aEnd : Number.MAX_SAFE_INTEGER) -
                (Number.isFinite(bEnd) ? bEnd : Number.MAX_SAFE_INTEGER);
              if (endDiff) return endDiff;
              return String(a?.locationTitle || "").localeCompare(String(b?.locationTitle || ""), "ru");
            });
          if (todayAssignments.length === 1) {
            const one = todayAssignments[0];
            const time = `${one.workStart || "14:00"} - ${one.workEnd || "22:00"}`;
            shiftText = "Работаю";
            shiftDotClass = "on";
            overviewShift = time;
            overviewStatus = "Рабочий день";
            todayCardTitle = "Сегодня рабочий день";
            todayTeamTitle = getCoworkerScheduleText(one);
            todayTeamSub = one.locationTitle || "Ваша смена";
          } else if (todayAssignments.length > 1) {
            const first = todayAssignments[0];
            shiftText = "Работаю";
            shiftDotClass = "on";
            overviewShift = "";
            overviewStatus = `${first.workStart || "14:00"} - ${first.workEnd || "22:00"}`;
            todayCardTitle = "Сегодня рабочий день";
            todayTeamTitle = "";
            todayTeamSub = "";
          }
          const upcomingShifts = Array.isArray(upcomingData.shifts) ? upcomingData.shifts : [];
          if (!todayAssignments.length && upcomingShifts.length) {
            const nearestShift = upcomingShifts
              .slice()
              .sort((a, b) => {
                const aMs = new Date(`${String(a?.date || "")}T${String(a?.workStart || "14:00").slice(0, 5)}:00`).getTime();
                const bMs = new Date(`${String(b?.date || "")}T${String(b?.workStart || "14:00").slice(0, 5)}:00`).getTime();
                return aMs - bMs;
              })[0];
            const countdown = formatCountdown(nearestShift?.date, nearestShift?.workStart);
            if (countdown) {
              todayCardTitle = "До смены";
              overviewShift = countdown;
            }
            const nearestDateLabel = formatUpcomingDate(nearestShift?.date);
            const nearestLocation = String(nearestShift?.locationTitle || "").trim();
            const nearestCoworker = String(nearestShift?.coworkerName || "").trim();
            if (nearestCoworker) {
              todayTeamSub = `У вас будет смена с ${nearestCoworker}`;
            } else if (nearestDateLabel && nearestLocation) {
              todayTeamSub = "Вы будете одни на смене";
            }
          }
          const labels = upcomingShifts
            .map((item) => {
              const dateLabel = formatUpcomingDate(item?.date);
              const locationTitle = String(item?.locationTitle || "").trim();
              if (!dateLabel || !locationTitle) return "";
              return `${dateLabel} — ${locationTitle}`;
            })
            .filter(Boolean);
          if (labels.length) {
            upcomingLines = labels;
          }

          const groupedRows = (overviewData?.freeShifts || [])
            .map((item) => {
              const dateLabel = formatUpcomingDate(item?.date);
              const locationTitles = Array.isArray(item?.locationTitles)
                ? item.locationTitles.filter(Boolean)
                : [];
              if (!dateLabel || !locationTitles.length) return "";
              return `${dateLabel} — ${locationTitles.join("||")}`;
            })
            .filter(Boolean);
          if (groupedRows.length) {
            emptyShiftLines = groupedRows;
          }
        } catch {
          // fallback значения уже заданы
        }
        const emptyShiftLinesHtml = emptyShiftLines
          .map((line) => {
            const parts = String(line || "").split(" — ");
            if (parts.length < 2) {
              return `<div class="home-list-address">${renderLocationLabelHtml(line)}</div>`;
            }
            const dateLabel = parts[0] || "";
            const addrLabel = parts.slice(1).join(" — ");
            const addressLines = addrLabel.split("||").filter(Boolean);
            return `
              <div class="home-list-item">
                <div class="home-list-date">${escapeHtml(dateLabel)}</div>
                <div class="home-list-sep">—</div>
                <div class="home-list-address">
                  ${addressLines.map((item) => `<div class="home-list-address-line">${renderLocationLabelHtml(item)}</div>`).join("")}
                </div>
              </div>
            `;
          })
          .join("");
        const upcomingLinesHtml = upcomingLines
          .map((line) => {
            const parts = String(line || "").split(" — ");
            if (parts.length < 2) {
              return `<div class="home-list-address">${renderLocationLabelHtml(line)}</div>`;
            }
            const dateLabel = parts[0] || "";
            const addrLabel = parts.slice(1).join(" — ");
            return `
              <div class="home-list-item">
                <div class="home-list-date">${escapeHtml(dateLabel)}</div>
                <div class="home-list-sep">—</div>
                <div class="home-list-address">${renderLocationLabelHtml(addrLabel)}</div>
              </div>
            `;
          })
          .join("");
        const todayScheduleHtml =
          todayAssignments.length > 1
            ? `
              <div class="today-schedule">
                ${todayAssignments
                  .map(
                    (item) => `
                      <div class="today-schedule-row">
                        <div class="today-schedule-time">${escapeHtml(item?.workStart || "14:00")}–${escapeHtml(item?.workEnd || "22:00")}</div>
                        <div>
                          <div class="today-schedule-location">${renderLocationLabelHtml(item?.locationTitle || "ПВЗ")}</div>
                          <div class="today-schedule-team">${escapeHtml(getCoworkerScheduleText(item, false))}</div>
                        </div>
                      </div>
                    `
                  )
                  .join("")}
              </div>
            `
            : "";
        const canUseParticipantPreview = currentEmployeePosition() === "owner";
        screen.innerHTML = `
          <div class="home-shell">
            <div class="home-top-grid">
              <div class="dash-user" id="openProfileFromMain">
                ${renderUserAvatar({ avatarUrl, initials, className: "dash-avatar", alt: "Аватар сотрудника" })}
                <div>
                  <div style="font-size:20px;"><strong>${escapeHtml((state.user.fullName || "").split(" ")[0] || state.user.fullName)}</strong></div>
                  <div class="main-position-row">
                    <div class="muted">Должность: <strong>${escapeHtml(positionLabel)}</strong></div>
                    ${
                      canUseParticipantPreview
                        ? `<button id="participantPreviewBtn" class="participant-preview-btn ${state.participantPreview ? "active" : ""}" type="button">${
                            state.participantPreview ? "Вернуться к владельцу" : "Просмотр участника"
                          }</button>`
                        : ""
                    }
                  </div>
                  <div class="muted mt8"><span class="dash-dot ${escapeHtml(shiftDotClass)}"></span> ${escapeHtml(shiftText)}</div>
                </div>
                <img class="dash-arrow" src="/icons/right-arrow.png" alt="Открыть" />
              </div>
              <button class="my-finances-home-btn" id="openMyFinancesBtn" type="button">
                <span>Мои финансы</span>
              </button>
            </div>
            <div class="overview-grid mt16">
              <div class="overview-card blue">
                <h3>${escapeHtml(todayCardTitle)}</h3>
                ${overviewShift ? `<div class="big">${escapeHtml(overviewShift)}</div>` : ""}
                ${todayTeamTitle ? `<div class="home-main-note">${escapeHtml(todayTeamTitle)}</div>` : ""}
                ${todayTeamSub ? `<div class="home-sub-note">${escapeHtml(todayTeamSub)}</div>` : ""}
                ${todayScheduleHtml}
              </div>
              <div class="overview-card green">
                <h3>Ваши ближайшие смены</h3>
                <div class="home-list">${upcomingLinesHtml}</div>
              </div>
            </div>
            <div class="warn-banner mt12">
              <div><strong>Свободные смены</strong></div>
              <div class="home-list">${emptyShiftLinesHtml}</div>
            </div>
          </div>
        `;
        renderBottomNav("home");
        document.getElementById("openProfileFromMain")?.addEventListener("click", () => {
          renderProfile();
        });
        document.getElementById("openMyFinancesBtn")?.addEventListener("click", () => {
          renderMyFinances();
        });
        document.getElementById("participantPreviewBtn")?.addEventListener("click", (event) => {
          event.stopPropagation();
          state.participantPreview = !state.participantPreview;
          renderMain();
        });
      }

      async function renderMyFinances() {
        setAppTitle("");
        renderBottomNav("home");
        document.body.classList.add("personal-finance-view");
        let selectedMonth = monthNow();
        const expandedSections = new Set();

        screen.innerHTML = `
          <div class="personal-finance-head">
            <button class="back-icon-btn" id="closeMyFinancesBtn" type="button" aria-label="Назад">
              <img src="/icons/back-arrow.png" alt="Назад" />
            </button>
            <h2>Мои финансы</h2>
          </div>
          <div class="finance-month-control mt16" style="max-width:340px;">
            <span>Отчетный месяц</span>
            <button class="month-picker-trigger" id="myFinanceMonthBtn" type="button"></button>
          </div>
          <p id="myFinanceStatus" class="status mt12">Загрузка...</p>
          <div id="myFinanceContent"></div>
          <div id="myFinancePhotoViewer" class="personal-finance-photo-viewer hidden" role="dialog" aria-modal="true" aria-label="Просмотр фотографии">
            <div class="personal-finance-photo-viewer-card">
              <button id="closeMyFinancePhotoViewer" class="personal-finance-photo-close" type="button" aria-label="Закрыть">×</button>
              <img id="myFinancePhotoViewerImage" alt="Фото подтверждения" />
            </div>
          </div>
        `;

        const monthButton = document.getElementById("myFinanceMonthBtn");
        const status = document.getElementById("myFinanceStatus");
        const content = document.getElementById("myFinanceContent");
        const photoViewer = document.getElementById("myFinancePhotoViewer");
        const photoViewerImage = document.getElementById("myFinancePhotoViewerImage");
        const closePhotoViewerButton = document.getElementById("closeMyFinancePhotoViewer");
        let cachedFinanceData = null;
        monthButton.textContent = formatMonthYear(selectedMonth);
        const shortFinanceDate = (isoDate) => {
          const [year, month, day] = String(isoDate || "").split("-");
          return year && month && day ? `${day}.${month}.${year.slice(-2)}` : "";
        };

        const closeFinancePhotoViewer = () => {
          photoViewer.classList.add("hidden");
          photoViewerImage.removeAttribute("src");
        };
        content.addEventListener("click", (event) => {
          const photoButton = event.target.closest("[data-my-finance-photo]");
          if (!photoButton) return;
          const photoUrl = String(photoButton.dataset.myFinancePhoto || "");
          if (!photoUrl.startsWith("/api/schedule/attachments/")) return;
          photoViewerImage.src = photoUrl;
          photoViewer.classList.remove("hidden");
        });
        closePhotoViewerButton.addEventListener("click", closeFinancePhotoViewer);
        photoViewer.addEventListener("click", (event) => {
          if (event.target === photoViewer) closeFinancePhotoViewer();
        });

        const displayPaidAt = (value) => {
          if (!value) return "";
          const date = new Date(String(value).replace(" ", "T") + (String(value).includes("Z") ? "" : "Z"));
          if (Number.isNaN(date.getTime())) return "";
          return date.toLocaleString("ru-RU", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
          });
        };
        const workedTimeLabel = (shift) => {
          const minutes = Math.max(0, Number(shift.workedMinutes || 0));
          const hours = Math.floor(minutes / 60);
          const restMinutes = minutes % 60;
          const duration = restMinutes ? `${hours} ч ${restMinutes} мин` : `${hours} ч`;
          if (!shift.workStart || !shift.workEnd) return duration;
          return `${escapeHtml(shift.workStart)}–${escapeHtml(shift.workEnd)} · ${duration}`;
        };
        const financeItemHtml = ({
          title,
          meta,
          eyebrow = "",
          reasonDetail = "",
          amount,
          amountClass = "",
          attachmentIds = []
        }) => `
          <div class="personal-finance-item">
            <div class="personal-finance-item-main">
              ${eyebrow ? `<div class="personal-finance-item-eyebrow">${escapeHtml(eyebrow)}</div>` : ""}
              <div class="personal-finance-item-title">${title}</div>
              <div class="personal-finance-item-meta">${meta}</div>
              ${
                reasonDetail
                  ? `<div class="personal-finance-item-reason"><strong>Причина:</strong> ${escapeHtml(reasonDetail)}</div>`
                  : ""
              }
              ${
                attachmentIds.length
                  ? `<div class="adjust-photo-list">${attachmentIds
                      .map(
                        (id) => `
                          <button
                            class="adjust-photo personal-finance-photo-button"
                            type="button"
                            data-my-finance-photo="/api/schedule/attachments/${escapeHtml(id)}"
                            aria-label="Открыть фото подтверждения"
                          >
                            <img src="/api/schedule/attachments/${escapeHtml(
                              id
                            )}" alt="Фото подтверждения" loading="lazy" />
                          </button>
                        `
                      )
                      .join("")}</div>`
                  : ""
              }
            </div>
            <div class="personal-finance-item-amount ${amountClass}">${amount}</div>
          </div>
        `;
        const sectionHtml = ({ key, title, caption, amount, amountClass, details }) => {
          const expanded = expandedSections.has(key);
          return `
            <section class="personal-finance-section">
              <button class="personal-finance-summary" type="button" data-my-finance-section="${key}">
                <div class="personal-finance-summary-title">
                  ${escapeHtml(title)}
                  <span>${escapeHtml(caption)}</span>
                </div>
                <div class="personal-finance-summary-amount ${amountClass || ""}">${amount}</div>
                <img
                  class="personal-finance-chevron"
                  src="${expanded ? "/icons/chevron_double_up_icon_143815.png" : "/icons/chevron_double_down_icon_143818.png"}"
                  alt="${expanded ? "Свернуть" : "Развернуть"}"
                />
              </button>
              <div class="personal-finance-details ${expanded ? "" : "hidden"}">
                ${details || `<div class="muted">За выбранный месяц данных нет.</div>`}
              </div>
            </section>
          `;
        };

        const load = async (refresh = true) => {
          if (refresh) {
            status.className = "status mt12";
            status.textContent = "Загрузка...";
            content.innerHTML = "";
          }
          try {
            const data = refresh
              ? await api(`/api/schedule/me/finances?month=${selectedMonth}`)
              : cachedFinanceData;
            if (!data) return;
            cachedFinanceData = data;
            const periodFrom = String(data.period?.from || "");
            const periodTo = String(data.period?.to || "");
            const financePeriodText = periodTo
              ? `Статистика с ${shortFinanceDate(periodFrom)} до ${shortFinanceDate(periodTo)}`
              : "За выбранный период начислений пока нет";
            const summary = data.summary || {};
            const shifts = Array.isArray(data.shifts) ? data.shifts : [];
            const shiftDetails = shifts
              .map((shift) =>
                financeItemHtml({
                  title: `${escapeHtml(ruDate(shift.date))} · ${renderLocationLabelHtml(shift.locationTitle)}`,
                  meta: `${workedTimeLabel(shift)} · ставка за день ${formatMoneyUnsigned(
                    shift.dailyRate
                  )}`,
                  amount: formatMoneyUnsigned(shift.salary)
                })
              )
              .join("");
            const deductionDetails = shifts
              .flatMap((shift) =>
                (shift.deductionItems || []).map((item) => ({ shift, item }))
              )
              .map(({ shift, item }) =>
                financeItemHtml({
                  eyebrow: "Причина удержания",
                  title: escapeHtml(item.reason || "Не указана"),
                  meta: `${escapeHtml(ruDate(shift.date))} · ${renderLocationLabelHtml(shift.locationTitle)}`,
                  reasonDetail: item.description || "",
                  amount: `−${formatMoneyUnsigned(item.amount)}`,
                  amountClass: "negative",
                  attachmentIds: Array.isArray(item.attachmentIds) ? item.attachmentIds : []
                })
              )
              .join("");
            const bonusDetails = shifts
              .flatMap((shift) => (shift.bonusItems || []).map((item) => ({ shift, item })))
              .map(({ shift, item }) =>
                financeItemHtml({
                  eyebrow: "Причина доплаты",
                  title: escapeHtml(item.reason || "Не указана"),
                  meta: `${escapeHtml(ruDate(shift.date))} · ${renderLocationLabelHtml(shift.locationTitle)}`,
                  reasonDetail: item.description || "",
                  amount: `+${formatMoneyUnsigned(item.amount)}`,
                  amountClass: "positive",
                  attachmentIds: Array.isArray(item.attachmentIds) ? item.attachmentIds : []
                })
              )
              .join("");
            const paymentDetails = shifts
              .filter((shift) => shift.payment)
              .map((shift) =>
                financeItemHtml({
                  title: `Оплата смены ${escapeHtml(ruDate(shift.date))}`,
                  meta: `${renderLocationLabelHtml(shift.locationTitle)}${
                    shift.payment.paidAt
                      ? ` · Выплачено ${escapeHtml(displayPaidAt(shift.payment.paidAt))}`
                      : ""
                  }`,
                  amount: formatMoneyUnsigned(shift.payment.amount),
                  amountClass: "positive"
                })
              )
              .join("");

            const sections = [
              {
                key: "shifts",
                title: "Смены",
                caption: `${Number(summary.shiftCount || 0)} смен`,
                amount: formatMoneyUnsigned(summary.salary),
                details: shiftDetails
              },
              {
                key: "deductions",
                title: "Удержания",
                caption: "Удержания за месяц",
                amount: `−${formatMoneyUnsigned(summary.deductions)}`,
                amountClass: "negative",
                details: deductionDetails
              },
              {
                key: "bonuses",
                title: "Доплаты",
                caption: "Доплаты за месяц",
                amount: `+${formatMoneyUnsigned(summary.bonuses)}`,
                amountClass: "positive",
                details: bonusDetails
              },
              {
                key: "paid",
                title: "Выплачено",
                caption: "Оплаченные смены",
                amount: formatMoneyUnsigned(summary.paid),
                amountClass: "positive",
                details: paymentDetails
              }
            ];

            content.innerHTML = `
              <div class="personal-finance-balance">
                <div class="personal-finance-balance-main">
                  <div class="personal-finance-balance-label">Текущий баланс</div>
                  <div class="personal-finance-balance-value">${formatPayoutBalance(summary.balance)}</div>
                  <div class="personal-finance-balance-note">
                    Начислено за месяц: ${formatMoneyUnsigned(summary.accrued)}
                    <br />Зарплата + доплаты − удержания − выплачено
                  </div>
                </div>
                <div class="personal-finance-balance-period">${escapeHtml(financePeriodText)}</div>
              </div>
              <div class="personal-finance-sections">
                ${sections.map(sectionHtml).join("")}
              </div>
            `;
            status.textContent = "";
            for (const button of content.querySelectorAll("[data-my-finance-section]")) {
              button.addEventListener("click", () => {
                const key = String(button.dataset.myFinanceSection || "");
                if (expandedSections.has(key)) expandedSections.delete(key);
                else expandedSections.add(key);
                load(false);
              });
            }
          } catch (error) {
            status.className = "status error mt12";
            status.textContent = `Ошибка: ${error.message}`;
          }
        };

        document.getElementById("closeMyFinancesBtn").addEventListener("click", renderMain);
        monthButton.addEventListener("click", () => {
          openMonthPicker({
            value: selectedMonth,
            title: "Отчетный месяц",
            onSelect: (nextMonth) => {
              selectedMonth = nextMonth;
              monthButton.textContent = formatMonthYear(selectedMonth);
              expandedSections.clear();
              cachedFinanceData = null;
              load();
            }
          });
        });
        await load();
      }

      async function renderProfile() {
        setAppTitle("");
        const todayIso = new Date(Date.now() - new Date().getTimezoneOffset() * 60 * 1000)
          .toISOString()
          .slice(0, 10);
        let employeeProfile = getCurrentEmployeeFromState();
        try {
          const todayData = await api(`/api/schedule/me/today?date=${todayIso}`);
          if (todayData?.employee) {
            state.currentEmployee = todayData.employee;
            employeeProfile = todayData.employee;
          }
        } catch {}
        const roleLabel = state.participantPreview
          ? userRoles.PARTICIPANT
          : userRoles[state.user.role] || state.user.role;
        const positionLabel = positions[employeeProfile?.position] || "Сотрудник";
        let profileStats = {
          current: { shifts: 0, violations: 0, bonuses: 0, income: 0 },
          previous: { shifts: 0, violations: 0, bonuses: 0, income: 0 }
        };
        let profileStatsPeriod = "";
        try {
          const currentMonth = monthNow();
          const [year, month] = currentMonth.split("-").map(Number);
          const previousDate = new Date(year, month - 2, 1);
          const previousMonth = `${previousDate.getFullYear()}-${String(
            previousDate.getMonth() + 1
          ).padStart(2, "0")}`;
          const currentDay = Number(todayIso.slice(-2));
          const previousMonthLastDay = new Date(year, month - 1, 0).getDate();
          const previousCutoff = `${previousMonth}-${String(
            Math.min(currentDay, previousMonthLastDay)
          ).padStart(2, "0")}`;
          const [currentFinance, previousFinance] = await Promise.all([
            api(`/api/schedule/me/finances?month=${currentMonth}`),
            api(`/api/schedule/me/finances?month=${previousMonth}`)
          ]);
          const getStats = (finance, cutoffDate) => {
            const shifts = (Array.isArray(finance?.shifts) ? finance.shifts : []).filter(
              (shift) => !cutoffDate || String(shift.date || "") <= cutoffDate
            );
            return {
              shifts: shifts.length,
              income: shifts.reduce((sum, shift) => sum + Number(shift.accrued || 0), 0),
              violations: shifts.reduce(
                (sum, shift) => sum + (Array.isArray(shift.deductionItems) ? shift.deductionItems.length : 0),
                0
              ),
              bonuses: shifts.reduce(
                (sum, shift) => sum + (Array.isArray(shift.bonusItems) ? shift.bonusItems.length : 0),
                0
              )
            };
          };
          profileStats = {
            current: getStats(currentFinance, todayIso),
            previous: getStats(previousFinance, previousCutoff)
          };
          const [currentYear, currentMonthNumber] = currentMonth.split("-");
          profileStatsPeriod = `Статистика с 01.${currentMonthNumber}.${currentYear.slice(
            -2
          )} до ${todayIso.slice(8, 10)}.${todayIso.slice(5, 7)}.${todayIso.slice(2, 4)}`;
        } catch {}
        const statTrend = (current, previous, lowerIsBetter = false) => {
          const currentValue = Number(current || 0);
          const previousValue = Number(previous || 0);
          if (currentValue === previousValue) {
            return { text: "Без изменений", className: "" };
          }
          if (previousValue === 0) {
            return {
              text: "Новый результат",
              className: lowerIsBetter ? "negative" : "positive"
            };
          }
          const percent = Math.round((Math.abs(currentValue - previousValue) / previousValue) * 100);
          const increased = currentValue > previousValue;
          const isPositive = lowerIsBetter ? !increased : increased;
          return {
            text: `На ${percent}% ${increased ? "больше" : "меньше"}, чем в прошлом месяце`,
            className: isPositive ? "positive" : "negative"
          };
        };
        const shiftsTrend = statTrend(profileStats.current.shifts, profileStats.previous.shifts);
        const violationsTrend = statTrend(
          profileStats.current.violations,
          profileStats.previous.violations,
          true
        );
        const bonusesTrend = statTrend(profileStats.current.bonuses, profileStats.previous.bonuses);
        const incomeTrend = statTrend(profileStats.current.income, profileStats.previous.income);
        const avatarUrl = employeeProfile?.avatarUrl || "";
        const customAvatar = parseCustomAvatar(avatarUrl) || { background: "ocean", emoji: "📦" };
        const initials = (state.user?.fullName || "?")
          .split(" ")
          .filter(Boolean)
          .slice(0, 2)
          .map((w) => w[0]?.toUpperCase() || "")
          .join("");
        const canOpenAdminPanel = canManageEmployees();
        const canViewSystemJournal = canOpenAdminPanel;
        screen.innerHTML = `
          <div class="profile-hero">
            <button id="openAvatarEditorBtn" class="profile-avatar-button" type="button" aria-label="Изменить аватар">
              ${renderUserAvatar({ avatarUrl, initials, className: "dash-avatar", alt: "Аватар профиля" })}
              <span class="profile-avatar-edit-badge" aria-hidden="true">✎</span>
            </button>
            <div>
              <div style="font-size:22px;"><strong>${escapeHtml(state.user.fullName)}</strong></div>
              <div style="font-size:15px; margin-top:4px; opacity:0.95;">Должность: ${escapeHtml(positionLabel)}</div>
              <div class="profile-badge">${escapeHtml(roleLabel)}</div>
              <div class="profile-phone">Телефон: ${escapeHtml(employeeProfile?.phone || "не указан")}</div>
            </div>
            <button id="logoutAccountBtn" class="profile-logout-btn" type="button">Выйти из аккаунта</button>
          </div>
          <div class="profile-dashboard-grid mt12">
            <div class="panel profile-stats-panel">
              <h3 class="panel-title profile-section-title">Моя статистика</h3>
              ${profileStatsPeriod ? `<div class="profile-stats-period">${escapeHtml(profileStatsPeriod)}</div>` : ""}
              <div class="profile-stats-grid mt12">
                <div class="profile-stat-card">
                  <div class="profile-stat-label">Смены</div>
                  <div class="profile-stat-value">${profileStats.current.shifts}</div>
                  <div class="profile-stat-trend ${shiftsTrend.className}">${shiftsTrend.text}</div>
                </div>
                <div class="profile-stat-card">
                  <div class="profile-stat-label">Удержания</div>
                  <div class="profile-stat-value">${profileStats.current.violations}</div>
                  <div class="profile-stat-trend ${violationsTrend.className}">${violationsTrend.text}</div>
                </div>
                <div class="profile-stat-card">
                  <div class="profile-stat-label">Доплаты</div>
                  <div class="profile-stat-value">${profileStats.current.bonuses}</div>
                  <div class="profile-stat-trend ${bonusesTrend.className}">${bonusesTrend.text}</div>
                </div>
                <div class="profile-stat-card">
                  <div class="profile-stat-label">Ваш доход</div>
                  <div class="profile-stat-value">${formatMoneyUnsigned(profileStats.current.income)}</div>
                  <div class="profile-stat-trend ${incomeTrend.className}">${incomeTrend.text}</div>
                </div>
              </div>
            </div>
            <div class="panel profile-settings-block">
              <h3 class="panel-title profile-section-title">Настройки</h3>
              <div class="settings-list mt12">
                <div class="settings-row">
                  <span>Тема</span>
                  <button
                    id="themeToggleBtn"
                    class="theme-switch ${state.theme === "dark" ? "dark" : ""}"
                    type="button"
                    aria-label="Переключить тему"
                    title="Переключить тему"
                  >
                    <span class="theme-switch-thumb">
                      <img src="/icons/theme-night.png" alt="Тема" />
                    </span>
                  </button>
                </div>
                <div class="settings-row">
                  <span>Уведомления</span>
                  <button id="openNotificationsBtn" class="open-arrow-btn" type="button" aria-label="Открыть уведомления">
                    <img src="/icons/right-arrow.png" alt="Открыть" />
                  </button>
                </div>
                <div class="settings-row">
                  <span>Безопасность</span>
                  <button id="openSecurityBtn" class="open-arrow-btn" type="button" aria-label="Открыть безопасность">
                    <img src="/icons/right-arrow.png" alt="Открыть" />
                  </button>
                </div>
                ${canOpenAdminPanel ? `
                  <div class="settings-row">
                    <span>Админ-панель</span>
                    <button id="openAdminPanelBtn" class="open-arrow-btn" type="button" aria-label="Открыть админ-панель">
                      <img src="/icons/right-arrow.png" alt="Открыть" />
                    </button>
                  </div>
                ` : ""}
              </div>
            </div>
          </div>
          <div id="avatarEditorModal" class="modal hidden">
            <div class="panel avatar-editor-panel" role="dialog" aria-modal="true" aria-labelledby="avatarEditorTitle">
              <div class="avatar-editor-head">
                <h3 id="avatarEditorTitle" class="panel-title">Ваша аватарка</h3>
                <button id="closeAvatarEditorBtn" class="month-picker-close" type="button" aria-label="Закрыть">×</button>
              </div>
              <div id="avatarEditorPreview" class="avatar-editor-preview custom-avatar avatar-bg-${escapeHtml(customAvatar.background)}">
                ${renderAvatarEmojiImage(customAvatar.emoji)}
              </div>
              <div class="avatar-editor-label">Выберите фон</div>
              <div class="avatar-background-grid">
                ${avatarBackgrounds
                  .map(
                    (background) => `
                      <button
                        class="avatar-background-option avatar-bg-${escapeHtml(background)} ${background === customAvatar.background ? "selected" : ""}"
                        type="button"
                        data-avatar-background="${escapeHtml(background)}"
                        aria-label="Выбрать фон"
                      ></button>
                    `
                  )
                  .join("")}
              </div>
              <div class="avatar-editor-label">Выберите эмодзи</div>
              <div class="avatar-emoji-grid">
                ${avatarEmojis
                  .map(
                    (emoji) => `
                      <button
                        class="avatar-emoji-option ${emoji === customAvatar.emoji ? "selected" : ""}"
                        type="button"
                        data-avatar-emoji="${escapeHtml(emoji)}"
                        aria-label="Выбрать ${escapeHtml(emoji)}"
                      >${renderAvatarEmojiImage(emoji)}</button>
                    `
                  )
                  .join("")}
              </div>
              <p id="avatarEditorStatus" class="status mt12"></p>
              <div class="avatar-editor-actions">
                <button id="saveAvatarBtn" class="button" type="button">Сохранить</button>
              </div>
            </div>
          </div>
          <div id="securityModal" class="modal fullscreen-modal hidden">
            <div class="panel">
              <div class="fullscreen-modal-header">
                <button id="closeSecurityBtnTop" class="open-arrow-btn" type="button" aria-label="Назад">
                  <img src="/icons/back-arrow.png" alt="Назад" />
                </button>
                <h3 class="panel-title">Безопасность</h3>
              </div>
              <div id="securityTabsNav" class="security-tabs mt12">
                <button class="security-tab-btn active" type="button" data-tab="pin">PIN-код</button>
                <button class="security-tab-btn" type="button" data-tab="sessions">Сессии</button>
                <button class="security-tab-btn" type="button" data-tab="logs">Журнал</button>
              </div>

              <div id="securityPinSection" class="panel mt12 security-section">
                <div id="securityPinBlock"></div>
              </div>

              <div id="securitySessionsSection" class="panel mt12 security-section hidden">
                <div class="row" style="justify-content:flex-end;">
                  <button id="refreshSessionsBtn" class="icon-button" type="button" title="Обновить" aria-label="Обновить">
                    <img src="/icons/refresh-new.png" alt="Обновить" />
                  </button>
                </div>
                <div class="row mt8">
                  <button id="revokeOtherSessionsBtn" class="button secondary security-revoke-all-btn" type="button">Завершить все</button>
                </div>
                <div id="securitySessionsList" class="mt12"></div>
                <p id="securitySessionsStatus" class="status mt8"></p>
              </div>

              <div id="securityLogsSection" class="panel mt12 security-section hidden">
                <h4 class="panel-title">Журнал действий</h4>
                ${canViewSystemJournal ? `
                  <div class="security-log-tabs mt8">
                    <button id="logsPersonalBtn" class="security-log-tab active" type="button">Персональный</button>
                    <button id="logsSystemBtn" class="security-log-tab" type="button">Системный</button>
                  </div>
                ` : ""}
                <div class="security-log-filters">
                  <label class="security-log-filter">
                    <span>Период</span>
                    <select id="logsPeriodFilter">
                      <option value="all">Всё время</option>
                      <option value="today">Сегодня</option>
                      <option value="7">Последние 7 дней</option>
                      <option value="30">Последние 30 дней</option>
                    </select>
                  </label>
                  <label id="logsCategoryFilterWrap" class="security-log-filter hidden">
                    <span>Раздел</span>
                    <select id="logsCategoryFilter">
                      <option value="all">Все действия</option>
                      <option value="employees">Сотрудники</option>
                      <option value="schedule">График и ПВЗ</option>
                      <option value="finance">Финансы</option>
                      <option value="security">Безопасность</option>
                    </select>
                  </label>
                  <label id="logsActorFilterWrap" class="security-log-filter hidden">
                    <span>Кто выполнил</span>
                    <select id="logsActorFilter">
                      <option value="all">Все сотрудники</option>
                    </select>
                  </label>
                </div>
                <p id="securityLogsStatus" class="status mt8"></p>
                <div id="securityLogsList" class="security-log-scroll mt8"></div>
              </div>
            </div>
          </div>
          <div id="notificationsModal" class="modal fullscreen-modal hidden">
            <div class="panel">
              <div class="fullscreen-modal-header">
                <button id="closeNotificationsBtnTop" class="open-arrow-btn" type="button" aria-label="Назад">
                  <img src="/icons/back-arrow.png" alt="Назад" />
                </button>
                <h3 class="panel-title">Уведомления</h3>
              </div>
              <div class="muted mt8">Настройка сообщений напоминаний от бота.</div>
              <div class="reminder-toggle-row mt12">
                <div>
                  <div><strong>Напоминание за 24 часа</strong></div>
                  <div class="muted mt8">Отправка сообщения от бота</div>
                </div>
                <input id="reminder24EnabledInput" type="checkbox" ${state.user?.reminder24Enabled !== false ? "checked" : ""} />
              </div>
              <div class="reminder-toggle-row mt12">
                <div>
                  <div><strong>Напоминание за 14 часов</strong></div>
                  <div class="muted mt8">Отправка сообщения от бота</div>
                </div>
                <input id="reminder14EnabledInput" type="checkbox" ${state.user?.reminder14Enabled !== false ? "checked" : ""} />
              </div>
              <p id="reminderSettingsStatus" class="status mt12"></p>
              <div class="form-save-footer">
                <div class="save-icon-wrap">
                  <button id="saveReminderSettingsBtn" class="save-icon-btn" type="button">Сохранить</button>
                  <div id="saveReminderSettingsFeedback" class="save-feedback"></div>
                </div>
              </div>
            </div>
          </div>
          <div id="adminHoursModal" class="modal fullscreen-modal hidden">
            <div class="panel">
              <div class="fullscreen-modal-header">
                <button id="closeAdminPanelBtnTop" class="open-arrow-btn" type="button">
                  <img src="/icons/back-arrow.png" alt="Выход" />
                </button>
                <h3 class="panel-title">Админ-панель: график ПВЗ</h3>
              </div>
              <div class="muted mt8">Измените рабочие часы пунктов. Эти часы будут показываться в смене сотрудника.</div>
              <div class="employees-form mt12">
                ${state.locations
                  .map(
                    (loc) => `
                      <div class="admin-hours-card">
                        <div><strong>${escapeHtml(loc.title)}</strong></div>
                        <div class="row mt8">
                          <div class="admin-hours-field">
                            <div class="muted">Начало</div>
                            <input type="time" data-hours-start="${escapeHtml(loc.code)}" value="${escapeHtml(loc.workStart || "14:00")}" />
                          </div>
                          <div class="admin-hours-field">
                            <div class="muted">Конец</div>
                            <input type="time" data-hours-end="${escapeHtml(loc.code)}" value="${escapeHtml(loc.workEnd || "22:00")}" />
                          </div>
                        </div>
                      </div>
                    `
                  )
                  .join("")}
              </div>
              <p id="adminHoursStatus" class="status mt12"></p>
              <div class="form-save-footer">
                <div class="save-icon-wrap">
                  <button id="saveAllHoursBtn" class="save-icon-btn" type="button">Сохранить</button>
                  <div id="saveAllHoursFeedback" class="save-feedback"></div>
                </div>
              </div>
            </div>
          </div>
        `;
        const themeToggleBtn = document.getElementById("themeToggleBtn");
        const logoutAccountBtn = document.getElementById("logoutAccountBtn");
        const openAvatarEditorBtn = document.getElementById("openAvatarEditorBtn");
        const avatarEditorModal = document.getElementById("avatarEditorModal");
        const closeAvatarEditorBtn = document.getElementById("closeAvatarEditorBtn");
        const avatarEditorPreview = document.getElementById("avatarEditorPreview");
        const avatarEditorStatus = document.getElementById("avatarEditorStatus");
        const saveAvatarBtn = document.getElementById("saveAvatarBtn");
        const openNotificationsBtn = document.getElementById("openNotificationsBtn");
        const notificationsModal = document.getElementById("notificationsModal");
        const reminder24EnabledInput = document.getElementById("reminder24EnabledInput");
        const reminder14EnabledInput = document.getElementById("reminder14EnabledInput");
        const saveReminderSettingsBtn = document.getElementById("saveReminderSettingsBtn");
        const saveReminderSettingsFeedback = document.getElementById("saveReminderSettingsFeedback");
        const reminderSettingsStatus = document.getElementById("reminderSettingsStatus");
        const openAdminPanelBtn = document.getElementById("openAdminPanelBtn");
        const adminHoursModal = document.getElementById("adminHoursModal");
        const adminHoursStatus = document.getElementById("adminHoursStatus");
        const saveAllHoursBtn = document.getElementById("saveAllHoursBtn");
        const saveAllHoursFeedback = document.getElementById("saveAllHoursFeedback");
        const openSecurityBtn = document.getElementById("openSecurityBtn");
        const securityModal = document.getElementById("securityModal");
        const securityPinBlock = document.getElementById("securityPinBlock");
        const refreshSessionsBtn = document.getElementById("refreshSessionsBtn");
        const revokeOtherSessionsBtn = document.getElementById("revokeOtherSessionsBtn");
        const securitySessionsList = document.getElementById("securitySessionsList");
        const securitySessionsStatus = document.getElementById("securitySessionsStatus");
        const logsPersonalBtn = document.getElementById("logsPersonalBtn");
        const logsSystemBtn = document.getElementById("logsSystemBtn");
        const securityLogsList = document.getElementById("securityLogsList");
        const securityLogsStatus = document.getElementById("securityLogsStatus");
        const logsPeriodFilter = document.getElementById("logsPeriodFilter");
        const securityLogFilters = logsPeriodFilter?.closest(".security-log-filters");
        let selectedAvatarBackground = customAvatar.background;
        let selectedAvatarEmoji = customAvatar.emoji;

        const updateAvatarEditor = () => {
          if (avatarEditorPreview) {
            avatarEditorPreview.className = `avatar-editor-preview custom-avatar avatar-bg-${selectedAvatarBackground}`;
            avatarEditorPreview.innerHTML = renderAvatarEmojiImage(selectedAvatarEmoji);
          }
          for (const button of avatarEditorModal?.querySelectorAll("[data-avatar-background]") || []) {
            button.classList.toggle("selected", button.dataset.avatarBackground === selectedAvatarBackground);
          }
          for (const button of avatarEditorModal?.querySelectorAll("[data-avatar-emoji]") || []) {
            button.classList.toggle("selected", button.dataset.avatarEmoji === selectedAvatarEmoji);
          }
        };

        openAvatarEditorBtn?.addEventListener("click", () => {
          avatarEditorStatus.textContent = "";
          avatarEditorStatus.className = "status";
          avatarEditorModal?.classList.remove("hidden");
          updateAvatarEditor();
        });
        closeAvatarEditorBtn?.addEventListener("click", () => avatarEditorModal?.classList.add("hidden"));
        avatarEditorModal?.addEventListener("click", (event) => {
          if (event.target === avatarEditorModal) avatarEditorModal.classList.add("hidden");
        });
        for (const button of avatarEditorModal?.querySelectorAll("[data-avatar-background]") || []) {
          button.addEventListener("click", () => {
            selectedAvatarBackground = String(button.dataset.avatarBackground || "ocean");
            updateAvatarEditor();
          });
        }
        for (const button of avatarEditorModal?.querySelectorAll("[data-avatar-emoji]") || []) {
          button.addEventListener("click", () => {
            selectedAvatarEmoji = String(button.dataset.avatarEmoji || "📦");
            updateAvatarEditor();
          });
        }
        saveAvatarBtn?.addEventListener("click", async () => {
          saveAvatarBtn.disabled = true;
          avatarEditorStatus.className = "status";
          avatarEditorStatus.textContent = "Сохраняем...";
          try {
            const data = await api("/api/auth/me/avatar", {
              method: "PUT",
              body: JSON.stringify({
                background: selectedAvatarBackground,
                emoji: selectedAvatarEmoji
              })
            });
            state.currentEmployee = data.employee || state.currentEmployee;
            state.avatarNonce = String(Date.now());
            showTextNotice("Аватарка сохранена");
            await renderProfile();
          } catch (error) {
            avatarEditorStatus.className = "status error";
            avatarEditorStatus.textContent = `Ошибка: ${error.message}`;
            saveAvatarBtn.disabled = false;
          }
        });
        const logsCategoryFilterWrap = document.getElementById("logsCategoryFilterWrap");
        const logsCategoryFilter = document.getElementById("logsCategoryFilter");
        const logsActorFilterWrap = document.getElementById("logsActorFilterWrap");
        const logsActorFilter = document.getElementById("logsActorFilter");
        const securityTabsNav = document.getElementById("securityTabsNav");
        const securityPinSection = document.getElementById("securityPinSection");
        const securitySessionsSection = document.getElementById("securitySessionsSection");
        const securityLogsSection = document.getElementById("securityLogsSection");
        let activeSecurityLogsScope = "PERSONAL";
        let securityLogsCache = [];


        const normalizePinDigits = (value) => String(value || "").replace(/\D/g, "").slice(0, 4);
        const isPinLengthValid = (pin) => /^\d{4}$/.test(String(pin || ""));
        const setupSecurityTabs = () => {
          if (!securityTabsNav) return;
          const sections = {
            pin: securityPinSection,
            sessions: securitySessionsSection,
            logs: securityLogsSection
          };
          const buttons = Array.from(securityTabsNav.querySelectorAll(".security-tab-btn"));
          const activate = (tab) => {
            buttons.forEach((btn) => {
              const isActive = btn.dataset.tab === tab;
              btn.classList.toggle("active", isActive);
            });
            Object.entries(sections).forEach(([key, section]) => {
              section?.classList.toggle("hidden", key !== tab);
            });
          };
          buttons.forEach((btn) => {
            btn.addEventListener("click", () => activate(btn.dataset.tab || "pin"));
          });
          activate("pin");
        };

        const alignSecuritySessionsActions = () => {
          const section = document.getElementById("securitySessionsSection");
          const refreshBtn = document.getElementById("refreshSessionsBtn");
          const revokeBtn = document.getElementById("revokeOtherSessionsBtn");
          if (!section || !refreshBtn || !revokeBtn) return;

          let topRow = refreshBtn.closest(".row");
          if (!topRow) {
            topRow = document.createElement("div");
            topRow.className = "row mt8";
            section.insertBefore(topRow, section.firstChild);
            topRow.appendChild(refreshBtn);
          }

          topRow.className = "row mt8 security-sessions-actions";
          topRow.style.justifyContent = "space-between";
          topRow.style.alignItems = "center";
          topRow.style.gap = "8px";

          if (revokeBtn.parentElement !== topRow) {
            topRow.insertBefore(revokeBtn, refreshBtn);
          }

          for (const row of section.querySelectorAll(".row")) {
            if (row === topRow) continue;
            if (!row.children.length) row.remove();
            if (row.children.length === 1 && row.firstElementChild?.id === "revokeOtherSessionsBtn") {
              row.remove();
            }
          }
        };

        const renderPinBlockLegacy = (pinState) => {
          if (!securityPinBlock) return;
          const enabled = !!pinState?.enabled;
          const lockText = pinState?.lockedUntil
            ? `<div class="status error mt8">Блокировка до ${escapeHtml(formatDateTime(pinState.lockedUntil))}</div>`
            : "";
          const bindPinInput = (id) => {
            const input = document.getElementById(id);
            const toggleBtn = securityPinBlock.querySelector(`[data-pin-toggle="${id}"]`);
            if (!input) return null;

            let visible = false;
            const applyVisibility = () => {
              input.type = visible ? "text" : "password";
              if (toggleBtn) {
                toggleBtn.classList.toggle("active", visible);
                toggleBtn.setAttribute("aria-label", visible ? "Скрыть PIN" : "Показать PIN");
                toggleBtn.setAttribute("title", visible ? "Скрыть PIN" : "Показать PIN");
              }
            };

            input.addEventListener("input", () => {
              input.value = normalizePinDigits(input.value);
            });

            toggleBtn?.addEventListener("click", () => {
              visible = !visible;
              applyVisibility();
              input.focus({ preventScroll: true });
              const end = input.value.length;
              input.setSelectionRange(end, end);
            });

            applyVisibility();
            return input;
          };

          if (!enabled) {
            securityPinBlock.innerHTML = `
              <div class="pin-shell">
                <div class="pin-hero">
                  <div>
                    <p class="pin-hero-title">PIN-код</p>
                    <div class="pin-hero-subtitle">Добавьте PIN для дополнительной защиты входа в приложение.</div>
                  </div>
                  <span class="pin-status-badge off">Выключен</span>
                </div>
                ${lockText}
                <div class="pin-card">
                  <p class="pin-section-title">Включить PIN</p>
                  <div class="pin-section-subtitle">Введите новый PIN и подтвердите его повторным вводом.</div>
                  <div class="pin-grid">
                    <div class="pin-field">
                      <label for="pinEnableNewInput">Новый PIN</label>
                      <div class="pin-input-wrap">
                        <input class="pin-input" id="pinEnableNewInput" type="password" inputmode="numeric" maxlength="4" placeholder="4 цифры" />
                        <button class="pin-eye-btn" data-pin-toggle="pinEnableNewInput" type="button" aria-label="Показать PIN">&#128065;</button>
                      </div>
                    </div>
                    <div class="pin-field">
                      <label for="pinEnableRepeatInput">Повторите PIN</label>
                      <div class="pin-input-wrap">
                        <input class="pin-input" id="pinEnableRepeatInput" type="password" inputmode="numeric" maxlength="8" placeholder="Повторите PIN" />
                        <button class="pin-eye-btn" data-pin-toggle="pinEnableRepeatInput" type="button" aria-label="Показать PIN">&#128065;</button>
                      </div>
                    </div>
                  </div>
                  <div class="row mt12">
                    <button id="pinEnableBtn" class="button pin-primary-btn" type="button">Включить PIN</button>
                  </div>
                  <p id="pinEnableStatus" class="status mt8"></p>
                </div>
              </div>
            `;

            const newInput = bindPinInput("pinEnableNewInput");
            const repeatInput = bindPinInput("pinEnableRepeatInput");
            const enableStatus = document.getElementById("pinEnableStatus");
            const enableBtn = document.getElementById("pinEnableBtn");
            enableBtn?.addEventListener("click", async () => {
              const pin = normalizePinDigits(newInput?.value || "");
              const repeatPin = normalizePinDigits(repeatInput?.value || "");
              if (!isPinLengthValid(pin)) {
                enableStatus.className = "status error";
                enableStatus.textContent = "PIN должен состоять ровно из 4 цифр";
                return;
              }
              if (pin !== repeatPin) {
                enableStatus.className = "status error";
                enableStatus.textContent = "PIN и подтверждение не совпадают";
                return;
              }
              try {
                const data = await api("/api/security/pin/enable", {
                  method: "POST",
                  body: JSON.stringify({ pin })
                });
                state.security.pinState = data?.pinState || null;
                renderPinBlock(state.security.pinState);
              } catch (error) {
                enableStatus.className = "status error";
                enableStatus.textContent = `Ошибка: ${error.message}`;
              }
            });
            return;
          }

          securityPinBlock.innerHTML = `
            <div class="pin-shell">
              <div class="pin-hero">
                <div>
                  <p class="pin-hero-title">PIN-код</p>
                  <div class="pin-hero-subtitle">Код активен и используется для подтверждения входа.</div>
                </div>
                <span class="pin-status-badge on">Включен</span>
              </div>
              ${lockText}
              <div class="pin-card">
                <p class="pin-section-title">Сменить PIN</p>
                <div class="pin-section-subtitle">Для смены укажите текущий PIN и задайте новый.</div>
                <div class="pin-grid mt8">
                  <div class="pin-field">
                    <label for="pinChangeCurrentInput">Текущий PIN</label>
                    <div class="pin-input-wrap">
                      <input class="pin-input" id="pinChangeCurrentInput" type="password" inputmode="numeric" maxlength="8" placeholder="Текущий PIN" />
                      <button class="pin-eye-btn" data-pin-toggle="pinChangeCurrentInput" type="button" aria-label="Показать PIN">&#128065;</button>
                    </div>
                  </div>
                  <div class="pin-field">
                    <label for="pinChangeNewInput">Новый PIN</label>
                    <div class="pin-input-wrap">
                      <input class="pin-input" id="pinChangeNewInput" type="password" inputmode="numeric" maxlength="4" placeholder="4 цифры" />
                      <button class="pin-eye-btn" data-pin-toggle="pinChangeNewInput" type="button" aria-label="Показать PIN">&#128065;</button>
                    </div>
                  </div>
                  <div class="pin-field">
                    <label for="pinChangeRepeatInput">Повторите новый PIN</label>
                    <div class="pin-input-wrap">
                      <input class="pin-input" id="pinChangeRepeatInput" type="password" inputmode="numeric" maxlength="8" placeholder="Повторите новый PIN" />
                      <button class="pin-eye-btn" data-pin-toggle="pinChangeRepeatInput" type="button" aria-label="Показать PIN">&#128065;</button>
                    </div>
                  </div>
                </div>
                <div class="row mt12">
                  <button id="pinChangeBtn" class="button pin-primary-btn" type="button">Сменить PIN</button>
                </div>
                <p id="pinChangeStatus" class="status mt8"></p>
              </div>
              <div class="pin-card">
                <p class="pin-section-title">Отключить PIN</p>
                <div class="pin-section-subtitle">Подтвердите текущий PIN для отключения защиты.</div>
                <div class="pin-grid mt8">
                  <div class="pin-field">
                    <label for="pinDisableCurrentInput">Текущий PIN</label>
                    <div class="pin-input-wrap">
                      <input class="pin-input" id="pinDisableCurrentInput" type="password" inputmode="numeric" maxlength="8" placeholder="Текущий PIN" />
                      <button class="pin-eye-btn" data-pin-toggle="pinDisableCurrentInput" type="button" aria-label="Показать PIN">&#128065;</button>
                    </div>
                  </div>
                </div>
                <div class="row mt12">
                  <button id="pinDisableBtn" class="button pin-danger-btn" type="button">Отключить PIN</button>
                </div>
                <p id="pinDisableStatus" class="status mt8"></p>
              </div>
            </div>
          `;

          const currentInput = bindPinInput("pinChangeCurrentInput");
          const newInput = bindPinInput("pinChangeNewInput");
          const repeatInput = bindPinInput("pinChangeRepeatInput");
          const disableCurrentInput = bindPinInput("pinDisableCurrentInput");
          const changeStatus = document.getElementById("pinChangeStatus");
          const disableStatus = document.getElementById("pinDisableStatus");

          document.getElementById("pinChangeBtn")?.addEventListener("click", async () => {
            const currentPin = normalizePinDigits(currentInput?.value || "");
            const newPin = normalizePinDigits(newInput?.value || "");
            const repeatNewPin = normalizePinDigits(repeatInput?.value || "");
            if (!isPinLengthValid(currentPin) || !isPinLengthValid(newPin)) {
              changeStatus.className = "status error";
              changeStatus.textContent = "PIN должен состоять ровно из 4 цифр";
              return;
            }
            if (newPin !== repeatNewPin) {
              changeStatus.className = "status error";
              changeStatus.textContent = "Новый PIN и подтверждение не совпадают";
              return;
            }
            try {
              const data = await api("/api/security/pin/change", {
                method: "POST",
                body: JSON.stringify({ currentPin, newPin })
              });
              state.security.pinState = data?.pinState || null;
              renderPinBlock(state.security.pinState);
            } catch (error) {
              changeStatus.className = "status error";
              changeStatus.textContent = `Ошибка: ${error.message}`;
            }
          });

          document.getElementById("pinDisableBtn")?.addEventListener("click", async () => {
            const currentPin = normalizePinDigits(disableCurrentInput?.value || "");
            if (!isPinLengthValid(currentPin)) {
              disableStatus.className = "status error";
              disableStatus.textContent = "Введите корректный текущий PIN";
              return;
            }
            try {
              const data = await api("/api/security/pin/disable", {
                method: "POST",
                body: JSON.stringify({ currentPin })
              });
              state.security.pinState = data?.pinState || null;
              renderPinBlock(state.security.pinState);
            } catch (error) {
              disableStatus.className = "status error";
              disableStatus.textContent = `Ошибка: ${error.message}`;
            }
          });
        };

        const openSecurityPinModal = ({ mode }) => {
          document.getElementById("securityPinFlowModal")?.remove();

          const stateMachine = {
            mode,
            step: mode === "change" || mode === "disable" ? "verify_current" : "enter_new",
            currentPin: "",
            newPin: "",
            value: "",
            status: "",
            statusClass: "",
            shaking: false,
            busy: false,
            failedAttempts: 0
          };

          const stepMeta = () => {
            if (stateMachine.mode === "enable") {
              if (stateMachine.step === "repeat_new") {
                return {
                  title: "Повторите PIN",
                  subtitle: "Введите новый PIN еще раз",
                  progress: "Шаг 2 из 2",
                  button: "Включить PIN"
                };
              }
              return {
                title: "Новый PIN",
                subtitle: "Придумайте код из 4 цифр",
                progress: "Шаг 1 из 2",
                button: "Продолжить"
              };
            }

            if (stateMachine.mode === "change") {
              if (stateMachine.step === "enter_new") {
                return {
                  title: "Новый PIN",
                  subtitle: "Придумайте код из 4 цифр",
                  progress: "Шаг 2 из 3",
                  button: "Продолжить"
                };
              }
              if (stateMachine.step === "repeat_new") {
                return {
                  title: "Повторите PIN",
                  subtitle: "Введите новый PIN еще раз",
                  progress: "Шаг 3 из 3",
                  button: "Сменить PIN"
                };
              }
              return {
                title: "Введите текущий PIN",
                subtitle: "Подтвердите, что это вы",
                progress: "Шаг 1 из 3",
                button: "Продолжить"
              };
            }

            if (stateMachine.step === "confirm_disable") {
              return {
                title: "Отключить PIN-код?",
                subtitle: "После отключения вход не будет защищен PIN-кодом",
                progress: "Шаг 2 из 2",
                button: "Отключить PIN"
              };
            }

            return {
              title: "Введите текущий PIN",
              subtitle: "Подтвердите отключение защиты",
              progress: "Шаг 1 из 2",
              button: "Продолжить"
            };
          };

          const modal = document.createElement("div");
          modal.id = "securityPinFlowModal";
          modal.className = "pin-gate-overlay";
          document.body.appendChild(modal);

          const close = () => {
            clearPinKeyboard();
            modal.remove();
            syncModalScrollLock();
          };

          const setError = (message) => {
            stateMachine.status = message;
            stateMachine.statusClass = "status error";
            stateMachine.shaking = true;
            render();
            window.setTimeout(() => {
              stateMachine.shaking = false;
              render();
            }, 340);
          };

          const resetValue = () => {
            stateMachine.value = "";
            stateMachine.status = "";
            stateMachine.statusClass = "status";
          };

          const setStep = (step) => {
            stateMachine.step = step;
            resetValue();
            render();
          };

          const finishWithPinState = (pinState) => {
            state.security.pinState = pinState || null;
            renderPinBlock(state.security.pinState);
            close();
          };

          const submit = async () => {
            if (stateMachine.busy) return;

            if (stateMachine.step === "confirm_disable") {
              const confirmed = await confirmAction("Отключить PIN-код?");
              if (!confirmed) return;
              stateMachine.busy = true;
              render();
              try {
                const data = await api("/api/security/pin/disable", {
                  method: "POST",
                  body: JSON.stringify({ currentPin: stateMachine.currentPin })
                });
                finishWithPinState(data?.pinState || null);
              } catch (error) {
                stateMachine.busy = false;
                setStep("verify_current");
                setError(`Ошибка: ${error.message}`);
              }
              return;
            }

            const pin = normalizePinDigits(stateMachine.value);
            if (!isPinLengthValid(pin)) {
              setError("PIN должен состоять ровно из 4 цифр");
              return;
            }

            if (stateMachine.step === "verify_current") {
              stateMachine.busy = true;
              render();
              try {
                await api("/api/security/pin/verify", {
                  method: "POST",
                  body: JSON.stringify({ pin })
                });
                stateMachine.currentPin = pin;
                stateMachine.busy = false;
                setStep(stateMachine.mode === "disable" ? "confirm_disable" : "enter_new");
              } catch (error) {
                stateMachine.busy = false;
                stateMachine.failedAttempts += 1;
                stateMachine.value = "";
                const warning =
                  stateMachine.failedAttempts >= 3
                    ? "Слишком много неверных попыток. Проверьте PIN или попробуйте позже."
                    : `Ошибка: ${error.message}`;
                setError(warning);
              }
              return;
            }

            if (stateMachine.step === "enter_new") {
              stateMachine.newPin = pin;
              setStep("repeat_new");
              return;
            }

            if (stateMachine.step === "repeat_new") {
              if (pin !== stateMachine.newPin) {
                stateMachine.value = "";
                setError("PIN не совпал. Повторите новый PIN");
                return;
              }
              stateMachine.busy = true;
              render();
              try {
                const endpoint =
                  stateMachine.mode === "enable" ? "/api/security/pin/enable" : "/api/security/pin/change";
                const body =
                  stateMachine.mode === "enable"
                    ? { pin: stateMachine.newPin }
                    : { currentPin: stateMachine.currentPin, newPin: stateMachine.newPin };
                const data = await api(endpoint, {
                  method: "POST",
                  body: JSON.stringify(body)
                });
                finishWithPinState(data?.pinState || null);
              } catch (error) {
                stateMachine.busy = false;
                setError(`Ошибка: ${error.message}`);
              }
            }
          };

          const renderDots = () =>
            Array.from({ length: 4 })
              .map((_, index) => {
                const classes = ["pin-gate-dot"];
                if (index < stateMachine.value.length) classes.push("filled");
                return `<span class="${classes.join(" ")}"></span>`;
              })
              .join("");

          const render = () => {
            const meta = stepMeta();
            const isConfirm = stateMachine.step === "confirm_disable";
            const canContinue = isConfirm || isPinLengthValid(stateMachine.value);
            modal.innerHTML = `
              <div class="pin-gate-card">
                <div class="pin-gate-head">
                  <div style="width:24px;height:24px;"></div>
                  <button id="pinModalCloseBtn" class="open-arrow-btn" type="button" aria-label="Закрыть">
                    <img src="/icons/back-arrow.png" alt="Закрыть" />
                  </button>
                </div>
                <div class="pin-gate-shield">
                  <img src="/icons/pin-protection.png" alt="Защита" />
                </div>
                <h3 class="pin-gate-title">${escapeHtml(meta.title)}</h3>
                <div class="pin-gate-subtitle">${escapeHtml(meta.subtitle)}</div>
                <div class="pin-modal-progress">${escapeHtml(meta.progress)}</div>
                ${
                  isConfirm
                    ? `<div class="pin-modal-confirm">
                        <button id="pinModalSubmitBtn" class="button pin-primary-btn pin-modal-continue pin-danger-btn" type="button" ${stateMachine.busy ? "disabled" : ""}>${escapeHtml(meta.button)}</button>
                      </div>`
                    : `<div id="pinModalDots" class="pin-gate-dots ${stateMachine.shaking ? "shake" : ""}">${renderDots()}</div>
                      <div class="pin-gate-keypad">
                        <button class="pin-gate-key" data-pin-modal-key="1" type="button">1</button>
                        <button class="pin-gate-key" data-pin-modal-key="2" type="button">2</button>
                        <button class="pin-gate-key" data-pin-modal-key="3" type="button">3</button>
                        <button class="pin-gate-key" data-pin-modal-key="4" type="button">4</button>
                        <button class="pin-gate-key" data-pin-modal-key="5" type="button">5</button>
                        <button class="pin-gate-key" data-pin-modal-key="6" type="button">6</button>
                        <button class="pin-gate-key" data-pin-modal-key="7" type="button">7</button>
                        <button class="pin-gate-key" data-pin-modal-key="8" type="button">8</button>
                        <button class="pin-gate-key" data-pin-modal-key="9" type="button">9</button>
                        <div class="pin-gate-spacer" aria-hidden="true"></div>
                        <button class="pin-gate-key" data-pin-modal-key="0" type="button">0</button>
                        <button class="pin-gate-key" id="pinModalBackspaceBtn" type="button" aria-label="Удалить символ">
                          <img src="/icons/pin-delete.png" alt="Удалить" />
                        </button>
                      </div>
                      <button id="pinModalSubmitBtn" class="button pin-primary-btn pin-modal-continue" type="button" ${!canContinue || stateMachine.busy ? "disabled" : ""}>${escapeHtml(meta.button)}</button>`
                }
                <p class="${stateMachine.statusClass || "status"} mt12" style="text-align:center;">${escapeHtml(stateMachine.status)}</p>
              </div>
            `;

            document.getElementById("pinModalCloseBtn")?.addEventListener("click", close);
            document.getElementById("pinModalSubmitBtn")?.addEventListener("click", submit);
            document.getElementById("pinModalBackspaceBtn")?.addEventListener("click", () => {
              if (stateMachine.busy) return;
              stateMachine.value = stateMachine.value.slice(0, -1);
              stateMachine.status = "";
              stateMachine.statusClass = "status";
              render();
            });
            for (const btn of modal.querySelectorAll("[data-pin-modal-key]")) {
              btn.addEventListener("click", () => {
                if (stateMachine.busy || stateMachine.value.length >= 4) return;
                const digit = btn.getAttribute("data-pin-modal-key");
                if (!/^\d$/.test(String(digit || ""))) return;
                stateMachine.value += digit;
                stateMachine.status = "";
                stateMachine.statusClass = "status";
                render();
              });
            }
            bindPinKeyboard({
              onDigit: (digit) =>
                modal.querySelector(`[data-pin-modal-key="${digit}"]`)?.click(),
              onBackspace: () => document.getElementById("pinModalBackspaceBtn")?.click(),
              onEnter: () => document.getElementById("pinModalSubmitBtn")?.click()
            });
          };

          render();
          syncModalScrollLock();
        };

        const renderPinBlock = (pinState) => {
          if (!securityPinBlock) return;
          const enabled = !!pinState?.enabled;
          const lockText = pinState?.lockedUntil
            ? `<div class="status error mt8">Блокировка до ${escapeHtml(formatDateTime(pinState.lockedUntil))}</div>`
            : "";

          securityPinBlock.innerHTML = enabled
            ? `
              <div class="pin-shell">
                <div class="pin-hero">
                  <div>
                    <p class="pin-hero-title">PIN-код</p>
                    <div class="pin-hero-subtitle">Код используется для подтверждения входа.</div>
                  </div>
                  <span class="pin-status-badge on">Включен</span>
                </div>
                ${lockText}
                <div class="pin-card pin-action-card">
                  <div>
                    <p class="pin-section-title">Сменить PIN</p>
                    <div class="pin-section-subtitle">Введите текущий PIN, затем задайте новый.</div>
                  </div>
                  <button id="openPinChangeBtn" class="button pin-primary-btn" type="button">Сменить PIN</button>
                </div>
                <div class="pin-card pin-action-card danger">
                  <div>
                    <p class="pin-section-title">Отключить PIN</p>
                    <div class="pin-section-subtitle">Потребуется подтвердить текущий PIN.</div>
                  </div>
                  <button id="openPinDisableBtn" class="button pin-danger-btn" type="button">Отключить PIN</button>
                </div>
              </div>
            `
            : `
              <div class="pin-shell">
                <div class="pin-hero">
                  <div>
                    <p class="pin-hero-title">PIN-код</p>
                    <div class="pin-hero-subtitle">Добавьте PIN-код для защиты входа.</div>
                  </div>
                  <span class="pin-status-badge off">Выключен</span>
                </div>
                ${lockText}
                <div class="pin-card pin-action-card">
                  <div>
                    <p class="pin-section-title">Включить PIN</p>
                    <div class="pin-section-subtitle">Код будет запрашиваться при входе в приложение.</div>
                  </div>
                  <button id="openPinEnableBtn" class="button pin-primary-btn" type="button">Включить PIN</button>
                </div>
              </div>
            `;

          document.getElementById("openPinEnableBtn")?.addEventListener("click", () => openSecurityPinModal({ mode: "enable" }));
          document.getElementById("openPinChangeBtn")?.addEventListener("click", () => openSecurityPinModal({ mode: "change" }));
          document.getElementById("openPinDisableBtn")?.addEventListener("click", () => openSecurityPinModal({ mode: "disable" }));
        };

        const loadSecurityState = async () => {
          const data = await api("/api/security/state");
          state.security.pinState = data?.pinState || null;
          renderPinBlock(state.security.pinState);
        };

        const loadSessions = async () => {
          const data = await api("/api/security/sessions");
          const items = data?.sessions || [];
          if (!items.length) {
            securitySessionsList.innerHTML = `<div class="muted">Активных сессий нет</div>`;
            return;
          }
          const sortedItems = [...items].sort((a, b) => Number(!!b.isCurrent) - Number(!!a.isCurrent));
          securitySessionsList.innerHTML = `
            <div class="security-session-list">
              ${sortedItems
            .map(
              (item) => {
                const deviceType = getSessionDeviceType(item);
                const title = item.isCurrent ? "Это устройство" : item.deviceName || "Устройство";
                const subtitle = item.isCurrent ? item.deviceName || "Текущее устройство" : item.platform || "";
                return `
                <div class="security-session-card ${item.isCurrent ? "current" : ""}">
                  <span class="security-session-icon ${deviceType}" aria-hidden="true"></span>
                  <div class="security-session-main">
                    <div class="security-session-head">
                      <div>
                        <div class="security-session-name">${escapeHtml(title)}</div>
                        ${subtitle ? `<div class="muted">${escapeHtml(subtitle)}</div>` : ""}
                      </div>
                      ${item.isCurrent ? `<span class="security-session-badge">Активно сейчас</span>` : ""}
                    </div>
                    <div class="security-session-meta">
                      <div><strong>Активность:</strong> ${escapeHtml(formatSessionDateTime(item.lastActiveAt))}</div>
                      <div><strong>Создана:</strong> ${escapeHtml(formatSessionDateTime(item.createdAt))}</div>
                    </div>
                    ${
                      item.isCurrent
                        ? ""
                        : `<div class="security-session-actions"><button class="button secondary security-session-revoke-btn" type="button" data-revoke-session="${escapeHtml(item.id)}">Завершить</button></div>`
                    }
                  </div>
                </div>
              `;
              }
            )
            .join("")}
            </div>
          `;
          for (const btn of securitySessionsList.querySelectorAll("[data-revoke-session]")) {
            btn.addEventListener("click", async () => {
              const id = btn.getAttribute("data-revoke-session");
              const confirmed = await confirmAction("Завершить эту сессию?");
              if (!confirmed) return;
              try {
                await api(`/api/security/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
                securitySessionsStatus.className = "status ok";
                securitySessionsStatus.textContent = "Сессия завершена";
                await loadSessions();
              } catch (error) {
                securitySessionsStatus.className = "status error";
                securitySessionsStatus.textContent = `Ошибка: ${error.message}`;
              }
            });
          }
        };

        const securityLogLabels = {
          AUTH_LOGIN_SUCCESS: {
            title: "Вход с нового устройства",
            description: "Пользователь вошел в приложение с устройства, которого раньше не было в активных сессиях.",
            badge: "Вход",
            tone: "info"
          },
          AUTH_LOGIN_DENIED: {
            title: "Вход отклонен",
            description: "Пользователю отказано во входе.",
            badge: "Вход",
            tone: "danger"
          },
          PROFILE_AVATAR_UPDATED: {
            title: "Аватар обновлён",
            description: "Пользователь изменил оформление своей фотографии профиля.",
            tone: "ok"
          },
          REMINDER_SETTINGS_UPDATED: {
            title: "Уведомления изменены",
            description: "Настройки напоминаний о сменах обновлены.",
            badge: "Настройки",
            tone: "ok"
          },
          EMPLOYEE_CREATED: {
            title: "Сотрудник добавлен",
            description: "В базу сотрудников добавлена новая запись.",
            badge: "Сотрудники",
            tone: "ok"
          },
          EMPLOYEE_UPDATED: {
            title: "Сотрудник изменен",
            description: "Данные сотрудника были обновлены.",
            badge: "Сотрудники",
            tone: "ok"
          },
          EMPLOYEE_PHOTO_UPDATED: {
            title: "Фото сотрудника обновлено",
            description: "В карточке сотрудника установлена новая фотография.",
            badge: "Сотрудники",
            tone: "ok"
          },
          EMPLOYEE_DOCUMENT_UPLOADED: {
            title: "Документ сотрудника загружен",
            description: "В защищенное хранилище добавлен документ сотрудника.",
            badge: "Сотрудники",
            tone: "ok"
          },
          EMPLOYEE_DOCUMENT_DELETED: {
            title: "Документ сотрудника удален",
            description: "Документ удален из защищенного хранилища.",
            badge: "Сотрудники",
            tone: "warning"
          },
          EMPLOYEE_DELETED: {
            title: "Сотрудник удален",
            description: "Сотрудник удален из базы.",
            badge: "Сотрудники",
            tone: "danger"
          },
          USER_ROLE_CHANGED: {
            title: "Роль пользователя изменена",
            description: "Изменены права доступа пользователя в приложении.",
            tone: "warning"
          },
          LOCATION_HOURS_UPDATED: {
            title: "График ПВЗ изменен",
            description: "Обновлены часы работы пункта.",
            badge: "ПВЗ",
            tone: "ok"
          },
          SHIFT_UPDATED: {
            title: "Смена изменена",
            description: "В графике смен были внесены изменения.",
            badge: "График",
            tone: "ok"
          },
          SCHEDULE_BULK_RATE_APPLIED: {
            title: "Ставка применена к сменам",
            description: "Ставка заполнена у назначенных смен, где она не была указана.",
            badge: "График",
            tone: "ok"
          },
          FINANCE_PAYMENT_CREATED: {
            title: "Выплата добавлена",
            description: "В финансах добавлена выплата или аванс.",
            badge: "Финансы",
            tone: "ok"
          },
          FINANCE_PAYMENT_DELETED: {
            title: "Выплата отменена",
            description: "Запись выплаты удалена из истории.",
            badge: "Финансы",
            tone: "warning"
          },
          FINANCE_SHIFT_PAID: {
            title: "Смена оплачена",
            description: "Рабочий день сотрудника отмечен оплаченным.",
            badge: "Финансы",
            tone: "ok"
          },
          FINANCE_SHIFT_PAYMENT_CANCELLED: {
            title: "Оплата смены отменена",
            description: "Отметка оплаты рабочего дня была отменена.",
            badge: "Финансы",
            tone: "warning"
          },
          FINANCE_EMPLOYEE_PERIOD_PAID: {
            title: "Период сотрудника оплачен",
            description: "Все неоплаченные смены сотрудника за выбранный период отмечены оплаченными.",
            badge: "Финансы",
            tone: "ok"
          },
          PIN_VERIFY_LOCKED: {
            title: "PIN временно заблокирован",
            description: "Сработала защита от перебора PIN-кода.",
            badge: "PIN",
            tone: "danger"
          },
          PIN_VERIFY_FAILED: {
            title: "Неверный PIN",
            description: "Была попытка ввода неверного PIN-кода.",
            badge: "PIN",
            tone: "warning"
          },
          PIN_VERIFY_SUCCESS: {
            title: "PIN введен верно",
            description: "Доступ подтвержден PIN-кодом.",
            badge: "PIN",
            tone: "ok"
          },
          PIN_ENABLED: {
            title: "PIN включен",
            description: "Защита входа PIN-кодом включена.",
            badge: "PIN",
            tone: "ok"
          },
          PIN_CHANGED: {
            title: "PIN изменен",
            description: "PIN-код был успешно изменен.",
            badge: "PIN",
            tone: "ok"
          },
          PIN_DISABLED: {
            title: "PIN отключен",
            description: "Защита входа PIN-кодом отключена.",
            badge: "PIN",
            tone: "warning"
          },
          PIN_RECOVERY_REQUESTED: {
            title: "Запрошено восстановление PIN",
            description: "Код восстановления отправлен на почту пользователя.",
            badge: "PIN",
            tone: "warning"
          },
          PIN_RECOVERED_EMAIL: {
            title: "PIN восстановлен",
            description: "Пользователь подтвердил почту и установил новый PIN-код.",
            badge: "PIN",
            tone: "ok"
          },
          PIN_RECOVERY_RESET_BY_SUPERADMIN: {
            title: "PIN сброшен главным админом",
            description: "Главный админ сформировал новый PIN.",
            badge: "PIN",
            tone: "warning"
          },
          SESSION_REVOKED: {
            title: "Сессия завершена",
            description: "Одна активная сессия была завершена.",
            badge: "Сессии",
            tone: "warning"
          },
          SESSIONS_REVOKED_OTHERS: {
            title: "Другие сессии завершены",
            description: "Завершены все сессии кроме текущей.",
            badge: "Сессии",
            tone: "warning"
          }
        };

        const securityLogMetaLabels = {
          deviceName: "Устройство",
          platform: "Платформа",
          pinRequired: "PIN требовался",
          reason: "Причина",
          revokedCount: "Завершено сессий",
          revokedSessionId: "ID сессии",
          employeeId: "ID сотрудника",
          fullName: "Сотрудник",
          employeeName: "Сотрудник",
          accessRole: "Роль доступа",
          role: "Роль",
          locationCode: "ПВЗ",
          locationName: "ПВЗ",
          date: "Дата",
          shiftDate: "Дата смены",
          periodFrom: "Период с",
          periodTo: "Период по",
          paymentDate: "Дата выплаты",
          operationType: "Тип операции",
          amount: "Сумма",
          paymentId: "ID выплаты",
          month: "Месяц",
          paidShiftCount: "Оплачено смен",
          enabled14: "Напоминание 14 часов",
          enabled24: "Напоминание 24 часа",
          fromRole: "Предыдущая роль",
          toRole: "Новая роль",
          locationCodes: "Доступные ПВЗ",
          locationTitle: "Название ПВЗ",
          workStart: "Начало работы",
          workEnd: "Конец работы",
          executor1: "Исполнитель 1",
          executor2: "Исполнитель 2",
          executor1Start: "Начало И1",
          executor1End: "Конец И1",
          executor2Start: "Начало И2",
          executor2End: "Конец И2",
          dailyRate: "Ставка за день",
          updatedCount: "Обновлено смен",
          rate1: "Начислено И1",
          rate2: "Начислено И2",
          period: "Половина месяца",
          fileId: "ID файла",
          fileName: "Название файла",
          recoveryPinLength: "Длина нового PIN",
          isNewDevice: "Новое устройство",
          background: "Фон аватара",
          emoji: "Эмодзи аватара"
        };

        const securityLogReasonLabels = {
          invalid_pin: "введён неверный PIN-код",
          locked: "ввод PIN-кода временно заблокирован",
          employee_not_found: "пользователь не найден в базе сотрудников",
          session_not_found: "сессия не найдена",
          unauthorized: "пользователь не авторизован"
        };

        const securityLogOperationLabels = {
          payout: "выплата",
          advance: "аванс"
        };

        const formatSecurityLogDate = (value) => {
          const raw = String(value || "").trim();
          const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
          if (match) return `${match[3]}.${match[2]}.${match[1]}`;
          return raw;
        };

        const formatSecurityLogValue = (key, value) => {
          if (value === null || value === undefined || value === "") return "";
          if (typeof value === "boolean") return value ? "да" : "нет";
          if (typeof value === "number" && key === "amount") return formatMoney(value);
          if (["date", "shiftDate", "periodFrom", "periodTo", "paymentDate"].includes(key)) return formatSecurityLogDate(value);
          if (["role", "accessRole", "fromRole", "toRole"].includes(key)) {
            return userRoles[String(value)] || String(value);
          }
          if (key === "reason") return securityLogReasonLabels[String(value)] || "действие отклонено";
          if (key === "operationType") return securityLogOperationLabels[String(value)] || String(value);
          if (key === "period") {
            if (String(value) === "first") return "1–15 число";
            if (String(value) === "second") return "16 число – конец месяца";
          }
          if (Array.isArray(value)) {
            if (!value.length) return "";
            if (key === "locationCodes") {
              return value
                .map((code) => state.locations.find((location) => location.code === code)?.title || code)
                .join(", ");
            }
            return value.map((item) => String(item)).join(", ");
          }
          if (typeof value === "object") return "";
          return String(value);
        };

        const renderSecurityLogDetails = (meta = {}) => {
          const rows = Object.entries(meta)
            .map(([key, value]) => {
              const formatted = formatSecurityLogValue(key, value);
              if (!formatted) return "";
              const label = securityLogMetaLabels[key] || key;
              return `<div class="security-log-detail"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(formatted)}</div>`;
            })
            .filter(Boolean);
          if (!rows.length) return "";
          return `<div class="security-log-details">${rows.join("")}</div>`;
        };

        const getSecurityLogGroupLabel = (value) => {
          const dt = new Date(String(value || "").trim());
          if (!Number.isFinite(dt.getTime())) return "Ранее";
          const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
          const today = startOfDay(new Date());
          const target = startOfDay(dt);
          const diffDays = Math.round((today - target) / 86400000);
          if (diffDays === 0) return "Сегодня";
          if (diffDays === 1) return "Вчера";
          return "Ранее";
        };

        const formatSecurityLogTime = (value) => {
          const raw = String(value || "").trim();
          if (!raw) return "Без даты";
          const dt = new Date(raw);
          if (!Number.isFinite(dt.getTime())) return raw;
          const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
          const today = startOfDay(new Date());
          const target = startOfDay(dt);
          const timePart = dt.toLocaleTimeString("ru-RU", {
            hour: "2-digit",
            minute: "2-digit"
          });
          if (target === today) return `Сегодня, ${timePart}`;
          if (target === today - 86400000) return `Вчера, ${timePart}`;
          return dt.toLocaleDateString("ru-RU", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric"
          });
        };

        const parseSecurityLogDateTime = (value) => {
          const raw = String(value || "").trim();
          if (!raw) return null;
          const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)
            ? `${raw.replace(" ", "T")}Z`
            : raw;
          const date = new Date(normalized);
          return Number.isFinite(date.getTime()) ? date : null;
        };

        const getSecurityLogCategory = (eventType) => {
          const type = String(eventType || "");
          if (type.startsWith("EMPLOYEE_") || type === "USER_ROLE_CHANGED") return "employees";
          if (type.startsWith("SHIFT_") || type.startsWith("LOCATION_")) return "schedule";
          if (type.startsWith("FINANCE_")) return "finance";
          return "security";
        };

        const getSecurityLogActorName = (log) =>
          String(
            log?.actorFullName ||
            log?.meta?.actorName ||
            log?.actorTelegramId ||
            "Система"
          ).trim();

        const updateSecurityLogActorOptions = () => {
          const isSystem = activeSecurityLogsScope === "SYSTEM";
          securityLogFilters?.classList.toggle("system", isSystem);
          logsCategoryFilterWrap?.classList.toggle("hidden", !isSystem);
          if (!isSystem && logsCategoryFilter) logsCategoryFilter.value = "all";
          if (!logsActorFilter || !logsActorFilterWrap) return;
          logsActorFilterWrap.classList.toggle("hidden", !isSystem);
          if (!isSystem) {
            logsActorFilter.value = "all";
            return;
          }

          const previousValue = logsActorFilter.value || "all";
          const actors = new Map();
          for (const log of securityLogsCache) {
            const key = String(log.actorUserId || log.actorTelegramId || "system");
            if (!actors.has(key)) actors.set(key, getSecurityLogActorName(log));
          }
          const options = [...actors.entries()]
            .sort((left, right) => left[1].localeCompare(right[1], "ru"))
            .map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`)
            .join("");
          logsActorFilter.innerHTML = `<option value="all">Все сотрудники</option>${options}`;
          logsActorFilter.value = [...actors.keys()].includes(previousValue) ? previousValue : "all";
        };

        const renderSecurityLogs = () => {
          const period = logsPeriodFilter?.value || "all";
          const category = logsCategoryFilter?.value || "all";
          const actor = logsActorFilter?.value || "all";
          const now = new Date();
          const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

          const logs = securityLogsCache.filter((log) => {
            if (category !== "all" && getSecurityLogCategory(log.eventType) !== category) return false;
            if (activeSecurityLogsScope === "SYSTEM" && actor !== "all") {
              const actorKey = String(log.actorUserId || log.actorTelegramId || "system");
              if (actorKey !== actor) return false;
            }
            if (period === "all") return true;
            const createdAt = parseSecurityLogDateTime(log.createdAt);
            if (!createdAt) return false;
            if (period === "today") return createdAt.getTime() >= todayStart;
            const days = Number(period);
            return Number.isFinite(days) && createdAt.getTime() >= now.getTime() - days * 86400000;
          });

          if (!logs.length) {
            securityLogsList.innerHTML = `<div class="muted">По выбранным фильтрам записей нет</div>`;
            return;
          }
          const groups = { "Сегодня": [], "Вчера": [], "Ранее": [] };
          for (const log of logs) {
            groups[getSecurityLogGroupLabel(log.createdAt)]?.push(log);
          }
          securityLogsList.innerHTML = `
            <div class="security-log-list">
              ${["Сегодня", "Вчера", "Ранее"]
                .map((groupName) => {
                  const items = groups[groupName] || [];
                  if (!items.length) return "";
                  return `
                    <div class="security-log-group">
                      <div class="security-log-day-title">${escapeHtml(groupName)}</div>
                      <div class="security-log-group-list">
                        ${items
                          .map((log) => {
                            const info = securityLogLabels[log.eventType] || {
                              title: "Действие в системе",
                              description: "В приложении выполнено служебное действие.",
                              tone: ""
                            };
                            return `
                              <div class="security-log-card ${escapeHtml(info.tone)}">
                                <div class="security-log-head">
                                  <div class="security-log-title">${escapeHtml(info.title)}</div>
                                  <div class="security-log-time">${escapeHtml(formatSecurityLogTime(log.createdAt))}</div>
                                </div>
                                <div class="security-log-description">${escapeHtml(info.description)}</div>
                                ${activeSecurityLogsScope === "SYSTEM" ? `
                                  <div class="security-log-actor">
                                    <span>Выполнил:</span>
                                    <strong>${escapeHtml(getSecurityLogActorName(log))}</strong>
                                    ${log.actorRole ? `<span>· ${escapeHtml(userRoles[log.actorRole] || log.actorRole)}</span>` : ""}
                                  </div>
                                ` : ""}
                                ${renderSecurityLogDetails(log.meta || {})}
                              </div>
                            `;
                          })
                          .join("")}
                      </div>
                    </div>
                  `;
                })
                .join("")}
            </div>
          `;
        };

        const loadLogs = async (scope) => {
          const allowedScope = scope === "SYSTEM" && canViewSystemJournal ? "SYSTEM" : "PERSONAL";
          const data = await api(`/api/security/journal?scope=${encodeURIComponent(allowedScope)}&limit=200`);
          activeSecurityLogsScope = allowedScope;
          securityLogsCache = (data?.logs || []).filter((log) => {
            if (log.eventType === "PIN_VERIFY_SUCCESS") return false;
            if (log.eventType === "AUTH_LOGIN_SUCCESS") return !!log.meta?.isNewDevice;
            return true;
          });
          logsPersonalBtn?.classList.toggle("active", activeSecurityLogsScope === "PERSONAL");
          logsSystemBtn?.classList.toggle("active", activeSecurityLogsScope === "SYSTEM");
          updateSecurityLogActorOptions();
          renderSecurityLogs();
          securityModal.scrollTop = 0;
        };

        setupSecurityTabs();
        alignSecuritySessionsActions();

        themeToggleBtn?.addEventListener("click", () => {
          toggleTheme();
          themeToggleBtn.classList.toggle("dark", state.theme === "dark");
        });
        logoutAccountBtn?.addEventListener("click", async () => {
          const confirmed = await confirmAction("Вы действительно хотите выйти из аккаунта на этом устройстве?", {
            title: "Выйти из аккаунта?",
            cancelText: "Нет",
            confirmText: "Да",
            danger: true
          });
          if (!confirmed) return;
          logoutAccountBtn.disabled = true;
          await api("/api/auth/logout", { method: "POST" }).catch(() => {});
          state.sessionId = "";
          state.telegramId = "";
          state.user = null;
          state.currentEmployee = null;
          try {
            localStorage.removeItem(SESSION_STORAGE_KEY);
            localStorage.removeItem(AUTH_ID_STORAGE_KEY);
            localStorage.removeItem(ACTIVE_TAB_STORAGE_KEY);
          } catch {}
          renderEmailLogin();
        });
        openSecurityBtn?.addEventListener("click", async () => {
          securitySessionsStatus.className = "status";
          securitySessionsStatus.textContent = "";
          securityLogsStatus.className = "status";
          securityLogsStatus.textContent = "";
          securityModal?.classList.remove("hidden");
          try {
            await loadSecurityState();
            await loadSessions();
            await loadLogs("PERSONAL");
          } catch (error) {
            securityLogsStatus.className = "status error";
            securityLogsStatus.textContent = `Ошибка: ${error.message}`;
          }
        });
        document.getElementById("closeSecurityBtnTop")?.addEventListener("click", () => {
          securityModal?.classList.add("hidden");
        });
        securityModal?.addEventListener("click", (event) => {
          if (event.target === securityModal) securityModal.classList.add("hidden");
        });
        refreshSessionsBtn?.addEventListener("click", async () => {
          try {
            await loadSessions();
            securitySessionsStatus.className = "status ok";
            securitySessionsStatus.textContent = "Сессии обновлены";
          } catch (error) {
            securitySessionsStatus.className = "status error";
            securitySessionsStatus.textContent = `Ошибка: ${error.message}`;
          }
        });
        revokeOtherSessionsBtn?.addEventListener("click", async () => {
          const confirmed = await confirmAction("Завершить все сессии кроме текущей?");
          if (!confirmed) return;
          try {
            const data = await api("/api/security/sessions/revoke-others", { method: "POST" });
            securitySessionsStatus.className = "status ok";
            securitySessionsStatus.textContent = `Завершено сессий: ${Number(data?.revokedCount || 0)}`;
            await loadSessions();
          } catch (error) {
            securitySessionsStatus.className = "status error";
            securitySessionsStatus.textContent = `Ошибка: ${error.message}`;
          }
        });
        logsPeriodFilter?.addEventListener("change", () => {
          renderSecurityLogs();
          securityLogsList.scrollTop = 0;
        });
        logsCategoryFilter?.addEventListener("change", () => {
          renderSecurityLogs();
          securityLogsList.scrollTop = 0;
        });
        logsActorFilter?.addEventListener("change", () => {
          renderSecurityLogs();
          securityLogsList.scrollTop = 0;
        });
        logsPersonalBtn?.addEventListener("click", async () => {
          try {
            await loadLogs("PERSONAL");
            securityLogsStatus.className = "status";
            securityLogsStatus.textContent = "";
          } catch (error) {
            securityLogsStatus.className = "status error";
            securityLogsStatus.textContent = `Ошибка: ${error.message}`;
          }
        });
        logsSystemBtn?.addEventListener("click", async () => {
          try {
            await loadLogs("SYSTEM");
            securityLogsStatus.className = "status";
            securityLogsStatus.textContent = "";
          } catch (error) {
            securityLogsStatus.className = "status error";
            securityLogsStatus.textContent = `Ошибка: ${error.message}`;
          }
        });
        openNotificationsBtn?.addEventListener("click", () => {
          reminderSettingsStatus.className = "status";
          reminderSettingsStatus.textContent = "";
          if (saveReminderSettingsFeedback) {
            saveReminderSettingsFeedback.textContent = "";
            saveReminderSettingsFeedback.classList.remove("visible");
          }
          notificationsModal?.classList.remove("hidden");
        });
        saveReminderSettingsBtn?.addEventListener("click", async () => {
          const enabled24 = !!reminder24EnabledInput?.checked;
          const enabled14 = !!reminder14EnabledInput?.checked;
          saveReminderSettingsBtn.disabled = true;
          try {
            const data = await api("/api/auth/me/reminders", {
              method: "PUT",
              body: JSON.stringify({ enabled24, enabled14 })
            });
            if (data?.user) {
              state.user = data.user;
            } else {
              state.user = {
                ...(state.user || {}),
                reminder24Enabled: enabled24,
                reminder14Enabled: enabled14,
                reminderEnabled: enabled24 || enabled14
              };
            }
            reminderSettingsStatus.className = "status ok";
            reminderSettingsStatus.textContent = "Настройки уведомлений сохранены";
            showSavedFeedback(saveReminderSettingsFeedback);
          } catch (error) {
            reminderSettingsStatus.className = "status error";
            reminderSettingsStatus.textContent = `Ошибка: ${error.message}`;
          } finally {
            saveReminderSettingsBtn.disabled = false;
          }
        });
        document.getElementById("closeNotificationsBtnTop")?.addEventListener("click", () => {
          notificationsModal?.classList.add("hidden");
        });
        notificationsModal?.addEventListener("click", (event) => {
          if (event.target === notificationsModal) notificationsModal.classList.add("hidden");
        });
        if (openAdminPanelBtn) {
          openAdminPanelBtn.addEventListener("click", () => {
            if (!canOpenAdminPanel) {
              showAccessDenied();
              return;
            }
            adminHoursStatus.className = "status";
            adminHoursStatus.textContent = "";
            if (saveAllHoursFeedback) {
              saveAllHoursFeedback.textContent = "";
              saveAllHoursFeedback.classList.remove("visible");
            }
            adminHoursModal.classList.remove("hidden");
          });
        }
        saveAllHoursBtn?.addEventListener("click", async () => {
          const payloads = [];
          for (const loc of state.locations || []) {
            const code = String(loc.code || "");
            const startInput = screen.querySelector(`[data-hours-start='${code}']`);
            const endInput = screen.querySelector(`[data-hours-end='${code}']`);
            const workStart = String(startInput?.value || "").slice(0, 5);
            const workEnd = String(endInput?.value || "").slice(0, 5);
            if (!/^\d{2}:\d{2}$/.test(workStart) || !/^\d{2}:\d{2}$/.test(workEnd)) {
              adminHoursStatus.className = "status error";
              adminHoursStatus.textContent = `Введите корректные часы для "${loc.title}" в формате ЧЧ:ММ`;
              return;
            }
            payloads.push({ code, workStart, workEnd });
          }
          saveAllHoursBtn.disabled = true;
          try {
            await Promise.all(
              payloads.map((item) =>
                api(`/api/schedule/locations/${item.code}/hours`, {
                  method: "PUT",
                  body: JSON.stringify({ workStart: item.workStart, workEnd: item.workEnd })
                })
              )
            );
            state.locations = state.locations.map((loc) => {
              const updated = payloads.find((x) => x.code === loc.code);
              return updated ? { ...loc, workStart: updated.workStart, workEnd: updated.workEnd } : loc;
            });
            if (state.selectedLocation?.code) {
              const selected = payloads.find((x) => x.code === state.selectedLocation.code);
              if (selected) {
                state.selectedLocation = {
                  ...state.selectedLocation,
                  workStart: selected.workStart,
                  workEnd: selected.workEnd
                };
              }
            }
            adminHoursStatus.className = "status ok";
            adminHoursStatus.textContent = "График всех пунктов обновлен";
            showSavedFeedback(saveAllHoursFeedback);
          } catch (error) {
            adminHoursStatus.className = "status error";
            adminHoursStatus.textContent = `Ошибка: ${error.message}`;
          } finally {
            saveAllHoursBtn.disabled = false;
          }
        });
        document.getElementById("closeAdminPanelBtnTop")?.addEventListener("click", () => {
          adminHoursModal.classList.add("hidden");
        });
        adminHoursModal?.addEventListener("click", (event) => {
          if (event.target === adminHoursModal) adminHoursModal.classList.add("hidden");
        });
        renderBottomNav("profile");
      }

      function renderLocations() {
        setAppTitle("");
        const locationHtml = state.locations
          .map(
            (loc) => {
              const btnClass = loc.title.toLowerCase().startsWith("ozon") ? "ozon" : "wb";
              return `<button class="button location-btn ${btnClass}" data-code="${escapeHtml(loc.code)}">
                <span class="location-btn-inner">
                  <span class="location-btn-title">${escapeHtml(loc.title)}</span>
                  <img class="location-btn-arrow" src="/icons/right-arrow.png" alt="Открыть" />
                </span>
              </button>`;
            }
          )
          .join("");

        screen.innerHTML = `
          <h2>Выбор ПВЗ</h2>
          <div class="location-grid mt12">${locationHtml}</div>
        `;
        renderBottomNav("schedule");
        for (const btn of screen.querySelectorAll("[data-code]")) {
          btn.addEventListener("click", () => {
            const location = state.locations.find((x) => x.code === btn.dataset.code);
            if (location) {
              state.selectedLocation = location;
              renderSchedule();
            }
          });
        }
      }

      function reliabilityBadge(value) {
        const label = reliabilities[value] || value;
        return `<span class="badge ${escapeHtml(value)}">${escapeHtml(label)}</span>`;
      }

      function missingEmployeeContact(label) {
        return `
          <div class="employee-contact-row missing">
            <div class="employee-contact-link employee-contact-item">
              <span class="employee-contact-label">${escapeHtml(label)}</span>
              <span class="employee-contact-value">Заполнить</span>
            </div>
            <span class="employee-contact-copy-placeholder" aria-hidden="true"></span>
          </div>
        `;
      }

      function positionOptionsHtml(selected = "manager") {
        return `
          <option value="owner" ${selected === "owner" ? "selected" : ""}>Владелец</option>
          <option value="owner_manager" ${selected === "owner_manager" ? "selected" : ""}>Управляющий</option>
          <option value="senior_manager" ${selected === "senior_manager" ? "selected" : ""}>Старший менеджер</option>
          <option value="manager" ${selected === "manager" ? "selected" : ""}>Менеджер</option>
          <option value="intern" ${selected === "intern" ? "selected" : ""}>Стажер</option>
        `;
      }

      function accessRoleOptionsHtml(selected = "PARTICIPANT", actorRole = "PARTICIPANT", targetProtected = false) {
        if (targetProtected) {
          return `<option value="ADMIN" selected>Гл. Админ</option>`;
        }
        if (actorRole === "SUPERADMIN") {
          return `
            <option value="PARTICIPANT" ${selected === "PARTICIPANT" ? "selected" : ""}>Участник</option>
            <option value="ADMIN" ${selected === "ADMIN" ? "selected" : ""}>Админ</option>
          `;
        }
        return `
          <option value="PARTICIPANT" ${selected === "PARTICIPANT" ? "selected" : ""}>Участник</option>
          <option value="ADMIN" ${selected === "ADMIN" ? "selected" : ""}>Админ</option>
        `;
      }

      function reliabilityOptionsHtml(selected = "checking") {
        return `
          <option value="reliable" ${selected === "reliable" ? "selected" : ""}>Надежный</option>
          <option value="checking" ${selected === "checking" ? "selected" : ""}>Проверяется</option>
          <option value="borderline" ${selected === "borderline" ? "selected" : ""}>На грани увольнения</option>
        `;
      }

      function mapEmployeeApiError(error) {
        if (!error?.message) return "Не удалось сохранить сотрудника";
        if (error.message.toLowerCase().includes("почт") || error.message.toLowerCase().includes("email")) {
          return error.message;
        }
        if (error.message.includes("phone") || error.message.includes("телефон")) {
          return "Некорректный номер телефона. Пример: +7 999 123-45-67";
        }
        return error.message;
      }

      function normalizeTelegramContact(value) {
        const raw = value.trim();
        if (!raw) return "";
        return raw.startsWith("@") ? raw : `@${raw}`;
      }

      function normalizeVkContact(value) {
        const raw = String(value || "").trim();
        if (!raw) return "";
        return raw.replace(
          /^https?:\/\/(?:m\.)?vk\.com\//i,
          "https://vk.ru/"
        );
      }

      function onlyDigits(value) {
        return String(value || "").replace(/\D/g, "");
      }

      function applyPhoneMask(value) {
        let digits = onlyDigits(value);
        if (!digits) return "";

        // Some browsers append a pasted +7 number to the prefilled +7.
        if (digits.length > 11 && digits.startsWith("77")) {
          digits = digits.slice(1);
        }

        const hasCountryPrefix =
          digits.length >= 11 && (digits.startsWith("7") || digits.startsWith("8"));
        const nationalDigits = hasCountryPrefix
          ? digits.slice(1)
          : digits.startsWith("7")
            ? digits.slice(1)
            : digits;
        const normalized = `7${nationalDigits}`;
        const cut = normalized.slice(0, 11);
        const p1 = cut.slice(1, 4);
        const p2 = cut.slice(4, 7);
        const p3 = cut.slice(7, 9);
        const p4 = cut.slice(9, 11);

        let out = "+7";
        if (p1) out += ` ${p1}`;
        if (p2) out += ` ${p2}`;
        if (p3) out += `-${p3}`;
        if (p4) out += `-${p4}`;
        return out;
      }

      function replacePhoneFromPaste(event, input) {
        const pastedValue = event.clipboardData?.getData("text") || "";
        if (!onlyDigits(pastedValue)) return;

        event.preventDefault();
        input.value = applyPhoneMask(pastedValue);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }

      function normalizePhone(value) {
        const masked = applyPhoneMask(value);
        const digits = onlyDigits(masked);
        if (!digits) return "";
        if (digits.length !== 11 || digits[0] !== "7") return null;
        return masked;
      }

      function authIdFromPhoneClient(value) {
        const normalized = normalizePhone(value);
        if (!normalized) return "";
        const digits = onlyDigits(normalized);
        return digits ? `phone:${digits}` : "";
      }

      function normalizePinDigitsGlobal(value) {
        return String(value || "").replace(/\D/g, "").slice(0, 4);
      }

      function isPinLengthValidGlobal(pin) {
        return /^\d{4}$/.test(String(pin || ""));
      }

      function renderEmployeeCardDocuments(employee) {
        const imageDocuments = (Array.isArray(employee.documents) ? employee.documents : []).filter(
          (documentItem) => String(documentItem.mimeType || "").startsWith("image/")
        );
        if (!imageDocuments.length) return "";
        return `
          <div class="employee-card-documents">
            <div class="employee-card-documents-title">Документы</div>
            <div class="employee-card-document-grid">
              ${imageDocuments
                .map(
                  (documentItem) => `
                    <button
                      class="employee-card-document"
                      type="button"
                      data-image-preview="/api/employees/${escapeHtml(employee.id)}/documents/${escapeHtml(documentItem.id)}"
                      data-image-alt="${escapeHtml(documentItem.originalName || "Документ сотрудника")}"
                      title="${escapeHtml(documentItem.originalName || "Документ")}"
                    >
                      <img
                        src="/api/employees/${escapeHtml(employee.id)}/documents/${escapeHtml(documentItem.id)}"
                        alt="${escapeHtml(documentItem.originalName || "Документ сотрудника")}"
                        loading="lazy"
                      />
                      <span>${escapeHtml(documentItem.originalName || "Документ")}</span>
                    </button>
                  `
                )
                .join("")}
            </div>
          </div>
        `;
      }

      async function renderEmployeesBase() {
        setAppTitle("");
        await loadEmployees();

        const employeeHtml = state.employees.length
          ? state.employees
              .map(
                (emp) => `
                  <div
                    class="employee-row reliability-${escapeHtml(emp.reliability || "checking")} avatar-accent-${escapeHtml(employeeAvatarAccent(emp.avatarUrl))}"
                    data-employee-card-id="${escapeHtml(emp.id)}"
                  >
                    <div class="employee-main">
                      ${renderUserAvatar({
                        avatarUrl: emp.avatarUrl || "",
                        initials: (emp.fullName || "?").slice(0, 1).toUpperCase(),
                        className: "employee-avatar",
                        alt: `Аватар ${emp.fullName || "сотрудника"}`,
                        nonce: `${state.avatarNonce}-${emp.telegramId || emp.id || "emp"}`
                      })}
                      <div class="employee-content">
                        <div class="employee-head">
                          <div class="employee-name">${escapeHtml(emp.fullName)}</div>
                          ${reliabilityBadge(emp.reliability)}
                          <div class="employee-head-actions">
                            <button
                              class="employee-edit-icon-btn ${canEditEmployeeFromList(emp) ? "" : "disabled"}"
                              data-edit-id="${emp.id}"
                              ${canEditEmployeeFromList(emp) ? "" : "disabled"}
                              type="button"
                              aria-label="Редактировать"
                              title="Редактировать"
                            >
                              <img src="/icons/employee-edit.png" alt="Редактировать" />
                            </button>
                          </div>
                        </div>
                        <div class="employee-roleline">
                          ${escapeHtml(positions[emp.position] || emp.position)}
                          ${emp.accessRole ? ` · Доступ: ${escapeHtml(userRoles[emp.accessRole] || emp.accessRole)}` : ""}
                        </div>
                      </div>
                    </div>
                    <div class="employee-locationline">
                      ПВЗ: ${
                        Array.isArray(emp.locations) && emp.locations.length
                          ? emp.locations
                              .map((location) => renderLocationLabelHtml(location.title))
                              .join(", ")
                          : "не назначены"
                      }
                    </div>
                    <div class="employee-contacts">
                          ${emp.email
                            ? `<div class="employee-contact-row">
                                <a class="employee-contact-link employee-contact-item" href="mailto:${escapeHtml(emp.email)}">
                                  <span class="employee-contact-label">Почта</span>
                                  <span class="employee-contact-value">${escapeHtml(emp.email)}</span>
                                </a>
                                <button type="button" class="employee-contact-copy-btn" data-copy-value="${escapeHtml(emp.email)}" data-copy-label="Почта" aria-label="Скопировать почту" title="Скопировать почту">
                                  <img src="/icons/copy.png" alt="Скопировать" />
                                </button>
                              </div>`
                            : missingEmployeeContact("Почта")}
                          ${emp.phone
                            ? `<div class="employee-contact-row">
                                <div class="employee-contact-link employee-contact-item">
                                  <span class="employee-contact-label">Телефон</span>
                                  <span class="employee-contact-value">${escapeHtml(emp.phone)}</span>
                                </div>
                                <button
                                  type="button"
                                  class="employee-contact-copy-btn"
                                  data-copy-value="${escapeHtml(emp.phone)}"
                                  data-copy-label="Номер"
                                  aria-label="Скопировать телефон"
                                  title="Скопировать телефон"
                                >
                                  <img src="/icons/copy.png" alt="Скопировать" />
                                </button>
                              </div>`
                            : missingEmployeeContact("Телефон")}
                          ${(() => {
                            const raw = String(emp.telegramContact || "").trim();
                            if (!raw) return missingEmployeeContact("TG");
                            const clean = raw.replace(/^@/, "");
                            if (!clean) return missingEmployeeContact("TG");
                            const href = /^\d+$/.test(clean)
                              ? `tg://user?id=${clean}`
                              : `https://t.me/${encodeURIComponent(clean)}`;
                            const label = raw.startsWith("@") ? raw : `@${raw}`;
                            return `<div class="employee-contact-row">
                              <a class="employee-contact-link employee-contact-item" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">
                                <span class="employee-contact-label">TG</span>
                                <span class="employee-contact-value">${escapeHtml(label)}</span>
                              </a>
                              <button
                                type="button"
                                class="employee-contact-copy-btn"
                                data-copy-value="${escapeHtml(label)}"
                                data-copy-label="TG"
                                aria-label="Скопировать TG"
                                title="Скопировать TG"
                              >
                                <img src="/icons/copy.png" alt="Скопировать" />
                              </button>
                            </div>`;
                          })()}
                          ${(() => {
                            const raw = String(emp.vkContact || "").trim();
                            if (!raw) return missingEmployeeContact("VK");
                            const canonical = normalizeVkContact(raw);
                            const href = /^https?:\/\//i.test(canonical) ? canonical : `https://${canonical}`;
                            return `<div class="employee-contact-row">
                              <a class="employee-contact-link employee-contact-item" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">
                                <span class="employee-contact-label">VK</span>
                                <span class="employee-contact-value">${escapeHtml(canonical)}</span>
                              </a>
                              <button
                                type="button"
                                class="employee-contact-copy-btn"
                                data-copy-value="${escapeHtml(href)}"
                                data-copy-label="VK"
                                aria-label="Скопировать VK"
                                title="Скопировать VK"
                              >
                                <img src="/icons/copy.png" alt="Скопировать" />
                              </button>
                            </div>`;
                          })()}
                    </div>
                    ${renderEmployeeCardDocuments(emp)}
                  </div>
                `
              )
              .join("")
          : `<div class="muted">Список пока пуст.</div>`;

        screen.innerHTML = `
          <div class="employees-header">
            <h2>База сотрудников</h2>
            <button class="button add-employee-btn icon-only" id="openAddEmployeeBtn" type="button" aria-label="Добавить сотрудника" title="Добавить сотрудника">
              <img src="/icons/employee-add.png" alt="Добавить сотрудника" />
            </button>
          </div>
          <div id="employeeModal" class="modal fullscreen-modal hidden">
            <div id="employeePanel" class="panel">
              <div class="employee-panel-head">
                <button id="closeEmployeePanelBtnTop" class="open-arrow-btn" type="button" aria-label="Назад">
                  <img src="/icons/back-arrow.png" alt="Назад" />
                </button>
                <h3 id="employeePanelTitle" class="panel-title">Добавить сотрудника</h3>
              </div>
              <p id="employeeFormStatus" class="employee-panel-status" role="status" aria-live="polite"></p>
              <div class="employee-form-stack mt12">
                <div class="employee-form-group">
                  <p class="employee-form-group-title">Основные данные</p>
                  <div class="employee-form-group-grid">
                    <div class="employee-form-field">
                      <div class="employee-form-label">Электронная почта</div>
                      <input id="emailInput" type="email" inputmode="email" autocomplete="email" placeholder="name@yandex.ru" required />
                    </div>
                    <div class="employee-form-field">
                      <div class="employee-form-label-row">
                        <div class="employee-form-label">Имя</div>
                      </div>
                      <div id="firstNameInputWrap" class="employee-form-input-with-error">
                        <input id="firstNameInput" type="text" required minlength="3" aria-describedby="firstNameInlineError" />
                        <span id="firstNameInlineError" class="employee-form-inline-error" aria-live="polite"></span>
                      </div>
                    </div>
                    <div class="employee-form-field">
                      <div class="employee-form-label-row">
                        <div class="employee-form-label">Фамилия</div>
                      </div>
                      <div id="lastNameInputWrap" class="employee-form-input-with-error">
                        <input id="lastNameInput" type="text" required minlength="3" aria-describedby="lastNameInlineError" />
                        <span id="lastNameInlineError" class="employee-form-inline-error" aria-live="polite"></span>
                      </div>
                    </div>
                    <div class="employee-form-field">
                      <div class="employee-form-label">Должность</div>
                      <select id="positionInput">${positionOptionsHtml("manager")}</select>
                    </div>
                    <div class="employee-form-field">
                      <div class="employee-form-label">Надежность</div>
                      <select id="reliabilityInput">${reliabilityOptionsHtml("checking")}</select>
                    </div>
                  </div>
                </div>

                <div class="employee-form-group">
                  <p class="employee-form-group-title">Контакты</p>
                  <div class="employee-form-group-grid">
                    <div class="employee-form-field">
                      <div class="employee-form-label">Телефон</div>
                      <input id="phoneInput" type="tel" placeholder="+7 922 ***‒**‒94" inputmode="numeric" required />
                    </div>
                    <div class="employee-form-field">
                      <div class="employee-form-label">Telegram контакт</div>
                      <input id="telegramInput" type="text" placeholder="@username" />
                    </div>
                    <div class="employee-form-field">
                      <div class="employee-form-label">VK контакт</div>
                      <input id="vkInput" type="text" placeholder="https://vk.ru/username" />
                    </div>
                  </div>
                </div>

                <div id="employeeDocumentsGroup" class="employee-form-group">
                  <p class="employee-form-group-title">Документы сотрудника</p>
                  <div class="employee-photo-upload-row">
                    <div>
                      <div class="employee-form-label">Фото сотрудника</div>
                      <div class="muted">JPG, PNG или WEBP, до 5 МБ</div>
                    </div>
                    <input id="employeePhotoInput" class="hidden" type="file" accept="image/jpeg,image/png,image/webp" />
                    <button id="employeePhotoUploadBtn" class="employee-document-upload-btn" type="button">Загрузить фото</button>
                  </div>
                  <div class="muted">Паспорт: PDF, JPG, PNG или WEBP, до 10 МБ</div>
                  <input id="employeeDocumentInput" class="hidden" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" multiple />
                  <button id="employeeDocumentUploadBtn" class="employee-document-upload-btn mt8" type="button">Загрузить паспорт</button>
                  <p id="employeeDocumentStatus" class="status mt8"></p>
                  <div id="employeeDocumentList" class="employee-document-list"></div>
                </div>

                <div class="employee-form-group">
                  <p class="employee-form-group-title">Пункты выдачи</p>
                  <div id="employeeLocationsInput" class="employee-location-options">
                    ${(state.employeeLocationOptions || [])
                      .map(
                        (location) => `
                          <label class="employee-location-option">
                            <input type="checkbox" value="${escapeHtml(location.code)}" />
                            <span>${renderLocationLabelHtml(location.title)}</span>
                          </label>
                        `
                      )
                      .join("")}
                  </div>
                </div>

                <div class="employee-form-group">
                  <p class="employee-form-group-title">Доступ</p>
                  <div class="employee-form-group-grid">
                    <div class="employee-form-field">
                      <div class="employee-form-label">Роль в приложении</div>
                      <select id="accessRoleInput">${accessRoleOptionsHtml("PARTICIPANT", state.user.role, false)}</select>
                    </div>
                  </div>
                </div>
              </div>
              <div class="form-save-footer">
                <div class="save-icon-wrap">
                  <button class="save-icon-btn" id="saveEmployeeBtn" type="button">Добавить</button>
                  <div id="saveEmployeeFeedback" class="save-feedback"></div>
                </div>
                <div class="save-icon-wrap">
                  <button class="employee-delete-btn" id="deleteEmployeeBtn" type="button" aria-label="Удалить сотрудника" title="Удалить сотрудника">
                    <img src="/icons/delete-bin.png" alt="Удалить" />
                  </button>
                  <div class="save-feedback"></div>
                </div>
              </div>
            </div>
          </div>
          <p id="employeeStatus" class="status mt8"></p>
          <div class="employees-list mt12">${employeeHtml}</div>
        `;
        renderBottomNav("employees");
        const status = document.getElementById("employeeStatus");
        const formStatus = document.getElementById("employeeFormStatus");
        const modal = document.getElementById("employeeModal");
        const panel = document.getElementById("employeePanel");
        const panelTitle = document.getElementById("employeePanelTitle");
        const firstNameInput = document.getElementById("firstNameInput");
        const lastNameInput = document.getElementById("lastNameInput");
        const firstNameInputWrap = document.getElementById("firstNameInputWrap");
        const lastNameInputWrap = document.getElementById("lastNameInputWrap");
        const firstNameInlineError = document.getElementById("firstNameInlineError");
        const lastNameInlineError = document.getElementById("lastNameInlineError");
        const emailInput = document.getElementById("emailInput");
        const phoneInput = document.getElementById("phoneInput");
        const telegramInput = document.getElementById("telegramInput");
        const vkInput = document.getElementById("vkInput");
        const positionInput = document.getElementById("positionInput");
        const reliabilityInput = document.getElementById("reliabilityInput");
        const employeeLocationsInput = document.getElementById("employeeLocationsInput");
        const accessRoleInput = document.getElementById("accessRoleInput");
        const employeeDocumentsGroup = document.getElementById("employeeDocumentsGroup");
        const employeePhotoInput = document.getElementById("employeePhotoInput");
        const employeePhotoUploadBtn = document.getElementById("employeePhotoUploadBtn");
        const employeeDocumentInput = document.getElementById("employeeDocumentInput");
        const employeeDocumentUploadBtn = document.getElementById("employeeDocumentUploadBtn");
        const employeeDocumentStatus = document.getElementById("employeeDocumentStatus");
        const employeeDocumentList = document.getElementById("employeeDocumentList");
        const deleteEmployeeBtn = document.getElementById("deleteEmployeeBtn");
        const deleteEmployeeWrap = deleteEmployeeBtn?.closest(".save-icon-wrap");
        const saveEmployeeBtn = document.getElementById("saveEmployeeBtn");
        const saveEmployeeFeedback = document.getElementById("saveEmployeeFeedback");
        let editingEmployeeId = null;
        let loadedEmployeeDocuments = [];
        let pendingEmployeePhoto = null;
        let pendingEmployeeDocuments = [];

        const releasePendingEmployeeFiles = () => {
          if (pendingEmployeePhoto?.url) URL.revokeObjectURL(pendingEmployeePhoto.url);
          for (const pending of pendingEmployeeDocuments) {
            if (pending.url) URL.revokeObjectURL(pending.url);
          }
          pendingEmployeePhoto = null;
          pendingEmployeeDocuments = [];
        };

        const formatFileSize = (bytes) => {
          const size = Math.max(0, Number(bytes || 0));
          if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} КБ`;
          return `${(size / (1024 * 1024)).toFixed(1)} МБ`;
        };

        const renderEmployeeDocuments = (documents = loadedEmployeeDocuments) => {
          loadedEmployeeDocuments = Array.isArray(documents) ? documents : [];
          const pendingRows = [
            pendingEmployeePhoto
              ? `
                <div class="employee-document-item">
                  <button class="employee-document-preview" type="button" data-image-preview="${escapeHtml(pendingEmployeePhoto.url)}" data-image-alt="Фото сотрудника">
                    <img src="${escapeHtml(pendingEmployeePhoto.url)}" alt="Фото сотрудника" />
                  </button>
                  <div class="employee-document-link">
                    Фото сотрудника: ${escapeHtml(pendingEmployeePhoto.file.name)}
                    <span class="employee-document-meta">Будет загружено после добавления</span>
                  </div>
                  <button class="employee-document-delete" type="button" data-remove-pending-photo="1" aria-label="Убрать фото" title="Убрать фото"><img src="/icons/delete-bin.png" alt="Убрать" /></button>
                </div>
              `
              : "",
            ...pendingEmployeeDocuments.map((pending) => `
              <div class="employee-document-item">
                ${
                  pending.isImage
                    ? `<button class="employee-document-preview" type="button" data-image-preview="${escapeHtml(pending.url)}" data-image-alt="${escapeHtml(pending.file.name)}"><img src="${escapeHtml(pending.url)}" alt="${escapeHtml(pending.file.name)}" /></button>`
                    : `<button class="employee-document-preview" type="button" data-document-preview="${escapeHtml(pending.url)}" aria-label="Открыть ${escapeHtml(pending.file.name)}">PDF</button>`
                }
                <div class="employee-document-link">
                  ${escapeHtml(pending.file.name)}
                  <span class="employee-document-meta">Будет загружено после добавления · ${formatFileSize(pending.file.size)}</span>
                </div>
                <button class="employee-document-delete" type="button" data-remove-pending-document="${escapeHtml(pending.id)}" aria-label="Убрать документ" title="Убрать документ"><img src="/icons/delete-bin.png" alt="Убрать" /></button>
              </div>
            `)
          ].filter(Boolean).join("");
          const savedRows = loadedEmployeeDocuments.length
            ? loadedEmployeeDocuments
                .map(
                  (documentItem) => {
                    const documentUrl = `/api/employees/${editingEmployeeId}/documents/${escapeHtml(documentItem.id)}`;
                    const isImage = String(documentItem.mimeType || "").startsWith("image/");
                    return `
                    <div class="employee-document-item">
                      ${isImage
                        ? `<button class="employee-document-preview" type="button" data-image-preview="${documentUrl}" data-image-alt="${escapeHtml(documentItem.originalName || "Документ")}" title="Открыть ${escapeHtml(documentItem.originalName || "документ")}"><img src="${documentUrl}" alt="${escapeHtml(documentItem.originalName || "Документ")}" loading="lazy" /></button>`
                        : `<button class="employee-document-preview" type="button" data-document-preview="${documentUrl}" aria-label="Открыть ${escapeHtml(documentItem.originalName || "PDF документ")}">PDF</button>`
                      }
                      <div class="employee-document-link">
                        ${escapeHtml(documentItem.originalName || "Документ")}
                        <span class="employee-document-meta">${formatFileSize(documentItem.sizeBytes)}</span>
                      </div>
                      <button
                        class="employee-document-delete"
                        type="button"
                        data-delete-employee-document="${escapeHtml(documentItem.id)}"
                        aria-label="Удалить документ"
                        title="Удалить документ"
                      ><img src="/icons/delete-bin.png" alt="Удалить" /></button>
                    </div>
                  `;
                  }
                )
                .join("")
            : "";
          employeeDocumentList.innerHTML = pendingRows || savedRows
            ? `${pendingRows}${savedRows}`
            : `<div class="muted">Фото и паспорт пока не выбраны.</div>`;
        };

        const loadEmployeeDocuments = async () => {
          if (!editingEmployeeId) return;
          employeeDocumentStatus.className = "status mt8";
          employeeDocumentStatus.textContent = "Загрузка...";
          try {
            const data = await api(`/api/employees/${editingEmployeeId}/documents`);
            renderEmployeeDocuments(Array.isArray(data.documents) ? data.documents : []);
            employeeDocumentStatus.textContent = "";
          } catch (error) {
            employeeDocumentStatus.className = "status error mt8";
            employeeDocumentStatus.textContent = error.message;
          }
        };

        const updateNameFieldError = (input, inputWrap, errorElement, force = false) => {
          const length = input.value.trim().length;
          const invalid = length > 0 && length < 3;
          const emptyRequired = force && length === 0;
          errorElement.textContent = invalid || emptyRequired ? "Нужно хотя бы 3 символа" : "";
          inputWrap.classList.toggle("has-error", invalid || emptyRequired);
          input.setAttribute("aria-invalid", invalid || emptyRequired ? "true" : "false");
          return !(invalid || emptyRequired);
        };

        const openPanel = () => modal.classList.remove("hidden");
        const closePanel = () => {
          modal.classList.add("hidden");
          releasePendingEmployeeFiles();
        };
        const resetForm = () => {
          releasePendingEmployeeFiles();
          loadedEmployeeDocuments = [];
          firstNameInput.value = "";
          lastNameInput.value = "";
          updateNameFieldError(firstNameInput, firstNameInputWrap, firstNameInlineError);
          updateNameFieldError(lastNameInput, lastNameInputWrap, lastNameInlineError);
          emailInput.value = "";
          phoneInput.value = "";
          telegramInput.value = "";
          vkInput.value = "";
          positionInput.value = "manager";
          reliabilityInput.value = "checking";
          for (const checkbox of employeeLocationsInput.querySelectorAll("input[type='checkbox']")) {
            checkbox.checked = false;
          }
          accessRoleInput.innerHTML = accessRoleOptionsHtml("PARTICIPANT", state.user.role, false);
          accessRoleInput.value = "PARTICIPANT";
          accessRoleInput.disabled = false;
          employeePhotoUploadBtn.disabled = false;
          employeeDocumentUploadBtn.disabled = false;
          saveEmployeeBtn.textContent = "Добавить";
          saveEmployeeBtn.disabled = false;
          formStatus.className = "employee-panel-status";
          formStatus.textContent = "";
          if (saveEmployeeFeedback) {
            saveEmployeeFeedback.textContent = "";
            saveEmployeeFeedback.classList.remove("visible");
          }
          if (deleteEmployeeWrap) deleteEmployeeWrap.style.display = "none";
          deleteEmployeeBtn.disabled = true;
          deleteEmployeeBtn.title = "Удалить сотрудника";
          employeeDocumentsGroup.classList.remove("hidden");
          employeePhotoInput.value = "";
          employeeDocumentInput.value = "";
          employeeDocumentStatus.textContent = "";
          renderEmployeeDocuments([]);
        };

        const openForCreate = () => {
          editingEmployeeId = null;
          panelTitle.textContent = "Добавить сотрудника";
          resetForm();
          openPanel();
        };

        const openForEdit = (employeeId) => {
          const employee = state.employees.find((x) => String(x.id) === String(employeeId));
          if (!employee) {
            status.className = "status error";
            status.textContent = "Сотрудник не найден";
            return;
          }

          releasePendingEmployeeFiles();
          loadedEmployeeDocuments = [];
          editingEmployeeId = employee.id;
          panelTitle.textContent = "Редактировать сотрудника";
          saveEmployeeBtn.textContent = "Сохранить";
          firstNameInput.value = employee.firstName || "";
          lastNameInput.value = employee.lastName || "";
          emailInput.value = employee.email || "";
          phoneInput.value = employee.phone || "";
          telegramInput.value = employee.telegramContact || "";
          vkInput.value = normalizeVkContact(employee.vkContact || "");
          positionInput.value = employee.position || "manager";
          reliabilityInput.value = employee.reliability || "checking";
          const employeeLocationCodes = new Set(
            Array.isArray(employee.locationCodes) ? employee.locationCodes : []
          );
          for (const checkbox of employeeLocationsInput.querySelectorAll("input[type='checkbox']")) {
            checkbox.checked = employeeLocationCodes.has(checkbox.value);
          }
          accessRoleInput.innerHTML = accessRoleOptionsHtml(
            employee.accessRole || "PARTICIPANT",
            state.user.role,
            !!employee.isProtected
          );
          accessRoleInput.value = employee.accessRole || "PARTICIPANT";
          accessRoleInput.disabled =
            !!employee.isProtected || state.user.role === "ADMIN";
          const adminCannotEdit =
            state.user.role === "ADMIN" &&
            (employee.accessRole || "PARTICIPANT") !== "PARTICIPANT";
          saveEmployeeBtn.disabled = adminCannotEdit;
          if (adminCannotEdit) {
            formStatus.className = "employee-panel-status error";
            formStatus.textContent = "Админ может изменять и удалять только участников";
          } else {
            formStatus.className = "employee-panel-status";
            formStatus.textContent = "";
          }
          if (deleteEmployeeWrap) deleteEmployeeWrap.style.display = "flex";
          deleteEmployeeBtn.disabled = !!employee.isProtected || adminCannotEdit;
          deleteEmployeeBtn.title = employee.isProtected
            ? "Удаление запрещено"
            : "Удалить сотрудника";
          employeeDocumentsGroup.classList.remove("hidden");
          employeePhotoUploadBtn.disabled = adminCannotEdit;
          employeeDocumentUploadBtn.disabled = adminCannotEdit;
          loadEmployeeDocuments();
          openPanel();
        };

        document.getElementById("openAddEmployeeBtn").addEventListener("click", openForCreate);
        document.getElementById("closeEmployeePanelBtnTop").addEventListener("click", closePanel);
        modal.addEventListener("click", (event) => {
          if (event.target === modal) closePanel();
        });
        panel.addEventListener("click", (event) => event.stopPropagation());
        phoneInput.addEventListener("focus", () => {
          if (!phoneInput.value.trim()) {
            phoneInput.value = "+7";
          }
        });
        phoneInput.addEventListener("blur", () => {
          const digits = onlyDigits(phoneInput.value);
          if (!digits || digits === "7") {
            phoneInput.value = "";
          }
        });
        phoneInput.addEventListener("input", () => {
          phoneInput.value = applyPhoneMask(phoneInput.value);
        });
        phoneInput.addEventListener("paste", (event) => {
          replacePhoneFromPaste(event, phoneInput);
        });
        firstNameInput.addEventListener("input", () => {
          updateNameFieldError(firstNameInput, firstNameInputWrap, firstNameInlineError);
        });
        lastNameInput.addEventListener("input", () => {
          updateNameFieldError(lastNameInput, lastNameInputWrap, lastNameInlineError);
        });
        employeePhotoUploadBtn.addEventListener("click", () => {
          employeePhotoInput.click();
        });
        employeePhotoInput.addEventListener("change", async () => {
          const file = employeePhotoInput.files?.[0];
          if (!file) return;
          if (!editingEmployeeId) {
            if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
              employeeDocumentStatus.className = "status error mt8";
              employeeDocumentStatus.textContent = "Фото должно быть в формате JPG, PNG или WEBP";
              employeePhotoInput.value = "";
              return;
            }
            if (file.size > 5 * 1024 * 1024) {
              employeeDocumentStatus.className = "status error mt8";
              employeeDocumentStatus.textContent = "Фотография сотрудника должна быть не больше 5 МБ";
              employeePhotoInput.value = "";
              return;
            }
            if (pendingEmployeePhoto?.url) URL.revokeObjectURL(pendingEmployeePhoto.url);
            pendingEmployeePhoto = { file, url: URL.createObjectURL(file) };
            employeeDocumentStatus.className = "status ok mt8";
            employeeDocumentStatus.textContent = "Фото выбрано и загрузится после добавления сотрудника";
            renderEmployeeDocuments();
            employeePhotoInput.value = "";
            return;
          }
          employeePhotoUploadBtn.disabled = true;
          employeeDocumentStatus.className = "status mt8";
          employeeDocumentStatus.textContent = "Загрузка фото...";
          try {
            const formData = new FormData();
            formData.append("file", file, file.name);
            const result = await api(`/api/employees/${editingEmployeeId}/photo`, {
              method: "POST",
              body: formData
            });
            const employee = state.employees.find((item) => String(item.id) === String(editingEmployeeId));
            if (employee && result.employee) {
              employee.avatarUrl = result.employee.avatarUrl || "";
            }
            state.avatarNonce = Date.now();
            const card = screen.querySelector(`[data-employee-card-id="${String(editingEmployeeId)}"]`);
            const oldAvatar = card?.querySelector(".employee-avatar");
            if (card && oldAvatar && employee) {
              const avatarHolder = document.createElement("div");
              avatarHolder.innerHTML = renderUserAvatar({
                avatarUrl: employee.avatarUrl || "",
                initials: (employee.fullName || "?").slice(0, 1).toUpperCase(),
                className: "employee-avatar",
                alt: `Аватар ${employee.fullName || "сотрудника"}`,
                nonce: state.avatarNonce
              });
              oldAvatar.replaceWith(avatarHolder.firstElementChild);
              for (const accent of avatarBackgrounds.concat("photo")) {
                card.classList.remove(`avatar-accent-${accent}`);
              }
              card.classList.add(`avatar-accent-${employeeAvatarAccent(employee.avatarUrl)}`);
            }
            employeeDocumentStatus.className = "status ok mt8";
            employeeDocumentStatus.textContent = "Фото сотрудника обновлено";
          } catch (error) {
            employeeDocumentStatus.className = "status error mt8";
            employeeDocumentStatus.textContent = error.message;
          } finally {
            employeePhotoInput.value = "";
            employeePhotoUploadBtn.disabled = false;
          }
        });
        employeeDocumentUploadBtn.addEventListener("click", () => {
          employeeDocumentInput.click();
        });
        employeeDocumentInput.addEventListener("change", async () => {
          const files = [...(employeeDocumentInput.files || [])];
          if (!files.length) return;
          if (!editingEmployeeId) {
            const allowedTypes = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
            const invalidFile = files.find((file) => !allowedTypes.has(file.type) || file.size > 10 * 1024 * 1024);
            if (invalidFile) {
              employeeDocumentStatus.className = "status error mt8";
              employeeDocumentStatus.textContent = !allowedTypes.has(invalidFile.type)
                ? "Паспорт должен быть в формате PDF, JPG, PNG или WEBP"
                : "Каждый документ должен быть не больше 10 МБ";
              employeeDocumentInput.value = "";
              return;
            }
            pendingEmployeeDocuments.push(
              ...files.map((file, index) => {
                const isImage = file.type.startsWith("image/");
                return {
                  id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`,
                  file,
                  isImage,
                  url: URL.createObjectURL(file)
                };
              })
            );
            employeeDocumentStatus.className = "status ok mt8";
            employeeDocumentStatus.textContent = "Документы выбраны и загрузятся после добавления сотрудника";
            renderEmployeeDocuments();
            employeeDocumentInput.value = "";
            return;
          }
          employeeDocumentUploadBtn.disabled = true;
          employeeDocumentStatus.className = "status mt8";
          employeeDocumentStatus.textContent = "Загрузка документов...";
          try {
            for (const file of files) {
              const formData = new FormData();
              formData.append("file", file, file.name);
              await api(`/api/employees/${editingEmployeeId}/documents`, {
                method: "POST",
                body: formData
              });
            }
            employeeDocumentStatus.className = "status ok mt8";
            employeeDocumentStatus.textContent = files.length > 1 ? "Документы загружены" : "Документ загружен";
            await loadEmployeeDocuments();
          } catch (error) {
            employeeDocumentStatus.className = "status error mt8";
            employeeDocumentStatus.textContent = error.message;
          } finally {
            employeeDocumentInput.value = "";
            employeeDocumentUploadBtn.disabled = false;
          }
        });
        employeeDocumentList.addEventListener("click", async (event) => {
          const removePendingPhoto = event.target.closest("[data-remove-pending-photo]");
          if (removePendingPhoto) {
            if (pendingEmployeePhoto?.url) URL.revokeObjectURL(pendingEmployeePhoto.url);
            pendingEmployeePhoto = null;
            renderEmployeeDocuments();
            return;
          }
          const removePendingDocument = event.target.closest("[data-remove-pending-document]");
          if (removePendingDocument) {
            const pendingId = String(removePendingDocument.dataset.removePendingDocument || "");
            const pending = pendingEmployeeDocuments.find((item) => item.id === pendingId);
            if (pending?.url) URL.revokeObjectURL(pending.url);
            pendingEmployeeDocuments = pendingEmployeeDocuments.filter((item) => item.id !== pendingId);
            renderEmployeeDocuments();
            return;
          }
          const button = event.target.closest("[data-delete-employee-document]");
          if (!button || !editingEmployeeId) return;
          const confirmed = await confirmAction("Удалить паспортный документ?", { danger: true });
          if (!confirmed) return;
          button.disabled = true;
          try {
            await api(
              `/api/employees/${editingEmployeeId}/documents/${encodeURIComponent(
                button.dataset.deleteEmployeeDocument
              )}`,
              { method: "DELETE" }
            );
            await loadEmployeeDocuments();
          } catch (error) {
            employeeDocumentStatus.className = "status error mt8";
            employeeDocumentStatus.textContent = error.message;
            button.disabled = false;
          }
        });

        saveEmployeeBtn.addEventListener("click", async () => {
          const firstName = firstNameInput.value.trim();
          const lastName = lastNameInput.value.trim();
          const email = emailInput.value.trim().toLowerCase();
          const normalizedPhone = normalizePhone(phoneInput.value);
          const telegramContact = normalizeTelegramContact(telegramInput.value);
          const vkContact = normalizeVkContact(vkInput.value);
          const position = positionInput.value;
          const reliability = reliabilityInput.value;
          const locationCodes = [
            ...employeeLocationsInput.querySelectorAll("input[type='checkbox']:checked")
          ].map((checkbox) => checkbox.value);
          const accessRole = accessRoleInput.value || "PARTICIPANT";

          const firstNameValid = updateNameFieldError(
            firstNameInput,
            firstNameInputWrap,
            firstNameInlineError,
            true
          );
          const lastNameValid = updateNameFieldError(
            lastNameInput,
            lastNameInputWrap,
            lastNameInlineError,
            true
          );
          if (!firstNameValid || !lastNameValid) {
            return;
          }

          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            formStatus.className = "employee-panel-status error";
            formStatus.textContent = "Укажите корректную электронную почту";
            emailInput.focus();
            return;
          }

          if (!normalizedPhone) {
            formStatus.className = "employee-panel-status error";
            formStatus.textContent = "Укажите номер телефона в формате +7 999 999-99-99";
            return;
          }
          if (!locationCodes.length) {
            formStatus.className = "employee-panel-status error";
            formStatus.textContent = "Выберите минимум один ПВЗ";
            return;
          }

          try {
            formStatus.className = "employee-panel-status";
            formStatus.textContent = "";
            const isCreatingEmployee = !editingEmployeeId;
            const method = isCreatingEmployee ? "POST" : "PUT";
            const endpoint = isCreatingEmployee
              ? "/api/employees"
              : `/api/employees/${editingEmployeeId}`;

            const savedEmployee = await api(endpoint, {
              method,
              body: JSON.stringify({
                firstName,
                lastName,
                email,
                phone: normalizedPhone || "",
                telegramContact,
                vkContact,
                position,
                reliability,
                locationCodes,
                accessRole
              })
            });
            const savedEmployeeId = editingEmployeeId || savedEmployee?.employee?.id;
            if (isCreatingEmployee && savedEmployeeId) {
              editingEmployeeId = savedEmployeeId;
              panelTitle.textContent = "Редактировать сотрудника";
              saveEmployeeBtn.textContent = "Сохранить";
            }
            if (savedEmployeeId && (pendingEmployeePhoto || pendingEmployeeDocuments.length)) {
              employeeDocumentStatus.className = "status mt8";
              employeeDocumentStatus.textContent = "Загрузка выбранных файлов...";
              if (pendingEmployeePhoto) {
                const photoFormData = new FormData();
                photoFormData.append("file", pendingEmployeePhoto.file, pendingEmployeePhoto.file.name);
                await api(`/api/employees/${savedEmployeeId}/photo`, {
                  method: "POST",
                  body: photoFormData
                });
                if (pendingEmployeePhoto.url) URL.revokeObjectURL(pendingEmployeePhoto.url);
                pendingEmployeePhoto = null;
              }
              for (const pending of [...pendingEmployeeDocuments]) {
                const documentFormData = new FormData();
                documentFormData.append("file", pending.file, pending.file.name);
                await api(`/api/employees/${savedEmployeeId}/documents`, {
                  method: "POST",
                  body: documentFormData
                });
                if (pending.url) URL.revokeObjectURL(pending.url);
                pendingEmployeeDocuments = pendingEmployeeDocuments.filter((item) => item.id !== pending.id);
              }
              employeeDocumentStatus.className = "status ok mt8";
              employeeDocumentStatus.textContent = "Фото и документы загружены";
            }
            if (savedEmployee?.authId) {
              state.telegramId = String(savedEmployee.authId);
              try {
                localStorage.setItem(AUTH_ID_STORAGE_KEY, state.telegramId);
              } catch {}
            }

            formStatus.className = "employee-panel-status ok";
            formStatus.textContent = isCreatingEmployee ? "Сотрудник добавлен" : "Сотрудник обновлен";
            showSavedFeedback(saveEmployeeFeedback, isCreatingEmployee ? "Добавлено" : "Сохранено");
            window.setTimeout(() => {
              closePanel();
              renderEmployeesBase();
            }, 280);
          } catch (error) {
            formStatus.className = "employee-panel-status error";
            formStatus.textContent = mapEmployeeApiError(error);
          }
        });

        for (const editBtn of screen.querySelectorAll("[data-edit-id]")) {
          editBtn.addEventListener("click", () => openForEdit(editBtn.dataset.editId));
        }

        for (const copyBtn of screen.querySelectorAll("[data-copy-value]")) {
          copyBtn.addEventListener("click", async () => {
            const rawValue = String(copyBtn.dataset.copyValue || "").trim();
            const copyLabel = String(copyBtn.dataset.copyLabel || "Данные").trim();
            if (!rawValue) return;
            try {
              if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(rawValue);
              } else {
                const tmp = document.createElement("textarea");
                tmp.value = rawValue;
                tmp.setAttribute("readonly", "");
                tmp.style.position = "absolute";
                tmp.style.left = "-9999px";
                document.body.appendChild(tmp);
                tmp.select();
                document.execCommand("copy");
                document.body.removeChild(tmp);
              }
              status.className = "status ok";
              status.textContent = `${copyLabel} скопирован`;
            } catch {
              status.className = "status error";
              status.textContent = `Не удалось скопировать ${copyLabel.toLowerCase()}`;
            }
          });
        }

        deleteEmployeeBtn.addEventListener("click", async () => {
          if (!editingEmployeeId || deleteEmployeeBtn.disabled) return;
          const confirmed = await confirmAction("Точно хотите удалить сотрудника?");
          if (!confirmed) return;
          try {
            await api(`/api/employees/${editingEmployeeId}`, { method: "DELETE" });
            formStatus.className = "employee-panel-status ok";
            formStatus.textContent = "Сотрудник удален";
            closePanel();
            renderEmployeesBase();
          } catch (error) {
            formStatus.className = "employee-panel-status error";
            formStatus.textContent = error.message;
          }
        });
      }

      function dayNameFromIso(iso) {
        const [y, m, d] = iso.split("-").map(Number);
        const dt = new Date(Date.UTC(y, m - 1, d));
        return dayNames[dt.getUTCDay()];
      }

      function ruDate(iso) {
        const [y, m, d] = iso.split("-");
        return `${d}.${m}.${y}`;
      }

      function getMonthBounds(monthValue) {
        const match = String(monthValue || "").match(/^(\d{4})-(\d{2})$/);
        if (!match) {
          const now = new Date();
          const y = now.getFullYear();
          const m = now.getMonth() + 1;
          const mm = String(m).padStart(2, "0");
          return { start: `${y}-${mm}-01`, end: `${y}-${mm}-31` };
        }
        const year = Number(match[1]);
        const month = Number(match[2]);
        const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
        return {
          start: `${match[1]}-${match[2]}-01`,
          end: `${match[1]}-${match[2]}-${String(lastDay).padStart(2, "0")}`
        };
      }

      function formatMonthYear(monthValue) {
        const match = String(monthValue || "").match(/^(\d{4})-(\d{2})$/);
        if (!match) return "Выбрать месяц";
        const year = Number(match[1]);
        const monthIndex = Number(match[2]) - 1;
        return `${monthNamesRu[monthIndex] || "Месяц"} ${year}`;
      }

      function formatMoney(value) {
        const num = Number(value || 0);
        const abs = Math.abs(num).toLocaleString("ru-RU");
        if (num < 0) return `-${abs} ₽`;
        if (num > 0) return `+${abs} ₽`;
        return "0 ₽";
      }

      function formatMoneyUnsigned(value) {
        const num = Math.abs(Number(value || 0));
        return `${num.toLocaleString("ru-RU")} ₽`;
      }

      function formatPayoutBalance(value) {
        const num = Number(value || 0);
        const abs = Math.abs(num).toLocaleString("ru-RU");
        if (num < 0) return `-${abs} ₽`;
        return `${abs} ₽`;
      }

      function financeStateForRow({ balance, advance, paid }) {
        const bal = Number(balance || 0);
        const adv = Number(advance || 0);
        const pd = Number(paid || 0);
        if (Math.abs(bal) < 0.01) {
          return { cls: "closed", label: "Закрыто" };
        }
        if (adv > 0 && pd <= 0) {
          return { cls: "advance", label: "Аванс" };
        }
        return { cls: "pending", label: "Долг" };
      }

      function adjustButtonLabel(kind, value) {
        const labels = {
          deductions1: "Удержания И1",
          deductions2: "Удержания И2",
          bonuses1: "Доплаты И1",
          bonuses2: "Доплаты И2"
        };
        return `${labels[kind] || "Сумма"}: ${formatMoney(value)}`;
      }

      function employeeSelectOptionsHtml(selectedValue = "", disabledNames = new Set()) {
        const current = String(selectedValue || "").trim();
        const selectedLocationCode = String(state.selectedLocation?.code || "");
        const names = state.employees
          .filter(
            (employee) =>
              !selectedLocationCode ||
              (Array.isArray(employee.locationCodes) &&
                employee.locationCodes.includes(selectedLocationCode))
          )
          .map((emp) => String(emp.fullName || "").trim())
          .filter(Boolean);
        if (current && !names.includes(current)) {
          names.unshift(current);
        }
        const uniqueNames = [...new Set(names)];
        const disabledLookup = new Set(
          [...disabledNames].map((name) => String(name || "").trim().toLowerCase()).filter(Boolean)
        );
        return `
          <option value="">— Пусто —</option>
          ${uniqueNames
            .map(
              (name) => {
                const normalized = String(name || "").trim().toLowerCase();
                const isDisabled = normalized && disabledLookup.has(normalized) && current !== name;
                return `<option value="${escapeHtml(name)}" ${current === name ? "selected" : ""} ${
                  isDisabled ? "disabled" : ""
                }>${escapeHtml(name)}</option>`;
              }
            )
            .join("")}
        `;
      }

      function scheduleTimeToMinutes(value) {
        const match = String(value || "").match(/^(\d{2}):(\d{2})$/);
        if (!match) return Number.NaN;
        const hours = Number(match[1]);
        const minutes = Number(match[2]);
        if (hours > 23 || minutes > 59) return Number.NaN;
        return hours * 60 + minutes;
      }

      function scheduleMinutesToTime(value) {
        const totalMinutes = Number(value);
        if (!Number.isFinite(totalMinutes)) return "";
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
      }

      function scheduleAccruedAmount(rate, deductions, bonuses) {
        return Number(rate || 0) + Number(deductions || 0) + Number(bonuses || 0);
      }

      function calculateScheduleRatesPreview(row) {
        const get = (name) => row.querySelector(`[data-f='${name}']`)?.value ?? "";
        const locationStart = String(state.selectedLocation?.workStart || "14:00");
        const locationEnd = String(state.selectedLocation?.workEnd || "22:00");
        const locationMinutes =
          scheduleTimeToMinutes(locationEnd) - scheduleTimeToMinutes(locationStart);
        const dailyRate = Math.max(0, Number(get("dailyRate") || 0));

        const employeeMinutes = (slot) => {
          if (!String(get(`executor${slot}`) || "").trim()) return 0;
          const start = scheduleTimeToMinutes(get(`executor${slot}Start`) || locationStart);
          const end = scheduleTimeToMinutes(get(`executor${slot}End`) || locationEnd);
          return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, end - start) : 0;
        };

        const minutes1 = employeeMinutes(1);
        const minutes2 = employeeMinutes(2);
        const divisor = Math.max(locationMinutes, minutes1 + minutes2);
        let rate1 = divisor > 0 ? Math.round((dailyRate * minutes1) / divisor) : 0;
        let rate2 = divisor > 0 ? Math.round((dailyRate * minutes2) / divisor) : 0;
        const overflow = rate1 + rate2 - dailyRate;
        if (overflow > 0) {
          if (rate2 > 0) rate2 = Math.max(0, rate2 - overflow);
          else rate1 = Math.max(0, rate1 - overflow);
        }

        const rate1Input = row.querySelector("[data-f='rate1']");
        const rate2Input = row.querySelector("[data-f='rate2']");
        if (rate1Input) rate1Input.value = String(rate1);
        if (rate2Input) rate2Input.value = String(rate2);
        const rate1Output = row.querySelector("[data-rate-output='1']");
        const rate2Output = row.querySelector("[data-rate-output='2']");
        const accrued1 = scheduleAccruedAmount(rate1, get("deductions1"), get("bonuses1"));
        const accrued2 = scheduleAccruedAmount(rate2, get("deductions2"), get("bonuses2"));
        if (rate1Output) rate1Output.textContent = formatMoney(accrued1);
        if (rate2Output) rate2Output.textContent = formatMoney(accrued2);
        return { rate1, rate2 };
      }

      function syncExecutorTimeDefaults(row, slot) {
        const executor = row.querySelector(`[data-f='executor${slot}']`);
        const start = row.querySelector(`[data-f='executor${slot}Start']`);
        const end = row.querySelector(`[data-f='executor${slot}End']`);
        if (!executor || !start || !end) return;
        if (!String(executor.value || "").trim()) {
          start.value = "";
          end.value = "";
          return;
        }
        if (!start.value) start.value = String(state.selectedLocation?.workStart || "14:00");
        if (!end.value) end.value = String(state.selectedLocation?.workEnd || "22:00");
      }

      function createRowAutoSaver(locationCode) {
        const rows = new Map();

        const flush = async (date, entry) => {
          if (entry.inFlight || !entry.pending) return;
          const save = entry.pending;
          entry.pending = null;
          entry.inFlight = true;
          const status = document.getElementById("scheduleStatus");
          if (status) {
            status.className = "status";
            status.textContent = `Сохраняем ${ruDate(date)}...`;
          }

          try {
            await api(`/api/schedule/${locationCode}/${date}`, {
              method: "PUT",
              body: JSON.stringify(save.payload)
            });
            if (status && !entry.pending && entry.version === save.version) {
              status.className = "status ok";
              status.textContent = `Сохранено: ${ruDate(date)}`;
            }
          } catch (error) {
            if (status && entry.version === save.version) {
              status.className = "status error";
              status.textContent = `Ошибка сохранения: ${error.message}`;
            }
            if (entry.version === save.version) entry.lastSerialized = "";
          } finally {
            entry.inFlight = false;
            if (entry.pending) {
              clearTimeout(entry.timer);
              entry.timer = window.setTimeout(() => flush(date, entry), 120);
            }
          }
        };

        return (tr) => {
          const date = tr.dataset.date;
          if (!date) return;

          const get = (name) => tr.querySelector(`[data-f='${name}']`)?.value ?? "";
          const executor1 = get("executor1").trim();
          const executor2 = get("executor2").trim();
          const status = document.getElementById("scheduleStatus");
          if (!executor1 && executor2) {
            const executor2Input = tr.querySelector(`[data-f='executor2']`);
            if (executor2Input) executor2Input.value = "";
            status.className = "status error";
            status.textContent = "Сначала заполните Исполнитель1, потом Исполнитель2";
            return;
          }
          const payload = {
            executor1,
            executor2,
            executor1Start: get("executor1Start"),
            executor1End: get("executor1End"),
            executor2Start: get("executor2Start"),
            executor2End: get("executor2End"),
            dailyRate: Number(get("dailyRate") || 0),
            ...calculateScheduleRatesPreview(tr),
            deductions1: Number(get("deductions1") || 0),
            deductions2: Number(get("deductions2") || 0),
            bonuses1: Number(get("bonuses1") || 0),
            bonuses2: Number(get("bonuses2") || 0),
            deductions1Meta: (() => {
              try {
                const parsed = JSON.parse(tr.dataset.deductions1Meta || "[]");
                return Array.isArray(parsed) ? parsed : [];
              } catch {
                return [];
              }
            })(),
            deductions2Meta: (() => {
              try {
                const parsed = JSON.parse(tr.dataset.deductions2Meta || "[]");
                return Array.isArray(parsed) ? parsed : [];
              } catch {
                return [];
              }
            })(),
            bonuses1Meta: (() => {
              try {
                const parsed = JSON.parse(tr.dataset.bonuses1Meta || "[]");
                return Array.isArray(parsed) ? parsed : [];
              } catch {
                return [];
              }
            })(),
            bonuses2Meta: (() => {
              try {
                const parsed = JSON.parse(tr.dataset.bonuses2Meta || "[]");
                return Array.isArray(parsed) ? parsed : [];
              } catch {
                return [];
              }
            })()
          };

          const serialized = JSON.stringify(payload);
          const entry = rows.get(date) || {
            timer: 0,
            inFlight: false,
            pending: null,
            version: 0,
            lastSerialized: ""
          };
          if (serialized === entry.lastSerialized) return;

          entry.version += 1;
          entry.lastSerialized = serialized;
          entry.pending = { payload, version: entry.version };
          clearTimeout(entry.timer);
          entry.timer = window.setTimeout(() => flush(date, entry), 550);
          rows.set(date, entry);

          status.className = "status";
          status.textContent = `Сохраняем ${ruDate(date)}...`;
        };
      }

      function setupScheduleFloatingHeader(tableWrap) {
        const sourceTable = tableWrap?.querySelector("table");
        const sourceHead = sourceTable?.querySelector("thead");
        if (!tableWrap || !sourceTable || !sourceHead) return () => {};

        const floating = document.createElement("div");
        floating.className = "schedule-floating-head";
        const floatingTable = document.createElement("table");
        const clonedHead = sourceHead.cloneNode(true);
        floatingTable.appendChild(clonedHead);
        floating.appendChild(floatingTable);
        document.body.appendChild(floating);

        const syncWidths = () => {
          const sourceCells = [...sourceHead.querySelectorAll("th")];
          const clonedCells = [...clonedHead.querySelectorAll("th")];
          sourceCells.forEach((cell, index) => {
            const width = cell.getBoundingClientRect().width;
            const clonedCell = clonedCells[index];
            if (!clonedCell) return;
            clonedCell.style.width = `${width}px`;
            clonedCell.style.minWidth = `${width}px`;
            clonedCell.style.maxWidth = `${width}px`;
          });
          floatingTable.style.width = `${sourceTable.scrollWidth}px`;
        };

        let frameId = 0;
        const update = () => {
          frameId = 0;
          if (!document.body.classList.contains("schedule-table-view")) {
            floating.classList.remove("visible");
            return;
          }
          const wrapRect = tableWrap.getBoundingClientRect();
          const headRect = sourceHead.getBoundingClientRect();
          const visibleLeft = Math.max(0, wrapRect.left);
          const visibleRight = Math.min(window.innerWidth, wrapRect.right);
          const shouldShow = headRect.top < 0 && wrapRect.bottom > headRect.height;
          floating.classList.toggle("visible", shouldShow);
          if (!shouldShow) return;
          floating.style.left = `${visibleLeft}px`;
          floating.style.width = `${Math.max(0, visibleRight - visibleLeft)}px`;
          floatingTable.style.transform = `translateX(${
            wrapRect.left - visibleLeft - tableWrap.scrollLeft
          }px)`;
        };

        const requestUpdate = () => {
          if (frameId) return;
          frameId = window.requestAnimationFrame(update);
        };
        const handleResize = () => {
          syncWidths();
          requestUpdate();
        };

        syncWidths();
        update();
        window.addEventListener("scroll", requestUpdate, { passive: true });
        window.addEventListener("resize", handleResize);
        tableWrap.addEventListener("scroll", requestUpdate, { passive: true });

        return () => {
          if (frameId) window.cancelAnimationFrame(frameId);
          window.removeEventListener("scroll", requestUpdate);
          window.removeEventListener("resize", handleResize);
          tableWrap.removeEventListener("scroll", requestUpdate);
          floating.remove();
        };
      }

      async function renderSchedule() {
        setAppTitle("");
        await ensureDesktopFullscreenForSchedule();
        await loadEmployeesSafe();
        screen.innerHTML = `<p class="muted">Загружаем график...</p>`;

        try {
          const financeAllowed = canAccessFinance();
          const [data, shiftPaymentsData, occupancyData] = await Promise.all([
            api(`/api/schedule/${state.selectedLocation.code}?month=${state.selectedMonth}`),
            financeAllowed
              ? api(`/api/schedule/${state.selectedLocation.code}/shift-payments?month=${state.selectedMonth}`)
              : Promise.resolve({ shiftPayments: [] }),
            canEditSchedule()
              ? api(
                  `/api/schedule/occupancy?month=${state.selectedMonth}&excludeLocationCode=${encodeURIComponent(
                    state.selectedLocation.code
                  )}`
                )
              : Promise.resolve({ assignments: [] })
          ]);
          const shifts = data.shifts || [];
          const shiftPayments = shiftPaymentsData.shiftPayments || [];
          const roleBusyByDate = new Map();
          for (const otherRow of occupancyData.assignments || []) {
            const date = String(otherRow?.date || "");
            if (!date) continue;
            const busy =
              roleBusyByDate.get(date) ||
              {
                executor1: new Set(),
                executor2: new Set()
              };
            const e1 = String(otherRow.executor1 || "").trim();
            const e2 = String(otherRow.executor2 || "").trim();
            if (e1) busy.executor1.add(e1);
            if (e2) busy.executor2.add(e2);
            roleBusyByDate.set(date, busy);
          }
          const monthBounds = getMonthBounds(state.selectedMonth);
          const editable = canEditSchedule();
          const participantView = isParticipantView();
          if (!state.scheduleViewMode) {
            state.scheduleViewMode = isPhoneClient() ? "mobile" : "table";
          }
          const viewMode = state.scheduleViewMode;

          const rows = shifts
            .map(
              (row) => `
                <tr
                  data-date="${row.date}"
                  ${
                    participantView
                      ? ""
                      : `
                        data-deductions1-meta="${escapeHtml(JSON.stringify(row.deductions1Meta || []))}"
                        data-deductions2-meta="${escapeHtml(JSON.stringify(row.deductions2Meta || []))}"
                        data-bonuses1-meta="${escapeHtml(JSON.stringify(row.bonuses1Meta || []))}"
                        data-bonuses2-meta="${escapeHtml(JSON.stringify(row.bonuses2Meta || []))}"
                      `
                  }
                >
                  <td class="day">${dayNameFromIso(row.date)}</td>
                  <td>${ruDate(row.date)}</td>
                  <td>
                    ${
                      participantView
                        ? escapeHtml(row.executor1 || "—")
                        : `<div class="schedule-executor">
                            <select data-f="executor1">${employeeSelectOptionsHtml(
                              row.executor1 || "",
                              roleBusyByDate.get(row.date)?.executor1 || new Set()
                            )}</select>
                            <div class="schedule-time-range">
                              <input type="time" data-f="executor1Start" min="${escapeHtml(
                                data.location.workStart
                              )}" max="${escapeHtml(data.location.workEnd)}" value="${escapeHtml(
                                row.executor1Start || ""
                              )}" aria-label="Начало смены исполнителя 1" />
                              <span>–</span>
                              <input type="time" data-f="executor1End" min="${escapeHtml(
                                data.location.workStart
                              )}" max="${escapeHtml(data.location.workEnd)}" value="${escapeHtml(
                                row.executor1End || ""
                              )}" aria-label="Конец смены исполнителя 1" />
                            </div>
                          </div>`
                    }
                  </td>
                  <td>
                    ${
                      participantView
                        ? escapeHtml(row.executor2 || "—")
                        : `<div class="schedule-executor">
                            <select data-f="executor2">${employeeSelectOptionsHtml(
                              row.executor2 || "",
                              roleBusyByDate.get(row.date)?.executor2 || new Set()
                            )}</select>
                            <div class="schedule-time-range">
                              <input type="time" data-f="executor2Start" min="${escapeHtml(
                                data.location.workStart
                              )}" max="${escapeHtml(data.location.workEnd)}" value="${escapeHtml(
                                row.executor2Start || ""
                              )}" aria-label="Начало смены исполнителя 2" />
                              <span>–</span>
                              <input type="time" data-f="executor2End" min="${escapeHtml(
                                data.location.workStart
                              )}" max="${escapeHtml(data.location.workEnd)}" value="${escapeHtml(
                                row.executor2End || ""
                              )}" aria-label="Конец смены исполнителя 2" />
                            </div>
                          </div>`
                    }
                  </td>
                  ${
                    participantView
                      ? ""
                      : `
                        <td><input type="number" min="0" step="100" data-f="dailyRate" value="${Number(
                          row.dailyRate || 0
                        )}" aria-label="Ставка за день" /></td>
                        <td>
                          <input type="hidden" data-f="rate1" value="${Number(row.rate1 || 0)}" />
                          <span class="schedule-rate-output" data-rate-output="1">${formatMoney(
                            scheduleAccruedAmount(row.rate1, row.deductions1, row.bonuses1)
                          )}</span>
                        </td>
                        <td>
                          <input type="hidden" data-f="rate2" value="${Number(row.rate2 || 0)}" />
                          <span class="schedule-rate-output" data-rate-output="2">${formatMoney(
                            scheduleAccruedAmount(row.rate2, row.deductions2, row.bonuses2)
                          )}</span>
                        </td>
                        <td>
                          <input type="hidden" data-f="deductions1" value="${Number(row.deductions1 || 0)}" />
                          <button type="button" class="button secondary" data-adjust-open="deductions1">${adjustButtonLabel(
                            "deductions1",
                            Number(row.deductions1 || 0)
                          )}</button>
                        </td>
                        <td>
                          <input type="hidden" data-f="deductions2" value="${Number(row.deductions2 || 0)}" />
                          <button type="button" class="button secondary" data-adjust-open="deductions2">${adjustButtonLabel(
                            "deductions2",
                            Number(row.deductions2 || 0)
                          )}</button>
                        </td>
                        <td>
                          <input type="hidden" data-f="bonuses1" value="${Number(row.bonuses1 || 0)}" />
                          <button type="button" class="button secondary" data-adjust-open="bonuses1">${adjustButtonLabel(
                            "bonuses1",
                            Number(row.bonuses1 || 0)
                          )}</button>
                        </td>
                        <td>
                          <input type="hidden" data-f="bonuses2" value="${Number(row.bonuses2 || 0)}" />
                          <button type="button" class="button secondary" data-adjust-open="bonuses2">${adjustButtonLabel(
                            "bonuses2",
                            Number(row.bonuses2 || 0)
                          )}</button>
                        </td>
                      `
                  }
                </tr>
              `
            )
            .join("");

          const mobileCards = shifts
            .map(
              (row) => `
                <div
                  class="schedule-card"
                  data-date="${row.date}"
                  ${
                    participantView
                      ? ""
                      : `
                        data-deductions1-meta="${escapeHtml(JSON.stringify(row.deductions1Meta || []))}"
                        data-deductions2-meta="${escapeHtml(JSON.stringify(row.deductions2Meta || []))}"
                        data-bonuses1-meta="${escapeHtml(JSON.stringify(row.bonuses1Meta || []))}"
                        data-bonuses2-meta="${escapeHtml(JSON.stringify(row.bonuses2Meta || []))}"
                      `
                  }
                >
                  <div class="schedule-card-head">
                    <span>${dayNameFromIso(row.date)}</span>
                    <div class="schedule-date-wrap">
                      <span>${ruDate(row.date)}</span>
                      ${
                        participantView
                          ? ""
                          : `<button class="card-toggle" type="button" data-toggle-card="${row.date}" aria-label="Развернуть день">
                              <img src="/icons/chevron_double_down_icon_143818.png" alt="Развернуть" />
                            </button>`
                      }
                    </div>
                  </div>
                  <div class="schedule-card-grid">
                    <div>
                      <div class="muted">Исполнитель1</div>
                      ${
                        participantView
                          ? `<div class="schedule-readonly-value">${escapeHtml(row.executor1 || "—")}</div>`
                          : `<select data-shift-input="1" data-f="executor1">${employeeSelectOptionsHtml(
                              row.executor1 || "",
                              roleBusyByDate.get(row.date)?.executor1 || new Set()
                            )}</select>`
                      }
                    </div>
                    <div>
                      <div class="muted">Исполнитель2</div>
                      ${
                        participantView
                          ? `<div class="schedule-readonly-value">${escapeHtml(row.executor2 || "—")}</div>`
                          : `<select data-shift-input="1" data-f="executor2">${employeeSelectOptionsHtml(
                              row.executor2 || "",
                              roleBusyByDate.get(row.date)?.executor2 || new Set()
                            )}</select>`
                      }
                    </div>
                  </div>
                  ${
                    participantView
                      ? ""
                      : `<div class="schedule-card-details hidden" data-details="1">
                    <div class="schedule-card-grid">
                    <div>
                      <div class="muted">Время И1</div>
                      <div class="schedule-time-range">
                        <input data-shift-input="1" type="time" data-f="executor1Start" min="${escapeHtml(
                          data.location.workStart
                        )}" max="${escapeHtml(data.location.workEnd)}" value="${escapeHtml(
                          row.executor1Start || ""
                        )}" aria-label="Начало смены исполнителя 1" />
                        <span>–</span>
                        <input data-shift-input="1" type="time" data-f="executor1End" min="${escapeHtml(
                          data.location.workStart
                        )}" max="${escapeHtml(data.location.workEnd)}" value="${escapeHtml(
                          row.executor1End || ""
                        )}" aria-label="Конец смены исполнителя 1" />
                      </div>
                    </div>
                    <div>
                      <div class="muted">Время И2</div>
                      <div class="schedule-time-range">
                        <input data-shift-input="1" type="time" data-f="executor2Start" min="${escapeHtml(
                          data.location.workStart
                        )}" max="${escapeHtml(data.location.workEnd)}" value="${escapeHtml(
                          row.executor2Start || ""
                        )}" aria-label="Начало смены исполнителя 2" />
                        <span>–</span>
                        <input data-shift-input="1" type="time" data-f="executor2End" min="${escapeHtml(
                          data.location.workStart
                        )}" max="${escapeHtml(data.location.workEnd)}" value="${escapeHtml(
                          row.executor2End || ""
                        )}" aria-label="Конец смены исполнителя 2" />
                      </div>
                    </div>
                    <div>
                      <div class="muted">Ставка за день</div>
                      <input data-shift-input="1" type="number" min="0" step="100" data-f="dailyRate" value="${Number(
                        row.dailyRate || 0
                      )}" />
                    </div>
                    <div>
                      <div class="muted">Начислено И1 / И2</div>
                      <input type="hidden" data-f="rate1" value="${Number(row.rate1 || 0)}" />
                      <input type="hidden" data-f="rate2" value="${Number(row.rate2 || 0)}" />
                      <div class="row">
                        <span class="schedule-rate-output" data-rate-output="1">${formatMoney(
                          scheduleAccruedAmount(row.rate1, row.deductions1, row.bonuses1)
                        )}</span>
                        <span class="schedule-rate-output" data-rate-output="2">${formatMoney(
                          scheduleAccruedAmount(row.rate2, row.deductions2, row.bonuses2)
                        )}</span>
                      </div>
                    </div>
                    <div>
                      <div class="muted">Удержания И1</div>
                      <input type="hidden" data-f="deductions1" value="${Number(row.deductions1 || 0)}" />
                      <button data-shift-input="1" type="button" class="button secondary" data-adjust-open="deductions1">${adjustButtonLabel(
                        "deductions1",
                        Number(row.deductions1 || 0)
                      )}</button>
                    </div>
                    <div>
                      <div class="muted">Удержания И2</div>
                      <input type="hidden" data-f="deductions2" value="${Number(row.deductions2 || 0)}" />
                      <button data-shift-input="1" type="button" class="button secondary" data-adjust-open="deductions2">${adjustButtonLabel(
                        "deductions2",
                        Number(row.deductions2 || 0)
                      )}</button>
                    </div>
                    <div>
                      <div class="muted">Доплаты И1</div>
                      <input type="hidden" data-f="bonuses1" value="${Number(row.bonuses1 || 0)}" />
                      <button data-shift-input="1" type="button" class="button secondary" data-adjust-open="bonuses1">${adjustButtonLabel(
                        "bonuses1",
                        Number(row.bonuses1 || 0)
                      )}</button>
                    </div>
                    <div>
                      <div class="muted">Доплаты И2</div>
                      <input type="hidden" data-f="bonuses2" value="${Number(row.bonuses2 || 0)}" />
                      <button data-shift-input="1" type="button" class="button secondary" data-adjust-open="bonuses2">${adjustButtonLabel(
                        "bonuses2",
                        Number(row.bonuses2 || 0)
                      )}</button>
                    </div>
                    </div>
                  </div>
                  `
                  }
                </div>
              `
            )
            .join("");

          screen.innerHTML = `
            <div class="row">
              <button class="back-icon-btn" id="backLocationsBtn" aria-label="Назад">
                <img src="/icons/back-arrow.png" alt="Назад" />
              </button>
              <button class="button secondary" id="toggleViewBtn">${
                viewMode === "mobile" ? "Полный график" : "Мобильный режим"
              }</button>
              ${
                viewMode === "mobile" && !participantView
                  ? `<button class="button secondary" id="toggleAllCardsBtn">Развернуть все</button>`
                  : ""
              }
            </div>
            <h2 class="mt12">${escapeHtml(state.selectedLocation.title)}</h2>
            <div class="row mt12">
              <button class="month-picker-trigger" id="monthPickerBtn">${escapeHtml(
                formatMonthYear(state.selectedMonth)
              )}</button>
              ${financeAllowed ? `<button class="button secondary" id="openFinanceBtn">Финансы</button>` : ""}
            </div>
            ${
              editable
                ? `<div class="schedule-bulk-rate mt12">
                    <label class="schedule-bulk-rate-field">
                      <span>Ставка для смен без ставки</span>
                      <input id="bulkDailyRateInput" type="number" min="1" max="1000000" step="100" placeholder="Введите ставку" inputmode="decimal" />
                    </label>
                    <button class="button primary" id="applyBulkDailyRateBtn" type="button">Применить ко всем сменам без ставки</button>
                  </div>`
                : ""
            }
            <p id="scheduleStatus" class="status mt8"></p>
            ${
              viewMode === "mobile"
                ? `<div class="schedule-mobile mt12">${mobileCards}</div>`
                : `
                  <div class="table-wrap mt12">
                    <table class="${participantView ? "participant-table" : ""}">
                      <thead>
                        <tr>
                          <th>День</th>
                          <th>Дата</th>
                          <th>Исполнитель1</th>
                          <th>Исполнитель2</th>
                          ${
                            participantView
                              ? ""
                              : `
                                <th>Ставка за день</th>
                                <th>Начислено И1</th>
                                <th>Начислено И2</th>
                                <th>Удержания И1</th>
                                <th>Удержания И2</th>
                                <th>Доплаты И1</th>
                                <th>Доплаты И2</th>
                              `
                          }
                        </tr>
                      </thead>
                      <tbody>${rows}</tbody>
                    </table>
                  </div>
                `
            }
            <div id="financeModal" class="modal fullscreen-modal hidden">
              <div class="panel">
                <div class="panel-head">
                  <div class="fullscreen-modal-header">
                    <button class="open-arrow-btn" id="closeFinanceBtnTop" type="button" aria-label="Назад">
                      <img src="/icons/back-arrow.png" alt="Назад" />
                    </button>
                    <h3 id="financeTitle" class="panel-title">Финансы</h3>
                  </div>
                  <button class="icon-button" id="refreshFinanceBtn" type="button" title="Обновить">
                    <img src="/icons/refresh-new.png" alt="Обновить" />
                  </button>
                </div>
                <div class="finance-filters mt12">
                  <div class="finance-month-control">
                    <span>Месяц расчёта</span>
                    <button class="month-picker-trigger" id="financeMonthBtn" type="button"></button>
                  </div>
                  <label class="finance-month-control finance-location-control">
                    <span>Пункт выдачи</span>
                    <select class="finance-location-select" id="financeLocationSelect">
                      <option value="all">Все ПВЗ</option>
                      ${state.locations
                        .map(
                          (location) =>
                            `<option value="${escapeHtml(location.code)}">${escapeHtml(location.title)}</option>`
                        )
                        .join("")}
                    </select>
                  </label>
                </div>
                <p class="muted mt12">Каждый сотрудник разделён на зарплату за 1–15 и 16–конец месяца. Оплаченные дни не входят в остаток.</p>
                <p id="financeStatus" class="status mt8"></p>
                <p id="financeError" class="status error mt8"></p>
                <div id="financeList" class="finance-list mt12"></div>
              </div>
            </div>
            <div id="adjustModal" class="modal hidden">
              <div class="panel">
                <h3 id="adjustTitle" class="panel-title"></h3>
                <div id="adjustList" class="adjust-list mt12"></div>
                <p id="adjustError" class="status error mt8"></p>
                <div class="form-save-footer">
                  <div class="save-icon-wrap">
                    <button class="save-icon-btn" id="saveAdjustBtn" type="button">Сохранить</button>
                    <div id="saveAdjustFeedback" class="save-feedback"></div>
                  </div>
                  <button class="button secondary" id="closeAdjustBtn">Отмена</button>
                </div>
              </div>
            </div>
          `;
          renderBottomNav("schedule");
          document.body.classList.toggle(
            "schedule-table-view",
            viewMode === "table" && !isPhoneClient()
          );
          if (document.body.classList.contains("schedule-table-view")) {
            state.scheduleHeaderCleanup = setupScheduleFloatingHeader(
              screen.querySelector(".table-wrap")
            );
          }

          document.getElementById("backLocationsBtn").addEventListener("click", renderLocations);
          document.getElementById("toggleViewBtn").addEventListener("click", () => {
            state.scheduleViewMode = viewMode === "mobile" ? "table" : "mobile";
            renderSchedule();
          });
          document.getElementById("monthPickerBtn").addEventListener("click", () => {
            openMonthPicker({
              value: state.selectedMonth,
              title: "Месяц графика",
              onSelect: (nextMonth) => {
              state.selectedMonth = nextMonth;
              renderSchedule();
              }
            });
          });
          document.getElementById("applyBulkDailyRateBtn")?.addEventListener("click", async (event) => {
            const button = event.currentTarget;
            const input = document.getElementById("bulkDailyRateInput");
            const status = document.getElementById("scheduleStatus");
            const dailyRate = Number(input?.value || 0);
            if (!Number.isFinite(dailyRate) || dailyRate <= 0) {
              status.className = "status error mt8";
              status.textContent = "Введите ставку больше нуля";
              input?.focus();
              return;
            }
            button.disabled = true;
            button.textContent = "Применяем...";
            try {
              const result = await api(
                `/api/schedule/${encodeURIComponent(state.selectedLocation.code)}/apply-rate`,
                {
                  method: "PUT",
                  body: JSON.stringify({ month: state.selectedMonth, dailyRate })
                }
              );
              const message = result.updatedCount
                ? `Ставка применена к сменам: ${result.updatedCount}`
                : "Назначенных смен без ставки нет";
              await renderSchedule();
              showTextNotice(message);
            } catch (error) {
              status.className = "status error mt8";
              status.textContent = `Ошибка: ${error.message}`;
              button.disabled = false;
              button.textContent = "Применить ко всем сменам без ставки";
            }
          });

          const financeModal = document.getElementById("financeModal");
          const financeList = document.getElementById("financeList");
          const financeStatus = document.getElementById("financeStatus");
          const financeError = document.getElementById("financeError");
          const refreshFinanceBtn = document.getElementById("refreshFinanceBtn");
          const financeMonthBtn = document.getElementById("financeMonthBtn");
          const financeLocationSelect = document.getElementById("financeLocationSelect");
          const financeTitle = document.getElementById("financeTitle");
          const canMarkShiftPaid = financeAllowed;
          const expandedFinancePeriods = new Set();
          let financeMonth = monthNow();
          let financeLocationCode = String(state.selectedLocation.code);
          let financeShifts = shifts.map((row) => ({
            ...row,
            locationCode: state.selectedLocation.code,
            locationTitle: state.selectedLocation.title
          }));
          let financeShiftPayments = shiftPayments.map((payment) => ({
            ...payment,
            locationCode: state.selectedLocation.code,
            locationTitle: state.selectedLocation.title
          }));

          const getFinancePeriods = () => {
            const bounds = getMonthBounds(financeMonth);
            const monthIndex = Number(financeMonth.slice(5, 7)) - 1;
            const monthName = monthNamesGenitiveRu[monthIndex] || "месяца";
            const lastDay = Number(bounds.end.slice(-2));
            return [
              {
                key: "first",
                label: `1–15 ${monthName}`,
                from: bounds.start,
                to: `${financeMonth}-15`
              },
              {
                key: "second",
                label: `16–${lastDay} ${monthName}`,
                from: `${financeMonth}-16`,
                to: bounds.end
              }
            ];
          };

          const financePaymentKey = (locationCode, date, employeeName) =>
            `${String(locationCode || "")}::${String(date || "")}::${String(employeeName || "")
              .trim()
              .toLowerCase()}`;

          const setFinanceStatus = (text, isError = false) => {
            financeStatus.className = isError ? "status error mt8" : "status ok mt8";
            financeStatus.textContent = text;
          };

          const financeTimeLabel = () =>
            new Date().toLocaleTimeString("ru-RU", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit"
            });

          const getFinanceEmployeeNames = () => {
            const names = new Set(
              state.employees
                .map((employee) => String(employee.fullName || "").trim())
                .filter(Boolean)
            );
            for (const row of financeShifts) {
              const first = String(row.executor1 || "").trim();
              const second = String(row.executor2 || "").trim();
              if (first) names.add(first);
              if (second) names.add(second);
            }
            const sortKeys = new Map(
              state.employees.map((employee) => [
                String(employee.fullName || "").trim(),
                `${String(employee.lastName || "").trim()} ${String(employee.firstName || "").trim()}`
                  .trim()
                  .toLowerCase()
              ])
            );
            return [...names].sort((a, b) =>
              String(sortKeys.get(a) || a).localeCompare(String(sortKeys.get(b) || b), "ru")
            );
          };

          const getFinanceDays = (employeeName, period) => {
            const paymentMap = new Map(
              financeShiftPayments.map((payment) => [
                financePaymentKey(payment.locationCode, payment.shiftDate, payment.employeeName),
                payment
              ])
            );
            const days = [];
            for (const row of financeShifts) {
              if (!row?.date || row.date < period.from || row.date > period.to) continue;
              let slot = 0;
              if (String(row.executor1 || "").trim() === employeeName) slot = 1;
              if (String(row.executor2 || "").trim() === employeeName) slot = 2;
              if (!slot) continue;

              const payment =
                paymentMap.get(financePaymentKey(row.locationCode, row.date, employeeName)) || null;
              const currentSalary = Number(slot === 1 ? row.rate1 : row.rate2) || 0;
              const currentDeduction = Math.abs(
                Math.min(0, Number(slot === 1 ? row.deductions1 : row.deductions2) || 0)
              );
              const currentBonus = Math.max(
                0,
                Number(slot === 1 ? row.bonuses1 : row.bonuses2) || 0
              );
              const salary = payment ? Number(payment.salaryAmount || 0) : currentSalary;
              const deductions = payment
                ? Number(payment.deductionsAmount || 0)
                : currentDeduction;
              const bonuses = payment ? Number(payment.bonusesAmount || 0) : currentBonus;
              const normalizeAdjustmentItems = (items, fallbackReason, fallbackAmount) => {
                const normalized = (Array.isArray(items) ? items : [])
                  .map((item) => ({
                    reason: String(item?.reason || fallbackReason).trim() || fallbackReason,
                    description: String(item?.note || item?.description || "").trim(),
                    amount: Math.abs(Number(item?.amount || 0)),
                    attachmentIds: Array.isArray(item?.attachmentIds)
                      ? item.attachmentIds.filter(Boolean).slice(0, 6)
                      : []
                  }))
                  .filter((item) => item.amount > 0);
                if (normalized.length || fallbackAmount <= 0) return normalized;
                return [{ reason: "Не указана", description: "", amount: fallbackAmount }];
              };
              const deductionItems = normalizeAdjustmentItems(
                slot === 1 ? row.deductions1Meta : row.deductions2Meta,
                "Удержание",
                deductions
              );
              const bonusItems = normalizeAdjustmentItems(
                slot === 1 ? row.bonuses1Meta : row.bonuses2Meta,
                "Доплата",
                bonuses
              );
              days.push({
                date: row.date,
                locationCode: row.locationCode,
                locationTitle: row.locationTitle,
                workStart: slot === 1 ? row.executor1Start : row.executor2Start,
                workEnd: slot === 1 ? row.executor1End : row.executor2End,
                salary,
                deductions,
                bonuses,
                deductionItems,
                bonusItems,
                total: salary + bonuses - deductions,
                payment
              });
            }
            return days.sort(
              (a, b) =>
                a.date.localeCompare(b.date) ||
                String(a.locationTitle || "").localeCompare(String(b.locationTitle || ""), "ru")
            );
          };

          const renderFinance = () => {
            financeError.textContent = "";
            const employeeNames = getFinanceEmployeeNames();
            if (!employeeNames.length) {
              financeList.innerHTML = `<div class="muted">В базе пока нет сотрудников.</div>`;
              return;
            }

            const dayActions = [];
            const periodActions = [];
            financeList.innerHTML = employeeNames
              .map((employeeName) => {
                const periodsHtml = getFinancePeriods()
                  .map((period) => {
                    const days = getFinanceDays(employeeName, period);
                    const unpaidDays = days.filter((day) => !day.payment);
                    const periodActionIndex =
                      periodActions.push({
                        employeeName,
                        period,
                        unpaidCount: unpaidDays.length,
                        unpaidTotal: unpaidDays.reduce((sum, day) => sum + day.total, 0),
                        locationCodes: [
                          ...new Set(unpaidDays.map((day) => String(day.locationCode || "")).filter(Boolean))
                        ]
                      }) - 1;
                    const salary = unpaidDays.reduce((sum, day) => sum + day.salary, 0);
                    const deductions = unpaidDays.reduce((sum, day) => sum + day.deductions, 0);
                    const bonuses = unpaidDays.reduce((sum, day) => sum + day.bonuses, 0);
                    const total = unpaidDays.reduce((sum, day) => sum + day.total, 0);
                    const expandKey = `${employeeName}::${period.key}`;
                    const expanded = expandedFinancePeriods.has(expandKey);
                    const daysHtml = days.length
                      ? days
                          .map((day) => {
                            const actionIndex = dayActions.push({ employeeName, day }) - 1;
                            const reasonGroupHtml = (label, items, amountPrefix) => {
                              if (!items.length) return "";
                              return `
                                <div class="finance-day-reason">
                                  <strong>${label}</strong>
                                  <div class="finance-day-reason-list">
                                    ${items
                                      .map(
                                        (item) => `
                                          <div class="finance-day-reason-item">
                                            <span>${escapeHtml(item.reason)}${
                                              item.description
                                                ? ` — ${escapeHtml(item.description)}`
                                                : ""
                                            }</span>
                                            <span class="finance-day-reason-amount">${amountPrefix}${formatMoneyUnsigned(
                                              item.amount
                                            )}</span>
                                          </div>
                                          ${
                                            item.attachmentIds?.length
                                              ? `<div class="adjust-photo-list">${item.attachmentIds
                                                  .map(
                                                    (id) => `
                                                      <button
                                                        class="adjust-photo"
                                                        type="button"
                                                        data-image-preview="/api/schedule/attachments/${escapeHtml(id)}"
                                                        data-image-alt="Фото подтверждения"
                                                        aria-label="Открыть фото подтверждения"
                                                      >
                                                        <img src="/api/schedule/attachments/${escapeHtml(
                                                          id
                                                        )}" alt="Фото подтверждения" loading="lazy" />
                                                      </button>
                                                    `
                                                  )
                                                  .join("")}</div>`
                                              : ""
                                          }
                                        `
                                      )
                                      .join("")}
                                  </div>
                                </div>
                              `;
                            };
                            const reasonsHtml = [
                              reasonGroupHtml("Причина удержания", day.deductionItems, "−"),
                              reasonGroupHtml("Причина доплаты", day.bonusItems, "+")
                            ].join("");
                            return `
                              <div class="finance-day ${day.payment ? "paid" : ""}">
                                <div class="finance-day-date">
                                  <span>${ruDate(day.date)}</span>
                                  <span class="finance-day-location">${escapeHtml(day.locationTitle || "")}</span>
                                  <span class="finance-day-location">${escapeHtml(
                                    day.workStart || ""
                                  )}–${escapeHtml(day.workEnd || "")}</span>
                                </div>
                                <div class="finance-day-value">
                                  <span>Зарплата</span>
                                  <strong>${formatMoneyUnsigned(day.salary)}</strong>
                                </div>
                                <div class="finance-day-value">
                                  <span>Удержания</span>
                                  <strong>${formatMoneyUnsigned(day.deductions)}</strong>
                                </div>
                                <div class="finance-day-value">
                                  <span>Доплаты</span>
                                  <strong>${formatMoneyUnsigned(day.bonuses)}</strong>
                                </div>
                                <div class="finance-day-value">
                                  <span>Итого</span>
                                  <strong>${formatPayoutBalance(day.total)}</strong>
                                </div>
                                ${
                                  day.payment
                                    ? canMarkShiftPaid
                                      ? `<button class="button secondary finance-day-action" type="button" data-unpay-shift="${actionIndex}">Отменить оплату</button>`
                                      : `<span class="finance-paid-badge">Оплачено</span>`
                                    : canMarkShiftPaid
                                      ? `<button class="button finance-day-action" type="button" data-pay-shift="${actionIndex}">Оплатить</button>`
                                      : `<span class="finance-unpaid-badge">Не оплачено</span>`
                                }
                                ${reasonsHtml ? `<div class="finance-day-reasons">${reasonsHtml}</div>` : ""}
                              </div>
                            `;
                          })
                          .join("")
                      : `<div class="muted">Смен за этот период нет.</div>`;

                    return `
                      <div class="finance-period">
                        <div class="finance-period-head">
                          <button class="finance-period-summary" type="button" data-finance-period="${escapeHtml(expandKey)}">
                            <div class="finance-period-title">${period.label}</div>
                            <div class="finance-period-stat">
                              <span>Зарплата</span>
                              <strong>${formatMoneyUnsigned(salary)}</strong>
                            </div>
                            <div class="finance-period-stat">
                              <span>Удержания</span>
                              <strong>${formatMoneyUnsigned(deductions)}</strong>
                            </div>
                            <div class="finance-period-stat">
                              <span>Доплаты</span>
                              <strong>${formatMoneyUnsigned(bonuses)}</strong>
                            </div>
                            <div class="finance-period-stat total">
                              <span>К выплате</span>
                              <strong>${formatPayoutBalance(total)}</strong>
                            </div>
                            <span
                              class="finance-toggle-icon ${expanded ? "expanded" : ""}"
                              aria-hidden="true"
                            ></span>
                          </button>
                          ${
                            canMarkShiftPaid && unpaidDays.length
                              ? `<button class="button finance-pay-period-btn" type="button" data-pay-period="${periodActionIndex}">Оплатить период</button>`
                              : !unpaidDays.length && days.length
                                ? `<span class="finance-paid-badge" style="align-self:center; margin-right:12px;">Оплачено</span>`
                                : ""
                          }
                        </div>
                        <div class="finance-period-details ${expanded ? "" : "hidden"}">${daysHtml}</div>
                      </div>
                    `;
                  })
                  .join("");

                return `
                  <section class="finance-employee-card">
                    <div class="finance-employee-head">
                      <h4 class="finance-employee-name">${escapeHtml(employeeName)}</h4>
                    </div>
                    <div class="finance-periods">${periodsHtml}</div>
                  </section>
                `;
              })
              .join("");

            for (const button of financeList.querySelectorAll("[data-finance-period]")) {
              button.addEventListener("click", () => {
                const key = String(button.dataset.financePeriod || "");
                if (expandedFinancePeriods.has(key)) {
                  expandedFinancePeriods.delete(key);
                } else {
                  expandedFinancePeriods.add(key);
                }
                renderFinance();
              });
            }

            for (const button of financeList.querySelectorAll("[data-pay-period]")) {
              button.addEventListener("click", async () => {
                const action = periodActions[Number(button.dataset.payPeriod)];
                if (!action?.unpaidCount) return;
                const confirmed = await confirmAction(
                  `Оплатить все неоплаченные смены сотрудника ${action.employeeName} за период ${action.period.label}? Смен: ${action.unpaidCount}, сумма: ${formatPayoutBalance(action.unpaidTotal)}.`
                );
                if (!confirmed) return;
                button.disabled = true;
                financeError.textContent = "";
                try {
                  const results = await Promise.all(
                    action.locationCodes.map((locationCode) =>
                      api(`/api/schedule/${locationCode}/shift-payments/pay-period`, {
                        method: "POST",
                        body: JSON.stringify({
                          employeeName: action.employeeName,
                          month: financeMonth,
                          period: action.period.key
                        })
                      })
                    )
                  );
                  await refreshFinanceData();
                  const paidCount = results.reduce((sum, result) => sum + Number(result.count || 0), 0);
                  setFinanceStatus(
                    `Оплачено смен: ${paidCount}. Обновлено: ${financeTimeLabel()}`
                  );
                } catch (error) {
                  financeError.textContent = `Ошибка массовой оплаты: ${error.message}`;
                } finally {
                  button.disabled = false;
                }
              });
            }

            for (const button of financeList.querySelectorAll("[data-pay-shift]")) {
              button.addEventListener("click", async () => {
                const action = dayActions[Number(button.dataset.payShift)];
                if (!action) return;
                const confirmed = await confirmAction(
                  `Отметить смену ${ruDate(action.day.date)} сотрудника ${action.employeeName} оплаченной?`
                );
                if (!confirmed) return;
                button.disabled = true;
                financeError.textContent = "";
                try {
                  await api(`/api/schedule/${action.day.locationCode}/shift-payments`, {
                    method: "POST",
                    body: JSON.stringify({
                      employeeName: action.employeeName,
                      shiftDate: action.day.date
                    })
                  });
                  await refreshFinanceData();
                  setFinanceStatus(`Смена отмечена оплаченной. Обновлено: ${financeTimeLabel()}`);
                } catch (error) {
                  financeError.textContent = `Ошибка оплаты: ${error.message}`;
                } finally {
                  button.disabled = false;
                }
              });
            }

            for (const button of financeList.querySelectorAll("[data-unpay-shift]")) {
              button.addEventListener("click", async () => {
                const action = dayActions[Number(button.dataset.unpayShift)];
                const paymentId = Number(action?.day?.payment?.id);
                if (!action || !Number.isInteger(paymentId)) return;
                const confirmed = await confirmAction(
                  `Отменить оплату смены ${ruDate(action.day.date)} сотрудника ${action.employeeName}?`
                );
                if (!confirmed) return;
                button.disabled = true;
                financeError.textContent = "";
                try {
                  await api(
                    `/api/schedule/${action.day.locationCode}/shift-payments/${paymentId}`,
                    { method: "DELETE" }
                  );
                  await refreshFinanceData();
                  setFinanceStatus(`Оплата отменена. Обновлено: ${financeTimeLabel()}`);
                } catch (error) {
                  financeError.textContent = `Ошибка отмены оплаты: ${error.message}`;
                } finally {
                  button.disabled = false;
                }
              });
            }
          };

          const refreshFinanceData = async () => {
            refreshFinanceBtn.disabled = true;
            financeError.textContent = "";
            const selectedFinanceLocations =
              financeLocationCode === "all"
                ? state.locations
                : state.locations.filter(
                    (location) => String(location.code) === String(financeLocationCode)
                  );
            const locationLabel =
              financeLocationCode === "all"
                ? "Все ПВЗ"
                : selectedFinanceLocations[0]?.title || "ПВЗ";
            financeTitle.textContent = `Финансы — ${locationLabel}`;
            try {
              const locationData = await Promise.all(
                selectedFinanceLocations.map(async (location) => {
                  const [latestSchedule, latestShiftPayments] = await Promise.all([
                    api(`/api/schedule/${location.code}?month=${financeMonth}`),
                    api(`/api/schedule/${location.code}/shift-payments?month=${financeMonth}`)
                  ]);
                  return {
                    location,
                    shifts: latestSchedule.shifts || [],
                    payments: latestShiftPayments.shiftPayments || []
                  };
                })
              );
              financeShifts = locationData.flatMap(({ location, shifts: locationShifts }) =>
                locationShifts.map((row) => ({
                  ...row,
                  locationCode: location.code,
                  locationTitle: location.title
                }))
              );
              financeShiftPayments = locationData.flatMap(
                ({ location, payments: locationPayments }) =>
                  locationPayments.map((payment) => ({
                    ...payment,
                    locationCode: location.code,
                    locationTitle: location.title
                  }))
              );
              renderFinance();
              return true;
            } catch (error) {
              financeError.textContent = `Ошибка обновления: ${error.message}`;
              return false;
            } finally {
              refreshFinanceBtn.disabled = false;
            }
          };

          document.getElementById("openFinanceBtn")?.addEventListener("click", async () => {
            financeMonth = monthNow();
            financeLocationCode = String(state.selectedLocation.code);
            financeMonthBtn.textContent = formatMonthYear(financeMonth);
            financeLocationSelect.value = financeLocationCode;
            expandedFinancePeriods.clear();
            financeModal.classList.remove("hidden");
            if (await refreshFinanceData()) {
              setFinanceStatus(`Обновлено: ${financeTimeLabel()}`);
            }
          });
          document.getElementById("closeFinanceBtnTop").addEventListener("click", () => {
            financeModal.classList.add("hidden");
          });
          refreshFinanceBtn.addEventListener("click", async () => {
            if (await refreshFinanceData()) {
              setFinanceStatus(`Обновлено: ${financeTimeLabel()}`);
            }
          });
          financeMonthBtn.textContent = formatMonthYear(financeMonth);
          financeLocationSelect.value = financeLocationCode;
          financeLocationSelect.addEventListener("change", async () => {
            financeLocationCode = String(financeLocationSelect.value || "all");
            expandedFinancePeriods.clear();
            if (await refreshFinanceData()) {
              const selectedLabel =
                financeLocationCode === "all"
                  ? "все ПВЗ"
                  : state.locations.find(
                      (location) => String(location.code) === financeLocationCode
                    )?.title || "ПВЗ";
              setFinanceStatus(`Выбран: ${selectedLabel}. Обновлено: ${financeTimeLabel()}`);
            }
          });
          financeMonthBtn.addEventListener("click", () => {
            openMonthPicker({
              value: financeMonth,
              title: "Месяц расчёта",
              onSelect: async (nextMonth) => {
                financeMonth = nextMonth;
                financeMonthBtn.textContent = formatMonthYear(financeMonth);
                expandedFinancePeriods.clear();
                if (await refreshFinanceData()) {
                  setFinanceStatus(`Выбран ${formatMonthYear(financeMonth).toLowerCase()}`);
                }
              }
            });
          });

          function legacyFinanceUiDisabled() {
          const financeModal = document.getElementById("financeModal");
          const financeFromInput = document.getElementById("financeFromInput");
          const financeToInput = document.getElementById("financeToInput");
          const financeList = document.getElementById("financeList");
          const financeHint = document.getElementById("financeHint");
          const financeStatus = document.getElementById("financeStatus");
          const financeError = document.getElementById("financeError");
          const refreshFinanceBtn = document.getElementById("refreshFinanceBtn");
          const financeHistoryModal = document.getElementById("financeHistoryModal");
          const financeHistoryTitle = document.getElementById("financeHistoryTitle");
          const financeHistoryList = document.getElementById("financeHistoryList");
          const canMarkPaid = editable;
          let financeShifts = shifts;
          let financePayments = [];
          const expandedFinance = new Set();

          financeFromInput.min = monthBounds.start;
          financeFromInput.max = monthBounds.end;
          financeToInput.min = monthBounds.start;
          financeToInput.max = monthBounds.end;
          financeFromInput.value = monthBounds.start;
          financeToInput.value = monthBounds.end;

          const setFinanceStatus = (text, isError = false) => {
            financeStatus.className = isError ? "status error mt8" : "status ok mt8";
            financeStatus.textContent = text;
          };

          const nowTimeLabel = () =>
            new Date().toLocaleTimeString("ru-RU", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit"
            });

          const renderFinanceHistory = (employeeName) => {
            const history = financePayments
              .filter((item) => String(item.employeeName || "").trim() === employeeName)
              .sort((a, b) => String(b.paymentDate || "").localeCompare(String(a.paymentDate || "")));

            financeHistoryTitle.textContent = `История выплат: ${employeeName}`;
            if (!history.length) {
              financeHistoryList.innerHTML = `<div class="muted">Выплат пока нет.</div>`;
            } else {
              financeHistoryList.innerHTML = history
                .map((item) => {
                  const pFrom = item.periodFrom ? ruDate(item.periodFrom) : "—";
                  const pTo = item.periodTo ? ruDate(item.periodTo) : "—";
                  return `
                    <div class="finance-history-item">
                      <div>Дата выплаты: ${ruDate(item.paymentDate)}</div>
                      <div>За период: ${pFrom} - ${pTo}</div>
                      <div>Тип: ${item.paymentType === "advance" ? "Аванс" : "Выплата"}</div>
                      <div>Сумма: ${formatMoneyUnsigned(item.amount)}</div>
                      ${
                        canMarkPaid
                          ? `
                            <div class="finance-history-actions">
                              <button class="button danger" type="button" data-history-cancel-id="${item.id}">Отменить</button>
                            </div>
                          `
                          : ""
                      }
                    </div>
                  `;
                })
                .join("");
            }
            financeHistoryModal.classList.remove("hidden");

            const cancelButtons = [...financeHistoryList.querySelectorAll("[data-history-cancel-id]")];
            for (const btn of cancelButtons) {
              btn.addEventListener("click", async () => {
                const paymentId = Number(btn.dataset.historyCancelId);
                if (!Number.isInteger(paymentId) || paymentId <= 0) return;
                if (!(await confirmAction("Отменить эту выплату?", { danger: true }))) return;
                btn.disabled = true;
                financeError.textContent = "";
                try {
                  await api(`/api/schedule/${state.selectedLocation.code}/payments/${paymentId}`, {
                    method: "DELETE"
                  });
                  await refreshFinanceData();
                  renderFinanceHistory(employeeName);
                  setFinanceStatus(`Выплата отменена. Обновлено: ${nowTimeLabel()}`);
                } catch (error) {
                  financeError.textContent = `Ошибка отмены выплаты: ${error.message}`;
                } finally {
                  btn.disabled = false;
                }
              });
            }
          };

          const renderFinance = () => {
            const from = financeFromInput.value || monthBounds.start;
            const to = financeToInput.value || monthBounds.end;

            financeError.textContent = "";
            if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
              financeError.textContent = "Выберите корректный диапазон дат";
              financeList.innerHTML = "";
              return;
            }
            if (from > to) {
              financeError.textContent = "Дата начала не может быть больше даты окончания";
              financeList.innerHTML = "";
              return;
            }

            const paidTotals = new Map();
            for (const payment of financePayments) {
              const pDate = String(payment.paymentDate || "");
              if (!pDate || pDate < from || pDate > to) continue;
              const pName = String(payment.employeeName || "").trim();
              if (!pName) continue;
              const current = paidTotals.get(pName) || { payout: 0, advance: 0 };
              if (String(payment.paymentType || "payout") === "advance") {
                current.advance += Number(payment.amount || 0);
              } else {
                current.payout += Number(payment.amount || 0);
              }
              paidTotals.set(pName, current);
            }

            const totals = new Map();
            for (const row of financeShifts) {
              if (!row?.date || row.date < from || row.date > to) continue;
              const p1 = String(row.executor1 || "").trim();
              const p2 = String(row.executor2 || "").trim();
              const rate1 = Number(row.rate1 || 0);
              const rate2 = Number(row.rate2 || 0);
              const bonus1 = Number(row.bonuses1 || 0);
              const bonus2 = Number(row.bonuses2 || 0);
              const ded1Raw = Number(row.deductions1 || 0);
              const ded2Raw = Number(row.deductions2 || 0);

              if (p1) {
                const current = totals.get(p1) || {
                  total: 0,
                  shifts: 0,
                  deductions: 0,
                  bonuses: 0,
                  paid: Number((paidTotals.get(p1)?.payout || 0)),
                  advance: Number((paidTotals.get(p1)?.advance || 0))
                };
                current.total += rate1 + bonus1 + ded1Raw;
                current.shifts += 1;
                current.deductions += Math.abs(Math.min(0, ded1Raw));
                current.bonuses += Math.max(0, bonus1);
                totals.set(p1, current);
              }
              if (p2) {
                const current = totals.get(p2) || {
                  total: 0,
                  shifts: 0,
                  deductions: 0,
                  bonuses: 0,
                  paid: Number((paidTotals.get(p2)?.payout || 0)),
                  advance: Number((paidTotals.get(p2)?.advance || 0))
                };
                current.total += rate2 + bonus2 + ded2Raw;
                current.shifts += 1;
                current.deductions += Math.abs(Math.min(0, ded2Raw));
                current.bonuses += Math.max(0, bonus2);
                totals.set(p2, current);
              }
            }

            for (const [name, paid] of paidTotals.entries()) {
              if (totals.has(name)) continue;
              totals.set(name, {
                total: 0,
                shifts: 0,
                deductions: 0,
                bonuses: 0,
                paid: Number(paid.payout || 0),
                advance: Number(paid.advance || 0)
              });
            }

            const rows = [...totals.entries()]
              .map(([name, stat]) => {
                const accrued = Number(stat.total || 0);
                const paid = Number(stat.paid || 0);
                const advance = Number(stat.advance || 0);
                const balance = accrued - paid - advance;
                return {
                  name,
                  shifts: Number(stat.shifts || 0),
                  accrued,
                  deductions: Number(stat.deductions || 0),
                  bonuses: Number(stat.bonuses || 0),
                  paid,
                  advance,
                  balance
                };
              })
              .sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name, "ru"));

            financeHint.textContent = `Период: ${ruDate(from)} - ${ruDate(to)}. К выплате = (ставка + доплаты - удержания) - аванс - выплачено.`;
            if (!rows.length) {
              financeList.innerHTML = `<div class="muted">За выбранный период смен не найдено.</div>`;
              return;
            }

            financeList.innerHTML = rows
              .map(
                (item, index) => `
                  <div class="finance-row">
                    <button class="finance-summary" type="button" data-finance-toggle="${index}">
                      <div class="finance-summary-left">
                        <div class="finance-summary-name">
                          ${escapeHtml(item.name)}
                          ${(() => {
                            const state = financeStateForRow(item);
                            return `<span class="state-pill ${state.cls}">${state.label}</span>`;
                          })()}
                        </div>
                      </div>
                      <div class="finance-summary-right">
                        <div class="finance-amount">К выплате: ${formatPayoutBalance(item.balance)}</div>
                        <img
                          class="finance-toggle-icon"
                          src="${expandedFinance.has(item.name) ? "/icons/chevron_double_up_icon_143815.png" : "/icons/chevron_double_down_icon_143818.png"}"
                          alt="${expandedFinance.has(item.name) ? "Свернуть" : "Развернуть"}"
                        />
                      </div>
                    </button>
                    <div class="finance-details ${expandedFinance.has(item.name) ? "" : "hidden"}" data-finance-details="${index}">
                      <div>За смены: ${item.shifts} (${formatMoney(item.accrued)})</div>
                      <div>Удержано: ${formatMoneyUnsigned(item.deductions)}</div>
                      <div>Доплачено: ${formatMoneyUnsigned(item.bonuses)}</div>
                      <div>Аванс: ${formatMoneyUnsigned(item.advance)}</div>
                      <div>Выплачено: ${formatMoneyUnsigned(item.paid)}</div>
                      ${
                        canMarkPaid
                          ? `
                            <div class="finance-pay-row">
                              <input type="number" min="1" step="100" placeholder="Сумма выплаты" data-finance-paid-input="${index}" />
                              <button class="button secondary" type="button" data-finance-history-btn="${index}">История</button>
                              <button class="button secondary" type="button" data-finance-advance-btn="${index}">Аванс</button>
                              <button class="button secondary" type="button" data-finance-paid-btn="${index}">Выплачено</button>
                            </div>
                          `
                          : ""
                      }
                    </div>
                  </div>
                `
              )
              .join("");

            const toggleButtons = [...financeList.querySelectorAll("[data-finance-toggle]")];
            for (const btn of toggleButtons) {
              btn.addEventListener("click", () => {
                const idx = Number(btn.dataset.financeToggle);
                const item = rows[idx];
                if (!item) return;
                if (expandedFinance.has(item.name)) {
                  expandedFinance.delete(item.name);
                } else {
                  expandedFinance.add(item.name);
                }
                renderFinance();
              });
            }

            const historyButtons = [...financeList.querySelectorAll("[data-finance-history-btn]")];
            for (const btn of historyButtons) {
              btn.addEventListener("click", () => {
                const idx = Number(btn.dataset.financeHistoryBtn);
                const item = rows[idx];
                if (!item) return;
                renderFinanceHistory(item.name);
              });
            }

            const paidButtons = [...financeList.querySelectorAll("[data-finance-paid-btn]")];
            const advanceButtons = [...financeList.querySelectorAll("[data-finance-advance-btn]")];
            const addFinanceOperation = async (idx, operationType) => {
              if (!canMarkPaid) return;
              const item = rows[idx];
              if (!item) return;
              const input = financeList.querySelector(`[data-finance-paid-input='${idx}']`);
              const amount = Number(input?.value || 0);
              if (!Number.isFinite(amount) || amount <= 0) {
                financeError.textContent = "Введите корректную сумму";
                return;
              }
              financeError.textContent = "";
              await api(`/api/schedule/${state.selectedLocation.code}/payments`, {
                method: "POST",
                body: JSON.stringify({
                  employeeName: item.name,
                  paymentDate: financeToInput.value || monthBounds.end,
                  periodFrom: financeFromInput.value || monthBounds.start,
                  periodTo: financeToInput.value || monthBounds.end,
                  operationType,
                  amount
                })
              });
              await refreshFinanceData();
              setFinanceStatus(
                `${operationType === "advance" ? "Аванс" : "Выплата"} добавлен(а). Обновлено: ${nowTimeLabel()}`
              );
            };

            for (const btn of paidButtons) {
              btn.addEventListener("click", async () => {
                const idx = Number(btn.dataset.financePaidBtn);
                btn.disabled = true;
                try {
                  await addFinanceOperation(idx, "payout");
                } catch (error) {
                  financeError.textContent = `Ошибка выплаты: ${error.message}`;
                } finally {
                  btn.disabled = false;
                }
              });
            }

            for (const btn of advanceButtons) {
              btn.addEventListener("click", async () => {
                const idx = Number(btn.dataset.financeAdvanceBtn);
                btn.disabled = true;
                try {
                  await addFinanceOperation(idx, "advance");
                } catch (error) {
                  financeError.textContent = `Ошибка аванса: ${error.message}`;
                } finally {
                  btn.disabled = false;
                }
              });
            }
          };

          const refreshFinanceData = async () => {
            refreshFinanceBtn.disabled = true;
            financeError.textContent = "";
            try {
              const [latestSchedule, latestPayments] = await Promise.all([
                api(`/api/schedule/${state.selectedLocation.code}?month=${state.selectedMonth}`),
                api(`/api/schedule/${state.selectedLocation.code}/payments?month=${state.selectedMonth}`)
              ]);
              financeShifts = latestSchedule.shifts || [];
              financePayments = latestPayments.payments || [];
              renderFinance();
              setFinanceStatus(`Обновлено: ${nowTimeLabel()}`);
            } catch (error) {
              financeError.textContent = `Ошибка обновления: ${error.message}`;
              setFinanceStatus("");
            } finally {
              refreshFinanceBtn.disabled = false;
            }
          };

          document.getElementById("openFinanceBtn").addEventListener("click", () => {
            financeFromInput.value = monthBounds.start;
            financeToInput.value = monthBounds.end;
            expandedFinance.clear();
            refreshFinanceData();
            financeModal.classList.remove("hidden");
          });
          document.getElementById("closeFinanceBtn").addEventListener("click", () => {
            financeModal.classList.add("hidden");
          });
          financeModal.addEventListener("click", (event) => {
            if (event.target === financeModal) financeModal.classList.add("hidden");
          });
          document.getElementById("closeFinanceHistoryBtn").addEventListener("click", () => {
            financeHistoryModal.classList.add("hidden");
          });
          financeHistoryModal.addEventListener("click", (event) => {
            if (event.target === financeHistoryModal) financeHistoryModal.classList.add("hidden");
          });
          financeFromInput.addEventListener("change", renderFinance);
          financeToInput.addEventListener("change", renderFinance);
          refreshFinanceBtn.addEventListener("click", refreshFinanceData);
          document.getElementById("financeFirstHalfBtn").addEventListener("click", () => {
            const firstHalfEnd = `${state.selectedMonth}-15`;
            financeFromInput.value = monthBounds.start;
            financeToInput.value = firstHalfEnd <= monthBounds.end ? firstHalfEnd : monthBounds.end;
            renderFinance();
          });
          document.getElementById("financeSecondHalfBtn").addEventListener("click", () => {
            const secondHalfStart = `${state.selectedMonth}-16`;
            financeFromInput.value = secondHalfStart >= monthBounds.start ? secondHalfStart : monthBounds.start;
            financeToInput.value = monthBounds.end;
            renderFinance();
          });
          document.getElementById("financeWholeMonthBtn").addEventListener("click", () => {
            financeFromInput.value = monthBounds.start;
            financeToInput.value = monthBounds.end;
            renderFinance();
          });
          }

          const autosave = createRowAutoSaver(state.selectedLocation.code);
          const adjustModal = document.getElementById("adjustModal");
          const adjustTitle = document.getElementById("adjustTitle");
          const adjustList = document.getElementById("adjustList");
          const adjustError = document.getElementById("adjustError");
          const saveAdjustBtn = document.getElementById("saveAdjustBtn");
          const saveAdjustFeedback = document.getElementById("saveAdjustFeedback");
          const closeAdjustBtn = document.getElementById("closeAdjustBtn");
          let adjustTarget = { row: null, kind: null };
          let activeAdjustCard = null;

          const getCardAttachmentIds = (card) => {
            try {
              const parsed = JSON.parse(card?.dataset.attachmentIds || "[]");
              return Array.isArray(parsed) ? parsed.filter(Boolean).slice(0, 6) : [];
            } catch {
              return [];
            }
          };
          const setCardAttachmentIds = (card, ids) => {
            card.dataset.attachmentIds = JSON.stringify([...new Set(ids)].slice(0, 6));
          };
          const appendAdjustPhoto = (card, attachment) => {
            const ids = getCardAttachmentIds(card);
            if (ids.includes(attachment.id)) return;
            setCardAttachmentIds(card, [...ids, attachment.id]);
            const list = card.querySelector("[data-adj-photo-list='1']");
            list.insertAdjacentHTML(
              "beforeend",
              `
                <div class="adjust-photo" data-attachment-id="${escapeHtml(attachment.id)}">
                  <img
                    src="/api/schedule/attachments/${escapeHtml(attachment.id)}"
                    data-image-preview="/api/schedule/attachments/${escapeHtml(attachment.id)}"
                    data-image-alt="Фото подтверждения"
                    alt="Фото подтверждения"
                    loading="lazy"
                  />
                  <button class="adjust-photo-remove" data-remove-adj-photo="1" type="button" aria-label="Удалить фото">×</button>
                </div>
              `
            );
          };
          const uploadAdjustmentPhoto = async (file, card) => {
            if (!file || !card) return;
            if (getCardAttachmentIds(card).length >= 6) {
              adjustError.textContent = "К одной причине можно добавить не больше 6 фотографий";
              return;
            }
            adjustError.className = "status mt8";
            adjustError.textContent = "Загрузка фотографии...";
            const formData = new FormData();
            formData.append("file", file, file.name || `photo-${Date.now()}.png`);
            try {
              const data = await api("/api/schedule/attachments", {
                method: "POST",
                body: formData
              });
              appendAdjustPhoto(card, data.attachment);
              card.querySelector("[data-adj-check='1']").checked = true;
              adjustError.className = "status ok mt8";
              adjustError.textContent = "Фото добавлено";
            } catch (error) {
              adjustError.className = "status error mt8";
              adjustError.textContent = error.message;
            }
          };

          const getMetaKey = (kind) => {
            if (kind === "deductions1") return "deductions1Meta";
            if (kind === "deductions2") return "deductions2Meta";
            if (kind === "bonuses1") return "bonuses1Meta";
            return "bonuses2Meta";
          };
          const getRules = (kind) =>
            kind === "deductions1" || kind === "deductions2" ? deductionRules : bonusRules;
          const parseRowMeta = (row, kind) => {
            const key = getMetaKey(kind);
            try {
              const raw = row.dataset[key] || "[]";
              const parsed = JSON.parse(raw);
              return Array.isArray(parsed) ? parsed : [];
            } catch {
              return [];
            }
          };
          const writeRowMeta = (row, kind, items) => {
            row.dataset[getMetaKey(kind)] = JSON.stringify(items);
          };
          const updateAdjustValue = (row, kind, total) => {
            const hidden = row.querySelector(`[data-f='${kind}']`);
            if (hidden) hidden.value = String(total);
            for (const btn of row.querySelectorAll(`[data-adjust-open='${kind}']`)) {
              btn.textContent = adjustButtonLabel(kind, total);
            }
          };

          const openAdjustModal = (row, kind) => {
            const rules = getRules(kind);
            const existing = parseRowMeta(row, kind);
            const existingMap = new Map(existing.map((item) => [item.reason, item]));
            adjustTarget = { row, kind };
            activeAdjustCard = null;
            const titleMap = {
              deductions1: "Удержания И1",
              deductions2: "Удержания И2",
              bonuses1: "Доплаты И1",
              bonuses2: "Доплаты И2"
            };
            adjustTitle.textContent = titleMap[kind] || "Изменения";
            adjustError.textContent = "";
            if (saveAdjustFeedback) {
              saveAdjustFeedback.textContent = "";
              saveAdjustFeedback.classList.remove("visible");
            }

            adjustList.innerHTML = rules
              .map((rule, index) => {
                const prev = existingMap.get(rule.title);
                const amountValue = prev ? Number(prev.amount || 0) : Number(rule.fixed || 0);
                const attachmentIds = Array.isArray(prev?.attachmentIds)
                  ? prev.attachmentIds.filter(Boolean).slice(0, 6)
                  : [];
                return `
                  <div
                    class="adjust-item"
                    data-rule-code="${escapeHtml(rule.code)}"
                    data-attachment-ids="${escapeHtml(JSON.stringify(attachmentIds))}"
                  >
                    <div class="adjust-item-head">
                      <input id="adjCheck${index}" type="checkbox" data-adj-check="1" ${prev ? "checked" : ""} />
                      <label for="adjCheck${index}">${escapeHtml(rule.title)}</label>
                    </div>
                    <div class="adjust-item-desc">${escapeHtml(rule.hint || "")}</div>
                    <div class="adjust-item-grid">
                      <div>
                        <div class="muted">Сумма</div>
                        <input
                          data-adj-amount="1"
                          type="number"
                          step="100"
                          ${kind.startsWith("deductions") ? 'max="0"' : 'min="0"'}
                          ${rule.fixed != null ? "disabled" : ""}
                          value="${Number.isFinite(amountValue) ? amountValue : 0}"
                          placeholder="${kind.startsWith("deductions") ? "-300" : "300"}"
                        />
                      </div>
                      <div>
                        <div class="muted">Описание</div>
                        <input
                          data-adj-note="1"
                          type="text"
                          maxlength="250"
                          value="${escapeHtml(prev?.note || "")}"
                          placeholder="Краткое описание"
                        />
                      </div>
                    </div>
                    <div class="adjust-attachments">
                      <div class="adjust-attachment-actions">
                        <input class="hidden" data-adj-photo-input="1" type="file" accept="image/jpeg,image/png,image/webp" multiple />
                        <button class="adjust-photo-btn" data-adj-photo-button="1" type="button">Добавить фото</button>
                        <span class="adjust-paste-hint">или вставьте изображение Ctrl+V</span>
                      </div>
                      <div class="adjust-photo-list" data-adj-photo-list="1">
                        ${attachmentIds
                          .map(
                            (id) => `
                              <div class="adjust-photo" data-attachment-id="${escapeHtml(id)}">
                                <img
                                  src="/api/schedule/attachments/${escapeHtml(id)}"
                                  data-image-preview="/api/schedule/attachments/${escapeHtml(id)}"
                                  data-image-alt="Фото подтверждения"
                                  alt="Фото подтверждения"
                                  loading="lazy"
                                />
                                <button class="adjust-photo-remove" data-remove-adj-photo="1" type="button" aria-label="Удалить фото">×</button>
                              </div>
                            `
                          )
                          .join("")}
                      </div>
                    </div>
                  </div>
                `;
              })
              .join("");

            adjustModal.classList.remove("hidden");
          };

          adjustList.addEventListener("pointerdown", (event) => {
            const card = event.target.closest(".adjust-item");
            if (card) activeAdjustCard = card;
          });
          adjustList.addEventListener("click", (event) => {
            const card = event.target.closest(".adjust-item");
            if (!card) return;
            activeAdjustCard = card;
            if (event.target.closest("[data-adj-photo-button='1']")) {
              card.querySelector("[data-adj-photo-input='1']")?.click();
              return;
            }
            const removeButton = event.target.closest("[data-remove-adj-photo='1']");
            if (removeButton) {
              const photo = removeButton.closest("[data-attachment-id]");
              const attachmentId = photo?.dataset.attachmentId;
              setCardAttachmentIds(
                card,
                getCardAttachmentIds(card).filter((id) => id !== attachmentId)
              );
              photo?.remove();
            }
          });
          adjustList.addEventListener("change", async (event) => {
            const input = event.target.closest("[data-adj-photo-input='1']");
            if (!input) return;
            const card = input.closest(".adjust-item");
            activeAdjustCard = card;
            for (const file of [...(input.files || [])]) {
              await uploadAdjustmentPhoto(file, card);
            }
            input.value = "";
          });
          adjustModal.addEventListener("paste", async (event) => {
            if (adjustModal.classList.contains("hidden")) return;
            const imageFiles = [...(event.clipboardData?.files || [])].filter((file) =>
              String(file.type || "").startsWith("image/")
            );
            if (!imageFiles.length) return;
            const checkedCard = [...adjustList.querySelectorAll(".adjust-item")].find(
              (item) => item.querySelector("[data-adj-check='1']")?.checked
            );
            const card = event.target.closest(".adjust-item") || activeAdjustCard || checkedCard;
            if (!card) {
              adjustError.className = "status error mt8";
              adjustError.textContent = "Сначала выберите причину, к которой относится фото";
              return;
            }
            event.preventDefault();
            activeAdjustCard = card;
            for (const file of imageFiles) await uploadAdjustmentPhoto(file, card);
          });

          closeAdjustBtn.addEventListener("click", () => {
            adjustModal.classList.add("hidden");
            adjustTarget = { row: null, kind: null };
            if (saveAdjustFeedback) {
              saveAdjustFeedback.textContent = "";
              saveAdjustFeedback.classList.remove("visible");
            }
          });
          adjustModal.addEventListener("click", (event) => {
            if (event.target === adjustModal) {
              adjustModal.classList.add("hidden");
              adjustTarget = { row: null, kind: null };
              if (saveAdjustFeedback) {
                saveAdjustFeedback.textContent = "";
                saveAdjustFeedback.classList.remove("visible");
              }
            }
          });

          saveAdjustBtn.addEventListener("click", () => {
            const { row, kind } = adjustTarget;
            if (!row || !kind) return;
            const rules = getRules(kind);
            const items = [];
            let total = 0;
            adjustError.textContent = "";

            const cards = [...adjustList.querySelectorAll(".adjust-item")];
            for (let idx = 0; idx < cards.length; idx += 1) {
              const card = cards[idx];
              const rule = rules[idx];
              const checked = !!card.querySelector("[data-adj-check='1']")?.checked;
              if (!checked) continue;
              const amountInput = card.querySelector("[data-adj-amount='1']");
              const noteInput = card.querySelector("[data-adj-note='1']");
              let amount = rule.fixed != null ? Number(rule.fixed) : Number(amountInput?.value || 0);
              const note = String(noteInput?.value || "").trim();

              if (kind.startsWith("deductions") && amount > 0) {
                adjustError.textContent = "В удержаниях можно указывать только отрицательные суммы";
                return;
              }
              if (kind.startsWith("bonuses") && amount < 0) {
                adjustError.textContent = "В доплатах можно указывать только положительные суммы";
                return;
              }

              if (!Number.isFinite(amount) || amount === 0) {
                continue;
              }

              items.push({
                reason: rule.title,
                amount,
                note,
                attachmentIds: getCardAttachmentIds(card)
              });
              total += amount;
            }

            writeRowMeta(row, kind, items);
            updateAdjustValue(row, kind, total);
            calculateScheduleRatesPreview(row);
            autosave(row);
            showSavedFeedback(saveAdjustFeedback);
            window.setTimeout(() => {
              adjustModal.classList.add("hidden");
              adjustTarget = { row: null, kind: null };
            }, 240);
          });

          if (!editable) {
            for (const input of screen.querySelectorAll("[data-shift-input='1'], tbody input, tbody select, [data-adjust-open]")) {
              input.setAttribute("readonly", "readonly");
              input.setAttribute("disabled", "disabled");
            }
          } else {
            for (const input of screen.querySelectorAll("[data-shift-input='1'], tbody input, tbody select")) {
              const handleScheduleInput = () => {
                const row = input.closest("[data-date]");
                if (!row) return;
                if (input.matches("[data-f='executor1']")) syncExecutorTimeDefaults(row, 1);
                if (input.matches("[data-f='executor2']")) syncExecutorTimeDefaults(row, 2);
                calculateScheduleRatesPreview(row);
                autosave(row);
              };
              input.addEventListener("input", handleScheduleInput);
              input.addEventListener("change", handleScheduleInput);
            }
            for (const btn of screen.querySelectorAll("[data-adjust-open]")) {
              btn.addEventListener("click", () => {
                const row = btn.closest("[data-date]");
                if (!row) return;
                const kind = btn.dataset.adjustOpen;
                openAdjustModal(row, kind);
              });
            }
          }

          if (viewMode === "mobile") {
            const allCards = [...screen.querySelectorAll(".schedule-card")];
            const toggleAllBtn = document.getElementById("toggleAllCardsBtn");
            let expandedAll = false;

            function setCardExpanded(card, expanded) {
              const details = card.querySelector("[data-details='1']");
              const btn = card.querySelector("[data-toggle-card]");
              const icon = btn?.querySelector("img");
              if (!details || !btn) return;
              details.classList.toggle("hidden", !expanded);
              btn.classList.toggle("open", expanded);
              btn.setAttribute("aria-label", expanded ? "Свернуть день" : "Развернуть день");
              if (icon) {
                icon.src = expanded
                  ? "/icons/chevron_double_up_icon_143815.png"
                  : "/icons/chevron_double_down_icon_143818.png";
                icon.alt = expanded ? "Свернуть" : "Развернуть";
              }
            }

            for (const card of allCards) {
              setCardExpanded(card, false);
              const btn = card.querySelector("[data-toggle-card]");
              if (!btn) continue;
              btn.addEventListener("click", () => {
                const details = card.querySelector("[data-details='1']");
                const expanded = details?.classList.contains("hidden");
                setCardExpanded(card, !!expanded);
                const anyCollapsed = allCards.some((c) =>
                  c.querySelector("[data-details='1']")?.classList.contains("hidden")
                );
                expandedAll = !anyCollapsed;
                toggleAllBtn.textContent = expandedAll ? "Свернуть все" : "Развернуть все";
              });
            }

            if (toggleAllBtn) {
              toggleAllBtn.addEventListener("click", () => {
                expandedAll = !expandedAll;
                for (const card of allCards) {
                  setCardExpanded(card, expandedAll);
                }
                toggleAllBtn.textContent = expandedAll ? "Свернуть все" : "Развернуть все";
              });
            }
          }
        } catch (error) {
          screen.innerHTML = `
            <p class="status error">Ошибка загрузки графика: ${escapeHtml(error.message)}</p>
            <div class="mt12">
              <button class="back-icon-btn" id="backLocationsBtn" aria-label="Назад">
                <img src="/icons/back-arrow.png" alt="Назад" />
              </button>
            </div>
          `;
          document.getElementById("backLocationsBtn").addEventListener("click", renderLocations);
        }
      }

      initApp().finally(scheduleInterfaceIconPreload);
