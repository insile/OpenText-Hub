import OpenTextHub from "main";
import { Modal, App, Setting, Notice } from "obsidian";
import { Action, Command } from "settings/settings-data";
import { FolderSuggest } from "utils/input-suggest";


// 编辑命令的弹窗
export class CommandEditModal extends Modal {
    plugin: OpenTextHub;
    command: Command;
    actions: Action[];
    onSave: (command: Command) => void;

    constructor(plugin: OpenTextHub, app: App, command: Command, actions: Action[], onSave: (command: Command) => void) {
        super(app);
        this.plugin = plugin;
        this.command = { ...command };
        this.actions = actions;
        this.onSave = onSave;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: '编辑命令' });

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
                        callback: () => this.plugin.metadataManager.executeCommand(this.command)
                    });
                    this.onSave(this.command);
                    this.close();
                }));
    }

    onClose() {
        this.contentEl.empty();
    }
}
