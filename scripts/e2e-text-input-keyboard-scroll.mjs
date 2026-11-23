/**
 * Headless E2E for play-rail character-input keyboard scroll helper.
 * Expects TEMP/dama-kb-scroll-e2e.mjs from esbuild, or builds via node_modules/.bin/esbuild.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const src = path.join(root, "apps/web/src/lib/text-input-keyboard-scroll.ts");
const out = path.join(os.tmpdir(), "dama-kb-scroll-e2e.mjs");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function installDom() {
  const listeners = new Map();
  const vvListeners = new Map();

  class FakeEl {
    constructor(tag, attrs = {}) {
      this.tagName = String(tag).toUpperCase();
      this.attrs = { ...attrs };
      this.style = {
        removeProperty(name) {
          delete this[name.replace(/-([a-z])/g, (_, c) => c.toUpperCase())];
          delete this[name];
        },
      };
      this.children = [];
      this.parentElement = null;
      this.scrollTop = 0;
      this.clientHeight = 500;
      this.scrollHeight = 500;
      this.readOnly = false;
      this.disabled = false;
      this._rect = { top: 0, bottom: 40, left: 0, right: 300, width: 300, height: 40 };
    }
    getAttribute(name) {
      return this.attrs[name] ?? null;
    }
    setAttribute(name, value) {
      this.attrs[name] = String(value);
    }
    hasAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attrs, name);
    }
    removeAttribute(name) {
      delete this.attrs[name];
    }
    closest(sel) {
      let n = this;
      while (n) {
        if (sel.includes("data-dama-rail-scroll") && n.hasAttribute("data-dama-rail-scroll")) {
          return n;
        }
        if (sel.includes("data-dama-kb-scroll") && n.hasAttribute("data-dama-kb-scroll")) {
          return n;
        }
        n = n.parentElement;
      }
      return null;
    }
    querySelectorAll(sel) {
      const attr = sel.match(/\[([^\]]+)\]/)?.[1];
      const out = [];
      const walk = (node) => {
        if (attr && node.hasAttribute?.(attr)) out.push(node);
        for (const c of node.children || []) walk(c);
      };
      walk(this);
      return out;
    }
    querySelector(sel) {
      return this.querySelectorAll(sel)[0] ?? null;
    }
    getBoundingClientRect() {
      return { ...this._rect };
    }
    addEventListener(type, fn) {
      const arr = listeners.get(type) || [];
      arr.push({ target: this, fn });
      listeners.set(type, arr);
    }
    removeEventListener(type, fn) {
      const arr = listeners.get(type) || [];
      listeners.set(
        type,
        arr.filter((x) => !(x.target === this && x.fn === fn)),
      );
    }
    contains(node) {
      let n = node;
      while (n) {
        if (n === this) return true;
        n = n.parentElement;
      }
      return false;
    }
    dispatchEvent(type, event) {
      for (const { target, fn } of listeners.get(type) || []) {
        if (target === this) fn(event);
      }
    }
  }

  class HTMLInputElement extends FakeEl {
    constructor() {
      super("input", { type: "text" });
    }
  }
  class HTMLTextAreaElement extends FakeEl {
    constructor() {
      super("textarea");
    }
  }

  const documentElement = new FakeEl("html");
  Object.defineProperty(documentElement, "clientHeight", {
    get: () => 844,
  });

  const visualViewport = {
    height: 844,
    width: 390,
    offsetTop: 0,
    addEventListener(type, fn) {
      const arr = vvListeners.get(type) || [];
      arr.push(fn);
      vvListeners.set(type, arr);
    },
    removeEventListener(type, fn) {
      vvListeners.set(
        type,
        (vvListeners.get(type) || []).filter((x) => x !== fn),
      );
    },
    _emit(type) {
      for (const fn of vvListeners.get(type) || []) fn();
    },
  };

  let scrolled = 0;
  globalThis.window = globalThis;
  globalThis.document = {
    documentElement,
    body: new FakeEl("body"),
    activeElement: null,
  };
  globalThis.HTMLElement = FakeEl;
  globalThis.HTMLInputElement = HTMLInputElement;
  globalThis.HTMLTextAreaElement = HTMLTextAreaElement;
  globalThis.visualViewport = visualViewport;
  globalThis.innerHeight = 844;
  globalThis.innerWidth = 390;
  globalThis.matchMedia = (q) => ({
    matches: String(q).includes("max-width: 1023"),
    addEventListener() {},
    removeEventListener() {},
  });
  globalThis.getComputedStyle = (el) => ({
    overflowY: el.attrs?.["data-overflow"] || "auto",
  });
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(0), 0);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
  globalThis.scrollBy = (_x, y) => {
    scrolled += y;
  };
  globalThis.addEventListener = (type, fn) => {
    const arr = listeners.get(`window:${type}`) || [];
    arr.push({ target: globalThis, fn });
    listeners.set(`window:${type}`, arr);
  };
  globalThis.removeEventListener = (type, fn) => {
    listeners.set(
      `window:${type}`,
      (listeners.get(`window:${type}`) || []).filter((x) => x.fn !== fn),
    );
  };
  globalThis.setTimeout = globalThis.setTimeout.bind(globalThis);
  globalThis.clearTimeout = globalThis.clearTimeout.bind(globalThis);
  globalThis.__scrollByTotal = () => scrolled;
  globalThis.__resetScrollBy = () => {
    scrolled = 0;
  };
  globalThis.__vv = visualViewport;
  globalThis.__FakeEl = FakeEl;

  return { visualViewport };
}

function ensureBundle() {
  // Always rebuild so helper changes are covered.
  const candidates = [
    path.join(root, "apps/web/node_modules/esbuild/bin/esbuild"),
    path.join(root, "node_modules/esbuild/bin/esbuild"),
    path.join(root, "apps/web/node_modules/esbuild/lib/main.js"),
    path.join(root, "node_modules/esbuild/lib/main.js"),
  ];
  const esbuildJs = candidates.find((p) => fs.existsSync(p));
  if (esbuildJs) {
    execFileSync(
      process.execPath,
      [esbuildJs, src, "--bundle", "--platform=neutral", "--format=esm", `--outfile=${out}`],
      { cwd: root, stdio: "pipe" },
    );
    return;
  }
  // Fallback: npx (pnpm workspaces often hoist differently on Windows).
  execFileSync(
    "npx",
    ["--yes", "esbuild", src, "--bundle", "--platform=neutral", "--format=esm", `--outfile=${out}`],
    { cwd: root, stdio: "pipe", shell: true },
  );
}

async function main() {
  ensureBundle();

  installDom();
  const mod = await import(pathToFileURL(out).href);
  const {
    isCharacterTextField,
    isMobileTabletViewport,
    keyboardBottomInset,
    captureIdleVisualHeight,
    ensureTextFieldAboveKeyboard,
    bindTextInputKeyboardScroll,
  } = mod;

  assert(isMobileTabletViewport() === true, "mobile mq should match");

  const text = new globalThis.HTMLInputElement();
  text.setAttribute("type", "text");
  assert(isCharacterTextField(text), "text input is character field");

  const search = new globalThis.HTMLInputElement();
  search.setAttribute("type", "search");
  assert(isCharacterTextField(search), "search input is character field");

  const checkbox = new globalThis.HTMLInputElement();
  checkbox.setAttribute("type", "checkbox");
  assert(!isCharacterTextField(checkbox), "checkbox is not character field");

  const number = new globalThis.HTMLInputElement();
  number.setAttribute("type", "number");
  assert(!isCharacterTextField(number), "number is not character field");

  const aside = new globalThis.__FakeEl("aside");
  aside.setAttribute("data-dama-rail-scroll", "");
  aside.clientHeight = 500;
  aside.scrollHeight = 500;
  aside.scrollTop = 0;

  const input = new globalThis.HTMLInputElement();
  input.setAttribute("type", "text");
  input.parentElement = aside;
  aside.children.push(input);
  input._rect = { top: 720, bottom: 760, left: 16, right: 374, width: 358, height: 40 };

  captureIdleVisualHeight();
  assert(keyboardBottomInset() === 0, "no keyboard yet");

  globalThis.__vv.height = 480;
  const kb = keyboardBottomInset();
  assert(kb >= 300, `keyboard inset should be large, got ${kb}`);

  ensureTextFieldAboveKeyboard(input);
  assert(aside.hasAttribute("data-dama-kb-pad"), "scrollport should be padded");
  const pad = aside.style.paddingBottom || "";
  assert(/px$/.test(pad) && Number.parseInt(pad, 10) > 200, `pad should be large, got ${pad}`);
  aside.scrollHeight = 500 + Number.parseInt(pad, 10);
  ensureTextFieldAboveKeyboard(input);
  assert(
    aside.scrollTop > 0 || globalThis.__scrollByTotal() > 0,
    "should scroll field into view",
  );

  // focusin bind path
  globalThis.__resetScrollBy();
  aside.scrollTop = 0;
  aside.scrollHeight = 500;
  delete aside.style.paddingBottom;
  aside.removeAttribute("data-dama-kb-pad");
  globalThis.__vv.height = 844;
  captureIdleVisualHeight();

  const cleanup = bindTextInputKeyboardScroll({ root: aside });
  globalThis.__vv.height = 480;
  document.activeElement = input;
  aside.dispatchEvent("focusin", { target: input, relatedTarget: null });
  await new Promise((r) => setTimeout(r, 50));
  globalThis.__vv._emit("resize");
  await new Promise((r) => setTimeout(r, 400));
  assert(aside.hasAttribute("data-dama-kb-pad"), "focusin path should pad rail");
  cleanup();

  // pointerdown backup path (WebViews that suppress focusin)
  globalThis.__resetScrollBy();
  aside.scrollTop = 0;
  aside.scrollHeight = 500;
  delete aside.style.paddingBottom;
  aside.removeAttribute("data-dama-kb-pad");
  globalThis.__vv.height = 844;
  captureIdleVisualHeight();
  const cleanup2 = bindTextInputKeyboardScroll({ root: aside });
  globalThis.__vv.height = 480;
  document.activeElement = input;
  aside.dispatchEvent("pointerdown", { target: input });
  await new Promise((r) => setTimeout(r, 50));
  globalThis.__vv._emit("resize");
  await new Promise((r) => setTimeout(r, 400));
  assert(aside.hasAttribute("data-dama-kb-pad"), "pointerdown path should pad rail");
  cleanup2();

  // Source coverage: rail character inputs + helpers must stay wired.
  const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
  // Admin helper must stay in lockstep with web (shared algorithm).
  const adminHelper = read("apps/admin/src/lib/text-input-keyboard-scroll.ts");
  assert(adminHelper.includes("onPointerDown"), "admin helper must include pointerdown backup");
  assert(adminHelper.includes("armFocusedField"), "admin helper must share armFocusedField");
  assert(!adminHelper.includes("data-dama-kb-bound"), "admin helper must not leave debug attrs");
  assert(!adminHelper.includes("data-dama-kb-debug"), "admin helper must not leave debug attrs");
  const webHelper = read("apps/web/src/lib/text-input-keyboard-scroll.ts");
  assert(webHelper.includes("onPointerDown"), "web helper must include pointerdown backup");
  assert(!webHelper.includes("data-dama-kb-bound"), "web helper must not leave debug attrs");
  assert(!webHelper.includes("data-dama-kb-debug"), "web helper must not leave debug attrs");
  const maxLgHook = read("apps/web/src/hooks/useMaxLg.ts");
  assert(maxLgHook.includes("requestAnimationFrame"), "useMaxLg must re-check after paint so SSR false does not stick on phone");
  assert(maxLgHook.includes("resize"), "useMaxLg must listen to resize for viewport emulation");
  assert(/onStoreChange\(\);\s*\n\s*const raf/.test(maxLgHook) || maxLgHook.includes("onStoreChange();\n  const raf"), "useMaxLg must notify immediately on subscribe (not only on media change)");
  const asideSrc = read("apps/web/src/components/play-rail/PlayRailAside.tsx");
  assert(asideSrc.includes("useTextInputKeyboardScroll"), "web PlayRailAside must bind helper");
  assert(asideSrc.includes("setRailComposeSheet") || asideSrc.includes("railComposeSheet"), "web PlayRailAside must support compose sheet");
  assert(asideSrc.includes("data-dama-rail-compose"), "web PlayRailAside must mark compose mode");
  assert(asideSrc.includes("onPointerDown") && asideSrc.includes("tryOpenCompose"), "web compose must open on pointerdown backup");
  assert(asideSrc.includes("flushSync"), "web must commit compose layout before focus in the same tap");
  assert(asideSrc.includes("setSheetOpen") || asideSrc.includes("sheetOpen"), "web must use local React sheet state so flushSync commits layout");
  assert(!/if\s*\(\s*!storeCompose\s*\)\s*setSheetOpen\(false\)/.test(asideSrc), "must not auto-close local sheet from stale storeCompose=false");
  assert(asideSrc.includes("onPointerDownCapture") || asideSrc.includes("tryOpenCompose"), "compose must open via React capture and/or document capture");
  assert(asideSrc.includes('document.addEventListener("pointerdown"'), "compose must use document capture backup (native + ref-safe)");
  assert(asideSrc.includes("playRailComposeInDialog"), "compose must work inside FAB / dialog sheet");
  assert(asideSrc.includes("pendingFocusRef") || asideSrc.includes("restorePendingFocus"), "web compose must keep field focused after open");
  assert(asideSrc.includes("tabIndex={-1}"), "compose chrome must not steal focus from the field");
  assert(asideSrc.includes("resolveCharacterField") || asideSrc.includes('closest("input, textarea")'), "compose must resolve field from icon/wrapper clicks");
  assert(/field\.focus\(/.test(asideSrc) || /target\.focus\(/.test(asideSrc), "web must focus the field inside the tap gesture");
  assert(asideSrc.includes("invisible pointer-events-none") || asideSrc.includes("keep layout size"), "compose chrome must keep layout size (not display:none) so focus is not pushed");
  assert(asideSrc.includes("Always mount backdrop") || asideSrc.includes(':"hidden pointer-events-none"') || asideSrc.includes('"hidden pointer-events-none"'), "compose backdrop must stay mounted so aside is not remounted");
  const kawSrc = read("apps/mobile/lib/core/ui/text_input_keyboard_scroll.dart");
  assert(kawSrc.includes("_keepFocusAfterCompose") || kawSrc.includes("requestFocus"), "flutter fields must reclaim focus after compose");
  assert(/onTap:\s*\(\)\s*\{[^}]*onComposeFocus\?\.call\(\);[^}]*requestFocus\(\)/s.test(kawSrc), "flutter must request compose before focus in onTap");
  const shellUi = read("apps/web/src/lib/player-shell-ui.ts");
  assert(shellUi.includes("z-[70]"), "compose sheet must sit above smart board pop (z-60)");
  assert(shellUi.includes("playRailComposeBackdropClass") || shellUi.includes("fade-in"), "compose backdrop must fade in smoothly");
  assert(!/playRailComposeSheetClass[\s\S]*?fade-in/.test(shellUi.replace(/\s+/g, " ")) || !shellUi.match(/export const playRailComposeSheetClass =\s*"[^"]*fade-in/), "compose sheet must not fade-in (opacity 0 drops mobile keyboard)");
  const smartHost = read("apps/web/src/components/play/SmartBoardHost.tsx");
  assert(smartHost.includes("railComposeSheet"), "smart board must tuck when compose opens");
  assert(smartHost.includes("suppressSmartBoardPop") || smartHost.includes("tuckBoard"), "smart board must tuck for FAB sheet too");
  assert(/topped\s*=\s*Boolean\(live\s*&&\s*expanded\s*&&\s*!tuckBoard\)/.test(smartHost), "board pop must tuck on same render as compose (not only in useEffect)");
  assert(smartHost.includes("PLAY_RAIL_MIN_PX") || smartHost.includes("dama-play-rail-min"), "popped board must reserve min rail height so fields stay tappable");
  assert(shellUi.includes("dama-play-rail-min") || shellUi.includes("min-h-[var(--dama-play-rail-min"), "play rail must keep min height under popped board");
  const shellChrome = read("apps/web/src/store/shell-chrome.ts");
  assert(shellChrome.includes("railComposeSheet"), "shell chrome must expose railComposeSheet");
  assert(shellChrome.includes("suppressSmartBoardPop"), "shell chrome must expose suppressSmartBoardPop");
  const bottomNav = read("apps/web/src/components/nav/BottomNavBar.tsx");
  assert(!/hideBottomNav\s*=\s*immersiveChat\s*\|\|\s*railComposeSheet/.test(bottomNav), "bottom nav must not unmount on compose (focus jump)");
  assert(bottomNav.includes("hideBottomNav = immersiveChat"), "bottom nav hide only for immersive chat");
  const homeHub = read("apps/web/src/components/home/HomePlayHub.tsx");
  assert(homeHub.includes("setSuppressSmartBoardPop"), "home hub must suppress board pop when FAB sheet opens");
  assert(homeHub.includes("z-[75]"), "FAB play-rail Sheet must sit above board pop");
  const homeFlutter = read("apps/mobile/lib/features/home/home_page.dart");
  assert(homeFlutter.includes("_composeSheet") || homeFlutter.includes("onComposeSheetChanged"), "flutter home must host compose sheet");
  assert(homeFlutter.includes("suppressExpand"), "flutter home must tuck smart board on compose");
  assert(homeFlutter.includes("Always mount backdrop") || homeFlutter.includes("dama-play-rail-compose"), "flutter home backdrop must stay mounted for focus");
  const flutterShell = read("apps/mobile/lib/features/game/smart_board_shell.dart");
  assert(flutterShell.includes("railMin") || flutterShell.includes("220.0"), "flutter popped board must leave rail min height for compose fields");
  const flutterFabSheet = read("apps/mobile/lib/features/home/show_play_rail_sheet.dart");
  assert(flutterFabSheet.includes("onComposeSheetChanged"), "flutter FAB play rail sheet must support compose");
  assert(flutterFabSheet.includes("Always mount backdrop") || flutterFabSheet.includes("dama-fab-play-rail-compose"), "flutter FAB backdrop must stay mounted for focus");
  for (const f of [
    "apps/web/src/components/play-rail/CreateChallengeForm.tsx",
    "apps/web/src/components/play-rail/GamesPanel.tsx",
    "apps/web/src/components/play-rail/PlayersPanel.tsx",
    "apps/web/src/components/play-rail/LiveViewersPanel.tsx",
  ]) {
    assert(read(f).includes("PlayerSearchTypeahead"), `${f} must use PlayerSearchTypeahead`);
  }
  const flutter = read("apps/mobile/lib/features/home/play_rail_panel.dart");
  const kaw = (flutter.match(/KeyboardAwareTextField\(/g) || []).length;
  assert(kaw === 4, `flutter must have 4 KeyboardAwareTextField, got ${kaw}`);
  assert(flutter.includes("playRailScrollPadding"), "flutter must pad for viewInsets");
  assert(flutter.includes("onComposeSheetChanged") || flutter.includes("onComposeFocus"), "flutter rail must request compose sheet");
  assert(!/\bTextField\(/.test(flutter.replace(/KeyboardAwareTextField\(/g, "KAW(")), "no raw TextField left in play rail");
  const adminShell = read("apps/admin/src/components/console/AdminConsoleShell.tsx");
  assert(adminShell.includes("useTextInputKeyboardScroll"), "admin shell must bind helper");

  console.log("E2E_TEXT_INPUT_KEYBOARD_SCROLL_OK");
  console.log("WEB_FIELDS=4 FLUTTER_FIELDS=4 ADMIN_SHELL=1 COMPOSE_SHEET=1");
}

main().catch((err) => {
  console.error("E2E_TEXT_INPUT_KEYBOARD_SCROLL_FAIL", err);
  process.exit(1);
});
