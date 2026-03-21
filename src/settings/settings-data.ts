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
	id: string;  // 唯一标识符, 时间戳
	name: string;  // 显示名称
	type: 'manual' | 'auto';  // 动作类型
	field?: string;  // 作用的字段
	fieldType?: 'checkbox' | 'date' | 'number' | 'text';  // 字段类型
	operation?: string;  // 操作类型
	dateValue?: string;  // 日期值，格式为 YYYY-MM-DD
	numberValue?: number;  // 数字值
	stringValue?: string;  // 字符串值
	period?: string;  // 周期
	weekday?: number;  // 星期
	weekOffset?: number;  // 周偏移
	prompt?: string;  // 提示词
	regexPattern?: string;  // 正则表达式模式
	regexFlags?: string;  // 正则表达式标志
}

// 元数据调用命令
export interface Command {
	id: string;
	name: string;
	actions: string[];
	folder: string;
}

