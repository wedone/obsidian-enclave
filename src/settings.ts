import { App, PluginSettingTab, type SettingDefinitionItem } from "obsidian";
import { ConfirmModal } from "./ConfirmModal";
import { DEFAULT_ITERATIONS, type EnclavePayload, type EnclaveScope } from "./crypto";
import type EnclavePlugin from "./main";

/** A folder kept locked: notes moved or created in it are locked with its kind of password. */
export interface ProtectedFolder {
	path: string;
	scope: EnclaveScope;
	/** For a separate-password folder: a check its password is verified against. */
	check?: EnclavePayload;
}

/**
 * Which passwords stay in memory between unlocks: only the vault password (the
 * default: everyday notes open freely, separate passwords are asked for every
 * time), every password, or none.
 */
export type RememberPasswords = "vault" | "all" | "none";

/** The settings that can differ on phones and tablets, as they apply to one device. */
export interface DeviceSettings {
	rememberPasswords: RememberPasswords;
	forgetPasswordMinutes: number;
	autoLockMinutes: number;
}

export interface EnclaveSettings {
	/** PBKDF2 iteration count used when locking new notes. */
	iterations: number;
	/** Re-encrypt an unlocked note automatically when you navigate away. */
	autoLockOnClose: boolean;
	/** Desktop: re-encrypt unlocked notes when Obsidian is minimized or hidden. Mobile always does. */
	lockWhenHidden: boolean;
	/** Hide the properties box on locked notes, which only holds Enclave's own markers. */
	hideLockProperties: boolean;
	/** Re-encrypt unlocked notes after this many minutes of inactivity (0 = off). */
	autoLockMinutes: number;
	/** Forget remembered passwords after this many minutes unused (0 = until quit). */
	forgetPasswordMinutes: number;
	/** Which passwords stay in memory between unlocks. */
	rememberPasswords: RememberPasswords;
	/** Give phones and tablets their own values for the three mobile* settings below. */
	mobileOverrides: boolean;
	mobileRememberPasswords: RememberPasswords;
	mobileForgetPasswordMinutes: number;
	mobileAutoLockMinutes: number;
	/** Verify each note decrypts back to the original before overwriting it. */
	verifyOnLock: boolean;
	/** Folders kept locked, set by locking a folder. */
	protectedFolders: ProtectedFolder[];
	/** A check the vault password is verified against; set when it's first chosen or used. */
	vaultCheck: EnclavePayload | null;
	/**
	 * Notes made plain on purpose (permanently decrypted, or left unlocked when
	 * moved into a locked folder), so sync tools may upload them as plain text.
	 */
	plainNotes: string[];
}

export const DEFAULT_SETTINGS: EnclaveSettings = {
	iterations: DEFAULT_ITERATIONS,
	autoLockOnClose: true,
	lockWhenHidden: true,
	hideLockProperties: true,
	// Non-zero by default so a note left open in a background pane (where the
	// navigate-away hook never fires) still re-locks as a backstop.
	autoLockMinutes: 5,
	forgetPasswordMinutes: 30,
	rememberPasswords: "vault",
	mobileOverrides: false,
	mobileRememberPasswords: "vault",
	mobileForgetPasswordMinutes: 30,
	mobileAutoLockMinutes: 5,
	verifyOnLock: true,
	protectedFolders: [],
	vaultCheck: null,
	plainNotes: [],
};

