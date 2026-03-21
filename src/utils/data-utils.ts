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
    if (typeof value === 'number') {
        return Number.isNaN(value) || !Number.isFinite(value) ? defaultValue : value;
    }
    return defaultValue;
}

export function asString(value: unknown, defaultValue = ''): string {
    return typeof value === 'string' ? value : defaultValue;
}

// 解析时间周期字符串
type MomentUnit = 'days' | 'weeks' | 'months' | 'years';

// 解析时间周期字符串
export function parsePeriod(input: string): { amount: number; unit: MomentUnit } {
    // 匹配数字 + 单位 (d, w, m, y)
    const match = input.match(/^(\d+)([dwmy])$/);
    if (!match) {
        return { amount: 0, unit: 'days' }; // 默认回退
    }
    const amount = parseInt(match[1] || '0', 10);
    const unitChar = match[2] || 'd';
    const unitMap: Record<string, MomentUnit> = {
        'd': 'days',
        'w': 'weeks',
        'm': 'months',
        'y': 'years'
    };
    return {
        amount,
        unit: unitMap[unitChar] || 'days'
    };
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