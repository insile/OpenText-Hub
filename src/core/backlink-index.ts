import { App, EventRef, TFile } from "obsidian";


export class BacklinkIndex {
    // 核心索引数据结构
    backlinkMap: Map<string, Set<string>> = new Map();
    forwardMap: Map<string, Set<string>> = new Map();
    app: App;
    isInitialized: boolean = false;
    fileWatcherRefs: EventRef[] = [];  // 存储文件监听器的 EventRef 以便注销

    constructor(app: App) {
        this.app = app;
    }

    // 全量初始化索引
    public init() {
        if (this.isInitialized) return;
        this.backlinkMap.clear();
        this.forwardMap.clear();
        this.isInitialized = true;

        const resolvedLinks = this.app.metadataCache.resolvedLinks;
        for (const sourcePath in resolvedLinks) {
            const targets = Object.keys(resolvedLinks[sourcePath] || {});
            for (const targetPath of targets) {
                this.addLink(sourcePath, targetPath);
            }
        }

        const resolveRef = this.app.metadataCache.on('resolve', (file) => {
            if (file instanceof TFile && file.path.endsWith(".md")) {
                this.updateFileIndex(file.path);
            }
        });
        const renameRef = this.app.vault.on("rename", (file, oldPath) => {
            if (file instanceof TFile && file.path.endsWith(".md")) {
                this.removeSourceFromIndex(oldPath);
                this.updateFileIndex(file.path);
            }
        });
        const deleteRef = this.app.vault.on("delete", (file) => {
            if (file instanceof TFile && file.path.endsWith(".md")) {
                this.removeSourceFromIndex(file.path);
                // 同时也确保作为 Target 的索引被抹除
                this['backlinkMap'].delete(file.path);
            }
        });
        this.fileWatcherRefs.push(resolveRef);
        this.fileWatcherRefs.push(renameRef);
        this.fileWatcherRefs.push(deleteRef);
    }

    // 清理索引和监听器
    public close() {
        this.backlinkMap.clear();
        this.forwardMap.clear();
        this.isInitialized = false;
        this.fileWatcherRefs.forEach(ref => this.app.workspace.offref(ref));
        this.fileWatcherRefs = [];
    }

    // 更新单个文件的索引（增量更新）
    public updateFileIndex(sourcePath: string) {
        // 1. 先移除该文件之前所有的旧链接关系
        this.removeSourceFromIndex(sourcePath);

        // 2. 获取 MetadataCache 中最新的链接数据并重新添加
        const newLinks = this.app.metadataCache.resolvedLinks[sourcePath];
        if (newLinks) {
            for (const targetPath in newLinks) {
                this.addLink(sourcePath, targetPath);
            }
        }
    }

    // 获取反向链接列表
    public getBacklinks(targetPath: string): string[] {
        const sources = this.backlinkMap.get(targetPath);
        return sources ? Array.from(sources) : [];
    }

    // 建立单向连接关系
    private addLink(source: string, target: string) {
        // 更新反向索引
        if (!this.backlinkMap.has(target)) this.backlinkMap.set(target, new Set());
        this.backlinkMap.get(target)!.add(source);

        // 更新正向索引（用于辅助增量更新）
        if (!this.forwardMap.has(source)) this.forwardMap.set(source, new Set());
        this.forwardMap.get(source)!.add(target);
    }

    // 移除一个源文件的所有索引轨迹
    public removeSourceFromIndex(sourcePath: string) {
        const targets = this.forwardMap.get(sourcePath);
        if (!targets) return;

        // 遍历该源文件之前指向的所有目标，从它们的 Backlink 集合中删掉自己
        for (const targetPath of targets) {
            const backlinkSet = this.backlinkMap.get(targetPath);
            if (backlinkSet) {
                backlinkSet.delete(sourcePath);
                // 如果该目标已经没有任何反向链接，清理 Map 空间
                if (backlinkSet.size === 0) this.backlinkMap.delete(targetPath);
            }
        }

        // 最后清理正向索引
        this.forwardMap.delete(sourcePath);
    }
}