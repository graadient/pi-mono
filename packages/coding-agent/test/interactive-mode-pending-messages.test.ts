import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExtensionContext, ExtensionRunner, ExtensionUIContext } from "../src/core/extensions/index.ts";
import { KeybindingsManager } from "../src/core/keybindings.ts";
import { InteractiveMode } from "../src/modes/interactive/interactive-mode.ts";
import { createHarness, type Harness } from "./suite/harness.ts";

type ShortcutContext = {
	session: Harness["session"];
	sessionManager: Harness["sessionManager"];
	keybindings: KeybindingsManager;
	defaultEditor: { onExtensionShortcut?: (data: string) => boolean };
	createExtensionUIContext: () => ExtensionUIContext;
	showError: (message: string) => void;
};

const interactiveModePrototype = InteractiveMode.prototype as unknown as {
	setupExtensionShortcuts(this: ShortcutContext, runner: ExtensionRunner): void;
};

describe("InteractiveMode pending messages", () => {
	const harnesses: Harness[] = [];

	afterEach(() => {
		while (harnesses.length > 0) harnesses.pop()?.cleanup();
	});

	// Regression test for #8349: shortcut contexts must also see custom agent messages.
	it.each(["steer", "followUp"] as const)("reports custom messages in the %s queue", async (deliverAs) => {
		let ctx: ExtensionContext | undefined;
		const harness = await createHarness({
			extensionFactories: [
				(pi) => {
					pi.registerShortcut("ctrl+shift+x", {
						handler: (context) => {
							ctx = context;
						},
					});
				},
			],
		});
		harnesses.push(harness);
		const shortcutContext: ShortcutContext = {
			session: harness.session,
			sessionManager: harness.sessionManager,
			keybindings: new KeybindingsManager(),
			defaultEditor: {},
			createExtensionUIContext: () => harness.session.extensionRunner.createContext().ui,
			showError: vi.fn(),
		};
		interactiveModePrototype.setupExtensionShortcuts.call(shortcutContext, harness.session.extensionRunner);
		expect(shortcutContext.defaultEditor.onExtensionShortcut?.("\x1b[120;6u")).toBe(true);
		expect(ctx).toBeDefined();
		expect(ctx!.hasPendingMessages()).toBe(false);

		harness.session.agent[deliverAs]({
			role: "custom",
			customType: "queue-test",
			content: "queued custom message",
			display: false,
			timestamp: Date.now(),
		});

		expect(harness.session.pendingMessageCount).toBe(0);
		expect(ctx!.hasPendingMessages()).toBe(true);
		harness.session.clearQueue();
		expect(ctx!.hasPendingMessages()).toBe(false);
		expect(shortcutContext.showError).not.toHaveBeenCalled();
	});
});
