import {App, Editor, MarkdownView, Notice, Plugin, TFile, TFolder} from 'obsidian';
import {DEFAULT_SETTINGS, OpenTextSettings, OpenTextSettingTab, Action, Command} from "./settings";
import {ConfigView, OPENTEXT_MANAGER_VIEW} from "./configView";


// 主插件类
export default class OpenTextManager extends Plugin {
	settings: OpenTextSettings;

	// 插件加载
	async onload() {
		// 加载设置, 注册设置选项卡, 注册配置面板视图和相关命令
		await this.loadSettings();
		this.addSettingTab(new OpenTextSettingTab(this.app, this));
		this.registerView(OPENTEXT_MANAGER_VIEW, (leaf) => new ConfigView(leaf, this));
		this.addRibbonIcon('cog', 'OpenText 管理面板', async () => { await this.openConfigView(); });
		this.addCommand({
			id: 'opentext-manager-open-config',
			name: '打开配置面板',
			callback: () => this.openConfigView()
		});
		this.settings.commands.forEach(command => {
			const commandId = `opentext-${command.id}`;
			this.addCommand({
				id: commandId,
				name: command.name,
				callback: () => this.executeCommand(command)
			});
		});
	}

	// 插件卸载
	onunload() {
		// 卸载时移除配置面板
		this.app.workspace.detachLeavesOfType(OPENTEXT_MANAGER_VIEW);
	}

	// 打开配置面板
	async openConfigView() {
		const leaves = this.app.workspace.getLeavesOfType(OPENTEXT_MANAGER_VIEW);
		const existing = leaves[0];
		if (existing) {
			this.app.workspace.revealLeaf(existing);
			return;
		}

		const leaf = this.app.workspace.getRightLeaf(false);
		if (!leaf) return;
		await leaf.setViewState({type: OPENTEXT_MANAGER_VIEW});
		this.app.workspace.revealLeaf(leaf);
	}

	// 执行命令
	async executeCommand(command: Command) {
		// 自动移除不存在的动作
		const validActions = command.actions.filter(actionId =>
			this.settings.actions.some(a => a.id === actionId)
		);
		if (validActions.length !== command.actions.length) {
			command.actions = validActions;
			await this.saveSettings();
		}

		// 如果未填写目标路径，则处理当前活动页面
		if (!command.folder) {
			const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        	if (activeView && activeView.file) {
				await this.executeActionsOnFile(activeView.file, command.actions);
				new Notice(`已在当前页面执行命令："${command.name}"`);
				return;
			} else {
				new Notice('未找到当前活动的 Markdown 页面');
				return;
			}
		}

		// 判断路径是文件还是文件夹
		const target = this.app.vault.getAbstractFileByPath(command.folder);
		if (!target) {
			new Notice(`未找到目标路径："${command.folder}"`);
			return;
		}
		if (target instanceof TFile && target.extension === 'md') {
			await this.executeActionsOnFile(target, command.actions);
			new Notice(`已在文件 "${target.name}" 上执行命令："${command.name}"`);
		} else if (target instanceof TFolder) {
			const files = this.getFilesInFolder(target);
			const numberOfFiles = files.length;
			let numberOfExecutedFiles = 0;
			for (const file of files) {
				if (file instanceof TFile && file.extension === 'md') {
					await this.executeActionsOnFile(file, command.actions);
					numberOfExecutedFiles++;
				}
				new Notice(`正在执行命令："${command.name}"，已完成 ${numberOfExecutedFiles}/${numberOfFiles} 个文件`);
			}
			new Notice(`已在路径 "${target.name}" 上执行命令："${command.name}"`);
		} else {
			new Notice('目标路径不是 Markdown 文件或文件夹');
		}
	}

	// 递归获取文件夹中的所有 Markdown 文件
	getFilesInFolder(folder: TFolder): TFile[] {
		const files: TFile[] = [];
		for (const child of folder.children) {
			if (child instanceof TFile) {
				files.push(child);
			} else if (child instanceof TFolder) {
				files.push(...this.getFilesInFolder(child));
			}
		}
		return files;
	}

	// 执行动作
	async executeActionsOnFile(file: TFile, actionIds: string[]) {
		const content = await this.app.vault.read(file);
		let frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter || {};

		for (const actionId of actionIds) {
			const action = this.settings.actions.find(a => a.id === actionId);
			if (!action) continue;

			if (action.type === 'manual') {
				await this.executeManualAction(file, frontmatter, action);
			} else {
				await this.executeAutoAction(file, frontmatter, action);
			}
		}
	}

