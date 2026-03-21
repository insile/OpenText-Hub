import OpenTextHub from 'main';
import { App, MarkdownView, Notice, requestUrl, TFile, TFolder } from 'obsidian';
import { Action, Command } from 'settings/settings-data';
import { OPENTEXT_METADATA_MANAGER_VIEW } from 'ui/metadata-manager-view';
import { asNumber, asString, getFilesInFolder, parseJsonResponse, parsePeriod } from 'utils/data-utils';


export class MetadataManager {
    app: App;
    plugin: OpenTextHub;

    // 构造函数，注册命令
    constructor(app: App, plugin: OpenTextHub) {
        this.app = app;
        this.plugin = plugin;
        this.plugin.settings.commands.forEach(command => {
            const commandId = `opentext-${command.id}`;
            this.plugin.addCommand({
                id: commandId,
                name: command.name,
                callback: () => this.executeCommand(command)
            });
        });
    }

    // 打开配置面板
    async openManagerView() {
        const existing = this.app.workspace.getLeavesOfType(OPENTEXT_METADATA_MANAGER_VIEW)[0];
        if (existing) {
            await this.app.workspace.revealLeaf(existing);
            return;
        }

        const leaf = this.app.workspace.getRightLeaf(false);
        if (!leaf) return;
        await leaf.setViewState({ type: OPENTEXT_METADATA_MANAGER_VIEW });
        await this.app.workspace.revealLeaf(leaf);
    }

    // 执行命令
    async executeCommand(command: Command) {
        const notice = new Notice(`正在执行命令："${command.name}"，共 ${command.actions.length} 个动作`);

        // 如果未填写目标路径，则处理当前活动页面
        if (!command.folder) {
            const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (activeView && activeView.file) {
                await this.executeActionsOnFile(activeView.file, command.actions);
                notice.setMessage(`已在当前页面执行命令："${command.name}"`);
                return;
            } else {
                notice.setMessage('未找到当前活动的 Markdown 页面');
                return;
            }
        }

        // 判断路径是文件还是文件夹
        const target = this.app.vault.getAbstractFileByPath(command.folder);
        if (!target) {
            notice.setMessage(`未找到目标路径："${command.folder}"`);
            return;
        }
        if (target instanceof TFile && target.extension === 'md') {
            await this.executeActionsOnFile(target, command.actions);
            notice.setMessage(`已在文件 "${target.name}" 上执行命令："${command.name}"`);
        } else if (target instanceof TFolder) {
            const files = getFilesInFolder(target);
            const numberOfFiles = files.length;
            let numberOfExecutedFiles = 0;
            for (const file of files) {
                if (file instanceof TFile && file.extension === 'md') {
                    await this.executeActionsOnFile(file, command.actions);
                    numberOfExecutedFiles++;
                }
                notice.setMessage(`正在执行命令："${command.name}"，已完成 ${numberOfExecutedFiles}/${numberOfFiles} 个文件`);
            }
            notice.setMessage(`已在路径 "${target.name}" 上执行命令："${command.name}"`);
        } else {
            notice.setMessage('目标路径不是 Markdown 文件或文件夹');
        }
    }

    // 执行动作
    private async executeActionsOnFile(file: TFile, actionIds: string[]): Promise<void> {
        let frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter || {} as Record<string, unknown>;

        for (const actionId of actionIds) {
            const action = this.plugin.settings.actions.find(a => a.id === actionId);
            if (!action) continue;

            if (action.type === 'manual') {
                await this.executeManualAction(file, frontmatter, action);
            } else if (action.type === 'auto') {
                await this.executeAutoAction(file, frontmatter, action);
            }
        }
    }

