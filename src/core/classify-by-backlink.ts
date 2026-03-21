import OpenTextHub from "main";
import { App, EventRef, TFile } from "obsidian";
import { BacklinkIndex } from "./backlink-index";


export class ClassifyByLink {
    app: App;
    plugin: OpenTextHub; // 替换为你的插件类名
    statusBarItem: HTMLElement;
    fileWatcherRefs: EventRef[] = [];  // 存储文件监听器的 EventRef 以便注销
    backlinkIndex: BacklinkIndex;

    constructor(app: App, plugin: OpenTextHub) {
        this.app = app;
        this.plugin = plugin;
        this.backlinkIndex = new BacklinkIndex(this.app);
        this.statusBarItem = this.plugin.addStatusBarItem().createEl("span");
        if (this.plugin.settings.classifyByLinkEnabled) { this.init(); }
    }

    init() {
        const isMetadataReady = Object.keys(this.app.metadataCache.resolvedLinks).length > 0;
        if (isMetadataReady) {
            // 如果已经准备好了（手动启用场景），直接初始化
            this.backlinkIndex.init();
        } else {
            const resolveRef = this.app.metadataCache.on('resolve', (file) => {
                this.backlinkIndex.init();
                this.app.metadataCache.offref(resolveRef);
            });
        }
        const changedRef = this.app.workspace.on("file-open", (file) => {
            if (file instanceof TFile && file.path.endsWith(".md")) {
                this.statusBarItem.setText(this.findNearestType(file.path)?.join(", ") ? `${this.findNearestType(file.path)?.join(", ")}` : "未找到类型");
                // console.debug(this.backlinkIndex.getBacklinks(file.path)); // 输出文件的反向链接信息
            }
            if (!file) {
                this.statusBarItem.setText("");
                return;
            }
        });
        this.fileWatcherRefs.push(changedRef);
    }

    close() {
        this.fileWatcherRefs.forEach(ref => this.app.workspace.offref(ref));
        this.fileWatcherRefs = [];
        this.statusBarItem.setText("");
        this.backlinkIndex.close();
    }

    private findNearestType(startPath: string): string[] | null {
        const queue: string[] = [startPath];
        const visited = new Set<string>([startPath]);
        const results: string[] = [];
        let foundAtLevel = false;

        while (queue.length > 0) {
            // 获取当前层的节点数量
            const levelSize = queue.length;

            // 遍历当前层的所有节点
            for (let i = 0; i < levelSize; i++) {
                const currentPath = queue.shift()!;

                const currentFile = this.app.vault.getAbstractFileByPath(currentPath);
                if (currentFile instanceof TFile) {
                    const cache = this.app.metadataCache.getFileCache(currentFile);
                    if (cache?.frontmatter?.页面类型 === 0) {
                        results.push(currentFile.basename);
                        foundAtLevel = true; // 标记在这一层找到了目标
                    }
                }

                // 如果这一层已经找到了，就不再往更深层探索（但要把当前层扫完）
                if (!foundAtLevel) {
                    const parents = this.backlinkIndex.getBacklinks(currentPath) || [];
                    for (const parent of parents) {
                        if (!visited.has(parent)) {
                            visited.add(parent);
                            queue.push(parent);
                        }
                    }
                }
            }

            // 扫完这一层后，如果有了结果，直接返回所有收集到的分类
            if (foundAtLevel) {
                return results.length > 0 ? results : null;
            }
        }

        return null;
    }
}