import {MarkdownView, Notice, Plugin, TFile, TFolder, requestUrl} from 'obsidian';
import {DEFAULT_SETTINGS, OpenTextSettings, OpenTextSettingTab, Command, ManualAction, AutoAction} from "./settings";
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
		// eslint-disable-next-line obsidianmd/ui/sentence-case
		this.addRibbonIcon('cog', 'OpenText 管理面板', () => this.openConfigView());
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
		
	}

	// 打开配置面板
	async openConfigView() {
		const existing = this.app.workspace.getLeavesOfType(OPENTEXT_MANAGER_VIEW)[0];
		if (existing) {
			await this.app.workspace.revealLeaf(existing);
			return;
		}

		const leaf = this.app.workspace.getRightLeaf(false);
		if (!leaf) return;
		await leaf.setViewState({type: OPENTEXT_MANAGER_VIEW});
		await this.app.workspace.revealLeaf(leaf);
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
			const files = this.getFilesInFolder(target);
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

	// 递归获取文件夹中的所有 Markdown 文件
	getFilesInFolder(folder: TFolder): TFile[] {
		return folder.children.flatMap(child => 
			child instanceof TFile ? [child] : 
			child instanceof TFolder ? this.getFilesInFolder(child) : []
		);
	}

	// 类型转换辅助函数
	private asNumber(value: unknown, defaultValue = 0): number {
		return typeof value === 'number' ? value : defaultValue;
	}

	private asString(value: unknown, defaultValue = ''): string {
		return typeof value === 'string' ? value : defaultValue;
	}

	private formatDate(date: Date): string {
		return date.toISOString().split('T')[0]!;
	}

	// 数字操作映射
	private readonly NUMBER_OPERATIONS = {
		'set': (current: number, operand: number) => operand,
		'add': (current: number, operand: number) => current + operand,
		'subtract': (current: number, operand: number) => current - operand,
		'multiply': (current: number, operand: number) => current * operand,
		'divide': (current: number, operand: number) => current / operand,
	} as const;

	// 执行动作
	async executeActionsOnFile(file: TFile, actionIds: string[]): Promise<void> {
		let frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter || {} as Record<string, unknown>;

		for (const actionId of actionIds) {
			const action = this.settings.actions.find(a => a.id === actionId);
			if (!action) continue;

			if (action.type === 'manual') {
				await this.executeManualAction(file, frontmatter, action);
			} else if (action.type === 'auto') {
				await this.executeAutoAction(file, frontmatter, action);
			}
		}
	}

	// 执行手动动作
	async executeManualAction(file: TFile, frontmatter: Record<string, unknown>, action: ManualAction): Promise<void> {
		const field = action.field;
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
					newData = action.dateValue;
				} else if (action.operation === 'add' || action.operation === 'subtract') {
					const current = new Date(this.asString(frontmatter[field]) || Date.now());
					const period = this.parsePeriod(action.period || '');
					const multiplier = action.operation === 'add' ? 1 : -1;
					current.setTime(current.getTime() + period * multiplier);
					newData = this.formatDate(current);
				} else if (action.operation === 'current') {
					newData = this.formatDate(new Date());
				} else if (action.operation === 'setWeekDay') {
					const now = new Date();
					const dayOfWeek = now.getDay();
					const monday = new Date(now);
					monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
					const targetDay = new Date(monday);
					targetDay.setDate(monday.getDate() + (this.asNumber(action.weekday) - 1));
					newData = this.formatDate(targetDay);
				}
				break;
			}
			case 'number': {
				const currentNum = this.asNumber(frontmatter[field]);
				const operand = this.asNumber(action.numberValue, action.operation === 'multiply' || action.operation === 'divide' ? 1 : 0);
				const operation = this.NUMBER_OPERATIONS[action.operation as keyof typeof this.NUMBER_OPERATIONS];
				newData = operation ? operation(currentNum, operand) : newData;
				break;
			}
			case 'text': {
				if (action.operation === 'set') {
					newData = action.stringValue;
				}
				break;
			}
		}
		await this.app.fileManager.processFrontMatter(file, (frontMatter: Record<string, unknown>) => {
            frontMatter[field] = newData;
        });
	}

	private readonly PERIOD_MULTIPLIERS = {d: 24*60*60*1000, w: 7*24*60*60*1000, m: 30*24*60*60*1000, y: 365*24*60*60*1000} as const;

	// 解析时间周期字符串为毫秒数
	parsePeriod(period: string): number {
		const match = period.match(/^(\d+)([dwmy])$/);
		if (!match) return 0;
		const num = parseInt(match[1]!, 10);
		const unit = match[2] as keyof typeof this.PERIOD_MULTIPLIERS;
		return num * (this.PERIOD_MULTIPLIERS[unit] ?? 0);
	}

	// 解析 AI 响应的 JSON
	private parseJsonResponse(response: string): Record<string, unknown> | null {
		try {
			return JSON.parse(response) as Record<string, unknown>;
		} catch {
			const match = response.match(/\{[\s\S]*?\}/);
			if (!match) return null;
			try {
				return JSON.parse(match[0]) as Record<string, unknown>;
			} catch {
				return null;
			}
		}
	}

	// 执行自动动作
	async executeAutoAction(file: TFile, frontmatter: Record<string, unknown>, action: AutoAction): Promise<void> {
		const prompt = action.prompt;
		const secret = this.app.secretStorage.getSecret(this.settings.apiKey);
		
		if (!secret) {
			new Notice('未找到对应的 API key，请在插件设置中配置');
			return;
		}
		
		const fileContent = await this.app.vault.read(file);
		const content = fileContent.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '');

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
						{"role": "system", "content": '你必须只返回有效的 JSON 数据，不包含任何其他文本。' },
						{"role": "user", "content": prompt.replace('{content}', content)},
					],
				}),
			});

			if (response.status !== 200) {
				new Notice(`AI 请求失败: ${response.status}`);
				return;
			}
			
			const data = JSON.parse(response.text) as Record<string, unknown>;
			const choices = data.choices as Array<{message: {content: string}}> | undefined;
			if (!choices?.[0]) {
				new Notice('AI 响应格式错误');
				return;
			}
			const aiResponse = choices[0].message.content;

			const jsonData = this.parseJsonResponse(aiResponse);
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
			// eslint-disable-next-line obsidianmd/ui/sentence-case
			new Notice('调用 DeepSeek API 失败');
			console.debug('Error details:', error);
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
