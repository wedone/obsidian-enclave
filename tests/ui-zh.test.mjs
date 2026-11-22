import test from "node:test";
import assert from "node:assert/strict";
import EnclavePlugin from "../src/main.ts";
import { EnclaveSettingTab } from "../src/settings.ts";
import { estimateStrength } from "../src/strength.ts";

class TestPlugin extends EnclavePlugin {
	async loadData() {
		return null;
	}
	async saveData() {}
}

function makePlugin() {
	return new TestPlugin({}, { id: "enclave", name: "Enclave" });
}

test("the settings tab's groups and settings are in Chinese", () => {
	const tab = new EnclaveSettingTab({}, makePlugin());
	const groups = tab.getSettingDefinitions();
	const headings = groups.filter((g) => g.type === "group").map((g) => g.heading);
	assert.deepEqual(headings, ["锁定", "手机与平板", "显示", "密码与加密"]);

	const names = groups
		.filter((g) => g.type === "group")
		.flatMap((g) => g.items)
		.map((item) => item.name);
	assert.ok(names.includes("离开笔记时锁定"));
	assert.ok(names.includes("覆盖前校验"));
	assert.ok(names.includes("密码无法找回"));
	for (const name of names) assert.match(name, /[\u4e00-\u9fff]/, `"${name}" is not Chinese`);
});

test("the password strength labels are in Chinese and still ordered", () => {
	const samples = ["", "abc", "abcdefgh", "abcdefghijk1", "abcdefghijklmn1!x", "aMuchLongerPassword1!23"];
	const results = samples.map((pw) => estimateStrength(pw));
	for (const { label } of results) assert.match(label, /^[\u4e00-\u9fff]+$/, `"${label}" is not Chinese`);
	assert.equal(results[0].label, "很弱");
	assert.equal(results[results.length - 1].label, "强");
	const scores = results.map((r) => r.score);
	assert.deepEqual(scores, [...scores].sort((a, b) => a - b), "a stronger password never scores lower");
});

test("the remembered-passwords summary is in Chinese", () => {
	const plugin = makePlugin();
	plugin.settings.autoLockMinutes = 0;
	assert.match(plugin.rememberedPasswordsSummary(), /^当前这台设备上没有笔记处于解锁状态/);

	plugin.vaultPassword = "pw";
	assert.match(plugin.rememberedPasswordsSummary(), /Enclave 会临时记住库密码/);
});
