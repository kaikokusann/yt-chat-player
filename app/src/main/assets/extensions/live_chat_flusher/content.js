// @ts-expect-error
self.browser ??= chrome;

if (localStorage.getItem('ytcc-app-lcf-enabled') !== '0') {
const manifest = browser.runtime.getManifest();

	self.addEventListener('ytcc-app-lcf-settings', event => {
		applyAppSettingsToStorage(readAppSettingsDetail(event)).catch(console.error);
	}, { passive: true });

if (isNormalChatPageMode()) {
	import(browser.runtime.getURL('./modules/normal_chat_page.mjs'))
		.then(module => module.initializeNormalChatPage())
		.catch(console.error);
}

	Promise.all([
	import(browser.runtime.getURL('./modules/logging.mjs')),
	new Promise(resolve => {
		(function check() {
			if (document.body) resolve(document.body);
			else requestAnimationFrame(check);
		})();
	}),
]).then((/** @type {[typeof import("./modules/logging.mjs"), HTMLBodyElement]} */ [{ logger }, _body]) => {
	try {
		document.body.dataset.browser = 'browser_specific_settings' in manifest ? 'firefox' : 'chrome';

		self.addEventListener('ytlcf-message', e => {
			const { ytInitialData, ytcfg } = e.detail ?? {};
			if (!ytInitialData || !ytcfg) {
				logger.error('Failed to get a message from the injected script.');
				return;
			}
			logger.debug('Getting initialization message from the injected script.');
			sessionStorage.setItem('ytlcf-initial-data', ytInitialData);
			sessionStorage.setItem('ytlcf-cfg', ytcfg);

			const path = location.pathname.split('/').find(Boolean);
			const detail = {
				pageType: path === 'watch' || path === 'live' ? 'watch' : 'browse',
				response: JSON.parse(ytInitialData),
			};
			const timer = setInterval(async () => {
				const target = document.querySelector('ytd-app') || document.getElementById('player-container-id');
				if (!target) {
					logger.debug('Waiting for <ytd-app> element.');
					return;
				}
				try {
					/** @type {typeof import("./modules/main.mjs")} */
					const { initialize } = await import(browser.runtime.getURL('./modules/main.mjs'));
					initialize({ target, detail });
				} catch (e) {
					logger.error('Failed to startup.\nCaused by:', e);
				} finally {
					clearInterval(timer);
				}
			}, 1000);
		}, { passive: true });

		self.addEventListener('ytlcf-ready', e => {
			e.stopImmediatePropagation();
			logger.info(`${manifest.name} is ready!`);
		}, { passive: true });

		document.addEventListener('yt-action', e => {
			const name = e.detail?.actionName;
			switch (name) {
				case 'ytd-watch-player-data-changed': {
					const ev = new CustomEvent(name);
					self.documentPictureInPicture?.window?.dispatchEvent(ev);
					checkAutoStart();
				}
			}
		}, { passive: true });

		const script = document.createElement('script');
		script.src = browser.runtime.getURL('./injections/init.mjs');
		script.type = 'module';
		document.body.appendChild(script);
	} catch (err) {
		logger.error('Failed to inject the initialization script.\nCaused by:', err);
	}
}).catch(console.error);

async function checkAutoStart() {
	const storeUrl = browser.runtime.getURL('./modules/store.mjs');
	const s = await import(storeUrl).then((/** @type {typeof import("./modules/store.mjs")} */ { store }) => store.load());
	const enabled = [ false, s?.others?.mode_replay !== 1, true ].at(s?.others?.autostart ?? 0);
	if (!enabled) return false;

	const container = document.getElementById('show-hide-button');
	if (!container || container.hidden) return false;

	const button = container.querySelector('button');
	if (button?.closest('#close-button')) return false;

	button?.click();
	return true;
}

function isNormalChatPageMode() {
	try {
		if (!/^\/live_chat(?:_replay)?$/.test(location.pathname)) return false;
		return getAppParams().get('ytcc_app_chat_only') === '1';
	} catch (_error) {
		return false;
	}
}

function getAppParams() {
	const url = new URL(location.href);
	const params = new URLSearchParams(url.search);
	const hashParams = new URLSearchParams(url.hash.replace(/^#\??/, ''));
	for (const [key, value] of hashParams) {
		if (!params.has(key)) params.set(key, value);
	}
	return params;
}

async function applyAppSettingsToStorage(detail) {
	const storeUrl = browser.runtime.getURL('./modules/store.mjs');
	const { store } = await import(storeUrl);
	if (!store.isLoaded) await store.load();
	const fontSizePx = normalizeFontSize(detail.fontSizePx);
	if (fontSizePx != null) {
		store.styles.font_size = `${fontSizePx}px`;
	}
	if (typeof detail.showPhoto === 'boolean') {
		for (const type of Object.keys(store.data.parts)) {
			if (!('photo' in store.data.parts[type])) continue;
			store.data.parts[type].photo = detail.showPhoto;
			store.parts[type] = store.data.parts[type];
		}
	}
}

function readAppSettingsDetail(event) {
	let detail = {};
	try {
		detail = /** @type {CustomEvent} */ (event).detail || {};
	} catch (_error) {
	}
	return {
		fontSizePx: detail.fontSizePx ?? readAppSetting('data-ytcc-app-lcf-font-size-px', 'ytcc-app-lcf-font-size-px'),
		showPhoto: typeof detail.showPhoto === 'boolean'
			? detail.showPhoto
			: readAppBooleanSetting('data-ytcc-app-lcf-show-photo', 'ytcc-app-lcf-show-photo'),
	};
}

function readAppSetting(attrName, storageKey) {
	try {
		return document.documentElement.getAttribute(attrName) ?? localStorage.getItem(storageKey);
	} catch (_error) {
		return null;
	}
}

function readAppBooleanSetting(attrName, storageKey) {
	const value = readAppSetting(attrName, storageKey);
	if (value == null) return undefined;
	return value === '1' || value === 'true';
}

function normalizeFontSize(value) {
	const number = Number.parseInt(String(value), 10);
	if (!Number.isFinite(number)) return null;
	return Math.min(96, Math.max(12, number));
}
	}
