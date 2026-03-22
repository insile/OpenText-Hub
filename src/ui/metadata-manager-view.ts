import { ItemView, Setting, WorkspaceLeaf } from "obsidian";
import { Action, Command } from "../settings/settings-data";
import { ActionEditModal } from "./action-edit-modal"
import { CommandEditModal } from "./command-edit-modal"
import OpenTextHub from "../main";


// 视图类型常量
export const OPENTEXT_METADATA_MANAGER_VIEW = "opentext-metadata-manager-view";


// 元数据管理视图
export class MetadataManagerView extends ItemView {
	plugin: OpenTextHub;

	constructor(leaf: WorkspaceLeaf, plugin: OpenTextHub) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType() { return OPENTEXT_METADATA_MANAGER_VIEW; }
	getDisplayText() { return "元数据管理"; }
	getIcon() { return "cog"; }
	async onOpen(): Promise<void> { this.render(); }
	async onClose(): Promise<void> { this.contentEl.empty(); }

	// 渲染配置界面
	render() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: '元数据管理' });

		// 动作管理
		contentEl.createEl('h3', { text: '动作' });

		new Setting(contentEl)
			.setName('添加动作')
			.setDesc('创建一个元数据更新动作')
			.addButton(button => button
				.setButtonText('添加动作')
				.onClick(() => this.openActionModal()));

		this.plugin.settings.actions.forEach((action, index) => {
			this.displayAction(action, index);
		});

		// 命令管理
		contentEl.createEl('h3', { text: '命令' });

		new Setting(contentEl)
			.setName('添加命令')
			.setDesc('创建一个触发动作的命令')
			.addButton(button => button
				.setButtonText('添加命令')
				.onClick(() => this.openCommandModal()));

		this.plugin.settings.commands.forEach((command, index) => {
			this.displayCommand(command, index);
		});
	}

	// 打开新建动作弹窗
	private openActionModal() {
		const action: Action = {
			id: Date.now().toString(),
			name: '',
			field: '',
			type: 'manual',
			fieldType: 'number',
			operation: 'set',
		};
		const modal = new ActionEditModal(this.app, action, (updatedAction) => {
			this.plugin.settings.actions.push(updatedAction);
			void this.plugin.saveSettings().then(() => {
				this.render();
			});
		});
		modal.open();
	}

	// 展示动作设置项
	private displayAction(action: Action, index: number) {
		const setting = new Setting(this.contentEl)
			.setName(action.name || '未命名动作')
			.setDesc(this.getActionDesc(action));

		setting.addButton(button => button
			.setButtonText('编辑')
			.onClick(() => this.editAction(action, index)));

		setting.addButton(button => button
			.setButtonText('删除')
			.setWarning()
			.onClick(async () => {
				const actionId = this.plugin.settings.actions[index]?.id;
				this.plugin.settings.actions.splice(index, 1);
				// 更新依赖的命令
				this.plugin.settings.commands.forEach(command => {
					command.actions = command.actions.filter(id => id !== actionId);
				});
				await this.plugin.saveSettings();
				this.render();
			}));
	}

	// 获取动作描述
	private getActionDesc(action: Action): string {
		if (action.type === 'manual') {
			const manualAction = action;
			return `${this.translateFieldType(manualAction.fieldType)} · ${this.translateOperation(manualAction)}`;
		} else {
			return `自动更新`;
		}
	}

	// 翻译字段类型
	private translateFieldType(fieldType: Action['fieldType']): string {
		switch (fieldType) {
			case 'checkbox': return '复选框';
			case 'date': return '日期';
			case 'number': return '数字';
			case 'text': return '文本';
			default: return fieldType || '未知类型';
		}
	}

	// 翻译操作
	private translateOperation(action: Action): string {
		switch (action.fieldType) {
			case 'checkbox':
				switch (action.operation) {
					case 'toggle': return '切换';
					case 'set': return '选中';
					case 'unset': return '取消';
					default: return action.operation || '未知操作';
				}
			case 'date':
				switch (action.operation) {
					case 'set': return '设置日期' + (action.dateValue ? `: ${action.dateValue}` : '');
					case 'add': return '增加周期' + (action.period ? `: ${action.period}` : '');
					case 'subtract': return '减少周期' + (action.period ? `: ${action.period}` : '');
					case 'current': return '今天';
					case 'setWeekDay': return '星期' + (action.weekday ? `: ${action.weekday}` : '') + (action.weekOffset ? `，偏移 ${action.weekOffset} 周` : '');
					default: return action.operation || '未知操作';
				}
			case 'number':
				switch (action.operation) {
					case 'set': return '设置数值' + (action.numberValue ? `: ${action.numberValue}` : '');
					case 'add': return '加' + (action.numberValue ? `: ${action.numberValue}` : '');
					case 'subtract': return '减' + (action.numberValue ? `: ${action.numberValue}` : '');
					case 'multiply': return '乘' + (action.numberValue ? `: ${action.numberValue}` : '');
					case 'divide': return '除' + (action.numberValue ? `: ${action.numberValue}` : '');
					default: return action.operation || '未知操作';
				}
			case 'text':
				switch (action.operation) {
					case 'set': return '设置文本' + (action.stringValue ? `: ${action.stringValue}` : '');
					case 'append': return '后缀' + (action.stringValue ? `: ${action.stringValue}` : '');
					case 'prepend': return '前缀' + (action.stringValue ? `: ${action.stringValue}` : '');
					case 'regex': return '正则模式' + (action.regexPattern ? `: /${action.regexPattern}/${action.regexFlags || ''} 替换为 "${action.stringValue || ''}"` : '');
					default: return action.operation || '未知操作';
				}
			default:
				return action.operation || '未知操作';
		}
	}

	// 打开编辑动作弹窗
	private editAction(action: Action, index: number) {
		const modal = new ActionEditModal(this.app, action, (updatedAction) => {
			this.plugin.settings.actions[index] = updatedAction;
			void this.plugin.saveSettings().then(() => {
				this.render();
			});
		});
		modal.open();
	}

	// 打开新建命令弹窗
	private openCommandModal() {
		const command: Command = {
			id: Date.now().toString(),
			name: '',
			actions: [],
			folder: ''
		};
		const modal = new CommandEditModal(this.plugin, this.app, command, this.plugin.settings.actions, (updatedCommand) => {
			this.plugin.settings.commands.push(updatedCommand);
			void this.plugin.saveSettings().then(() => {
				this.render();
			});
		});
		modal.open();
	}

	// 展示命令设置项
	private displayCommand(command: Command, index: number) {
		const setting = new Setting(this.contentEl)
			.setName(command.name || '未命名命令')
			.setDesc(`动作数量: ${command.actions.length}，路径: ${command.folder || '当前活动页面'}`);

		setting.addButton(button => button
			.setButtonText('编辑')
			.onClick(() => this.editCommand(command, index)));

		setting.addButton(button => button
			.setButtonText('删除')
			.setWarning()
			.onClick(async () => {
				this.plugin.settings.commands.splice(index, 1);
				await this.plugin.saveSettings();
				this.plugin.removeCommand(`opentext-${command.id}`);
				this.render();
			}));
	}

	// 打开编辑命令弹窗
	private editCommand(command: Command, index: number) {
		const tempCommand: Command = {
			...command,
			actions: [...command.actions]
		};
		const modal = new CommandEditModal(this.plugin, this.app, tempCommand, this.plugin.settings.actions, (updatedCommand) => {
			this.plugin.settings.commands[index] = updatedCommand;
			void this.plugin.saveSettings().then(() => {
				this.render();
			});
		});
		modal.open();
	}
}


