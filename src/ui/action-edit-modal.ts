import { App, Modal, Notice, Setting } from "obsidian";
import { Action } from "settings/settings-data";


// 编辑动作的弹窗
export class ActionEditModal extends Modal {
    action: Action;
    onSave: (action: Action) => void;

    constructor(app: App, action: Action, onSave: (action: Action) => void) {
        super(app);
        this.action = { ...action };
        this.onSave = onSave;
    }

    onOpen() {
        this.renderModal();
    }

    renderModal() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: '编辑动作' });

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
        const manualAction = this.action;
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
                .setValue(manualAction.fieldType || 'number')
                .onChange(value => {
                    manualAction.fieldType = value as Action['fieldType'];
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
                        'set': '选中',
                        'unset': '取消'
                    })
                    .setValue(manualAction.operation || 'toggle')
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
                        'current': '今天',
                        'setWeekDay': '星期'
                    })
                    .setValue(manualAction.operation || 'set')
                    .onChange(value => {
                        manualAction.operation = value;
                        this.renderModal();
                    }));
            // 日期值/周期
            if (manualAction.operation === 'set') {
                new Setting(contentEl)
                    .setName('日期值')
                    .addText(text => {
                        text.inputEl.type = 'date';
                        text.setValue(manualAction.dateValue || '')
                            .onChange(value => manualAction.dateValue = value)
                    });
            } else if (manualAction.operation === 'add' || manualAction.operation === 'subtract') {
                new Setting(contentEl)
                    .setName('周期值')
                    .setDesc('数字+单位（d=天，w=周，m=月，y=年），例如：1d')
                    .addText(text => text
                        .setValue(manualAction.period || '')
                        .onChange(value => manualAction.period = value));
            } else if (manualAction.operation === 'setWeekDay') {
                if (!manualAction.weekday) { manualAction.weekday = 1; }
                new Setting(contentEl)
                    .setName('星期与偏移')
                    .setDesc('0: 本周, 1: 下周, -1: 上周')
                    .addText(text => text
                        .setPlaceholder('0')
                        .setValue(manualAction.weekOffset?.toString() || '0')
                        .onChange(value => {
                            manualAction.weekOffset = parseInt(value) || 0;
                        }))
                    .addDropdown(dropdown => dropdown
                        .addOptions({
                            '1': '周一',
                            '2': '周二',
                            '3': '周三',
                            '4': '周四',
                            '5': '周五',
                            '6': '周六',
                            '7': '周日'
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
                    .setValue(manualAction.operation || 'set')
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
                    .addOptions({
                        'set': '设置文本',
                        'append': '后缀',
                        'prepend': '前缀',
                        'regex': '正则模式'
                    })
                    .setValue(manualAction.operation || 'set')
                    .onChange(value => {
                        manualAction.operation = value;
                        this.renderModal();
                    }));
            if (manualAction.operation === 'regex') {
                new Setting(contentEl)
                    .setName('正则表达式')
                    .addText(text => text
                        .setPlaceholder('正则表达式 ...')
                        .setValue(manualAction.regexPattern || '')
                        .onChange(value => manualAction.regexPattern = value));
                new Setting(contentEl)
                    .setName('替换为')
                    .addText(text => {
                        text.setPlaceholder('替换内容 ...')
                            .setValue(manualAction.stringValue || '')
                            .onChange(value => manualAction.stringValue = value);
                    })
                    .addText(text => {
                        text.setPlaceholder('修饰符 ...')
                            .setValue(manualAction.regexFlags || 'g')
                            .onChange(value => manualAction.regexFlags = value);
                    });
            } else {
                new Setting(contentEl)
                    .setName('文本内容')
                    .addText(text => text
                        .setValue(manualAction.stringValue || '')
                        .onChange(value => manualAction.stringValue = value));
            }
        }
    }

    // 自动更新表单
    private renderAutoForm(contentEl: HTMLElement) {
        new Setting(contentEl)
            .setName('提示词')
            .setDesc('返回 JSON 数据的提示词，可用 {content} 代表文档内容, {filename} 代表文档名称')
            .addTextArea(text => {
                text.setValue(this.action.prompt || '')
                    .onChange(value => this.action.prompt = value);
                text.inputEl.rows = 6; // 增加默认行数
                text.inputEl.cols = 60; // 增加默认行数
            });
    }

    onClose() {
        this.contentEl.empty();
    }
}
