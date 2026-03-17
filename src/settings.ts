import {App, PluginSettingTab, SecretComponent, Setting} from "obsidian";
import OpenTextManager from "./main";


// 手动更新
export interface ManualAction {
	id: string;
	name: string;
	field: string;
	type: 'manual';
	fieldType: 'checkbox' | 'date' | 'number' | 'text';
	operation: string;
	dateValue?: string;
	numberValue?: number;
	stringValue?: string;
	period?: string;
	weekday?: number;
}

// 自动更新
export interface AutoAction {
	id: string;
	name: string;
	field: string;
	type: 'auto';
	prompt: string;
}

// 统一动作类型
export type Action = ManualAction | AutoAction;

// 命令
export interface Command {
	id: string;
	name: string;
	actions: string[];
	folder: string;
}

// 插件设置
export interface OpenTextSettings {
	apiKey: string;
	actions: Action[];
	commands: Command[];
}

// 默认设置
export const DEFAULT_SETTINGS: OpenTextSettings = {
	apiKey: '',
	actions: [],
	commands: []
};


// 设置界面
export class OpenTextSettingTab extends PluginSettingTab {
	plugin: OpenTextManager;

	constructor(app: App, plugin: OpenTextManager) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('API key')
			// eslint-disable-next-line obsidianmd/ui/sentence-case
			.setDesc('选择一个 API 密钥，目前只支持 DeepSeek。')
			.addComponent((el) => new SecretComponent(this.app, el)
				.setValue(this.plugin.settings.apiKey)
				.onChange(async (value: string) => {
				this.plugin.settings.apiKey = value;
				await this.plugin.saveSettings();
        }));
	}
}

