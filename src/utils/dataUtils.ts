import { App, TFile, TFolder } from "obsidian";


// 递归获取文件夹中的所有 Markdown 文件
export function getFilesInFolder(folder: TFolder): TFile[] {
    return folder.children.flatMap(child =>
        child instanceof TFile ? [child] :
            child instanceof TFolder ? getFilesInFolder(child) : []
    );
}

// 类型转换辅助函数
export function asNumber(value: unknown, defaultValue = 0): number {
    return typeof value === 'number' ? value : defaultValue;
}

export function asString(value: unknown, defaultValue = ''): string {
    return typeof value === 'string' ? value : defaultValue;
}

export function formatDate(date: Date): string {
    return date.toISOString().split('T')[0]!;
}

// 数字操作映射
export const NUMBER_OPERATIONS = {
    'set': (current: number, operand: number) => operand,
    'add': (current: number, operand: number) => current + operand,
    'subtract': (current: number, operand: number) => current - operand,
    'multiply': (current: number, operand: number) => current * operand,
    'divide': (current: number, operand: number) => current / operand,
} as const;

// 时间周期单位对应的毫秒数
export const PERIOD_MULTIPLIERS = {
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
    m: 30 * 24 * 60 * 60 * 1000,
    y: 365 * 24 * 60 * 60 * 1000
} as const;

// 解析时间周期字符串为毫秒数
export function parsePeriod(period: string): number {
    const match = period.match(/^(\d+)([dwmy])$/);
    if (!match) return 0;
    const num = parseInt(match[1]!, 10);
    const unit = match[2] as keyof typeof PERIOD_MULTIPLIERS;
    return num * (PERIOD_MULTIPLIERS[unit] ?? 0);
}

// 解析 AI 响应的 JSON
export function parseJsonResponse(response: string): Record<string, unknown> | null {
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


// 获取文件的反向链接信息
export function getBacklinks(app: App, targetPath: string) {
    const backlinks: Record<string, number> = {};
    const resolvedLinks = app.metadataCache.resolvedLinks;

    for (const source in resolvedLinks) {
        const links = resolvedLinks[source] || {};
        if (links[targetPath]) {
            backlinks[source] = links[targetPath];
        }
    }

    return backlinks;
}