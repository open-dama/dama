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
  const asideSrc = read("apps/web/src/components/play-rail/PlayRailAside.tsx");
  assert(asideSrc.includes("useTextInputKeyboardScroll"), "web PlayRailAside must bind helper");
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
  assert(!/\bTextField\(/.test(flutter.replace(/KeyboardAwareTextField\(/g, "KAW(")), "no raw TextField left in play rail");
  const adminShell = read("apps/admin/src/components/console/AdminConsoleShell.tsx");
  assert(adminShell.includes("useTextInputKeyboardScroll"), "admin shell must bind helper");

  console.log("E2E_TEXT_INPUT_KEYBOARD_SCROLL_OK");
  console.log("WEB_FIELDS=4 FLUTTER_FIELDS=4 ADMIN_SHELL=1");
}

main().catch((err) => {
  console.error("E2E_TEXT_INPUT_KEYBOARD_SCROLL_FAIL", err);
  process.exit(1);
});
