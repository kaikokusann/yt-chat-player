// @ts-check

const DEFAULTS = {
  enabled: true,
  hideAvatar: true,
  hideName: true,
  compact: true,
  alignRight: false,
  chatWidthPercent: 100
};

const APP_ENABLED_KEY = 'ytcc-app-ycc-enabled';

const CLASS_MAP = {
  enabled: 'ytcc-enabled',
  hideAvatar: 'ytcc-hide-avatar',
  hideName: 'ytcc-hide-name',
  compact: 'ytcc-compact',
  alignRight: 'ytcc-align-right'
};

init();

async function init() {
  if (!isAppEnabled()) {
    clearClasses();
    return;
  }
  const config = await loadConfig();
  applyConfig(config);

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync') return;
    const next = { ...config };
    for (const key of Object.keys(DEFAULTS)) {
      if (changes[key]) next[key] = changes[key].newValue;
    }
    applyConfig(next);
    Object.assign(config, next);
  });

  // ドキュメント直下の変化を監視（元のロジック）
  const docObserver = new MutationObserver(() => applyConfig(config));
  docObserver.observe(document.documentElement, {
    childList: true,
    subtree: false
  });

  // チャットパネルの表示/非表示を監視
  observeChatVisibility();
  window.addEventListener('storage', () => applyConfig(config));

}

async function loadConfig() {
  return new Promise(resolve => {
    chrome.storage.sync.get(DEFAULTS, values => resolve(values));
  });
}

function applyConfig(config) {
  const root = document.documentElement;
  if (!isAppEnabled()) {
    clearClasses();
    return;
  }
  for (const [key, className] of Object.entries(CLASS_MAP)) {
    root.classList.toggle(className, Boolean(config[key]));
  }
  const chatWidthPercent = normalizeChatWidth(config.chatWidthPercent);
  const chatWidthPx = Math.max(Math.round(420 * chatWidthPercent / 100), 48);
  root.style.setProperty('--ytcc-chat-width-percent', `${chatWidthPercent}%`);
  root.style.setProperty('--ytcc-chat-width', `${chatWidthPx}px`);
  root.style.setProperty('--ytd-watch-flexy-sidebar-width', `${chatWidthPx}px`);

  // ytd-watch-flexy 要素が存在する場合、直接カスタムプロパティを設定し、
  // resizeイベントを発火してYouTubeのレイアウトエンジンにサイズ変更を強制認識させます。
  const watchFlexy = document.querySelector('ytd-watch-flexy');
  if (watchFlexy) {
    watchFlexy.style.setProperty('--ytd-watch-flexy-sidebar-width', `${chatWidthPx}px`, 'important');
    // 少し遅延を入れてプレイヤーなどの再描画処理のタイミングに合わせる
    window.dispatchEvent(new Event('resize'));
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 100);
  }
}

function isAppEnabled() {
  try {
    return localStorage.getItem(APP_ENABLED_KEY) !== '0';
  } catch (_error) {
    return true;
  }
}

function clearClasses() {
  const root = document.documentElement;
  for (const className of Object.values(CLASS_MAP)) {
    root.classList.remove(className);
  }
  root.classList.remove('ytcc-chat-visible');
}

function normalizeChatWidth(value) {
  const number = Number.parseInt(String(value), 10);
  if (!Number.isFinite(number)) return DEFAULTS.chatWidthPercent;
  return Math.min(100, Math.max(10, Math.round(number / 10) * 10));
}

/**
 * チャットパネルの表示状態を監視し、<html> に ytcc-chat-visible クラスを
 * トグルする。これにより CSS の幅制御がチャット表示時のみ適用される。
 */
function observeChatVisibility() {
  const root = document.documentElement;

  /** チャットが現在表示されているか判定する */
  function isChatVisible() {
    if (!isAppEnabled()) return false;

    const watchFlexy = document.querySelector('ytd-watch-flexy');
    if (!watchFlexy) return false;

    // 全画面でない場合はチャット幅制御は不要
    if (!watchFlexy.hasAttribute('fullscreen')) return false;

    const chat = watchFlexy.querySelector('#chat');
    if (!chat) return false;

    // チャットが折りたたまれているか非表示の場合
    if (chat.hasAttribute('collapsed')) return false;
    if (chat.hasAttribute('hidden')) return false;

    // display: none チェック
    const style = window.getComputedStyle(chat);
    if (style.display === 'none') return false;

    return true;
  }

  function updateChatVisibility() {
    root.classList.toggle('ytcc-chat-visible', isChatVisible());
  }

  // 初期状態を設定
  updateChatVisibility();

  const bodyObserver = new MutationObserver(() => {
    updateChatVisibility();
    tryObserveTargets();
  });
  bodyObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [
      'fullscreen', 'collapsed', 'hidden', 'is-two-columns_',
      'style', 'class'
    ]
  });

  let watchFlexyObserver = null;
  let chatObserver = null;

  function tryObserveTargets() {
    const watchFlexy = document.querySelector('ytd-watch-flexy');
    if (watchFlexy && !watchFlexyObserver) {
      watchFlexyObserver = new MutationObserver(updateChatVisibility);
      watchFlexyObserver.observe(watchFlexy, {
        attributes: true,
        attributeFilter: ['fullscreen', 'is-two-columns_', 'theater']
      });
    }

    const chat = document.querySelector('ytd-watch-flexy #chat');
    if (chat && !chatObserver) {
      chatObserver = new MutationObserver(updateChatVisibility);
      chatObserver.observe(chat, {
        attributes: true,
        attributeFilter: ['collapsed', 'hidden', 'style']
      });
    }
  }

  tryObserveTargets();
}
