import { logger } from './logging.mjs';
import { getLiveChatActionsAsyncIterable, getReplayChatActionsAsyncIterable } from './chat_actions.mjs';
import { NormalChatView } from './chat_controller.mjs';
import { LiveChatItemFactory, renderChatItem } from './chat_message.mjs';

let started = false;

export async function initializeNormalChatPage() {
	if (started || !isEnabled()) return;
	started = true;

	const view = new NormalChatView();
	const factory = new LiveChatItemFactory();
	await factory.load();
	document.documentElement.setAttribute('data-ytlcf-app-normal-chat-enabled', '1');
	view.syncFromStorage();
	view.setEnabled(true);
	document.body.append(view.element);
	installPageStyle();

	document.addEventListener('ytlcf-action', event => {
		handleActions(event.detail || [], view, factory);
	}, { passive: true });

	const continuation = new URL(location.href).searchParams.get('continuation');
	if (!continuation) return;

	const abortController = new AbortController();
	try {
		if (location.pathname === '/live_chat_replay') {
			for await (const containers of getReplayChatActionsAsyncIterable(abortController.signal, continuation, { auth: false })) {
				const actions = [];
				for (const container of containers || []) {
					actions.push(...(container.replayChatItemAction?.actions || []));
				}
				handleActions(actions, view, factory);
			}
		} else {
			for await (const actions of getLiveChatActionsAsyncIterable(abortController.signal, continuation, { auth: false })) {
				handleActions(actions || [], view, factory);
			}
		}
	} catch (error) {
		logger.warn('Normal chat page renderer stopped:', error);
	}
}

function isEnabled() {
	try {
		return localStorage.getItem('ytcc-app-chat-only-enabled') === '1'
			|| new URL(location.href).searchParams.get('ytcc_app_chat_only') === '1';
	} catch (_error) {
		return false;
	}
}

function installPageStyle() {
	const id = 'yt-lcf-normal-chat-page-only-style';
	if (document.getElementById(id)) return;
	const style = document.createElement('style');
	style.id = id;
	style.textContent = `
		html, body {
			background: #fff !important;
			height: 100vh !important;
			margin: 0 !important;
			overflow: hidden !important;
			width: 100vw !important;
		}
		yt-live-chat-app,
		yt-live-chat-renderer {
			opacity: 0 !important;
			pointer-events: none !important;
		}
	`;
	document.documentElement.append(style);
}

async function handleActions(actions, view, factory) {
	for (const action of actions) {
		if ('addChatItemAction' in action) {
			const item = action.addChatItemAction?.item;
			if (!item) continue;
			try {
				const element = await renderChatItem(item, factory);
				if (element) view.add(element);
			} catch (error) {
				logger.warn('Failed to render normal chat item:', error);
			}
			continue;
		}
		if ('markChatItemAsDeletedAction' in action) {
			view.delete(action.markChatItemAsDeletedAction?.targetItemId || '');
			continue;
		}
		if ('markChatItemsByAuthorAsDeletedAction' in action) {
			view.deleteByAuthor(action.markChatItemsByAuthorAsDeletedAction?.externalChannelId || '');
		}
	}
}
