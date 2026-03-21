// 插件设置
export interface OpenTextSettings {
	apiKey: string;
	actions: Action[];
	commands: Command[];
	classifyByLinkEnabled?: boolean;
}

// 默认设置
export const DEFAULT_SETTINGS: OpenTextSettings = {
	apiKey: '',
	actions: [],
	commands: [],
	classifyByLinkEnabled: false
};

// 元数据更新动作
export interface Action {
	id: string;
	name: string;
	type: 'manual' | 'auto';
	field?: string;
	fieldType?: 'checkbox' | 'date' | 'number' | 'text';
	operation?: string;
	dateValue?: string;
	numberValue?: number;
	stringValue?: string;
	period?: string;
	weekday?: number;
	prompt?: string;
}

// 元数据调用命令
export interface Command {
	id: string;
	name: string;
	actions: string[];
	folder: string;
}