	// 执行手动动作
	async executeManualAction(file: TFile, frontmatter: any, action: Action): Promise<any> {
		const manualAction = action as any; // 类型断言
		const field = action.field;
		let newData: any;

		switch (manualAction.fieldType) {
			case 'checkbox':
				if (manualAction.operation === 'toggle') {
					newData = !frontmatter[field];
				} else if (manualAction.operation === 'set') {
					newData = true;
				} else if (manualAction.operation === 'unset') {
					newData = false;
				}
				break;
			case 'date':
				if (manualAction.operation === 'set') {
					newData = manualAction.value;
				} else if (manualAction.operation === 'add' || manualAction.operation === 'subtract') {
					const current = new Date(frontmatter[field] || Date.now());
					const period = this.parsePeriod(manualAction.period || '');
					const multiplier = manualAction.operation === 'add' ? 1 : -1;
					current.setTime(current.getTime() + period * multiplier);
					newData = current.toISOString().split('T')[0];
				} else if (manualAction.operation === 'current') {
					newData = new Date().toISOString().split('T')[0];
				} else if (manualAction.operation === 'setWeekDay') {
					const now = new Date();
					const dayOfWeek = now.getDay(); // 0=周日, 1=周一, ..., 6=周六
					const monday = new Date(now);
					monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1)); // 本周一
					const targetDay = new Date(monday);
					targetDay.setDate(monday.getDate() + (manualAction.value - 1)); // value 1=周一, 2=周二, etc.
					newData = targetDay.toISOString().split('T')[0];
				}
				break;
			case 'number':
				const currentNum = frontmatter[field] || 0;
				if (manualAction.operation === 'set') {
					newData = manualAction.value;
				} else if (manualAction.operation === 'add') {
					newData = currentNum + (manualAction.value || 0);
				} else if (manualAction.operation === 'subtract') {
					newData = currentNum - (manualAction.value || 0);
				} else if (manualAction.operation === 'multiply') {
					newData = currentNum * (manualAction.value || 1);
				} else if (manualAction.operation === 'divide') {
					newData = currentNum / (manualAction.value || 1);
				}
				break;
			case 'text':
				if (manualAction.operation === 'set') {
					newData = manualAction.value;
				}
				break;
		}
		await this.app.fileManager.processFrontMatter(file, (frontMatter) => {
            frontMatter[field] = newData;
        });
	}

	// 解析时间周期字符串为毫秒数
	parsePeriod(period: string): number {
		const match = period.match(/^(\d+)([dwmy])$/);
		if (!match) return 0;
		const num = parseInt(match[1] ?? '0', 10);
		const unit = match[2] ?? '';
		switch (unit) {
			case 'd': return num * 24 * 60 * 60 * 1000;
			case 'w': return num * 7 * 24 * 60 * 60 * 1000;
			case 'm': return num * 30 * 24 * 60 * 60 * 1000; // 近似值
			case 'y': return num * 365 * 24 * 60 * 60 * 1000; // 近似值
			default: return 0;
		}
	}

	// 执行自动动作
	async executeAutoAction(file: TFile, frontmatter: any, action: Action): Promise<any> {
		const autoAction = action as any;
		const prompt = autoAction.prompt;
		const secret = this.app.secretStorage.getSecret(this.settings.apiKey);
		
		if (!secret) {
			new Notice('未找到对应的 API key，请在插件设置中配置');
			return;
		}
		
		const fileContent = await this.app.vault.read(file);
		const content = fileContent.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '')

		try {
			const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${secret}`,
				},
				body: JSON.stringify({
					model: 'deepseek-chat',
					messages: [
						{"role": "system", "content": '你必须只返回有效的 JSON 数据，不包含任何其他文本。' },
						{"role": "user", "content": prompt.replace('{content}', content)},
					],
				}),
			});

			if (!response.ok) {
				new Notice(`AI 请求失败: ${response.status}`);
				return;
			}
			const data = await response.json();
			const aiResponse = data.choices[0].message.content;
			console.log(aiResponse);

			let jsonData: any = null;

			// 1. 直接解析
			try {
				jsonData = JSON.parse(aiResponse);
			} catch {
				// 2. 兜底提取
				const match = aiResponse.match(/\{[\s\S]*?\}/);
				if (match) {
					try {
						jsonData = JSON.parse(match[0]);
					} catch {
						jsonData = null;
					}
				}
			}

			if (!jsonData || typeof jsonData !== 'object') {
				new Notice('AI 返回的不是有效的 JSON 对象');
				return;
			}

			await this.app.fileManager.processFrontMatter(file, (frontMatter) => {
				for (const [key, value] of Object.entries(jsonData)) {
					frontMatter[key] = value;
				}
			});
		} catch (error) {
			new Notice('调用 DeepSeek API 失败');
			console.error(error);
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