    // 执行手动动作
    private async executeManualAction(file: TFile, frontmatter: Record<string, unknown>, action: Action): Promise<void> {
        const field = action.field;
        if (!field) return;
        let newData: unknown;

        switch (action.fieldType) {
            case 'checkbox': {
                if (action.operation === 'toggle') {
                    newData = !frontmatter[field];
                } else if (action.operation === 'set') {
                    newData = true;
                } else if (action.operation === 'unset') {
                    newData = false;
                }
                break;
            }
            case 'date': {
                if (action.operation === 'set') {
                    newData = asString(action.dateValue) || window.moment().format('YYYY-MM-DD');
                } else if (action.operation === 'add' || action.operation === 'subtract') {
                    const rawValue = asString(frontmatter[field]);
                    let current = window.moment(rawValue);
                    if (!current.isValid()) {
                        current = window.moment();
                    }
                    const { amount, unit } = parsePeriod(action.period || '');
                    const multiplier = action.operation === 'add' ? 1 : -1;
                    current.add(amount * multiplier, unit);
                    newData = current.format('YYYY-MM-DD');
                } else if (action.operation === 'current') {
                    newData = window.moment().format('YYYY-MM-DD');
                } else if (action.operation === 'setWeekDay') {
                    const weekday = asNumber(action.weekday, 1);     // 目标周几
                    const weekOffset = asNumber(action.weekOffset, 0); // 周偏移
                    const m = window.moment().startOf('day');
                    m.isoWeekday(weekday + weekOffset * 7);
                    newData = m.format('YYYY-MM-DD');
                }
                break;
            }
            case 'number': {
                if (action.operation === 'set') {
                    newData = asNumber(action.numberValue);
                } else if (action.operation === 'add') {
                    newData = asNumber(frontmatter[field]) + asNumber(action.numberValue);
                } else if (action.operation === 'subtract') {
                    newData = asNumber(frontmatter[field]) - asNumber(action.numberValue);
                } else if (action.operation === 'multiply') {
                    newData = asNumber(frontmatter[field]) * asNumber(action.numberValue, 1);
                } else if (action.operation === 'divide') {
                    newData = asNumber(asNumber(frontmatter[field]) / asNumber(action.numberValue, 1), asNumber(frontmatter[field]));
                }
                break;
            }
            case 'text': {
                if (action.operation === 'set') {
                    newData = asString(action.stringValue);
                } else if (action.operation === 'append') {
                    newData = asString(frontmatter[field]) + asString(action.stringValue);
                } else if (action.operation === 'prepend') {
                    newData = asString(action.stringValue) + asString(frontmatter[field]);
                } else if (action.operation === 'regex') {
                    const current = asString(frontmatter[field]);
                    const pattern = action.regexPattern || '';     // 用户输入的正则，如: \d+
                    const replacement = action.stringValue || '';  // 替换后的文本
                    const flags = action.regexFlags || 'g';        // 正则修饰符，默认全局替换

                    try {
                        const regex = new RegExp(pattern, flags);
                        newData = current.replace(regex, replacement);
                    } catch (e) {
                        // 如果正则解析失败，保持原样并可在控制台报错
                        console.error("Invalid Regex Pattern:", e);
                        newData = current;
                    }
                }
                break;
            }
        }
        await this.app.fileManager.processFrontMatter(file, (frontMatter: Record<string, unknown>) => {
            frontMatter[field] = newData;
        });
    }

    // 执行自动动作
    private async executeAutoAction(file: TFile, frontmatter: Record<string, unknown>, action: Action): Promise<void> {
        const prompt = action.prompt;

        if (!prompt) {
            new Notice('未设置提示词');
            return;
        }

        const secret = this.app.secretStorage.getSecret(this.plugin.settings.apiKey);

        if (!secret) {
            new Notice('未找到对应的 API key，请在插件设置中配置');
            return;
        }

        const fileContent = await this.app.vault.cachedRead(file);
        const content = fileContent.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '').replace(/\[\[(?:[^|\]]+\|)?([^\]]+)\]\]/g, '$1');

        try {
            const response = await requestUrl({
                url: 'https://api.deepseek.com/v1/chat/completions',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${secret}`,
                },
                body: JSON.stringify({
                    model: 'deepseek-chat',
                    messages: [
                        { "role": "system", "content": '你必须只返回有效的 JSON 数据，不包含任何其他文本。' },
                        { "role": "user", "content": prompt.replace('{content}', content).replace('{filename}', file.basename) },
                    ],
                }),
            });

            if (response.status !== 200) {
                new Notice(`AI 请求失败: ${response.status}`);
                return;
            }

            const data = JSON.parse(response.text) as Record<string, unknown>;
            const choices = data.choices as Array<{ message: { content: string } }> | undefined;
            if (!choices?.[0]) {
                new Notice('AI 响应格式错误');
                return;
            }
            const aiResponse = choices[0].message.content;

            const jsonData = parseJsonResponse(aiResponse);
            if (!jsonData) {
                new Notice('AI 返回的不是有效的 JSON 对象');
                return;
            }

            await this.app.fileManager.processFrontMatter(file, (frontMatter: Record<string, unknown>) => {
                for (const [key, value] of Object.entries(jsonData)) {
                    frontMatter[key] = value;
                }
            });
        } catch (error) {
            new Notice('调用 API 失败');
            console.debug('Error details:', error);
        }
    }

}