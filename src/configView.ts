import {App, ItemView, Modal, Notice, Setting, WorkspaceLeaf} from "obsidian";
import {Action, AutoAction, Command, ManualAction} from "./settings";
import {FolderSuggest} from "./inputSuggest";
import OpenTextManager from "./main";


// 视图类型常量
export const OPENTEXT_MANAGER_VIEW = "opentext-manager-view";


// 插件的配置视图
export class ConfigView extends ItemView {
	plugin: OpenTextManager;

	constructor(leaf: WorkspaceLeaf, plugin: OpenTextManager) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType() {
		return OPENTEXT_MANAGER_VIEW;
	}

	getDisplayText() {
		// eslint-disable-next-line obsidianmd/ui/sentence-case
		return "OpenText 管理";
	}

	getIcon() {
		return "settings";
	}

	async onOpen(): Promise<void> {
		this.render();
	}

	async onClose(): Promise<void> {
		this.contentEl.empty();
	}

	// 渲染配置界面
	render() {
		const {contentEl} = this;
		contentEl.empty();

		contentEl.createEl('h2', {text: '元数据管理'});

		// 动作管理
		contentEl.createEl('h3', {text: '动作'});

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
		contentEl.createEl('h3', {text: '命令'});

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
	private translateFieldType(fieldType: ManualAction['fieldType']): string {
		switch (fieldType) {
			case 'checkbox': return '复选框';
			case 'date': return '日期';
			case 'number': return '数字';
			case 'text': return '文本';
			default: return fieldType;
		}
	}

	// 翻译操作
	private translateOperation(action: ManualAction): string {
		switch (action.fieldType) {
			case 'checkbox':
				switch (action.operation) {
					case 'toggle': return '切换';
					case 'set': return '设置为选中';
					case 'unset': return '设置为取消选中';
					default: return action.operation;
				}
			case 'date':
				switch (action.operation) {
					case 'set': return '设置日期';
					case 'add': return '增加周期';
					case 'subtract': return '减少周期';
					case 'current': return '当前日期';
					case 'setWeekDay': return '设置为本周星期';
					default: return action.operation;
				}
			case 'number':
				switch (action.operation) {
					case 'set': return '设置数值';
					case 'add': return '加';
					case 'subtract': return '减';
					case 'multiply': return '乘';
					case 'divide': return '除';
					default: return action.operation;
				}
			case 'text':
				return '设置文本';
			default:
				return action.operation;
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
		const modal = new CommandEditModal(this.plugin,this.app, command, this.plugin.settings.actions, (updatedCommand) => {
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
			.setDesc(`动作数量：${command.actions.length}，路径：${command.folder}`);

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

// 编辑动作的弹窗
class ActionEditModal extends Modal {
	action: Action;
	onSave: (action: Action) => void;

	constructor(app: App, action: Action, onSave: (action: Action) => void) {
		super(app);
		this.action = {...action};
		this.onSave = onSave;
	}

	onOpen() {
		this.renderModal();
	}

	renderModal() {
		const {contentEl} = this;
		contentEl.empty();

		contentEl.createEl('h2', {text: '编辑动作'});

		// 动作名称
		new Setting(contentEl)
			.setName('动作名称')
			.addText(text => text
				.setValue(this.action.name)
				.onChange(value => this.action.name = value));

		// 动作类型
		new Setting(contentEl)
			.setName('动作类型')
			.addDropdown(dropdown => dropdown
				.addOption('manual', '手动设置')
				.addOption('auto', '自动设置')
				.setValue(this.action.type)
				.onChange(value => {
					this.action.type = value as 'manual' | 'auto';
					this.renderModal();
				}));

		// 具体表单
		if (this.action.type === 'manual') {
			this.renderManualForm(contentEl);
		} else {
			this.renderAutoForm(contentEl);
		}

		// 保存按钮
		new Setting(contentEl)
			.addButton(button => button
				.setButtonText('保存')
				.setCta()
				.onClick(() => {
					if (!(this.action.name)) {
						new Notice('请填写动作名称');
						return;
					}
					if (this.action.type === 'manual' && !(this.action.field)) {
						new Notice('请填写字段名称');
						return;
					}

					this.onSave(this.action);
					this.close();
				}));
	}

	// 手动更新表单
	private renderManualForm(contentEl: HTMLElement) {
		const manualAction = this.action as ManualAction;
		new Setting(contentEl)
			.setName('字段名称')
			.addText(text => text
				.setValue(manualAction.field || '')
				.onChange(value => manualAction.field = value));
		// 字段类型
		new Setting(contentEl)
			.setName('字段类型')
			.addDropdown(dropdown => dropdown
				.addOptions({
					'checkbox': '复选框',
					'date': '日期',
					'number': '数字',
					'text': '文本'
				})
				.setValue(manualAction.fieldType)
				.onChange(value => {
					manualAction.fieldType = value as ManualAction['fieldType'];
					// 重置操作到新字段类型的默认值
					switch (value) {
						case 'checkbox':
							manualAction.operation = 'toggle';
							break;
						case 'date':
							manualAction.operation = 'set';
							break;
						case 'number':
							manualAction.operation = 'set';
							break;
						case 'text':
							manualAction.operation = 'set';
							break;
					}
					this.renderModal();
				}));

		// 操作
		if (manualAction.fieldType === 'checkbox') {
			new Setting(contentEl)
				.setName('操作')
				.addDropdown(dropdown => dropdown
					.addOptions({
						'toggle': '切换',
						'set': '设置为选中',
						'unset': '设置为取消选中'
					})
					.setValue(manualAction.operation)
					.onChange(value => {
						manualAction.operation = value;
						this.renderModal();
					}));
		} else if (manualAction.fieldType === 'date') {
			new Setting(contentEl)
				.setName('操作')
				.addDropdown(dropdown => dropdown
					.addOptions({
						'set': '设置日期',
						'add': '增加周期',
						'subtract': '减少周期',
						'current': '设置为当前日期',
						'setWeekDay': '设置为本周星期'
					})
					.setValue(manualAction.operation)
					.onChange(value => {
						manualAction.operation = value;
						this.renderModal();
					}));
			// 日期值/周期
			if (manualAction.operation === 'set') {
				new Setting(contentEl)
					.setName('日期值')
					.addText(text => text
						.setValue(manualAction.dateValue as string || '')
						.onChange(value => manualAction.dateValue = value));
			} else if (manualAction.operation === 'add' || manualAction.operation === 'subtract') {
				new Setting(contentEl)
					.setName('周期值')
					.setDesc('数字+单位（d=天，w=周，m=月，y=年），例如：1d')
					.addText(text => text
						.setValue(manualAction.period || '')
						.onChange(value => manualAction.period = value));
			} else if (manualAction.operation === 'setWeekDay') {
				new Setting(contentEl)
					.setName('星期')
					.addDropdown(dropdown => dropdown
						.addOptions({
							1: '周一',
							2: '周二',
							3: '周三',
							4: '周四',
							5: '周五',
							6: '周六',
							7: '周日'
						})
						.setValue(manualAction.weekday?.toString() || '1')
						.onChange(value => manualAction.weekday = parseInt(value)));
			}
		} else if (manualAction.fieldType === 'number') {
			new Setting(contentEl)
				.setName('操作')
				.addDropdown(dropdown => dropdown
					.addOptions({
						'set': '设置数值',
						'add': '加',
						'subtract': '减',
						'multiply': '乘',
						'divide': '除'
					})
					.setValue(manualAction.operation)
					.onChange(value => {
						manualAction.operation = value;
						this.renderModal();
					}));
			// 数值
			new Setting(contentEl)
				.setName('数值')
				.addText(text => text
					.setValue(manualAction.numberValue?.toString() || '')
					.onChange(value => manualAction.numberValue = parseFloat(value)));
		} else if (manualAction.fieldType === 'text') {
			new Setting(contentEl)
				.setName('操作')
				.addDropdown(dropdown => dropdown
					.addOption('set', '设置文本')
					.setValue(manualAction.operation)
					.onChange(value => {
						manualAction.operation = value;
						this.renderModal();
					}));
			new Setting(contentEl)
				.setName('文本内容')
				.addText(text => text
					.setValue(manualAction.stringValue as string || '')
					.onChange(value => manualAction.stringValue = value));
		}
	}

	// 自动更新表单
	private renderAutoForm(contentEl: HTMLElement) {
		new Setting(contentEl)
			.setName('提示词')
			.setDesc('返回 JSON 数据的提示词，可用 {content} 代表文档内容')
			.addTextArea(text => {
				text.setValue((this.action as AutoAction).prompt)
					.onChange(value => (this.action as AutoAction).prompt = value);
				text.inputEl.rows = 6; // 增加默认行数
				text.inputEl.cols = 60; // 增加默认行数
			});
	}

	onClose() {
		this.contentEl.empty();
	}
}

// 编辑命令的弹窗
class CommandEditModal extends Modal {
	plugin: OpenTextManager;
	command: Command;
	actions: Action[];
	onSave: (command: Command) => void;

	constructor(plugin: OpenTextManager, app: App, command: Command, actions: Action[], onSave: (command: Command) => void) {
		super(app);
		this.plugin = plugin;
		this.command = {...command};
		this.actions = actions;
		this.onSave = onSave;
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.empty();

		contentEl.createEl('h2', {text: '编辑命令'});

		// 名称
		new Setting(contentEl)
			.setName('命令名称')
			.addText(text => text
				.setValue(this.command.name)
				.onChange(value => this.command.name = value));

		// 目标路径
		new Setting(contentEl)
			.setName('目标路径')
			.setDesc('可填写单个文件路径或文件夹路径，留空则自动处理当前活动页面')
            .addText(text => {
                const input = text.setValue(this.command.folder);
                new FolderSuggest(this.app, input.inputEl);
                input.onChange(value => this.command.folder = value);
            });

		// 选择动作
		const actionsSetting = new Setting(contentEl)
			.setName('选择动作')
			.setDesc('命令将依次执行选择的动作');

		const actionsContainer = document.createElement('div');
		actionsContainer.className = 'otm-actions-flex';
		actionsSetting.controlEl.appendChild(actionsContainer);

		this.actions.forEach(action => {
			const toggleWrap = document.createElement('div');
			toggleWrap.className = 'otm-action-toggle';
			actionsContainer.appendChild(toggleWrap);

			const toggle = document.createElement('input');
			toggle.type = 'checkbox';
			toggle.checked = this.command.actions.includes(action.id);
			toggle.addEventListener('change', (e) => {
				if (toggle.checked) {
					this.command.actions.push(action.id);
				} else {
					this.command.actions = this.command.actions.filter(id => id !== action.id);
				}
			});
			toggleWrap.appendChild(toggle);

			const label = document.createElement('span');
			label.textContent = action.name;
			toggleWrap.appendChild(label);
		});

		// 保存按钮
		new Setting(contentEl)
			.addButton(button => button
				.setButtonText('保存')
				.setCta()
				.onClick(() => {
					if (!(this.command.name)) {
						new Notice('请填写命令名称');
						return;
					}
					const commandId = `opentext-${this.command.id}`;
					this.plugin.addCommand({
						id: commandId,
						name: this.command.name,
						callback: () => this.plugin.executeCommand(this.command)
					});
					this.onSave(this.command);
					this.close();
				}));
	}

	onClose() {
		this.contentEl.empty();
	}
}