export class EnclaveSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private plugin: EnclavePlugin
	) {
		super(app, plugin);
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		const settings = this.plugin.settings;
		return [
			{
				type: "group",
				heading: "锁定",
				items: [
					{
						name: "离开笔记时锁定",
						desc: "切换到其他笔记时立即重新加密当前笔记。强烈建议开启，因为未锁定的笔记，其明文会保存在磁盘上。",
						control: { type: "toggle", key: "autoLockOnClose" },
					},
					{
						name: "Obsidian 隐藏时锁定",
						desc: "仅桌面端：最小化 Obsidian，或切换到其他空间、其他全屏应用时，重新加密已解锁的笔记。退出 Obsidian 时总会锁定。在 iOS 和 Android 上，应用进入后台时笔记总会锁定，因为在移动端，那是最后一个可靠的锁定时机。",
						control: { type: "toggle", key: "lockWhenHidden" },
					},
					{
						name: "闲置后自动锁定",
						desc: "笔记保持解锁状态的分钟数，超时后重新加密。设为 0 表示关闭计时。",
						control: {
							type: "number",
							key: "autoLockMinutes",
							placeholder: "5",
							min: 0,
							max: MAX_MINUTES,
							validate: (value) => wholeNumberIn(value, 0, MAX_MINUTES),
						},
					},
					{
						name: "在当前会话中记住密码",
						desc: "输入过的哪些密码会留在内存中。仅库密码：日常笔记可直接打开，设有独立密码的笔记每次都要输入。记住的密码绝不会写入磁盘。",
						control: { type: "dropdown", key: "rememberPasswords", options: REMEMBER_OPTIONS },
					},
					{
						name: "多久后忘记密码",
						desc: "记住的密码在未使用时于内存中保留的分钟数。超过后需要重新输入。设为 0 表示保留到退出 Obsidian。",
						visible: () => this.plugin.settings.rememberPasswords !== "none",
						control: {
							type: "number",
							key: "forgetPasswordMinutes",
							placeholder: "30",
							min: 0,
							max: MAX_MINUTES,
							validate: (value) => wholeNumberIn(value, 0, MAX_MINUTES),
						},
					},
				],
			},
			{
				type: "group",
				heading: "手机与平板",
				items: [
					{
						name: "在手机与平板上使用不同的设置",
						desc: "让手机与平板单独设定记住密码和自动锁定的数值；此时上面的设置仅对桌面端生效。两套值都会随库同步，因此你可以在任何设备上修改移动端的数值。",
						control: { type: "toggle", key: "mobileOverrides" },
					},
					{
						name: "在移动端记住密码",
						desc: "在手机与平板上，输入过的哪些密码会留在内存中。",
						visible: () => this.plugin.settings.mobileOverrides,
						control: { type: "dropdown", key: "mobileRememberPasswords", options: REMEMBER_OPTIONS },
					},
					{
						name: "移动端多久后忘记密码",
						desc: "在手机与平板上，记住的密码在未使用时于内存中保留的分钟数。设为 0 表示保留到退出 Obsidian。",
						visible: () =>
							this.plugin.settings.mobileOverrides && this.plugin.settings.mobileRememberPasswords !== "none",
						control: {
							type: "number",
							key: "mobileForgetPasswordMinutes",
							placeholder: "30",
							min: 0,
							max: MAX_MINUTES,
							validate: (value) => wholeNumberIn(value, 0, MAX_MINUTES),
						},
					},
					{
						name: "移动端闲置后自动锁定",
						desc: "在手机与平板上，笔记保持解锁状态的分钟数，超时后重新加密。设为 0 表示关闭计时。",
						visible: () => this.plugin.settings.mobileOverrides,
						control: {
							type: "number",
							key: "mobileAutoLockMinutes",
							placeholder: "5",
							min: 0,
							max: MAX_MINUTES,
							validate: (value) => wholeNumberIn(value, 0, MAX_MINUTES),
						},
					},
				],
			},
			{
				type: "group",
				heading: "显示",
				items: [
					{
						name: "隐藏已锁定笔记的属性",
						desc: "隐藏已锁定笔记的属性栏。其中只显示 Enclave 自己的 locked 和 lock-scope 属性；笔记真正的属性会随其余内容一起加密。",
						control: { type: "toggle", key: "hideLockProperties" },
					},
				],
			},
			{
				type: "group",
				heading: "密码与加密",
				items: [
					// These two describe the current state, so their text is set while
					// rendering: Obsidian builds the definitions once and re-renders
					// rows each time the tab is shown.
					{
						name: "库密码",
						desc: "你是否已设置库密码，以及更改它的入口。",
						render: (setting) => {
							if (!this.plugin.settings.vaultCheck) {
								setting.setDesc(
									"你还没有设置库密码。第一次用库密码锁定笔记时，会由你来设置。"
								);
								return;
							}
							setting.setDesc(
								"你已设置库密码，因此输错的密码会被立即拒绝。点击更改后，下次锁定笔记时可设置新密码；用当前密码锁定的笔记仍用它打开。"
							);
							setting.addButton((button) =>
								button
									.setButtonText("更改")
									.setDestructive()
									.onClick(() => void this.changeVaultPassword())
							);
						},
					},
					{
						name: "内存中的密码",
						desc: "此设备的内存中保存了哪些密码，以及一键锁定全部内容并忘记密码的入口。",
						render: (setting) => {
							setting.setDesc(this.plugin.rememberedPasswordsSummary());
							setting.addButton((button) =>
								button.setButtonText("锁定并忘记").onClick(() => void this.lockAndForget())
							);
						},
					},
					{
						name: "密钥派生迭代次数",
						desc: "锁定新笔记时使用的 PBKDF2 迭代次数。数值越高越慢，但更能抵御暴力破解。已锁定的笔记仍沿用锁定时的数值。",
						control: {
							type: "number",
							key: "iterations",
							placeholder: String(DEFAULT_ITERATIONS),
							min: MIN_ITERATIONS,
							max: MAX_ITERATIONS,
							validate: (value) => wholeNumberIn(value, MIN_ITERATIONS, MAX_ITERATIONS),
						},
					},
					{
						name: "覆盖前校验",
						desc: "加密后先解密结果，确认与原文一致再替换笔记。强烈建议开启，这样可以避免一次出错的锁定毁掉内容。锁定所需时间大约会翻倍。",
						control: { type: "toggle", key: "verifyOnLock" },
					},
					{
						name: "密码无法找回",
						desc: "一旦忘记密码，用它锁定的笔记就无法解密。请为重要笔记保留备份。任何时候都可以用密码永久解密某篇笔记或某个文件夹。",
					},
				],
			},
			{
				type: "list",
				heading: "已锁定的文件夹",
				emptyState: "还没有。右键点击文件夹 → Enclave: 锁定文件夹。",
				items: settings.protectedFolders.map((folder) => ({
					name: folder.path,
					desc: folder.scope === "note" ? "独立密码" : "库密码",
				})),
				// Deleting stops locking new notes there; its notes stay as they are.
				onDelete: (index) => void this.unprotect(index),
			},
		];
	}

	/**
	 * Settings live inside the plugin's data file next to its crash-recovery
	 * ledger, so they're saved through the plugin rather than the default, which
	 * would overwrite the whole file with the settings alone.
	 */
	async setControlValue(key: string, value: unknown): Promise<void> {
		this.plugin.settings = { ...this.plugin.settings, [key]: value };
		if (key === "hideLockProperties") this.plugin.applyPropertyHiding();
		if (REMEMBER_KEYS.includes(key)) {
			// A stricter choice forgets what it no longer allows right away.
			this.plugin.applyRememberPolicy();
			this.update();
		}
		await this.plugin.saveSettings();
	}

	private async changeVaultPassword(): Promise<void> {
		const confirmed = await new ConfirmModal(this.app, {
			title: "更改库密码？",
			message:
				"下次用库密码锁定笔记时，你会设置一个新密码。已用当前密码锁定的笔记仍用它打开，并在你使用期间下次锁定它们时改用新密码。",
			cta: "更改",
		}).ask();
		if (!confirmed) return;
		await this.plugin.resetVaultCheck();
		this.update();
	}

	private async lockAndForget(): Promise<void> {
		await this.plugin.lockAndForget();
		this.update();
	}

	private async unprotect(index: number): Promise<void> {
		const folder = this.plugin.settings.protectedFolders[index];
		if (!folder) return;
		await this.plugin.unprotectFolder(folder.path);
		this.update();
	}
}

/** Labels for the "remember passwords" choices. */
const REMEMBER_OPTIONS: Record<RememberPasswords, string> = {
	vault: "仅库密码",
	all: "库密码和独立密码",
	none: "不记住",
};

/** Settings that change which passwords may stay in memory on this device, or what's shown. */
const REMEMBER_KEYS = ["rememberPasswords", "mobileOverrides", "mobileRememberPasswords"];

/** Upper bound for the minute settings, so a typo can't mean "practically never". */
const MAX_MINUTES = 100000;
/** Bounds for PBKDF2 iterations: a floor for security, a ceiling so a typo can't freeze locking. */
const MIN_ITERATIONS = 100000;
const MAX_ITERATIONS = 10000000;

/**
 * Validation message unless `value` is a whole number in [min, max]. Invalid
 * input is rejected rather than snapped to a default, since for some fields a
 * wrong default (0) would silently weaken security.
 */
function wholeNumberIn(value: number, min: number, max: number): string | void {
	if (!Number.isInteger(value) || value < min || value > max) {
		return `请输入 ${min.toLocaleString()} 到 ${max.toLocaleString()} 之间的整数。`;
	}
}
