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
        const notice = new Notice(`正在执行命令："${command.name}"，共 ${command.actions.length} 个动作`, 0);

        // 如果未填写目标路径，则处理当前活动页面
        if (!command.folder) {
            const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (activeView && activeView.file) {
                await this.executeActionsOnFile(activeView.file, command.actions);
                notice.setMessage(`已在当前页面执行命令："${command.name}"`);
            } else {
                notice.setMessage('未找到当前活动的 Markdown 页面');
            }
        } else {
            // 判断路径是文件还是文件夹
            const target = this.app.vault.getAbstractFileByPath(command.folder);
            if (!target) {
                notice.setMessage(`未找到目标路径："${command.folder}"`);
            } else if (target instanceof TFile && target.extension === 'md') {
                await this.executeActionsOnFile(target, command.actions);
                notice.setMessage(`已在文件 "${target.name}" 上执行命令："${command.name}"`);
            } else if (target instanceof TFolder) {
                const files = getFilesInFolder(target);
                const numberOfFiles = files.length;
                let numberOfExecutedFiles = 0;
                const chunkSize = 10; // 每组 10 个
                const mdFiles = files.filter(f => f instanceof TFile && f.extension === 'md');
                for (let i = 0; i < mdFiles.length; i += chunkSize) {
                    const chunk = mdFiles.slice(i, i + chunkSize);
                    // 这一组内并行执行
                    await Promise.all(chunk.map(async (file) => {
                        await this.executeActionsOnFile(file, command.actions);
                        numberOfExecutedFiles++;
                    }));
                    // 每组完成后更新一次 UI
                    notice.setMessage(`进度：${numberOfExecutedFiles}/${numberOfFiles}`);
                }
                notice.setMessage(`已在路径 "${target.name}" 上执行命令："${command.name}"`);
            } else {
                notice.setMessage('目标路径不是 Markdown 文件或文件夹');
            }
        }
        setTimeout(() => notice.hide(), 2000);
    }

    // 执行动作
    private async executeActionsOnFile(file: TFile, actionIds: string[]) {
        const cache = this.app.metadataCache.getFileCache(file);
        const frontmatter = structuredClone(cache?.frontmatter || {});

        for (const actionId of actionIds) {
            const action = this.plugin.settings.actions.find(a => a.id === actionId);
            if (!action) continue;
            if (action.type === 'manual') {
                const field = action.field;
                if (!field) continue;
                frontmatter[field] = this.getUpdatedData(frontmatter[field], action);
            } else if (action.type === 'auto') {
                const aiResult = await this.getUpdatedDataAI(file, frontmatter, action);
                Object.assign(frontmatter, aiResult);
            }
        }

        await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
            for (const [key, value] of Object.entries(frontmatter)) {
                fm[key] = value;
            }
        });
    }

    // 手动更新数据
    private getUpdatedData(currentValue: unknown, action: Action) {
        const fieldContent = currentValue;
        let newData: unknown = fieldContent;

        switch (action.fieldType) {
            case 'checkbox': {
                if (action.operation === 'toggle') newData = !fieldContent;
                else if (action.operation === 'set') newData = true;
                else if (action.operation === 'unset') newData = false;
                break;
            }
            case 'date': {
                if (action.operation === 'set') {
                    newData = asString(action.dateValue) || window.moment().format('YYYY-MM-DD');
                } else if (action.operation === 'add' || action.operation === 'subtract') {
                    let m = window.moment(asString(fieldContent) || undefined);
                    if (!m.isValid()) m = window.moment();
                    const { amount, unit } = parsePeriod(action.period || '');
                    const multiplier = action.operation === 'add' ? 1 : -1;
                    m.add(amount * multiplier, unit);
                    newData = m.format('YYYY-MM-DD');
                } else if (action.operation === 'current') {
                    newData = window.moment().format('YYYY-MM-DD');
                } else if (action.operation === 'setWeekDay') {
                    const weekday = asNumber(action.weekday, 1);
                    const weekOffset = asNumber(action.weekOffset, 0);
                    newData = window.moment().startOf('day').isoWeekday(weekday + weekOffset * 7).format('YYYY-MM-DD');
                }
                break;
            }
            case 'number': {
                const curNum = asNumber(fieldContent);
                const actNum = asNumber(action.numberValue);
                if (action.operation === 'set') newData = actNum;
                else if (action.operation === 'add') newData = curNum + actNum;
                else if (action.operation === 'subtract') newData = curNum - actNum;
                else if (action.operation === 'multiply') newData = curNum * asNumber(action.numberValue, 1);
                else if (action.operation === 'divide') {
                    const divisor = asNumber(action.numberValue, 1);
                    newData = divisor !== 0 ? curNum / divisor : curNum;
                }
                break;
            }
            case 'text': {
                const curText = asString(fieldContent);
                if (action.operation === 'set') newData = asString(action.stringValue);
                else if (action.operation === 'append') newData = curText + asString(action.stringValue);
                else if (action.operation === 'prepend') newData = asString(action.stringValue) + curText;
                else if (action.operation === 'regex') {
                    try {
                        const regex = new RegExp(action.regexPattern || '', action.regexFlags || 'g');
                        newData = curText.replace(regex, action.stringValue || '');
                    } catch (e) {
                        console.error("Invalid Regex Pattern:", e);
                        newData = curText;
                    }
                }
                break;
            }
        }
        return newData;
    }

    // 调用 AI 获取更新数据
    private async getUpdatedDataAI(file: TFile, frontmatter: Record<string, unknown>, action: Action) {
        const prompt = action.prompt;
        const secret = this.app.secretStorage.getSecret(this.plugin.settings.apiKey);
        if (!prompt || !secret) {
            new Notice(!prompt ? '未设置提示词' : '未配置 API key');
            return {};
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
                        { "role": "user", "content": prompt.replace(/{content}/g, content).replace(/{filename}/g, file.basename) },
                    ],
                }),
            });

            if (response.status !== 200) {
                new Notice(`AI 请求失败: ${response.status}`);
                return {};
            }

            const data = JSON.parse(response.text) as Record<string, unknown>;
            const choices = data.choices as Array<{ message: { content: string } }> | undefined;
            if (!choices?.[0]) {
                new Notice('AI 响应格式错误');
                return {};
            }

            const aiResponse = choices[0].message.content;
            console.debug(aiResponse)
            const jsonData = parseJsonResponse(aiResponse);
            if (!jsonData) {
                new Notice('AI 返回的不是有效的 JSON 对象');
                return {};
            }
            return jsonData
        } catch (error) {
            new Notice('调用 API 失败');
            console.debug('Error details:', error);
            return {};
        }
    }
}