import { App, PluginSettingTab, SecretComponent, Setting } from "obsidian";
import OpenTextHub from "../main";


// 设置界面
export class OpenTextSettingTab extends PluginSettingTab {
	plugin: OpenTextHub;

	constructor(app: App, plugin: OpenTextHub) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('API key')
			// eslint-disable-next-line obsidianmd/ui/sentence-case
			.setDesc('选择一个 AI 模型密钥，目前只支持 DeepSeek。')
			.addComponent((el) => new SecretComponent(this.app, el)
				.setValue(this.plugin.settings.apiKey)
				.onChange(async (value: string) => {
				this.plugin.settings.apiKey = value;
				await this.plugin.saveSettings();
        }));
	}
}

