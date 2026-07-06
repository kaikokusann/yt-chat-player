// @ts-expect-error
self.browser ??= chrome;

const isLive = location.pathname === '/live_chat';
const modeName = isLive ? 'mode_livestream' : 'mode_replay';

Promise.all([
	import(browser.runtime.getURL('./modules/store.mjs')).then((/** @type {typeof import('./modules/store.mjs')} */ { store }) => store.load()),
	import(browser.runtime.getURL('./modules/logging.mjs')).then((/** @type {typeof import('./modules/logging.mjs')} */ { logger }) => logger),
]).then(([store, logger]) => {
	const mode = store.others[modeName] ?? 1;
	logger.info('Loaded chat frame script:', `${modeName} =`, mode);
	document.addEventListener('yt-action', onAction, { passive: true });
	if (isNormalChatPageMode()) {
		import(browser.runtime.getURL('./modules/normal_chat_page.mjs'))
			.then(module => module.initializeNormalChatPage())
			.catch(error => logger.warn('Failed to start normal chat page mode:', error));
	}
	if (mode) return;
	const ev = new CustomEvent('ytlcf-start');
	const timer = setInterval(() => {
		const popupDocument = getPopupDocument();
		const layer = top?.document.getElementById('yt-lcf-layer') || popupDocument?.getElementById('yt-lcf-layer') || top?.document.getElementById('yt-lcf-pip-marker');
		if (layer) {
			top?.document.dispatchEvent(ev);
			popupDocument?.dispatchEvent(new CustomEvent('ytlcf-start'));
			logger.info('Initialized layer found, dispatched start event.');
			clearInterval(timer);
		} else {
			logger.debug('No initialized layer found, waiting...');
		}
	}, 1000);
});

/**
 * @param {CustomEvent} e
 */
function onAction(e) {
	if (e.detail?.actionName === 'yt-live-chat-actions') {
		const actions = e.detail?.args?.at(0);
		if (!actions) return;
		const ev = new CustomEvent('ytlcf-action', { detail: actions });
		top?.document.dispatchEvent(ev);
		getPopupDocument()?.dispatchEvent(new CustomEvent('ytlcf-action', { detail: actions }));
	}
}

function getPopupDocument() {
	try {
		const win = top?.__ytlcfPopupWindow;
		return win && !win.closed ? win.document : null;
	} catch (_err) {
		return null;
	}
}

function isNormalChatPageMode() {
	try {
		return new URL(location.href).searchParams.get('ytcc_app_chat_only') === '1';
	} catch (_error) {
		return false;
	}
}
