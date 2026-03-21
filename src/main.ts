import { DEFAULT_SETTINGS, OpenTextSettings } from "./settings/settings-data";
import { MetadataManagerView, OPENTEXT_METADATA_MANAGER_VIEW } from "./ui/metadata-manager-view";
import { OpenTextSettingTab } from 'settings/settings-tab';
import { MetadataManager } from 'core/metadata-manager';
import { Plugin } from 'obsidian';
import { ClassifyByLink } from "core/classify-by-backlink";


// 主插件类
export default class OpenTextHub extends Plugin {
	settings: OpenTextSettings;
	metadataManager: MetadataManager;
	classifyByLink: ClassifyByLink;

	// 插件加载
	async onload() {
		await this.loadSettings();
		this.addSettingTab(new OpenTextSettingTab(this.app, this));
		this.metadataManager = new MetadataManager(this.app, this);
		this.classifyByLink = new ClassifyByLink(this.app, this);
		this.registerView(OPENTEXT_METADATA_MANAGER_VIEW, (leaf) => new MetadataManagerView(leaf, this));
		this.addRibbonIcon('cog', '元数据管理', () => this.metadataManager.openManagerView());
		
		this.addCommand({
			id: 'opentext-open-metadatamanager-view',
			name: '元数据管理',
			callback: () => this.metadataManager.openManagerView()
		});
	}

	// 插件卸载
	onunload() {
		if (this.settings.classifyByLinkEnabled) {
			this.classifyByLink.close();
		}
	}

	// 加载设置
	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<OpenTextSettings>);
	}

	// 保存设置
	async saveSettings() {
		await this.saveData(this.settings);
	}
}

