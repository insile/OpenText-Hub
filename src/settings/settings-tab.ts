import { App, Notice, PluginSettingTab, SecretComponent, Setting } from "obsidian";
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

		new Setting(containerEl)
			.setName('基于最短反向链接的分类')
			.setDesc('启用后，插件将根据文件的反向链接数据，自动将其分类到路径最短的索引文件上。')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.classifyByLinkEnabled || false)
				.onChange(async (value) => {
					this.plugin.settings.classifyByLinkEnabled = value;
					await this.plugin.saveSettings();
					if (value) {
						this.plugin.classifyByBacklink.init();
						this.plugin.classifyByBacklink.backlinkIndex.init();
						new Notice("基于最短反向链接的分类已启用");
					} else {
						this.plugin.classifyByBacklink.close();
					}
				}));
	}
}

